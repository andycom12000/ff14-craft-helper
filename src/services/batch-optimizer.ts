import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { BatchException, BatchTarget, BatchResults, TodoItem, BuyFinishedDecision, BuffRecommendation, SelfCraftCandidate } from '@/stores/batch'
import type { MaterialWithPrice, MaterialBase, QuickBuyMaterial, QuickBuyMaterialPricing } from '@/services/shopping-list'
import { markRaw } from 'vue'
import { solveCraft, simulateCraft, waitForWasm, SOLVE_CANCELLED } from '@/solver/worker'
import { craftParamsToSolverConfig, recipeToCraftParams } from '@/solver/config'
import { findOptimalHqCombinations } from '@/services/hq-optimizer'
import { getAggregatedPrices, aggregateByWorld } from '@/api/universalis'
import type { MarketData, WorldPriceSummary } from '@/api/universalis'
import { separateCrystals, groupByServer, calculateBestPurchase, findCheapestServerPurchase } from '@/services/shopping-list'
import { applyFoodBuff, applyMedicineBuff, resolveBuff, COMMON_FOODS, COMMON_MEDICINES, type FoodBuff } from '@/engine/food-medicine'
import { evaluateBuffRecommendation, getBuffItemIds } from '@/services/buff-recommender'
import { produceSelfCraftCandidates } from '@/services/self-craft-candidates'
import { canReachHQQuality } from '@/services/feasibility-prefilter'
import { recipeHardGateReasons } from '@/services/recipe-gating'
import { fetchItemAcquisitionBatch } from '@/services/item-acquisition'
import { fetchItemLocationsBatch } from '@/services/item-locations'
import { fetchZoneMetaBulk, fetchNpcNameBulk } from '@/services/zone-meta'
import { loadAetherytes, getNearestAetheryte } from '@/services/aetherytes'
import type { NpcPurchaseCandidate } from '@/stores/batch'

export interface RecipeOptimizeResult {
  recipe: Recipe
  // # of crafts to perform. For amountResult=1 this equals outputAmount.
  quantity: number
  // # of finished items the user actually wants. Drives buy/craft cost compare
  // and the buy-finished shopping row.
  outputAmount: number
  actions: string[]
  hqAmounts: number[]
  initialQuality: number
  isDoubleMax: boolean
  materials: MaterialBase[]
  qualityDeficit: number
}

export async function optimizeRecipe(
  recipe: Recipe,
  gearset: GearsetStats,
  onSolverProgress?: (percent: number) => void,
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null },
): Promise<RecipeOptimizeResult> {
  const craftParams = recipeToCraftParams(recipe, gearset)
  if (buffs) {
    const afterFood = applyFoodBuff(
      { craftsmanship: craftParams.craftsmanship, control: craftParams.control, cp: craftParams.cp },
      buffs.food,
    )
    const enhanced = applyMedicineBuff(afterFood, buffs.medicine)
    craftParams.craftsmanship = enhanced.craftsmanship
    craftParams.control = enhanced.control
    craftParams.cp = enhanced.cp
  }
  const solverConfig = craftParamsToSolverConfig(craftParams)
  const solverResult = await solveCraft(solverConfig, onSolverProgress)
  if (solverResult.wasmDur !== undefined) {
    const stats = solverResult.runtimeStats
    const statsTail = stats
      ? ` nodes=${stats.search_processed_nodes} inserted=${stats.search_inserted_nodes}`
      : ''
    console.debug(
      `[bperf] solve ${recipe.name} wasmDur=${solverResult.wasmDur.toFixed(0)}ms steps=${solverResult.actions.length}${statsTail}`
    )
  }
  const simResult = await simulateCraft(solverConfig, solverResult.actions)

  if (recipe.canHq && solverConfig.hq_target) {
    const predicted = canReachHQQuality(recipe, gearset, buffs)
    const actualReached = simResult.quality >= simResult.max_quality
    console.debug(
      `[bperf-prefilter] recipe=${recipe.name} predicted=${predicted} ` +
      `actual_reached=${actualReached} max_q=${simResult.max_quality} ` +
      `final_q=${simResult.quality} cp=${gearset.cp}`
    )
  }

  const isDoubleMax =
    simResult.progress >= simResult.max_progress &&
    simResult.quality >= simResult.max_quality

  const materials = recipe.ingredients.map(i => ({
    itemId: i.itemId, name: i.name, icon: i.icon, amount: i.amount,
  }))

  if (isDoubleMax) {
    return {
      recipe, quantity: 1, outputAmount: 1, actions: solverResult.actions,
      hqAmounts: [], initialQuality: 0, isDoubleMax: true, materials, qualityDeficit: 0,
    }
  }

  const qualityDeficit = simResult.max_quality - simResult.quality
  const combos = findOptimalHqCombinations(
    recipe.recipeLevelTable.quality,
    recipe.materialQualityFactor,
    recipe.ingredients,
    qualityDeficit,
    new Map(),
  )
  const bestCombo = combos[0]

  return {
    recipe, quantity: 1, outputAmount: 1, actions: solverResult.actions,
    hqAmounts: bestCombo?.hqAmounts ?? [],
    initialQuality: bestCombo?.initialQuality ?? 0,
    isDoubleMax: false, materials, qualityDeficit,
  }
}

interface TypedMaterial extends MaterialBase {
  matType: 'hq' | 'nq'
}

/**
 * Resolve a finished-product buy price + source server from a DC-wide priceMap.
 * Cross-server picks the cheapest world that can fulfill `quantity`; otherwise
 * falls back to home-server min price. Returns `buyServer: undefined` when
 * cross-server has listings but no world can fulfill — that signals the caller
 * to skip (no usable price).
 */
function describeHardGates(reasons: ReturnType<typeof recipeHardGateReasons>): string {
  if (reasons.length === 0) return ''
  const parts: string[] = []
  if (reasons.includes('stars')) parts.push('星級')
  if (reasons.includes('expert')) parts.push('專家')
  if (reasons.includes('requiredCraftsmanship') || reasons.includes('requiredControl')) {
    parts.push('硬性數值門檻')
  }
  return parts.join('、')
}

function priceFinishedProduct(
  md: MarketData | undefined,
  quantity: number,
  hq: boolean,
  crossServer: boolean,
  homeServer: string,
): { buyPrice: number; buyServer?: string } {
  if (crossServer && md?.listings?.length) {
    const result = findCheapestServerPurchase(md.listings, quantity, hq, homeServer)
    if (result.bestCost < Infinity) {
      return { buyPrice: Math.round(result.bestCost / quantity), buyServer: result.bestServer }
    }
    return { buyPrice: 0 }
  }
  return {
    buyPrice: (hq ? md?.minPriceHQ : md?.minPriceNQ) ?? 0,
    buyServer: homeServer,
  }
}

/** Full batch pipeline: solve → HQ optimize → aggregate → price → group → todo */
export async function runBatchOptimization(
  targets: BatchTarget[],
  getGearset: (job: string) => (GearsetStats & { job: string }) | GearsetStats | null,
  settings: {
    crossServer: boolean
    recursivePricing: boolean
    maxRecursionDepth: number
    exceptionStrategy: 'skip' | 'buy'
    server: string
    dataCenter: string
    foodId?: number | null
    foodIsHq?: boolean
    medicineId?: number | null
    medicineIsHq?: boolean
    /** When false, skip food/medicine auto-recommendation even if no buff is selected. Defaults to true. */
    autoEvaluateBuffs?: boolean
    /** Calculation mode. 'quick-buy' skips the solver and just builds a flat shopping list. Defaults to 'macro'. */
    calcMode?: 'macro' | 'quick-buy'
    /** Per-material quality override. Maps itemId → 'nq' | 'hq'. Used in quick-buy mode. */
    qualityOverrides?: Record<number, 'nq' | 'hq'>
    /** Bulk quality mode used as default in quick-buy. Defaults to 'nq'. */
    bulkQualityMode?: 'nq' | 'hq'
    /**
     * Per-material self-make override. When true for a finished product's itemId,
     * force that recipe to be crafted even if buying would be cheaper. Takes effect
     * only in macro mode on recipes the user could otherwise craft — exceptions
     * (level-insufficient, quality-unachievable) still fall through to buy.
     */
    selfMakeOverrides?: Record<number, boolean>
  },
  onProgress: (info: {
    completed: number
    total: number
    name: string
    phase: 'solving' | 'pricing' | 'evaluating-buffs' | 'evaluating-self-craft' | 'aggregating' | 'done'
    solverPercent: number
  }) => void,
  isCancelled: () => boolean,
): Promise<BatchResults> {
  const recipeResults: RecipeOptimizeResult[] = []
  const exceptions: BatchException[] = []
  const qualityUnachievableResults: RecipeOptimizeResult[] = []

  const foodBuff = resolveBuff(COMMON_FOODS, settings.foodId ?? null, settings.foodIsHq ?? true)
  const medicineBuff = resolveBuff(COMMON_MEDICINES, settings.medicineId ?? null, settings.medicineIsHq ?? true)
  const buffs = (foodBuff || medicineBuff) ? { food: foodBuff, medicine: medicineBuff } : undefined

  // Quick-buy mode: skip solver + HQ optimizer and build a flat material shopping list
  // directly from recipe ingredients and the user-selected quality rules.
  if ((settings.calcMode ?? 'macro') === 'quick-buy') {
    return runQuickBuy(targets, settings, onProgress, isCancelled)
  }

  await waitForWasm()

  // === Phase 1-3: Per-recipe solve + HQ optimize ===
  let completedCount = 0
  const recipePercents = new Array(targets.length).fill(0)
  const emitAggregateProgress = (name: string) => {
    const aggregate = recipePercents.reduce((s, p) => s + p, 0) / targets.length
    onProgress({
      completed: completedCount,
      total: targets.length,
      name,
      phase: 'solving',
      solverPercent: aggregate,
    })
  }
  const phase1Settled = await Promise.allSettled(targets.map(async (target, i) => {
    if (isCancelled()) throw new Error(SOLVE_CANCELLED)
    const gearset = getGearset(target.recipe.job)
    // Hard-block only when the gearset is missing OR (below recipe level AND
    // the recipe has at least one hard-gate signal — stars, expert, required
    // stats). Standard 0-star recipes can be attempted below level; the solver
    // already applies progress/quality modifiers as the in-game penalty.
    const hardGates = recipeHardGateReasons(target.recipe)
    if (!gearset || (gearset.level < target.recipe.level && hardGates.length > 0)) {
      recipePercents[i] = 100
      emitAggregateProgress(target.recipe.name)
      return { kind: 'level-insufficient' as const, target, gearset, hardGates }
    }
    try {
      const result = await optimizeRecipe(target.recipe, gearset, (pct) => {
        recipePercents[i] = pct
        emitAggregateProgress(target.recipe.name)
      }, buffs)
      completedCount++
      recipePercents[i] = 100
      emitAggregateProgress('')
      return { kind: 'ok' as const, target, result }
    } catch (err) {
      if (err instanceof Error && err.message === SOLVE_CANCELLED) throw err
      completedCount++
      recipePercents[i] = 100
      emitAggregateProgress(target.recipe.name)
      return { kind: 'failed' as const, target, error: err }
    }
  }))

  for (const settled of phase1Settled) {
    if (settled.status === 'rejected') {
      if (settled.reason instanceof Error && settled.reason.message === SOLVE_CANCELLED) throw settled.reason
      continue
    }
    const v = settled.value
    if (v.kind === 'level-insufficient') {
      const gearsetLevel = v.gearset?.level ?? 0
      const details = v.gearset
        ? `「${v.target.recipe.name}」是${describeHardGates(v.hardGates)}配方，必須達到等級 ${v.target.recipe.level} 才能合成（目前 ${v.target.recipe.job} 等級 ${gearsetLevel}）`
        : `尚未設定 ${v.target.recipe.job} 裝備組`
      exceptions.push({
        type: 'level-insufficient', recipe: v.target.recipe, quantity: v.target.quantity,
        message: v.gearset ? '配方有硬性限制' : '尚未設定裝備組',
        details,
        action: settings.exceptionStrategy === 'buy' ? 'buy-finished' : 'skipped',
      })
      continue
    }
    if (v.kind === 'failed') {
      exceptions.push({
        type: 'quality-unachievable', recipe: v.target.recipe, quantity: v.target.quantity,
        message: '計算失敗', details: `「${v.target.recipe.name}」計算過程發生錯誤：${v.error}`,
        action: 'skipped',
      })
      continue
    }
    const result = v.result
    const yieldPerCraft = Math.max(1, v.target.recipe.amountResult)
    result.outputAmount = v.target.quantity
    result.quantity = Math.ceil(v.target.quantity / yieldPerCraft)
    if (!result.isDoubleMax && result.hqAmounts.length === 0) {
      if (result.recipe.canHq) qualityUnachievableResults.push(result)
      exceptions.push({
        type: 'quality-unachievable', recipe: v.target.recipe, quantity: v.target.quantity,
        message: '無法達成雙滿',
        details: `「${v.target.recipe.name}」即使使用全部 HQ 素材仍無法達成品質上限`,
        action: settings.exceptionStrategy === 'buy' ? 'buy-finished' : 'skipped',
      })
      continue
    }
    recipeResults.push(result)
  }

  if (isCancelled()) throw new Error(SOLVE_CANCELLED)

  // === Phase 4: Early price query (materials + finished products) ===
  onProgress({ completed: 0, total: 0, name: '查詢市場價格', phase: 'pricing', solverPercent: 0 })

  // Collect all material itemIds (excluding crystals) + finished product itemIds
  const allMaterialIds = new Set<number>()
  const finishedProductIds = new Set<number>()
  for (const r of recipeResults) {
    finishedProductIds.add(r.recipe.itemId)
    for (const m of r.materials) {
      if (m.itemId >= 20) allMaterialIds.add(m.itemId)
    }
  }
  // Include quality-unachievable recipes for buff recommendation price queries
  for (const r of qualityUnachievableResults) {
    finishedProductIds.add(r.recipe.itemId)
    for (const m of r.materials) {
      if (m.itemId >= 20) allMaterialIds.add(m.itemId)
    }
  }
  // Exception buy-finished items need their finished-product itemIds priced too.
  for (const exc of exceptions) {
    if (exc.action === 'buy-finished') finishedProductIds.add(exc.recipe.itemId)
  }
  // Merge into single query
  for (const id of finishedProductIds) allMaterialIds.add(id)
  const priceSource = settings.crossServer ? settings.dataCenter : settings.server

  // Add food/medicine item IDs for buff recommendation (only when user hasn't selected any
  // and auto-evaluation is enabled)
  const autoEvaluateBuffs = settings.autoEvaluateBuffs ?? true
  const noBuffSelected = !settings.foodId && !settings.medicineId && autoEvaluateBuffs
  if (noBuffSelected) {
    for (const id of getBuffItemIds()) allMaterialIds.add(id)
  }

  const priceMap = await getAggregatedPrices(priceSource, [...allMaterialIds], (done, total) => {
    onProgress({ completed: done, total, name: '查詢市場價格', phase: 'pricing', solverPercent: 0 })
  })

  // === Phase 4a: Fetch NPC availability + locations (parallel) ===
  const [acquisitionMap, locationsMap] = await Promise.all([
    fetchItemAcquisitionBatch([...allMaterialIds]),
    fetchItemLocationsBatch([...allMaterialIds]),
  ])

  // === Phase 4b: Resolve zone & NPC names + load aetheryte table ===
  // Without this, useZoneName/useNpcName render `#zone:XXX` / `#npc:XXX`
  // placeholders and `/tp` clipboard payloads are garbage. The aetheryte
  // table is needed because `/tp` requires aetheryte names, not zone names.
  const zoneIdsForNames = new Set<number>()
  const npcIdsForNames = new Set<number>()
  for (const [, info] of locationsMap) {
    for (const v of info.npcVendors) {
      zoneIdsForNames.add(v.zoneId)
      npcIdsForNames.add(v.npcId)
    }
  }
  const [, , aetherytesData] = await Promise.all([
    zoneIdsForNames.size > 0 ? fetchZoneMetaBulk([...zoneIdsForNames]) : Promise.resolve(),
    npcIdsForNames.size > 0 ? fetchNpcNameBulk([...npcIdsForNames]) : Promise.resolve(),
    loadAetherytes().catch(() => null),
  ])

  // === Phase 4.5: Compare craft cost vs buy price per recipe ===
  const recipesToCraft: RecipeOptimizeResult[] = []
  const buyFinishedItems: BuyFinishedDecision[] = []
  const selfMakeOverrides = settings.selfMakeOverrides ?? {}

  for (const r of recipeResults) {
    // Per-craft material cost (one craft consumes r.materials and yields amountResult items).
    let craftCostPerBatch = 0
    for (let j = 0; j < r.materials.length; j++) {
      const m = r.materials[j]
      if (m.itemId < 20) continue // skip crystals
      const md = priceMap.get(m.itemId)
      const hqCount = r.hqAmounts[j] ?? 0
      const nqCount = m.amount - hqCount
      const nqPrice = md?.minPriceNQ ?? 0
      const hqPrice = md?.minPriceHQ ?? 0
      craftCostPerBatch += nqPrice * nqCount + hqPrice * hqCount
    }
    // Per-output craft cost: divide by amountResult so food/medicine (yield 3)
    // compares apples-to-apples against per-item buy price.
    const yieldPerCraft = Math.max(1, r.recipe.amountResult)
    const craftCostPerUnit = craftCostPerBatch / yieldPerCraft

    const { buyPrice, buyServer } = priceFinishedProduct(
      priceMap.get(r.recipe.itemId), r.outputAmount, r.recipe.canHq,
      settings.crossServer, settings.server,
    )

    // User-forced self-make: keep crafting regardless of price.
    if (selfMakeOverrides[r.recipe.itemId]) {
      recipesToCraft.push(r)
    } else if (buyPrice > 0 && buyPrice <= craftCostPerUnit) {
      buyFinishedItems.push({
        recipe: r.recipe,
        quantity: r.outputAmount,
        craftCost: craftCostPerUnit,
        buyPrice,
        buyServer,
      })
    } else {
      recipesToCraft.push(r)
    }
  }

  for (const exc of exceptions) {
    if (exc.action !== 'buy-finished') continue
    const { buyPrice, buyServer } = priceFinishedProduct(
      priceMap.get(exc.recipe.itemId), exc.quantity, exc.recipe.canHq,
      settings.crossServer, settings.server,
    )
    if (buyPrice <= 0) continue
    // Surface price + server back on the exception so ExceptionList shows them.
    exc.buyPrice = buyPrice
    exc.buyServer = buyServer
    buyFinishedItems.push({
      recipe: exc.recipe,
      quantity: exc.quantity,
      craftCost: Infinity,
      buyPrice,
      buyServer,
    })
  }

  // === Phase 4.6: buff recommendation + self-craft candidates (parallel) ===
  const buffPromise: Promise<BuffRecommendation | undefined> = (async () => {
    if (!noBuffSelected || isCancelled()) return undefined
    const buyFinishedIds = new Set(buyFinishedItems.map(bf => bf.recipe.id))
    const hasDeficit = recipesToCraft.some(r => !r.isDoubleMax && r.recipe.canHq)
    const hasUnachievable = qualityUnachievableResults.length > 0
    if (!hasDeficit && !hasUnachievable) return undefined
    onProgress({ completed: 0, total: 0, name: '', phase: 'evaluating-buffs', solverPercent: 0 })
    const rec = await evaluateBuffRecommendation(
      recipesToCraft, buyFinishedIds, getGearset as (job: string) => GearsetStats | null,
      priceMap, isCancelled,
      (info) => onProgress({ completed: info.completed, total: info.total, name: '', phase: 'evaluating-buffs', solverPercent: 0 }),
      qualityUnachievableResults,
    )
    return rec ?? undefined
  })()

  const selfCraftPromise: Promise<SelfCraftCandidate[]> = (async () => {
    if (!settings.recursivePricing || isCancelled()) return []
    try {
      return await produceSelfCraftCandidates({
        recipesToCraft, priceMap, priceSource,
        crossServer: settings.crossServer, server: settings.server,
        getGearset: getGearset as (job: string) => GearsetStats | null,
        maxDepth: settings.maxRecursionDepth, buffs, optimizeRecipe,
        onProgress: (info) => onProgress({
          completed: info.completed, total: info.total, name: info.name,
          phase: 'evaluating-self-craft', solverPercent: 0,
        }),
        isCancelled,
      })
    } catch (err) {
      console.warn('[batch-optimizer] self-craft candidate production failed:', err)
      return []
    }
  })()

  const [buffRecommendation, selfCraftCandidates] = await Promise.all([buffPromise, selfCraftPromise])

  // === Phase 5: Aggregate materials (only for recipes still being crafted) ===
  onProgress({ completed: 0, total: 0, name: '整理材料清單', phase: 'aggregating', solverPercent: 0 })
  const allTypedMaterials: TypedMaterial[] = []

  for (const r of recipesToCraft) {
    for (let j = 0; j < r.materials.length; j++) {
      const m = r.materials[j]
      const hqCount = r.hqAmounts[j] ?? 0
      const nqCount = m.amount - hqCount
      if (hqCount > 0) {
        allTypedMaterials.push({ ...m, amount: hqCount * r.quantity, matType: 'hq' })
      }
      if (nqCount > 0) {
        allTypedMaterials.push({ ...m, amount: nqCount * r.quantity, matType: 'nq' })
      }
    }
  }

  // Aggregate using composite key to avoid HQ/NQ collision
  const matMap = new Map<string, TypedMaterial>()
  for (const m of allTypedMaterials) {
    const key = `${m.itemId}-${m.matType}`
    const existing = matMap.get(key)
    if (existing) {
      existing.amount += m.amount
    } else {
      matMap.set(key, { ...m })
    }
  }
  const aggregated = Array.from(matMap.values())
  const { crystals, nonCrystals } = separateCrystals(aggregated)

  // === Phase 5.5: Price materials + add buy-finished items to shopping list ===
  onProgress({ completed: 0, total: 0, name: '分組採購清單', phase: 'aggregating', solverPercent: 0 })
  let pricedMaterials: MaterialWithPrice[]
  let dcPriceMap: Map<number, MarketData> | null = null

  if (settings.crossServer) {
    dcPriceMap = priceMap
    pricedMaterials = nonCrystals.map(m => {
      const md = dcPriceMap!.get(m.itemId)
      const isHq = m.matType === 'hq'
      let bestServer = settings.server
      let bestCost = Infinity

      if (md?.listings && md.listings.length > 0) {
        const result = findCheapestServerPurchase(md.listings, m.amount, isHq, settings.server)
        bestCost = result.bestCost
        bestServer = result.bestServer
      }

      if (bestCost === Infinity) {
        const fallbackUnit = isHq ? (md?.minPriceHQ ?? 0) : (md?.minPriceNQ ?? 0)
        bestCost = fallbackUnit * m.amount
      }

      return {
        itemId: m.itemId, name: m.name, icon: m.icon, amount: m.amount,
        type: isHq ? 'hq' as const : 'nq' as const,
        unitPrice: Math.round(bestCost / m.amount), server: bestServer,
      }
    })
  } else {
    pricedMaterials = nonCrystals.map(m => {
      const md = priceMap.get(m.itemId)
      const isHq = m.matType === 'hq'

      if (md?.listings && md.listings.length > 0) {
        const purchase = calculateBestPurchase(md.listings, m.amount, isHq)
        if (purchase.fulfilled) {
          return {
            itemId: m.itemId, name: m.name, icon: m.icon, amount: m.amount,
            type: isHq ? 'hq' as const : 'nq' as const,
            unitPrice: purchase.effectiveUnitPrice, server: settings.server,
          }
        }
      }

      return {
        itemId: m.itemId, name: m.name, icon: m.icon, amount: m.amount,
        type: isHq ? 'hq' as const : 'nq' as const,
        unitPrice: isHq ? (md?.minPriceHQ ?? 0) : (md?.minPriceNQ ?? 0),
        server: settings.server,
      }
    })
  }

  // Add buy-finished items into pricedMaterials (HQ for items that can be HQ)
  for (const bf of buyFinishedItems) {
    pricedMaterials.push({
      itemId: bf.recipe.itemId,
      name: bf.recipe.name,
      icon: bf.recipe.icon,
      amount: bf.quantity,
      type: bf.recipe.canHq ? 'hq' : 'nq',
      unitPrice: bf.buyPrice,
      server: bf.buyServer,
      isFinishedProduct: true,
      craftCostComparison: { craftCost: bf.craftCost, buyPrice: bf.buyPrice },
    })
  }

  const serverGroups = groupByServer(pricedMaterials)
  const grandTotal = serverGroups.reduce((sum, g) => sum + g.subtotal, 0)

  // Build cross-world price cache from already-fetched market data (markRaw to avoid deep proxy)
  const crossWorldCache = markRaw(new Map<number, WorldPriceSummary[]>())
  if (dcPriceMap) {
    for (const [id, md] of dcPriceMap) {
      if (md.listings?.length) {
        crossWorldCache.set(id, aggregateByWorld(md.listings))
      }
    }
  }

  // === Phase 6: Todo list (only recipes still being crafted) ===
  const todoList: TodoItem[] = recipesToCraft.map(r => ({
    recipe: r.recipe, quantity: r.quantity, actions: r.actions,
    hqAmounts: r.hqAmounts, isSemiFinished: false, done: false,
  }))

  // === Phase 5.6: Build NPC purchase candidates ===
  const npcPurchaseCandidates: NpcPurchaseCandidate[] = []

  // From priced materials (non-crystal materials)
  for (const item of pricedMaterials) {
    if (item.itemId < 20) continue
    if (item.isFinishedProduct) continue // handled separately below
    const acq = acquisitionMap.get(item.itemId)
    if (!acq?.canNpc || !acq.npcPrice) continue
    const marketPrice = item.unitPrice
    if (acq.npcPrice >= marketPrice) continue
    const locs = locationsMap.get(item.itemId)
    const vendors = locs?.npcVendors ?? []
    const sorted = [...vendors].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    const chosenVendor = sorted[0]
    if (!chosenVendor) continue
    const aetheryte = aetherytesData
      ? getNearestAetheryte(aetherytesData, chosenVendor.zoneId, chosenVendor.x, chosenVendor.y)
      : null
    npcPurchaseCandidates.push({
      itemId: item.itemId,
      name: item.name,
      icon: item.icon,
      amount: item.amount,
      marketPrice,
      npcPrice: acq.npcPrice,
      savings: (marketPrice - acq.npcPrice) * item.amount,
      savingsRatio: 1 - acq.npcPrice / marketPrice,
      npcId: chosenVendor.npcId,
      zoneId: chosenVendor.zoneId,
      coords: { x: chosenVendor.x, y: chosenVendor.y },
      aetheryteName: aetheryte?.name ?? null,
      isFinishedProduct: false,
    })
  }

  // From buy-finished items (finished products purchased from market)
  for (const bf of buyFinishedItems) {
    const itemId = bf.recipe.itemId
    if (itemId < 20) continue
    const acq = acquisitionMap.get(itemId)
    if (!acq?.canNpc || !acq.npcPrice) continue
    const marketPrice = bf.buyPrice
    if (acq.npcPrice >= marketPrice) continue
    const locs = locationsMap.get(itemId)
    const vendors = locs?.npcVendors ?? []
    const sorted = [...vendors].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    const chosenVendor = sorted[0]
    if (!chosenVendor) continue
    const aetheryte = aetherytesData
      ? getNearestAetheryte(aetherytesData, chosenVendor.zoneId, chosenVendor.x, chosenVendor.y)
      : null
    npcPurchaseCandidates.push({
      itemId,
      name: bf.recipe.name,
      icon: bf.recipe.icon,
      amount: bf.quantity,
      marketPrice,
      npcPrice: acq.npcPrice,
      savings: (marketPrice - acq.npcPrice) * bf.quantity,
      savingsRatio: 1 - acq.npcPrice / marketPrice,
      npcId: chosenVendor.npcId,
      zoneId: chosenVendor.zoneId,
      coords: { x: chosenVendor.x, y: chosenVendor.y },
      aetheryteName: aetheryte?.name ?? null,
      isFinishedProduct: true,
    })
  }

  return { serverGroups, crystals, selfCraftCandidates, todoList, exceptions, buyFinishedItems, grandTotal, crossWorldCache, buffRecommendation, npcPurchaseCandidates }
}

/**
 * Quick-buy pipeline: skip the solver entirely and build a dual-priced
 * shopping list (NQ + HQ) from recipe ingredients. The view layer picks
 * the effective quality per material and re-groups on-the-fly, so the
 * user can toggle all-NQ ↔ all-HQ (or override per material) without
 * re-running the pipeline.
 */
async function runQuickBuy(
  targets: BatchTarget[],
  settings: Parameters<typeof runBatchOptimization>[2],
  onProgress: Parameters<typeof runBatchOptimization>[3],
  isCancelled: () => boolean,
): Promise<BatchResults> {
  onProgress({ completed: 0, total: 0, name: '查詢市場價格', phase: 'pricing', solverPercent: 0 })

  // Aggregate materials by itemId only (no matType split).
  interface QBMat { itemId: number; name: string; icon: string; amount: number; canHq: boolean }
  const matMap = new Map<number, QBMat>()
  for (const t of targets) {
    // t.quantity is # of output items wanted; convert to # of crafts so
    // ingredient totals match for amountResult > 1 recipes (food/medicine).
    const yieldPerCraft = Math.max(1, t.recipe.amountResult)
    const crafts = Math.ceil(t.quantity / yieldPerCraft)
    for (const ing of t.recipe.ingredients) {
      const amount = ing.amount * crafts
      const existing = matMap.get(ing.itemId)
      if (existing) {
        existing.amount += amount
        existing.canHq = existing.canHq || !!ing.canHq
      } else {
        matMap.set(ing.itemId, {
          itemId: ing.itemId, name: ing.name, icon: ing.icon,
          amount, canHq: !!ing.canHq,
        })
      }
    }
  }

  if (isCancelled()) {
    return {
      serverGroups: [], crystals: [], selfCraftCandidates: [],
      todoList: [], exceptions: [], buyFinishedItems: [],
      grandTotal: 0, crossWorldCache: markRaw(new Map()),
      quickBuyMaterials: [],
      npcPurchaseCandidates: [],
    }
  }

  const priceSource = settings.crossServer ? settings.dataCenter : settings.server
  const priceMap = await getAggregatedPrices(priceSource, [...matMap.keys()], (done, total) => {
    onProgress({ completed: done, total, name: '查詢市場價格', phase: 'pricing', solverPercent: 0 })
  })

  // === Phase 4a: Fetch NPC availability + locations (parallel) ===
  const qbMatIds = [...matMap.keys()]
  const [qbAcquisitionMap, qbLocationsMap] = await Promise.all([
    fetchItemAcquisitionBatch(qbMatIds),
    fetchItemLocationsBatch(qbMatIds),
  ])

  // === Phase 4b: Resolve zone & NPC names + aetheryte table ===
  const qbZoneIds = new Set<number>()
  const qbNpcIds = new Set<number>()
  for (const [, info] of qbLocationsMap) {
    for (const v of info.npcVendors) {
      qbZoneIds.add(v.zoneId)
      qbNpcIds.add(v.npcId)
    }
  }
  const [, , qbAetherytesData] = await Promise.all([
    qbZoneIds.size > 0 ? fetchZoneMetaBulk([...qbZoneIds]) : Promise.resolve(),
    qbNpcIds.size > 0 ? fetchNpcNameBulk([...qbNpcIds]) : Promise.resolve(),
    loadAetherytes().catch(() => null),
  ])

  onProgress({ completed: 0, total: 0, name: '整理材料清單', phase: 'aggregating', solverPercent: 0 })

  const aggregated = Array.from(matMap.values())
  const { crystals, nonCrystals } = separateCrystals(aggregated)

  function priceQuality(m: QBMat, hq: boolean): QuickBuyMaterialPricing | null {
    const md = priceMap.get(m.itemId)

    if (settings.crossServer && md?.listings?.length) {
      const r = findCheapestServerPurchase(md.listings, m.amount, hq, settings.server)
      if (r.bestCost < Infinity) {
        return { unitPrice: Math.round(r.bestCost / m.amount), server: r.bestServer }
      }
      // Cross-server with listings but no fulfillable at that quality.
      const fallback = hq ? md.minPriceHQ : md.minPriceNQ
      return fallback ? { unitPrice: fallback, server: settings.server } : null
    }

    if (md?.listings?.length) {
      const purchase = calculateBestPurchase(md.listings, m.amount, hq)
      if (purchase.fulfilled) {
        return { unitPrice: purchase.effectiveUnitPrice, server: settings.server }
      }
    }

    const fallback = hq ? md?.minPriceHQ : md?.minPriceNQ
    return fallback ? { unitPrice: fallback, server: settings.server } : null
  }

  const quickBuyMaterials: QuickBuyMaterial[] = nonCrystals.map(m => ({
    itemId: m.itemId, name: m.name, icon: m.icon, amount: m.amount,
    canHq: m.canHq,
    nq: priceQuality(m, false),
    hq: m.canHq ? priceQuality(m, true) : null,
  }))

  const crossWorldCache = markRaw(new Map<number, WorldPriceSummary[]>())
  if (settings.crossServer) {
    for (const [id, md] of priceMap) {
      if (md.listings?.length) crossWorldCache.set(id, aggregateByWorld(md.listings))
    }
  }

  // === Build NPC purchase candidates for quick-buy ===
  const qbNpcCandidates: NpcPurchaseCandidate[] = []
  for (const m of quickBuyMaterials) {
    if (m.itemId < 20) continue
    const acq = qbAcquisitionMap.get(m.itemId)
    if (!acq?.canNpc || !acq.npcPrice) continue
    // Use NQ price as the market baseline (NPC sells NQ); skip HQ-only items
    const nqPricing = m.nq
    if (!nqPricing) continue
    const marketPrice = nqPricing.unitPrice
    if (acq.npcPrice >= marketPrice) continue
    const locs = qbLocationsMap.get(m.itemId)
    const vendors = locs?.npcVendors ?? []
    const sorted = [...vendors].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    const chosenVendor = sorted[0]
    if (!chosenVendor) continue
    const aetheryte = qbAetherytesData
      ? getNearestAetheryte(qbAetherytesData, chosenVendor.zoneId, chosenVendor.x, chosenVendor.y)
      : null
    qbNpcCandidates.push({
      itemId: m.itemId,
      name: m.name,
      icon: m.icon,
      amount: m.amount,
      marketPrice,
      npcPrice: acq.npcPrice,
      savings: (marketPrice - acq.npcPrice) * m.amount,
      savingsRatio: 1 - acq.npcPrice / marketPrice,
      npcId: chosenVendor.npcId,
      zoneId: chosenVendor.zoneId,
      coords: { x: chosenVendor.x, y: chosenVendor.y },
      aetheryteName: aetheryte?.name ?? null,
      isFinishedProduct: false,
    })
  }

  onProgress({ completed: 1, total: 1, name: '', phase: 'done', solverPercent: 0 })

  // serverGroups / grandTotal left empty here — the ShoppingList view
  // computes them reactively from quickBuyMaterials + current
  // bulkQualityMode + qualityOverrides.
  return {
    serverGroups: [],
    crystals,
    selfCraftCandidates: [],
    todoList: [],
    exceptions: [],
    buyFinishedItems: [],
    grandTotal: 0,
    crossWorldCache,
    quickBuyMaterials,
    npcPurchaseCandidates: qbNpcCandidates,
  }
}

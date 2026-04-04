import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { BatchException, BatchTarget, BatchResults, TodoItem, BuyFinishedDecision, BuffRecommendation } from '@/stores/batch'
import type { MaterialWithPrice, MaterialBase } from '@/services/shopping-list'
import { markRaw } from 'vue'
import { solveCraft, simulateCraft, waitForWasm } from '@/solver/worker'
import { craftParamsToSolverConfig, recipeToCraftParams } from '@/solver/config'
import { findOptimalHqCombinations } from '@/services/hq-optimizer'
import { getAggregatedPrices, getMarketData, aggregateByWorld } from '@/api/universalis'
import type { MarketData, WorldPriceSummary } from '@/api/universalis'
import { separateCrystals, groupByServer, calculateBestPurchase, findCheapestServerPurchase } from '@/services/shopping-list'
import { buildMaterialTree, flattenMaterialTree, computeOptimalCosts } from '@/services/bom-calculator'
import { applyFoodBuff, applyMedicineBuff, resolveBuff, COMMON_FOODS, COMMON_MEDICINES, type FoodBuff } from '@/engine/food-medicine'
import { evaluateBuffRecommendation, getBuffItemIds } from '@/services/buff-recommender'

export interface RecipeOptimizeResult {
  recipe: Recipe
  quantity: number
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
  const simResult = await simulateCraft(solverConfig, solverResult.actions)

  const isDoubleMax =
    simResult.progress >= simResult.max_progress &&
    simResult.quality >= simResult.max_quality

  const materials = recipe.ingredients.map(i => ({
    itemId: i.itemId, name: i.name, icon: i.icon, amount: i.amount,
  }))

  if (isDoubleMax) {
    return {
      recipe, quantity: 1, actions: solverResult.actions,
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
    recipe, quantity: 1, actions: solverResult.actions,
    hqAmounts: bestCombo?.hqAmounts ?? [],
    initialQuality: bestCombo?.initialQuality ?? 0,
    isDoubleMax: false, materials, qualityDeficit,
  }
}

interface TypedMaterial extends MaterialBase {
  matType: 'hq' | 'nq'
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
  },
  onProgress: (info: {
    current: number
    total: number
    name: string
    phase: 'solving' | 'pricing' | 'evaluating-buffs' | 'aggregating' | 'done'
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

  await waitForWasm()

  // === Phase 1-3: Per-recipe solve + HQ optimize ===
  for (let i = 0; i < targets.length; i++) {
    if (isCancelled()) break
    const target = targets[i]
    const report = (phase: 'solving' | 'pricing' | 'done', solverPercent = 0) =>
      onProgress({ current: i + 1, total: targets.length, name: target.recipe.name, phase, solverPercent })
    report('solving', 0)

    const gearset = getGearset(target.recipe.job)
    if (!gearset || gearset.level < target.recipe.level) {
      const exc: BatchException = {
        type: 'level-insufficient',
        recipe: target.recipe,
        message: '職業等級不足',
        details: `你的 ${target.recipe.job} 等級 ${gearset?.level ?? 0} 不足以製作「${target.recipe.name}」（需要等級 ${target.recipe.level}）`,
        action: settings.exceptionStrategy === 'buy' ? 'buy-finished' : 'skipped',
      }
      if (settings.exceptionStrategy === 'buy') {
        try {
          const md = await getMarketData(settings.server, target.recipe.itemId)
          exc.buyPrice = target.recipe.canHq ? md.minPriceHQ : md.minPriceNQ
          exc.buyServer = settings.server
        } catch { /* buyPrice stays undefined */ }
      }
      exceptions.push(exc)
      continue
    }

    try {
      const result = await optimizeRecipe(target.recipe, gearset, (pct) => report('solving', pct), buffs)
      result.quantity = target.quantity

      if (!result.isDoubleMax && result.hqAmounts.length === 0) {
        // Save for buff recommendation evaluation (food/medicine may fix this)
        if (result.recipe.canHq) {
          qualityUnachievableResults.push(result)
        }
        const exc: BatchException = {
          type: 'quality-unachievable',
          recipe: target.recipe,
          message: '無法達成雙滿',
          details: `「${target.recipe.name}」即使使用全部 HQ 素材仍無法達成品質上限`,
          action: settings.exceptionStrategy === 'buy' ? 'buy-finished' : 'skipped',
        }
        if (settings.exceptionStrategy === 'buy') {
          try {
            const md = await getMarketData(settings.server, target.recipe.itemId)
            exc.buyPrice = target.recipe.canHq ? md.minPriceHQ : md.minPriceNQ
            exc.buyServer = settings.server
          } catch { /* ignore */ }
        }
        exceptions.push(exc)
        continue
      }
      recipeResults.push(result)
    } catch (err) {
      exceptions.push({
        type: 'quality-unachievable', recipe: target.recipe,
        message: '計算失敗', details: `「${target.recipe.name}」計算過程發生錯誤：${err}`,
        action: 'skipped',
      })
    }
  }

  // === Phase 4: Early price query (materials + finished products) ===
  onProgress({ current: 0, total: 0, name: '查詢市場價格', phase: 'pricing', solverPercent: 0 })

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
  // Merge into single query
  for (const id of finishedProductIds) allMaterialIds.add(id)
  const priceSource = settings.crossServer ? settings.dataCenter : settings.server

  // Add food/medicine item IDs for buff recommendation (only when user hasn't selected any)
  const noBuffSelected = !settings.foodId && !settings.medicineId
  if (noBuffSelected) {
    for (const id of getBuffItemIds()) allMaterialIds.add(id)
  }

  const priceMap = await getAggregatedPrices(priceSource, [...allMaterialIds])

  // === Phase 4.5: Compare craft cost vs buy price per recipe ===
  const recipesToCraft: RecipeOptimizeResult[] = []
  const buyFinishedItems: BuyFinishedDecision[] = []

  for (const r of recipeResults) {
    // Calculate per-unit craft cost from materials
    let craftCostPerUnit = 0
    for (let j = 0; j < r.materials.length; j++) {
      const m = r.materials[j]
      if (m.itemId < 20) continue // skip crystals
      const md = priceMap.get(m.itemId)
      const hqCount = r.hqAmounts[j] ?? 0
      const nqCount = m.amount - hqCount
      const nqPrice = md?.minPriceNQ ?? 0
      const hqPrice = md?.minPriceHQ ?? 0
      craftCostPerUnit += nqPrice * nqCount + hqPrice * hqCount
    }

    // Get finished product buy price (HQ for items that can be HQ)
    const finishedMd = priceMap.get(r.recipe.itemId)
    const buyHq = r.recipe.canHq
    let buyPrice = 0
    let buyServer: string | undefined

    if (settings.crossServer && finishedMd?.listings?.length) {
      const result = findCheapestServerPurchase(finishedMd.listings, r.quantity, buyHq, settings.server)
      if (result.bestCost < Infinity) {
        buyPrice = Math.round(result.bestCost / r.quantity)
        buyServer = result.bestServer
      }
    } else {
      buyPrice = (buyHq ? finishedMd?.minPriceHQ : finishedMd?.minPriceNQ) ?? 0
      buyServer = settings.server
    }

    if (buyPrice > 0 && buyPrice <= craftCostPerUnit) {
      buyFinishedItems.push({
        recipe: r.recipe,
        quantity: r.quantity,
        craftCost: craftCostPerUnit,
        buyPrice,
        buyServer,
      })
    } else {
      recipesToCraft.push(r)
    }
  }

  // Add exception-based buy-finished items to the shopping list
  for (const exc of exceptions) {
    if (exc.action === 'buy-finished' && exc.buyPrice) {
      const target = targets.find(t => t.recipe.id === exc.recipe.id)
      buyFinishedItems.push({
        recipe: exc.recipe,
        quantity: target?.quantity ?? 1,
        craftCost: Infinity,
        buyPrice: exc.buyPrice,
        buyServer: exc.buyServer,
      })
    }
  }

  // === Phase 4.6-buff: Evaluate food/medicine recommendation ===
  let buffRecommendation: BuffRecommendation | undefined
  if (noBuffSelected && !isCancelled()) {
    const buyFinishedIds = new Set(buyFinishedItems.map(bf => bf.recipe.id))
    const hasDeficit = recipesToCraft.some(r => !r.isDoubleMax && r.recipe.canHq)
    const hasUnachievable = qualityUnachievableResults.length > 0
    if (hasDeficit || hasUnachievable) {
      onProgress({ current: 0, total: 0, name: '', phase: 'evaluating-buffs', solverPercent: 0 })
      const recommendation = await evaluateBuffRecommendation(
        recipesToCraft, buyFinishedIds, getGearset as (job: string) => GearsetStats | null,
        priceMap, isCancelled,
        (info) => onProgress({ current: info.current, total: info.total, name: '', phase: 'evaluating-buffs', solverPercent: 0 }),
        qualityUnachievableResults,
      )
      if (recommendation) buffRecommendation = recommendation
    }
  }

  // === Phase 5: Aggregate materials (only for recipes still being crafted) ===
  onProgress({ current: 0, total: 0, name: '整理材料清單', phase: 'aggregating', solverPercent: 0 })
  const allTypedMaterials: TypedMaterial[] = []
  const selfCraftItems: MaterialWithPrice[] = []

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

  // Recursive BOM: expand craftable materials
  if (settings.recursivePricing) {
    try {
      onProgress({ current: 0, total: 0, name: '展開遞迴材料', phase: 'aggregating', solverPercent: 0 })
      const bomTargets = nonCrystals.map(m => ({
        itemId: m.itemId, recipeId: 0, name: m.name, icon: m.icon, quantity: m.amount,
      }))
      const tree = await buildMaterialTree(bomTargets)
      const flatList = flattenMaterialTree(tree)
      onProgress({ current: 0, total: 0, name: '查詢材料價格', phase: 'aggregating', solverPercent: 0 })
      const bomPriceMap = await getAggregatedPrices(priceSource, flatList.map(f => f.itemId))
      const costResult = computeOptimalCosts(tree, (id) => {
        const md = bomPriceMap.get(id)
        return md?.minPriceNQ ?? 0
      })
      for (const decision of costResult.decisions) {
        if (decision.recommendation === 'craft') {
          selfCraftItems.push({
            itemId: decision.itemId, name: decision.name, icon: decision.icon,
            amount: decision.amount, type: 'craft', unitPrice: 0,
          })
        }
      }
    } catch (err) {
      console.warn('[batch-optimizer] Recursive BOM expansion failed:', err)
    }
  }

  // === Phase 5.5: Price materials + add buy-finished items to shopping list ===
  onProgress({ current: 0, total: 0, name: '分組採購清單', phase: 'aggregating', solverPercent: 0 })
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

  return { serverGroups, crystals, selfCraftItems, todoList, exceptions, buyFinishedItems, grandTotal, crossWorldCache, buffRecommendation }
}

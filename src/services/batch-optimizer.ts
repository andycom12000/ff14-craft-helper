import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { BatchException, BatchTarget, BatchResults, TodoItem } from '@/stores/batch'
import type { MaterialWithPrice, MaterialBase } from '@/services/shopping-list'
import { solveCraft, simulateCraft, waitForWasm } from '@/solver/worker'
import { craftParamsToSolverConfig, recipeToCraftParams } from '@/solver/config'
import { findOptimalHqCombinations } from '@/services/hq-optimizer'
import { getAggregatedPrices, getMarketData } from '@/api/universalis'
import { separateCrystals, groupByServer, calculateBestPurchase } from '@/services/shopping-list'
import { buildMaterialTree, flattenMaterialTree, computeOptimalCosts } from '@/services/bom-calculator'

export interface RecipeOptimizeResult {
  recipe: Recipe
  quantity: number
  actions: string[]
  hqAmounts: number[]
  initialQuality: number
  isDoubleMax: boolean
  materials: MaterialBase[]
}

export async function optimizeRecipe(
  recipe: Recipe,
  gearset: GearsetStats,
  onSolverProgress?: (percent: number) => void,
): Promise<RecipeOptimizeResult> {
  const craftParams = recipeToCraftParams(recipe, gearset)
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
      hqAmounts: [], initialQuality: 0, isDoubleMax: true, materials,
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
    isDoubleMax: false, materials,
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
  },
  onProgress: (info: {
    current: number
    total: number
    name: string
    phase: 'solving' | 'pricing' | 'done'
    solverPercent: number
  }) => void,
  isCancelled: () => boolean,
): Promise<BatchResults> {
  const recipeResults: RecipeOptimizeResult[] = []
  const exceptions: BatchException[] = []

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
          exc.buyPrice = md.minPriceNQ
          exc.buyServer = settings.server
        } catch { /* buyPrice stays undefined */ }
      }
      exceptions.push(exc)
      continue
    }

    try {
      const result = await optimizeRecipe(target.recipe, gearset, (pct) => report('solving', pct))
      result.quantity = target.quantity

      if (!result.isDoubleMax && result.hqAmounts.length === 0) {
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
            exc.buyPrice = md.minPriceNQ
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

  // === Phase 4: Aggregate materials with HQ/NQ distinction ===
  const allTypedMaterials: TypedMaterial[] = []
  const selfCraftItems: MaterialWithPrice[] = []

  for (const r of recipeResults) {
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
      const bomTargets = nonCrystals.map(m => ({
        itemId: m.itemId, recipeId: 0, name: m.name, icon: m.icon, quantity: m.amount,
      }))
      const tree = await buildMaterialTree(bomTargets)
      const flatList = flattenMaterialTree(tree)
      const priceMap = await getAggregatedPrices(settings.server, flatList.map(f => f.itemId))
      const costResult = computeOptimalCosts(tree, (id) => {
        const md = priceMap.get(id)
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

  // === Phase 5: Price query + cross-server grouping ===
  onProgress({ current: targets.length, total: targets.length, name: '', phase: 'pricing', solverPercent: 100 })
  const itemIds = [...new Set(nonCrystals.map(m => m.itemId))]
  let pricedMaterials: MaterialWithPrice[]

  if (settings.crossServer) {
    const dcPriceMap = await getAggregatedPrices(settings.dataCenter, itemIds)
    pricedMaterials = nonCrystals.map(m => {
      const md = dcPriceMap.get(m.itemId)
      const isHq = m.matType === 'hq'
      let bestServer = settings.server
      let bestCost = Infinity

      if (md?.listings && md.listings.length > 0) {
        // Group listings by world, then find cheapest whole-stack purchase per world
        const worldMap = new Map<string, typeof md.listings>()
        for (const l of md.listings) {
          const w = l.worldName ?? settings.server
          if (!worldMap.has(w)) worldMap.set(w, [])
          worldMap.get(w)!.push(l)
        }
        for (const [world, worldListings] of worldMap) {
          const purchase = calculateBestPurchase(worldListings, m.amount, isHq)
          if (purchase.fulfilled && purchase.totalCost < bestCost) {
            bestCost = purchase.totalCost
            bestServer = world
          }
        }
      }

      // Fallback to aggregate min price if no listings
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
    const priceMap = await getAggregatedPrices(settings.server, itemIds)
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

      // Fallback
      return {
        itemId: m.itemId, name: m.name, icon: m.icon, amount: m.amount,
        type: isHq ? 'hq' as const : 'nq' as const,
        unitPrice: isHq ? (md?.minPriceHQ ?? 0) : (md?.minPriceNQ ?? 0),
        server: settings.server,
      }
    })
  }

  const serverGroups = groupByServer(pricedMaterials)
  const grandTotal = serverGroups.reduce((sum, g) => sum + g.subtotal, 0)

  // === Phase 6: Todo list (semi-finished first, then top-level) ===
  const todoList: TodoItem[] = recipeResults.map(r => ({
    recipe: r.recipe, quantity: r.quantity, actions: r.actions,
    hqAmounts: r.hqAmounts, isSemiFinished: false, done: false,
  }))

  return { serverGroups, crystals, selfCraftItems, todoList, exceptions, grandTotal }
}

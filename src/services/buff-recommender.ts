import type { RecipeOptimizeResult } from '@/services/batch-optimizer'
import type { GearsetStats } from '@/stores/gearsets'
import type { MarketData } from '@/api/universalis'
import type { FoodBuff, EnhancedStats } from '@/engine/food-medicine'
import type { BuffRecommendation, BuffPriceInfo } from '@/stores/batch'
import {
  COMMON_FOODS, COMMON_MEDICINES,
  resolveBuff, applyFoodBuff, applyMedicineBuff,
} from '@/engine/food-medicine'
import { solveCraft, simulateCraft } from '@/solver/worker'
import { craftParamsToSolverConfig, recipeToCraftParams } from '@/solver/config'
import type { Recipe } from '@/stores/recipe'

export interface BuffCombo {
  food: { buff: FoodBuff; isHq: boolean } | null
  medicine: { buff: FoodBuff; isHq: boolean } | null
}

/**
 * Generate all 44 valid food/medicine combinations (excluding null+null).
 */
export function generateCandidateCombos(): BuffCombo[] {
  const foods: BuffCombo['food'][] = [null]
  for (const f of COMMON_FOODS) {
    foods.push({ buff: f, isHq: true })
    foods.push({ buff: resolveBuff(COMMON_FOODS, f.id, false)!, isHq: false })
  }

  const medicines: BuffCombo['medicine'][] = [null]
  for (const m of COMMON_MEDICINES) {
    medicines.push({ buff: m, isHq: true })
    medicines.push({ buff: resolveBuff(COMMON_MEDICINES, m.id, false)!, isHq: false })
  }

  const combos: BuffCombo[] = []
  for (const food of foods) {
    for (const medicine of medicines) {
      if (!food && !medicine) continue
      combos.push({ food, medicine })
    }
  }
  return combos
}

/**
 * Apply a buff combo to base stats and return enhanced stats.
 */
export function applyCombo(
  baseStats: EnhancedStats,
  combo: BuffCombo,
): EnhancedStats {
  const afterFood = applyFoodBuff(baseStats, combo.food?.buff ?? null)
  return applyMedicineBuff(afterFood, combo.medicine?.buff ?? null)
}

/**
 * Get item IDs for all food/medicine items (for price query).
 */
export function getBuffItemIds(): number[] {
  const ids: number[] = []
  for (const f of COMMON_FOODS) ids.push(f.id)
  for (const m of COMMON_MEDICINES) ids.push(m.id)
  return ids
}

/**
 * Find the cheapest listing's price and server for an item.
 */
function getCheapestListing(md: MarketData, isHq: boolean): BuffPriceInfo {
  const price = isHq ? (md.minPriceHQ || Infinity) : (md.minPriceNQ || Infinity)
  const listing = md.listings?.find(l => l.hq === isHq && l.pricePerUnit === price)
  return { price, server: listing?.worldName }
}

/**
 * Get the market price of a buff combo.
 */
function getComboPrice(combo: BuffCombo, priceMap: Map<number, MarketData>): number {
  let cost = 0
  if (combo.food) {
    const md = priceMap.get(combo.food.buff.id)
    if (!md) return Infinity
    cost += combo.food.isHq ? (md.minPriceHQ || Infinity) : (md.minPriceNQ || Infinity)
  }
  if (combo.medicine) {
    const md = priceMap.get(combo.medicine.buff.id)
    if (!md) return Infinity
    cost += combo.medicine.isHq ? (md.minPriceHQ || Infinity) : (md.minPriceNQ || Infinity)
  }
  return cost
}

/**
 * Get per-item price info (price + server) for a buff combo.
 */
function getComboPriceInfo(combo: BuffCombo, priceMap: Map<number, MarketData>): {
  foodPrice?: BuffPriceInfo
  medicinePrice?: BuffPriceInfo
} {
  let foodPrice: BuffPriceInfo | undefined
  let medicinePrice: BuffPriceInfo | undefined
  if (combo.food) {
    const md = priceMap.get(combo.food.buff.id)
    if (md) foodPrice = getCheapestListing(md, combo.food.isHq)
  }
  if (combo.medicine) {
    const md = priceMap.get(combo.medicine.buff.id)
    if (md) medicinePrice = getCheapestListing(md, combo.medicine.isHq)
  }
  return { foodPrice, medicinePrice }
}

/**
 * Dedup combos that produce identical enhanced stats.
 * Keeps the cheapest combo per unique stat triplet.
 */
function dedupCombos(
  combos: BuffCombo[],
  baseStats: EnhancedStats,
  priceMap: Map<number, MarketData>,
): Array<BuffCombo & { price: number }> {
  const statMap = new Map<string, BuffCombo & { price: number }>()

  for (const combo of combos) {
    const enhanced = applyCombo(baseStats, combo)
    const key = `${enhanced.craftsmanship}-${enhanced.control}-${enhanced.cp}`
    const price = getComboPrice(combo, priceMap)
    if (price === Infinity) continue

    const existing = statMap.get(key)
    if (!existing || price < existing.price) {
      statMap.set(key, { ...combo, price })
    }
  }

  return Array.from(statMap.values()).sort((a, b) => a.price - b.price)
}

/**
 * Check if existing actions achieve isDoubleMax with buffed stats using cheap simulation.
 */
async function simulateWithBuffedStats(
  recipe: Recipe,
  gearset: GearsetStats,
  combo: BuffCombo,
  existingActions: string[],
): Promise<boolean> {
  const craftParams = recipeToCraftParams(recipe, gearset)
  const enhanced = applyCombo(
    { craftsmanship: craftParams.craftsmanship, control: craftParams.control, cp: craftParams.cp },
    combo,
  )
  craftParams.craftsmanship = enhanced.craftsmanship
  craftParams.control = enhanced.control
  craftParams.cp = enhanced.cp
  craftParams.initialQuality = 0

  const config = craftParamsToSolverConfig(craftParams)
  const simResult = await simulateCraft(config, existingActions)

  return simResult.progress >= simResult.max_progress &&
    simResult.quality >= simResult.max_quality
}

/**
 * Full solve with buffed stats to check if isDoubleMax is achievable.
 */
async function solveWithBuffedStats(
  recipe: Recipe,
  gearset: GearsetStats,
  combo: BuffCombo,
): Promise<boolean> {
  const craftParams = recipeToCraftParams(recipe, gearset)
  const enhanced = applyCombo(
    { craftsmanship: craftParams.craftsmanship, control: craftParams.control, cp: craftParams.cp },
    combo,
  )
  craftParams.craftsmanship = enhanced.craftsmanship
  craftParams.control = enhanced.control
  craftParams.cp = enhanced.cp
  craftParams.initialQuality = 0

  const config = craftParamsToSolverConfig(craftParams)
  const solverResult = await solveCraft(config)
  const simResult = await simulateCraft(config, solverResult.actions)

  return simResult.progress >= simResult.max_progress &&
    simResult.quality >= simResult.max_quality
}

/**
 * Calculate total HQ material cost savings if all affected recipes become isDoubleMax.
 */
function calculateHqSavings(
  deficitRecipes: RecipeOptimizeResult[],
  priceMap: Map<number, MarketData>,
): number {
  let total = 0
  for (const r of deficitRecipes) {
    for (let j = 0; j < r.materials.length; j++) {
      const hqCount = r.hqAmounts[j] ?? 0
      if (hqCount === 0) continue
      const md = priceMap.get(r.materials[j].itemId)
      const hqPrice = md?.minPriceHQ ?? 0
      const nqPrice = md?.minPriceNQ ?? 0
      total += (hqPrice - nqPrice) * hqCount * r.quantity
    }
  }
  return total
}

/**
 * Main entry point: evaluate whether food/medicine buffs can replace HQ materials
 * or enable quality-unachievable recipes.
 * Phase 4.6-buff in the batch pipeline.
 */
export async function evaluateBuffRecommendation(
  recipeResults: RecipeOptimizeResult[],
  buyFinishedIds: Set<number>,
  getGearset: (job: string) => GearsetStats | null,
  priceMap: Map<number, MarketData>,
  isCancelled: () => boolean,
  onProgress?: (info: { current: number; total: number }) => void,
  unachievableRecipes: RecipeOptimizeResult[] = [],
): Promise<BuffRecommendation | null> {
  // Step 1: collect deficit recipes (exclude buy-finished and canHq=false)
  const deficitRecipes = recipeResults.filter(
    r => !r.isDoubleMax && r.recipe.canHq && !buyFinishedIds.has(r.recipe.id),
  )
  if (deficitRecipes.length === 0 && unachievableRecipes.length === 0) return null

  const unachievableIds = new Set(unachievableRecipes.map(r => r.recipe.id))

  // Determine the primary target for ceiling check:
  // Prioritize unachievable recipes (enabling crafting is the main goal)
  // Fall back to deficit recipes if no unachievable
  const ceilingTarget = unachievableRecipes.length > 0
    ? [...unachievableRecipes].sort((a, b) => b.qualityDeficit - a.qualityDeficit)[0]
    : [...deficitRecipes].sort((a, b) => b.qualityDeficit - a.qualityDeficit)[0]

  const ceilingGearset = getGearset(ceilingTarget.recipe.job)
  if (!ceilingGearset) return null

  const baseStats: EnhancedStats = {
    craftsmanship: ceilingGearset.craftsmanship,
    control: ceilingGearset.control,
    cp: ceilingGearset.cp,
  }

  // Step 0: stat ceiling pre-check on the primary target
  const allCombos = generateCandidateCombos()
  let bestCeilingCombo: BuffCombo = allCombos[0]
  let bestCeilingScore = 0
  for (const combo of allCombos) {
    const enhanced = applyCombo(baseStats, combo)
    const score = enhanced.control + enhanced.cp
    if (score > bestCeilingScore) {
      bestCeilingScore = score
      bestCeilingCombo = combo
    }
  }
  const ceilingSimPass = await simulateWithBuffedStats(
    ceilingTarget.recipe, ceilingGearset, bestCeilingCombo, ceilingTarget.actions,
  )
  if (!ceilingSimPass) {
    const ceilingSolvePass = await solveWithBuffedStats(
      ceilingTarget.recipe, ceilingGearset, bestCeilingCombo,
    )
    if (!ceilingSolvePass) {
      // If we were checking an unachievable recipe and it failed, no recommendation possible
      // If we were checking a deficit recipe, also give up (original behavior)
      return null
    }
  }

  // Step 2: generate, dedup, sort by price
  const candidates = dedupCombos(allCombos, baseStats, priceMap)
  if (candidates.length === 0) return null

  // All recipes to evaluate (unachievable + deficit)
  const allCandidateRecipes = [...unachievableRecipes, ...deficitRecipes]

  // Step 2.5 + Step 3 + Step 4: try combos cheapest-first
  for (let i = 0; i < candidates.length; i++) {
    if (isCancelled()) return null
    onProgress?.({ current: i + 1, total: candidates.length })
    const candidate = candidates[i]
    const combo: BuffCombo = { food: candidate.food, medicine: candidate.medicine }

    // Step 4: test each recipe with this combo (partial pass)
    const passedRecipes: RecipeOptimizeResult[] = []
    for (const r of allCandidateRecipes) {
      if (isCancelled()) return null
      const gs = getGearset(r.recipe.job)
      if (!gs) continue

      let passes = await simulateWithBuffedStats(r.recipe, gs, combo, r.actions)
      if (!passes) {
        if (isCancelled()) return null
        passes = await solveWithBuffedStats(r.recipe, gs, combo)
      }
      if (passes) passedRecipes.push(r)
    }

    // Step 5: evaluate results
    const passedEnabled = passedRecipes.filter(r => unachievableIds.has(r.recipe.id))
    const passedDeficit = passedRecipes.filter(r => !unachievableIds.has(r.recipe.id))

    if (passedEnabled.length === 0 && passedDeficit.length === 0) continue

    const hqSavings = calculateHqSavings(passedDeficit, priceMap)

    if (passedEnabled.length > 0) {
      // Enables previously-unachievable recipes → always recommend
      const { foodPrice, medicinePrice } = getComboPriceInfo(combo, priceMap)
      return {
        food: combo.food,
        medicine: combo.medicine,
        buffCost: candidate.price,
        foodPrice,
        medicinePrice,
        hqMaterialSavings: hqSavings,
        affectedRecipes: passedDeficit.map(r => ({ id: r.recipe.id, name: r.recipe.name })),
        enabledRecipes: passedEnabled.map(r => ({ id: r.recipe.id, name: r.recipe.name })),
      }
    }

    // Pure deficit case: require all deficit recipes to pass + positive ROI
    if (passedDeficit.length < deficitRecipes.length) continue
    if (candidate.price >= hqSavings) continue

    const { foodPrice, medicinePrice } = getComboPriceInfo(combo, priceMap)
    return {
      food: combo.food,
      medicine: combo.medicine,
      buffCost: candidate.price,
      foodPrice,
      medicinePrice,
      hqMaterialSavings: hqSavings,
      affectedRecipes: passedDeficit.map(r => ({ id: r.recipe.id, name: r.recipe.name })),
      enabledRecipes: [],
    }
  }

  return null
}

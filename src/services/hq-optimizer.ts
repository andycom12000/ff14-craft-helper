import { calculateInitialQuality } from '@/engine/quality'
import type { Ingredient } from '@/stores/recipe'

export interface HqRecommendation {
  hqAmounts: number[] // indexed same as recipe.ingredients
  totalCost: number
  initialQuality: number
  missingPriceIndices: number[] // indices where HQ price is 0
}

export function findOptimalHqCombinations(
  maxQuality: number,
  materialQualityFactor: number,
  ingredients: Ingredient[],
  qualityDeficit: number,
  hqPrices: Map<number, number>, // itemId -> hqUnitPrice
  maxResults: number = 5,
): HqRecommendation[] {
  // Build list of canHq ingredient indices
  const hqIndices = ingredients
    .map((ing, i) => (ing.canHq ? i : -1))
    .filter((i) => i >= 0)

  if (hqIndices.length === 0) return []

  // Generate all combinations via cartesian product of [0..amount] for each canHq ingredient
  const ranges = hqIndices.map((i) => ingredients[i].amount)
  const validCombos: HqRecommendation[] = []

  // Iterate through all combinations using a counter array
  const counters = new Array(hqIndices.length).fill(0)
  let done = false

  while (!done) {
    // Build hqAmounts array (0 for non-canHq ingredients)
    const hqAmounts = new Array(ingredients.length).fill(0)
    for (let j = 0; j < hqIndices.length; j++) {
      hqAmounts[hqIndices[j]] = counters[j]
    }

    // Build ingredients array for calculateInitialQuality
    const qualityIngredients = ingredients.map((ing, i) => ({
      amount: ing.amount,
      hqAmount: hqAmounts[i],
      level: ing.level,
      canHq: ing.canHq,
    }))

    const initialQuality = calculateInitialQuality(
      maxQuality,
      materialQualityFactor,
      qualityIngredients,
    )

    if (initialQuality >= qualityDeficit) {
      // Calculate cost and track missing prices
      const missingPriceIndices: number[] = []
      let totalCost = 0
      let hasMissing = false

      for (let j = 0; j < hqIndices.length; j++) {
        const idx = hqIndices[j]
        const hqAmount = counters[j]
        if (hqAmount === 0) continue

        const price = hqPrices.get(ingredients[idx].itemId) ?? 0
        if (price === 0) {
          missingPriceIndices.push(idx)
          hasMissing = true
        } else {
          totalCost += hqAmount * price
        }
      }

      if (hasMissing) {
        totalCost = Infinity
      }

      validCombos.push({
        hqAmounts,
        totalCost,
        initialQuality,
        missingPriceIndices,
      })
    }

    // Increment counters (odometer style)
    let carry = true
    for (let j = hqIndices.length - 1; j >= 0 && carry; j--) {
      counters[j]++
      if (counters[j] > ranges[j]) {
        counters[j] = 0
      } else {
        carry = false
      }
    }
    if (carry) done = true
  }

  // Sort by cost ascending (Infinity goes last)
  validCombos.sort((a, b) => {
    if (a.totalCost === b.totalCost) return 0
    if (a.totalCost === Infinity) return 1
    if (b.totalCost === Infinity) return -1
    return a.totalCost - b.totalCost
  })

  return validCombos.slice(0, maxResults)
}

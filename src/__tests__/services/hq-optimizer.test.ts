import { describe, it, expect } from 'vitest'
import { findOptimalHqCombinations } from '@/services/hq-optimizer'
import type { Ingredient } from '@/stores/recipe'

function makeIngredient(overrides: Partial<Ingredient> & { itemId: number; amount: number }): Ingredient {
  return {
    name: `Item ${overrides.itemId}`,
    icon: '',
    canHq: true,
    level: 50,
    ...overrides,
  }
}

describe('findOptimalHqCombinations', () => {
  it('returns valid combos sorted by cost for a 2-ingredient recipe', () => {
    const ingredients: Ingredient[] = [
      makeIngredient({ itemId: 1, amount: 3, level: 50 }),
      makeIngredient({ itemId: 2, amount: 2, level: 50 }),
    ]
    const hqPrices = new Map([
      [1, 100],
      [2, 200],
    ])
    // maxQuality=1000, materialQualityFactor=75, qualityDeficit=100
    const results = findOptimalHqCombinations(1000, 75, ingredients, 100, hqPrices)

    expect(results.length).toBeGreaterThan(0)
    // All results should meet the quality deficit
    for (const r of results) {
      expect(r.initialQuality).toBeGreaterThanOrEqual(100)
    }
    // Results should be sorted by cost ascending
    for (let i = 1; i < results.length; i++) {
      expect(results[i].totalCost).toBeGreaterThanOrEqual(results[i - 1].totalCost)
    }
    // hqAmounts should have same length as ingredients
    expect(results[0].hqAmounts).toHaveLength(2)
  })

  it('returns empty array when qualityDeficit is unreachable', () => {
    const ingredients: Ingredient[] = [
      makeIngredient({ itemId: 1, amount: 1, level: 10 }),
    ]
    const hqPrices = new Map([[1, 100]])
    // qualityDeficit of 99999 is unreachable
    const results = findOptimalHqCombinations(1000, 75, ingredients, 99999, hqPrices)
    expect(results).toEqual([])
  })

  it('marks missing HQ prices in missingPriceIndices with Infinity cost', () => {
    const ingredients: Ingredient[] = [
      makeIngredient({ itemId: 1, amount: 2, level: 50 }),
      makeIngredient({ itemId: 2, amount: 2, level: 50 }),
    ]
    // itemId 2 has no price entry
    const hqPrices = new Map([[1, 100]])
    const results = findOptimalHqCombinations(1000, 75, ingredients, 1, hqPrices)

    // Find a result that uses item 2 HQ
    const withMissing = results.find((r) => r.hqAmounts[1] > 0)
    if (withMissing) {
      expect(withMissing.missingPriceIndices).toContain(1)
      expect(withMissing.totalCost).toBe(Infinity)
    }

    // Results with only item 1 HQ (and item 2 HQ = 0) should have finite cost
    const withoutMissing = results.find(
      (r) => r.hqAmounts[0] > 0 && r.hqAmounts[1] === 0,
    )
    if (withoutMissing) {
      expect(withoutMissing.totalCost).toBeLessThan(Infinity)
      expect(withoutMissing.missingPriceIndices).toHaveLength(0)
    }
  })

  it('sorts results by cost ascending with Infinity last', () => {
    const ingredients: Ingredient[] = [
      makeIngredient({ itemId: 1, amount: 3, level: 50 }),
      makeIngredient({ itemId: 2, amount: 2, level: 50 }),
    ]
    // item 2 has no price -> combos using it will be Infinity
    const hqPrices = new Map([[1, 100]])
    const results = findOptimalHqCombinations(1000, 75, ingredients, 1, hqPrices, 20)

    for (let i = 1; i < results.length; i++) {
      if (results[i - 1].totalCost === Infinity) {
        expect(results[i].totalCost).toBe(Infinity)
      } else {
        expect(results[i].totalCost).toBeGreaterThanOrEqual(results[i - 1].totalCost)
      }
    }
  })

  it('respects maxResults limit', () => {
    const ingredients: Ingredient[] = [
      makeIngredient({ itemId: 1, amount: 5, level: 50 }),
      makeIngredient({ itemId: 2, amount: 3, level: 50 }),
    ]
    const hqPrices = new Map([
      [1, 100],
      [2, 200],
    ])
    const results = findOptimalHqCombinations(1000, 75, ingredients, 1, hqPrices, 3)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  it('returns empty array when no ingredients canHq', () => {
    const ingredients: Ingredient[] = [
      makeIngredient({ itemId: 1, amount: 3, level: 50, canHq: false }),
      makeIngredient({ itemId: 2, amount: 2, level: 50, canHq: false }),
    ]
    const hqPrices = new Map([
      [1, 100],
      [2, 200],
    ])
    const results = findOptimalHqCombinations(1000, 75, ingredients, 100, hqPrices)
    expect(results).toEqual([])
  })
})

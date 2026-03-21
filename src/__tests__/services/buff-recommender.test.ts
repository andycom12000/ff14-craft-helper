import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GearsetStats } from '@/stores/gearsets'
import type { RecipeOptimizeResult } from '@/services/batch-optimizer'
import type { MarketData } from '@/api/universalis'
import type { Recipe } from '@/stores/recipe'

vi.mock('@/solver/worker', () => ({
  solveCraft: vi.fn(),
  simulateCraft: vi.fn(),
}))

import { generateCandidateCombos, evaluateBuffRecommendation } from '@/services/buff-recommender'
import { simulateCraft, solveCraft } from '@/solver/worker'

const mockGearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600 }

describe('generateCandidateCombos', () => {
  it('generates 44 combos (excluding null/null)', () => {
    const combos = generateCandidateCombos()
    expect(combos.length).toBe(44)
    expect(combos.every(c => c.food !== null || c.medicine !== null)).toBe(true)
  })

  it('all combos have resolveBuff-generated buffs', () => {
    const combos = generateCandidateCombos()
    for (const c of combos) {
      if (c.food) expect(c.food.buff.id).toBeGreaterThan(0)
      if (c.medicine) expect(c.medicine.buff.id).toBeGreaterThan(0)
    }
  })
})

const mockRecipe: Recipe = {
  id: 1, itemId: 100, name: 'Test Recipe', icon: '', job: 'CRP',
  level: 90, stars: 0, canHq: true, materialQualityFactor: 75,
  ingredients: [
    { itemId: 200, name: 'Mat A', icon: '', amount: 3, canHq: true, level: 50 },
  ],
  recipeLevelTable: {
    classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
    durability: 80, suggestedCraftsmanship: 0,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 80,
  },
}

function makeDeficitResult(recipe: Recipe, qualityDeficit: number): RecipeOptimizeResult {
  return {
    recipe, quantity: 2, actions: ['muscle_memory'],
    hqAmounts: [3], initialQuality: 500, isDoubleMax: false,
    materials: [{ itemId: 200, name: 'Mat A', icon: '', amount: 3 }],
    qualityDeficit,
  }
}

const priceMap = new Map<number, MarketData>([
  [36060, { minPriceNQ: 500, minPriceHQ: 2000 } as MarketData],
  [38929, { minPriceNQ: 600, minPriceHQ: 2500 } as MarketData],
  [37282, { minPriceNQ: 400, minPriceHQ: 1800 } as MarketData],
  [44091, { minPriceNQ: 700, minPriceHQ: 3000 } as MarketData],
  [44169, { minPriceNQ: 300, minPriceHQ: 1500 } as MarketData],
  [44168, { minPriceNQ: 350, minPriceHQ: 1600 } as MarketData],
  [200, { minPriceNQ: 100, minPriceHQ: 5000 } as MarketData],
])

describe('evaluateBuffRecommendation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when no deficit recipes exist', async () => {
    const result = await evaluateBuffRecommendation(
      [], new Set(), () => mockGearset, priceMap, () => false,
    )
    expect(result).toBeNull()
  })

  it('returns recommendation when buff enables HQ and saves money', async () => {
    vi.mocked(simulateCraft).mockResolvedValue({
      progress: 3500, max_progress: 3500,
      quality: 7200, max_quality: 7200,
    } as any)

    const deficitResult = makeDeficitResult(mockRecipe, 1000)
    const result = await evaluateBuffRecommendation(
      [deficitResult], new Set(), () => mockGearset, priceMap, () => false,
    )

    expect(result).not.toBeNull()
    expect(result!.buffCost).toBeGreaterThan(0)
    expect(result!.hqMaterialSavings).toBeGreaterThan(result!.buffCost)
    expect(result!.affectedRecipes).toHaveLength(1)
  })

  it('returns null when cancelled', async () => {
    const result = await evaluateBuffRecommendation(
      [makeDeficitResult(mockRecipe, 1000)],
      new Set(), () => mockGearset, priceMap, () => true,
    )
    expect(result).toBeNull()
  })

  it('excludes buy-finished recipes', async () => {
    const result = await evaluateBuffRecommendation(
      [makeDeficitResult(mockRecipe, 1000)],
      new Set([1]),
      () => mockGearset, priceMap, () => false,
    )
    expect(result).toBeNull()
  })
})

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
import { COMMON_FOODS, COMMON_MEDICINES } from '@/engine/food-medicine'
import { simulateCraft, solveCraft } from '@/solver/worker'

const mockGearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false }

describe('generateCandidateCombos', () => {
  it('generates every food × medicine combo (excluding null/null)', () => {
    const combos = generateCandidateCombos()
    // Each buff yields an HQ and an NQ variant, plus the "no buff" slot.
    const expected =
      (COMMON_FOODS.length * 2 + 1) * (COMMON_MEDICINES.length * 2 + 1) - 1
    expect(combos.length).toBe(expected)
    expect(combos.every(c => c.food !== null || c.medicine !== null)).toBe(true)
  })

  it('covers each consumable in both HQ and NQ', () => {
    const combos = generateCandidateCombos()
    for (const f of COMMON_FOODS) {
      expect(combos.some(c => c.food?.buff.id === f.id && c.food.isHq)).toBe(true)
      expect(combos.some(c => c.food?.buff.id === f.id && !c.food.isHq)).toBe(true)
    }
    for (const m of COMMON_MEDICINES) {
      expect(combos.some(c => c.medicine?.buff.id === m.id && c.medicine.isHq)).toBe(true)
      expect(combos.some(c => c.medicine?.buff.id === m.id && !c.medicine.isHq)).toBe(true)
    }
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
  level: 90, stars: 0, canHq: true, materialQualityFactor: 75, amountResult: 1,
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
    recipe, quantity: 2, outputAmount: 2, actions: ['muscle_memory'],
    hqAmounts: [3], initialQuality: 500, isDoubleMax: false,
    materials: [{ itemId: 200, name: 'Mat A', icon: '', amount: 3 }],
    qualityDeficit,
  }
}

/**
 * Like makeDeficitResult but with a distinct recipe id/name and a per-recipe
 * `actions` marker, so mocks can identify which recipe a simulateCraft /
 * solveCraft call belongs to without depending on call ordering.
 */
function makeRecipeResult(
  id: number, name: string, actionMarker: string, qualityDeficit: number,
): RecipeOptimizeResult {
  return {
    recipe: { ...mockRecipe, id, name },
    quantity: 2, outputAmount: 2, actions: [actionMarker],
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

  it('clears the ceiling gate for a progress-bound recipe via the craftsmanship probe', async () => {
    // At 4000/3800/600 the control probe (鮭魚乾 + 巨匠藥液) reaches
    // craftsmanship 4098 and the CP probe (椒麻鰻魚 + 魔匠藥液) only 4000, so a
    // gate above 4098 is unreachable on either. Only the craftsmanship probe —
    // 巧克力奶油蛋糕 HQ (+240) + 名匠藥液 HQ (+63) = 4303 — clears it; the NQ
    // pair tops out at 4242.
    const CRAFTSMANSHIP_GATE = 4300
    vi.mocked(simulateCraft).mockImplementation((config: any) => Promise.resolve({
      progress: config.craftsmanship >= CRAFTSMANSHIP_GATE ? 3500 : 2000,
      max_progress: 3500,
      quality: 7200,
      max_quality: 7200,
    } as any))
    vi.mocked(solveCraft).mockResolvedValue({
      actions: ['x'], progress: 3500, quality: 7200, steps: 1,
    } as any)

    const craftsmanshipPrices = new Map(priceMap)
    craftsmanshipPrices.set(44088, { minPriceNQ: 800, minPriceHQ: 3200 } as MarketData)
    craftsmanshipPrices.set(44167, { minPriceNQ: 400, minPriceHQ: 1700 } as MarketData)

    const result = await evaluateBuffRecommendation(
      [], new Set(), () => mockGearset, craftsmanshipPrices, () => false,
      undefined, [makeDeficitResult(mockRecipe, 0)],
    )

    expect(result).not.toBeNull()
    expect(result!.enabledRecipes).toHaveLength(1)
    expect(result!.food?.buff.id).toBe(44088)
    expect(result!.food?.isHq).toBe(true)
    expect(result!.medicine?.buff.id).toBe(44167)
    expect(result!.medicine?.isHq).toBe(true)
  })

  it('clears the ceiling gate for a CP-bound recipe via the CP probe', async () => {
    // Regression guard for the additive scorer. At 4000/3800/600 a `control+cp`
    // aggregate picks 鮭魚乾 + 巨匠藥液 (cp 600) because +215 control outweighs
    // the CP it gives up, and even the pre-existing best (犎牛牛排 + 巨匠藥液)
    // only reached 692. The gate sits at 725 so that 椒麻鰻魚 HQ + 魔匠藥液 HQ
    // (727) is the only combo in the whole table that clears it on stats alone
    // — 酸檸檬醃魚 HQ + 魔匠藥液 HQ is the runner-up at 723 and is priced here
    // deliberately, so the assertion below cannot be flipped by someone adding
    // a price for it to the shared fixture.
    const CP_GATE = 725
    vi.mocked(simulateCraft).mockImplementation((config: any) => Promise.resolve({
      progress: 3500,
      max_progress: 3500,
      quality: config.cp >= CP_GATE ? 7200 : 5000,
      max_quality: 7200,
    } as any))
    vi.mocked(solveCraft).mockResolvedValue({
      actions: ['x'], progress: 3500, quality: 7200, steps: 1,
    } as any)

    const cpPrices = new Map(priceMap)
    cpPrices.set(46253, { minPriceNQ: 900, minPriceHQ: 3600 } as MarketData)
    // Priced far below 46253, so if the gate ever stopped discriminating on
    // stats this test would fail loudly on the cheaper runner-up rather than
    // pass for the wrong reason.
    cpPrices.set(44842, { minPriceNQ: 100, minPriceHQ: 200 } as MarketData)

    const result = await evaluateBuffRecommendation(
      [], new Set(), () => mockGearset, cpPrices, () => false,
      undefined, [makeDeficitResult(mockRecipe, 0)],
    )

    expect(result).not.toBeNull()
    expect(result!.enabledRecipes).toHaveLength(1)
    expect(result!.food?.buff.id).toBe(46253)
    expect(result!.medicine?.buff.id).toBe(44169)
  })

  it('clears the ceiling gate for a balanced-quality recipe via the aggregate probe', async () => {
    // Regression guard for dropping the aggregate scorer. At 2500/2000/500 the
    // best control+cp combo is 椒麻鰻魚 HQ + 巨匠藥液 HQ (2163 / 600), which
    // tops neither axis alone — control-max is 鮭魚乾 + 巨匠藥液 (2243 / 500)
    // and cp-max is 椒麻鰻魚 + 魔匠藥液 (2100 / 627). A recipe needing both
    // control ≥ 2150 and cp ≥ 600 is therefore reachable only by the aggregate.
    const midGearset: GearsetStats = {
      level: 100, craftsmanship: 2500, control: 2000, cp: 500, isSpecialist: false,
    }
    vi.mocked(simulateCraft).mockImplementation((config: any) => Promise.resolve({
      progress: 3500,
      max_progress: 3500,
      quality: config.control >= 2150 && config.cp >= 600 ? 7200 : 5000,
      max_quality: 7200,
    } as any))
    vi.mocked(solveCraft).mockResolvedValue({
      actions: ['x'], progress: 3500, quality: 7200, steps: 1,
    } as any)

    const balancedPrices = new Map(priceMap)
    balancedPrices.set(46253, { minPriceNQ: 900, minPriceHQ: 3600 } as MarketData)

    const result = await evaluateBuffRecommendation(
      [], new Set(), () => midGearset, balancedPrices, () => false,
      undefined, [makeDeficitResult(mockRecipe, 0)],
    )

    expect(result).not.toBeNull()
    expect(result!.enabledRecipes).toHaveLength(1)
    expect(result!.food?.buff.id).toBe(46253)
    expect(result!.medicine?.buff.id).toBe(44168)
  })

  it('stops probing the ceiling as soon as the run is cancelled', async () => {
    // Each probe can cost a full solve; cancellation must not have to wait them out.
    vi.mocked(simulateCraft).mockResolvedValue({
      progress: 3500, max_progress: 3500, quality: 5000, max_quality: 7200,
    } as any)
    vi.mocked(solveCraft).mockResolvedValue({
      actions: ['x'], progress: 3500, quality: 5000, steps: 1,
    } as any)

    const result = await evaluateBuffRecommendation(
      [], new Set(), () => mockGearset, priceMap, () => true,
      undefined, [makeDeficitResult(mockRecipe, 0)],
    )

    expect(result).toBeNull()
    expect(vi.mocked(solveCraft)).not.toHaveBeenCalled()
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

  it('returns recommendation for quality-unachievable recipes via unachievableRecipes param', async () => {
    vi.mocked(simulateCraft).mockResolvedValue({
      progress: 3500, max_progress: 3500,
      quality: 7200, max_quality: 7200,
    } as any)

    const unachievable: RecipeOptimizeResult = {
      recipe: { ...mockRecipe, id: 2, name: 'Hard Potion' },
      quantity: 6, outputAmount: 6, actions: ['muscle_memory'],
      hqAmounts: [], initialQuality: 0, isDoubleMax: false,
      materials: [{ itemId: 200, name: 'Mat A', icon: '', amount: 3 }],
      qualityDeficit: 3000,
    }

    const result = await evaluateBuffRecommendation(
      [], new Set(), () => mockGearset, priceMap, () => false,
      undefined, [unachievable],
    )

    expect(result).not.toBeNull()
    expect(result!.enabledRecipes).toHaveLength(1)
    expect(result!.enabledRecipes[0].name).toBe('Hard Potion')
    expect(result!.affectedRecipes).toHaveLength(0)
  })

  it('returns null when no deficit and no unachievable recipes', async () => {
    const result = await evaluateBuffRecommendation(
      [], new Set(), () => mockGearset, priceMap, () => false,
      undefined, [],
    )
    expect(result).toBeNull()
  })

  // PR-2: within one combo, candidate recipes are evaluated concurrently.
  it('evaluates candidate recipes concurrently within a combo', async () => {
    let inFlight = 0
    let maxInFlight = 0
    vi.mocked(simulateCraft).mockImplementation(async (config: any) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(resolve => setTimeout(resolve, 10))
      inFlight--
      return {
        progress: config.progress, max_progress: config.progress,
        quality: config.quality, max_quality: config.quality,
      } as any
    })

    const recipes = [
      makeRecipeResult(1, 'Recipe 1', 'action_r1', 1000),
      makeRecipeResult(2, 'Recipe 2', 'action_r2', 1000),
      makeRecipeResult(3, 'Recipe 3', 'action_r3', 1000),
    ]

    await evaluateBuffRecommendation(
      recipes, new Set(), () => mockGearset, priceMap, () => false,
    )

    expect(maxInFlight).toBeGreaterThan(1) // serial version is pinned at 1
  })

  // PR-2: result parity — same inputs produce identical recommendation as before.
  it('returns the same passedRecipes set and order as the serial implementation', async () => {
    // r1, r3 pass on the first simulate; r2 fails simulate and only passes
    // after a solve — the mock keys off the `actions` marker, not call order,
    // so it stays correct regardless of how Promise.all interleaves calls.
    vi.mocked(simulateCraft).mockImplementation(async (config: any, actions?: string[]) => {
      const pass = {
        progress: config.progress, max_progress: config.progress,
        quality: config.quality, max_quality: config.quality,
      }
      const fail = { progress: 0, max_progress: config.progress, quality: 0, max_quality: config.quality }
      return (actions?.[0] === 'action_r2' ? fail : pass) as any
    })
    vi.mocked(solveCraft).mockResolvedValue({
      actions: ['solved_r2'], progress: 3500, quality: 7200, steps: 1,
    } as any)

    const r1 = makeRecipeResult(1, 'Recipe 1', 'action_r1', 1000)
    const r2 = makeRecipeResult(2, 'Recipe 2', 'action_r2', 1000)
    const r3 = makeRecipeResult(3, 'Recipe 3', 'action_r3', 1000)

    const result = await evaluateBuffRecommendation(
      [r1, r2, r3], new Set(), () => mockGearset, priceMap, () => false,
    )

    expect(result).not.toBeNull()
    expect(result!.affectedRecipes.map(r => r.id)).toEqual([1, 2, 3])
    expect(result!.affectedRecipes.map(r => r.name)).toEqual(['Recipe 1', 'Recipe 2', 'Recipe 3'])
  })
})


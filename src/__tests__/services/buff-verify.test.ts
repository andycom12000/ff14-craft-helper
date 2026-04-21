import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

vi.mock('@/solver/worker', () => ({
  solveCraft: vi.fn(),
  simulateCraft: vi.fn(),
  waitForWasm: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/api/universalis', () => ({
  getAggregatedPrices: vi.fn().mockResolvedValue(new Map()),
  getMarketData: vi.fn().mockResolvedValue({ minPriceNQ: 5000, minPriceHQ: 8000 }),
  aggregateByWorld: vi.fn().mockReturnValue([]),
}))
vi.mock('@/services/bom-calculator', () => ({
  buildMaterialTree: vi.fn().mockResolvedValue([]),
  flattenMaterialTree: vi.fn().mockReturnValue([]),
  getCraftingOrder: vi.fn().mockReturnValue([]),
  computeOptimalCosts: vi.fn().mockReturnValue({ totalCost: 0, decisions: [] }),
  SELF_CRAFT_SAVINGS_THRESHOLD: 0.1,
}))
vi.mock('@/services/buff-recommender', () => ({
  evaluateBuffRecommendation: vi.fn().mockResolvedValue(null),
  getBuffItemIds: vi.fn().mockReturnValue([]),
}))
vi.mock('@/services/self-craft-candidates', () => ({
  produceSelfCraftCandidates: vi.fn().mockResolvedValue([]),
}))

import { optimizeRecipe, runBatchOptimization } from '@/services/batch-optimizer'
import { solveCraft, simulateCraft } from '@/solver/worker'
import { COMMON_FOODS, COMMON_MEDICINES, applyFoodBuff, applyMedicineBuff, resolveBuff } from '@/engine/food-medicine'

const mockRecipe: Recipe = {
  id: 1, itemId: 100, name: 'Test', icon: '', job: 'CRP',
  level: 90, stars: 0, canHq: true, materialQualityFactor: 75,
  ingredients: [{ itemId: 200, name: 'Mat A', icon: '', amount: 3, canHq: true, level: 50 }],
  recipeLevelTable: {
    classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
    durability: 80, suggestedCraftsmanship: 0,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 80,
  },
}
const gearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600 }

describe('optimizeRecipe buff propagation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('applies both food+medicine to solver config', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['x'], progress: 3500, quality: 7200, steps: 1 })
    vi.mocked(simulateCraft).mockResolvedValue({
      progress: 3500, max_progress: 3500, quality: 7200, max_quality: 7200,
    } as any)

    const food = COMMON_FOODS[3] // 犎牛牛排 HQ: control +5% max97, cp +26% max92
    const med = COMMON_MEDICINES[0] // 魔匠藥液 HQ: cp +6% max27

    await optimizeRecipe(mockRecipe, gearset, undefined, { food, medicine: med })

    const expected = applyMedicineBuff(applyFoodBuff(gearset, food), med)
    const callConfig = vi.mocked(solveCraft).mock.calls[0][0]
    expect(callConfig.craftsmanship).toBe(expected.craftsmanship)
    expect(callConfig.control).toBe(expected.control)
    expect(callConfig.cp).toBe(expected.cp)
  })

  it('NQ food applies the reduced NQ numbers', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['x'], progress: 3500, quality: 7200, steps: 1 })
    vi.mocked(simulateCraft).mockResolvedValue({
      progress: 3500, max_progress: 3500, quality: 7200, max_quality: 7200,
    } as any)

    const foodHq = COMMON_FOODS[0]
    const foodNq = resolveBuff(COMMON_FOODS, foodHq.id, false)!

    await optimizeRecipe(mockRecipe, gearset, undefined, { food: foodNq, medicine: null })

    const callConfig = vi.mocked(solveCraft).mock.calls[0][0]
    const expectedHq = applyFoodBuff(gearset, foodHq)
    expect(callConfig.cp).toBeLessThan(expectedHq.cp)
  })

  it('runBatchOptimization resolves IDs to buffs and passes to solver', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['x'], progress: 3500, quality: 7200, steps: 1 })
    vi.mocked(simulateCraft).mockResolvedValue({
      progress: 3500, max_progress: 3500, quality: 7200, max_quality: 7200,
    } as any)

    const food = COMMON_FOODS[1] // 近東蝦香飯
    const med = COMMON_MEDICINES[1] // 巨匠藥液

    await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }],
      () => gearset,
      {
        crossServer: false, recursivePricing: false, maxRecursionDepth: 3,
        exceptionStrategy: 'skip', server: 'S', dataCenter: 'D',
        foodId: food.id, foodIsHq: true,
        medicineId: med.id, medicineIsHq: true,
      },
      () => {}, () => false,
    )

    const expected = applyMedicineBuff(applyFoodBuff(gearset, food), med)
    const callConfig = vi.mocked(solveCraft).mock.calls[0][0]
    expect(callConfig.craftsmanship).toBe(expected.craftsmanship)
    expect(callConfig.control).toBe(expected.control)
    expect(callConfig.cp).toBe(expected.cp)
  })
})

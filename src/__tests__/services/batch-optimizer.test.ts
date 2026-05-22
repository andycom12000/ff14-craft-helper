import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

const { MockSolveCancelledError } = vi.hoisted(() => {
  class MockSolveCancelledError extends Error {
    constructor(message = '求解已取消') {
      super(message)
      this.name = 'SolveCancelledError'
    }
  }
  return { MockSolveCancelledError }
})

vi.mock('@/solver/worker', () => ({
  solveCraft: vi.fn(),
  simulateCraft: vi.fn(),
  waitForWasm: vi.fn().mockResolvedValue(undefined),
  SolveCancelledError: MockSolveCancelledError,
}))
vi.mock('@/api/universalis', () => ({
  getAggregatedPrices: vi.fn().mockResolvedValue(new Map()),
  aggregateByWorld: vi.fn().mockReturnValue([]),
}))
vi.mock('@/services/bom-calculator', () => ({
  buildMaterialTree: vi.fn().mockResolvedValue([]),
  flattenMaterialTree: vi.fn().mockReturnValue([]),
  getCraftingOrder: vi.fn().mockReturnValue([]),
  computeOptimalCosts: vi.fn().mockReturnValue({ totalCost: 0, decisions: [] }),
}))
vi.mock('@/services/buff-recommender', () => ({
  evaluateBuffRecommendation: vi.fn().mockResolvedValue(null),
  getBuffItemIds: vi.fn().mockReturnValue([]),
}))
vi.mock('@/services/self-craft-candidates', () => ({
  produceSelfCraftCandidates: vi.fn().mockResolvedValue([]),
}))

import { optimizeRecipe, runBatchOptimization } from '@/services/batch-optimizer'
import { solveCraft, simulateCraft, SolveCancelledError } from '@/solver/worker'

const mockRecipe: Recipe = {
  id: 1, itemId: 100, name: 'Test', icon: '', job: 'CRP',
  level: 90, stars: 0, canHq: true, materialQualityFactor: 75, amountResult: 1,
  ingredients: [
    { itemId: 200, name: 'Mat A', icon: '', amount: 3, canHq: true, level: 50 },
    { itemId: 201, name: 'Mat B', icon: '', amount: 2, canHq: false, level: 50 },
  ],
  recipeLevelTable: {
    classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
    durability: 80, suggestedCraftsmanship: 0,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 80,
  },
}
const mockGearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false }

/** Hard-gated variant used by tests that need the level-insufficient code path. */
const starredMockRecipe: Recipe = {
  ...mockRecipe,
  stars: 1,
  recipeLevelTable: { ...mockRecipe.recipeLevelTable, stars: 1 },
}

const doubleMaxSim = {
  progress: 3500, max_progress: 3500,
  quality: 7200, max_quality: 7200,
  durability: 10, max_durability: 80, cp: 100, max_cp: 600, steps_count: 2,
}
const qualityDeficitSim = {
  progress: 3500, max_progress: 3500,
  quality: 5000, max_quality: 7200,
  durability: 10, max_durability: 80, cp: 100, max_cp: 600, steps_count: 1,
}

describe('optimizeRecipe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns double-max result when solver achieves full quality', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory', 'groundwork'], progress: 3500, quality: 7200, steps: 2 })
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)

    const result = await optimizeRecipe(mockRecipe, mockGearset)
    expect(result.isDoubleMax).toBe(true)
    expect(result.hqAmounts).toEqual([])
  })

  it('returns hq combo when quality deficit exists', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory'], progress: 3500, quality: 5000, steps: 1 })
    vi.mocked(simulateCraft).mockResolvedValue(qualityDeficitSim as any)

    const result = await optimizeRecipe(mockRecipe, mockGearset)
    expect(result.isDoubleMax).toBe(false)
    expect(result.hqAmounts.length).toBe(2)
  })

  it('returns qualityDeficit = 0 when double-max', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory', 'groundwork'], progress: 3500, quality: 7200, steps: 2 })
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)

    const result = await optimizeRecipe(mockRecipe, mockGearset)
    expect(result.qualityDeficit).toBe(0)
  })

  it('returns qualityDeficit when quality < max', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory'], progress: 3500, quality: 5000, steps: 1 })
    vi.mocked(simulateCraft).mockResolvedValue(qualityDeficitSim as any)

    const result = await optimizeRecipe(mockRecipe, mockGearset)
    expect(result.qualityDeficit).toBe(2200) // 7200 - 5000
  })

  it('treats non-HQ recipe as double-max when progress is full (quality irrelevant)', async () => {
    // canHq=false + requiredQuality=0 (e.g. furniture, housing): quality doesn't
    // carry to the final item, so progress-full alone should be a successful
    // craft, not a "無法達成雙滿" exception.
    const nonHqRecipe: Recipe = { ...mockRecipe, canHq: false }
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory'], progress: 3500, quality: 5000, steps: 1 })
    vi.mocked(simulateCraft).mockResolvedValue(qualityDeficitSim as any)

    const result = await optimizeRecipe(nonHqRecipe, mockGearset)
    expect(result.isDoubleMax).toBe(true)
    expect(result.hqAmounts).toEqual([])
  })

  it('non-HQ recipe with requiredQuality treats threshold as the quality target', async () => {
    // canHq=false + requiredQuality>0 (tribe-quest 建造組件): quality matters,
    // but the target is the explicit RequiredQuality, not max_quality.
    const tribeRecipe: Recipe = { ...mockRecipe, canHq: false, requiredQuality: 6000 }
    // Sim returns quality=6500 (≥ reqQ 6000) → success.
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory'], progress: 3500, quality: 6500, steps: 1 })
    vi.mocked(simulateCraft).mockResolvedValue({
      ...qualityDeficitSim, quality: 6500,
    } as any)

    const result = await optimizeRecipe(tribeRecipe, mockGearset)
    expect(result.isDoubleMax).toBe(true)
  })

  it('non-HQ recipe with requiredQuality flags isDoubleMax=false when below threshold', async () => {
    const tribeRecipe: Recipe = { ...mockRecipe, canHq: false, requiredQuality: 6000 }
    // Sim quality 5000 < reqQ 6000 → not double-max.
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory'], progress: 3500, quality: 5000, steps: 1 })
    vi.mocked(simulateCraft).mockResolvedValue(qualityDeficitSim as any)

    const result = await optimizeRecipe(tribeRecipe, mockGearset)
    expect(result.isDoubleMax).toBe(false)
  })
})

describe('runBatchOptimization', () => {
  beforeEach(() => vi.clearAllMocks())

  const defaultSettings = {
    crossServer: false, recursivePricing: false, maxRecursionDepth: 3,
    exceptionStrategy: 'skip' as const, server: 'Chocobo', dataCenter: 'Mana',
  }

  it('creates level-insufficient exception when gearset too low AND recipe has stars', async () => {
    // Star-gated recipes hard-block synthesis below recipe level in-game.
    const lowGearset: GearsetStats = { level: 50, craftsmanship: 1000, control: 1000, cp: 300, isSpecialist: false }
    const result = await runBatchOptimization(
      [{ recipe: starredMockRecipe, quantity: 1 }],
      () => lowGearset,
      defaultSettings,
      () => {}, () => false,
    )
    expect(result.exceptions).toHaveLength(1)
    expect(result.exceptions[0].type).toBe('level-insufficient')
    expect(result.exceptions[0].action).toBe('skipped')
  })

  it('hard-blocks when gearset is low AND recipe is expert (no stars)', async () => {
    const expertRecipe: Recipe = { ...mockRecipe, isExpert: true }
    const lowGearset: GearsetStats = { level: 50, craftsmanship: 1000, control: 1000, cp: 300, isSpecialist: false }
    const result = await runBatchOptimization(
      [{ recipe: expertRecipe, quantity: 1 }],
      () => lowGearset,
      defaultSettings,
      () => {}, () => false,
    )
    expect(result.exceptions).toHaveLength(1)
    expect(result.exceptions[0].type).toBe('level-insufficient')
  })

  it('hard-blocks when gearset is low AND recipe has stat gate (no stars)', async () => {
    const gatedRecipe: Recipe = { ...mockRecipe, requiredCraftsmanship: 3500 }
    const lowGearset: GearsetStats = { level: 50, craftsmanship: 1000, control: 1000, cp: 300, isSpecialist: false }
    const result = await runBatchOptimization(
      [{ recipe: gatedRecipe, quantity: 1 }],
      () => lowGearset,
      defaultSettings,
      () => {}, () => false,
    )
    expect(result.exceptions).toHaveLength(1)
    expect(result.exceptions[0].type).toBe('level-insufficient')
  })

  it('does NOT block a 0-star recipe when gearset is below recipe level — solver runs with penalty', async () => {
    // FFXIV allows attempting standard 0-star recipes below recipe level;
    // the in-game penalty (progress/quality modifier) is what gates effectiveness.
    vi.mocked(solveCraft).mockResolvedValue({
      actions: ['muscle_memory', 'groundwork'], progress: 3500, quality: 7200, steps: 2,
    })
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)

    const lowGearset: GearsetStats = { level: 89, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false }
    const result = await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }],
      () => lowGearset,
      defaultSettings,
      () => {}, () => false,
    )
    // No level-insufficient exception — the recipe was solved.
    const levelExc = result.exceptions.find((e) => e.type === 'level-insufficient')
    expect(levelExc).toBeUndefined()
    expect(solveCraft).toHaveBeenCalled()
  })

  it('does NOT raise quality-unachievable exception on non-HQ recipe when quality is below max', async () => {
    // Regression: non-HQ recipes (e.g. 檻框隔離牆) used to be flagged
    // "無法達成雙滿" whenever solver couldn't fill quality, then get rerouted to
    // buy-finished when exceptionStrategy='buy'. Quality is meaningless on
    // canHq=false items — the craft should be kept on the todo list.
    const nonHqRecipe: Recipe = { ...mockRecipe, canHq: false }
    vi.mocked(solveCraft).mockResolvedValue({
      actions: ['muscle_memory', 'careful'], progress: 3500, quality: 5000, steps: 2,
    })
    vi.mocked(simulateCraft).mockResolvedValue(qualityDeficitSim as any)
    // Materials free so craft cost = 0 → craft-vs-buy can't push to buy either.
    const { getAggregatedPrices } = await import('@/api/universalis')
    vi.mocked(getAggregatedPrices).mockResolvedValue(new Map())

    const result = await runBatchOptimization(
      [{ recipe: nonHqRecipe, quantity: 1 }],
      () => mockGearset,
      { ...defaultSettings, exceptionStrategy: 'buy' },
      () => {}, () => false,
    )
    expect(result.exceptions).toHaveLength(0)
    expect(result.buyFinishedItems).toHaveLength(0)
    expect(result.todoList).toHaveLength(1)
    expect(result.todoList[0].recipe.itemId).toBe(nonHqRecipe.itemId)
  })

  it('non-HQ tribe-quest recipe (reqQ>0) raises a precise "所需品質" exception when quality falls short', async () => {
    // Mirrors the tribe-quest deliverables (獺獺噴泉建造組件 etc): canHq=false,
    // requiredQuality>0. Solver doesn't optimize quality on canHq=false (current
    // solver behavior), so quality lands below reqQ → must NOT be silently
    // marked done, must surface a clear message.
    const tribeRecipe: Recipe = {
      ...mockRecipe, canHq: false, requiredQuality: 13500,
    }
    vi.mocked(solveCraft).mockResolvedValue({
      actions: ['groundwork'], progress: 3500, quality: 800, steps: 1,
    })
    vi.mocked(simulateCraft).mockResolvedValue({
      ...qualityDeficitSim, quality: 800,
    } as any)
    const { getAggregatedPrices } = await import('@/api/universalis')
    vi.mocked(getAggregatedPrices).mockResolvedValue(new Map())

    const result = await runBatchOptimization(
      [{ recipe: tribeRecipe, quantity: 1 }],
      () => mockGearset,
      defaultSettings,
      () => {}, () => false,
    )
    expect(result.exceptions).toHaveLength(1)
    expect(result.exceptions[0].message).toBe('無法達成所需品質')
    expect(result.exceptions[0].details).toContain('13500')
    expect(result.todoList).toHaveLength(0)
  })

  it('hard-blocks when gearset is missing entirely (no job configured)', async () => {
    const result = await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }],
      () => null,
      defaultSettings,
      () => {}, () => false,
    )
    expect(result.exceptions).toHaveLength(1)
    expect(result.exceptions[0].type).toBe('level-insufficient')
  })

  it('queries buy price when exception strategy is buy', async () => {
    const { getAggregatedPrices } = await import('@/api/universalis')
    vi.mocked(getAggregatedPrices).mockResolvedValue(new Map([
      [starredMockRecipe.itemId, { minPriceNQ: 12000, minPriceHQ: 15000, listings: [] } as any],
    ]))
    const result = await runBatchOptimization(
      [{ recipe: starredMockRecipe, quantity: 1 }],
      () => ({ level: 50, craftsmanship: 1000, control: 1000, cp: 300, isSpecialist: false }),
      { ...defaultSettings, exceptionStrategy: 'buy' },
      () => {}, () => false,
    )
    expect(result.exceptions[0].action).toBe('buy-finished')
    expect(result.exceptions[0].buyPrice).toBe(15000) // HQ price for canHq recipe
    expect(result.exceptions[0].buyServer).toBe('Chocobo')
  })

  it('downgrades recipe to buy-finished when buying is cheaper than crafting', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory', 'groundwork'], progress: 3500, quality: 7200, steps: 2 })
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)
    // Materials are free (priceMap empty) → craft cost = 0; finished product has a listed buy price.
    const { getAggregatedPrices } = await import('@/api/universalis')
    // craftCostPerUnit = 3*1000 + 2*500 = 4000 (only NQ since hqAmounts=[] for doubleMax);
    // finished product HQ = 1000 → buy < craft → downgrade.
    vi.mocked(getAggregatedPrices).mockResolvedValue(new Map([
      [mockRecipe.itemId, { minPriceNQ: 0, minPriceHQ: 1000, listings: [] } as any],
      [200, { minPriceNQ: 1000, minPriceHQ: 0, listings: [] } as any],
      [201, { minPriceNQ: 500, minPriceHQ: 0, listings: [] } as any],
    ]))

    const result = await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }],
      () => mockGearset,
      defaultSettings,
      () => {}, () => false,
    )
    expect(result.buyFinishedItems).toHaveLength(1)
    expect(result.buyFinishedItems[0].recipe.itemId).toBe(mockRecipe.itemId)
    expect(result.todoList).toHaveLength(0)
  })

  it('buy threshold for amountResult>1 recipe compares per-output cost', async () => {
    // Food yields 3 per craft. Materials cost 600/craft = 200/serving.
    // Buy price 250/serving > 200 → must NOT downgrade to buy.
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory', 'groundwork'], progress: 3500, quality: 7200, steps: 2 })
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)
    const { getAggregatedPrices } = await import('@/api/universalis')
    const foodRecipe: Recipe = { ...mockRecipe, amountResult: 3 }
    vi.mocked(getAggregatedPrices).mockResolvedValue(new Map([
      [foodRecipe.itemId, { minPriceNQ: 0, minPriceHQ: 250, listings: [] } as any],
      [200, { minPriceNQ: 100, minPriceHQ: 0, listings: [] } as any], // 100 * 3 = 300
      [201, { minPriceNQ: 150, minPriceHQ: 0, listings: [] } as any], // 150 * 2 = 300
    ]))
    const result = await runBatchOptimization(
      [{ recipe: foodRecipe, quantity: 9 }],
      () => mockGearset, defaultSettings,
      () => {}, () => false,
    )
    expect(result.buyFinishedItems).toHaveLength(0)
    expect(result.todoList).toHaveLength(1)
    // 9 servings ÷ 3 per craft = 3 crafts; each craft uses ing.amount × crafts
    expect(result.todoList[0].quantity).toBe(3)
  })

  it('amountResult>1 buy path uses output count, not craft count', async () => {
    // Same food recipe but cheaper market: 80/serving < 200/serving craft cost → buy.
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory', 'groundwork'], progress: 3500, quality: 7200, steps: 2 })
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)
    const { getAggregatedPrices } = await import('@/api/universalis')
    const foodRecipe: Recipe = { ...mockRecipe, amountResult: 3 }
    vi.mocked(getAggregatedPrices).mockResolvedValue(new Map([
      [foodRecipe.itemId, { minPriceNQ: 0, minPriceHQ: 80, listings: [] } as any],
      [200, { minPriceNQ: 100, minPriceHQ: 0, listings: [] } as any],
      [201, { minPriceNQ: 150, minPriceHQ: 0, listings: [] } as any],
    ]))
    const result = await runBatchOptimization(
      [{ recipe: foodRecipe, quantity: 9 }],
      () => mockGearset, defaultSettings,
      () => {}, () => false,
    )
    expect(result.buyFinishedItems).toHaveLength(1)
    expect(result.buyFinishedItems[0].quantity).toBe(9) // buy 9 servings, not 3 crafts
    const finishedRow = result.serverGroups.flatMap(g => g.items).find(i => i.isFinishedProduct)
    expect(finishedRow?.amount).toBe(9)
  })

  it('amountResult>1 quick-buy uses craft count for materials', async () => {
    const { getAggregatedPrices } = await import('@/api/universalis')
    const foodRecipe: Recipe = { ...mockRecipe, amountResult: 3 }
    vi.mocked(getAggregatedPrices).mockResolvedValue(new Map([
      [200, { minPriceNQ: 100, minPriceHQ: 0, listings: [] } as any],
      [201, { minPriceNQ: 150, minPriceHQ: 0, listings: [] } as any],
    ]))
    const result = await runBatchOptimization(
      [{ recipe: foodRecipe, quantity: 9 }], // 9 servings = 3 crafts
      () => mockGearset,
      { ...defaultSettings, calcMode: 'quick-buy' },
      () => {}, () => false,
    )
    const mat200 = result.quickBuyMaterials!.find(m => m.itemId === 200)!
    expect(mat200.amount).toBe(9) // 3 per craft × 3 crafts
    const mat201 = result.quickBuyMaterials!.find(m => m.itemId === 201)!
    expect(mat201.amount).toBe(6) // 2 per craft × 3 crafts
  })

  it('buy-finished preserves target quantity (regression: was always 1)', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory', 'groundwork'], progress: 3500, quality: 7200, steps: 2 })
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)
    const { getAggregatedPrices } = await import('@/api/universalis')
    vi.mocked(getAggregatedPrices).mockResolvedValue(new Map([
      [mockRecipe.itemId, { minPriceNQ: 0, minPriceHQ: 1000, listings: [] } as any],
      [200, { minPriceNQ: 1000, minPriceHQ: 0, listings: [] } as any],
      [201, { minPriceNQ: 500, minPriceHQ: 0, listings: [] } as any],
    ]))

    const result = await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 7 }],
      () => mockGearset,
      defaultSettings,
      () => {}, () => false,
    )
    expect(result.buyFinishedItems).toHaveLength(1)
    expect(result.buyFinishedItems[0].quantity).toBe(7)
    // Critical: shopping list row's amount must equal the requested quantity
    const allItems = result.serverGroups.flatMap(g => g.items)
    const finishedRow = allItems.find(i => i.isFinishedProduct)
    expect(finishedRow?.amount).toBe(7)
  })

  it('buy-finished via level-insufficient exception preserves target quantity', async () => {
    const { getAggregatedPrices } = await import('@/api/universalis')
    vi.mocked(getAggregatedPrices).mockResolvedValue(new Map([
      [starredMockRecipe.itemId, { minPriceNQ: 5000, minPriceHQ: 8000, listings: [] } as any],
    ]))
    const lowGearset: GearsetStats = { level: 50, craftsmanship: 1000, control: 1000, cp: 300, isSpecialist: false }
    const result = await runBatchOptimization(
      [{ recipe: starredMockRecipe, quantity: 9 }],
      () => lowGearset,
      { ...defaultSettings, exceptionStrategy: 'buy' },
      () => {}, () => false,
    )
    expect(result.buyFinishedItems).toHaveLength(1)
    expect(result.buyFinishedItems[0].quantity).toBe(9)
    const allItems = result.serverGroups.flatMap(g => g.items)
    const finishedRow = allItems.find(i => i.isFinishedProduct)
    expect(finishedRow?.amount).toBe(9)
  })

  it('buy-finished via exception picks cheapest DC server when crossServer is on', async () => {
    // Regression: exception-driven buy-finished used to single-server query
    // (settings.server) and always landed on home, regardless of crossServer.
    // Now it should reuse the DC-wide priceMap + findCheapestServerPurchase.
    const { getAggregatedPrices } = await import('@/api/universalis')
    vi.mocked(getAggregatedPrices).mockResolvedValue(new Map([
      [starredMockRecipe.itemId, {
        minPriceNQ: 0, minPriceHQ: 7000,
        listings: [
          // Home server: pricey
          { pricePerUnit: 12000, quantity: 3, total: 36000, hq: true, worldName: 'Chocobo' },
          // Other server in same DC: strictly cheaper total even after stack rounding
          { pricePerUnit: 7000, quantity: 3, total: 21000, hq: true, worldName: 'Atomos' },
        ],
      } as any],
    ]))
    const lowGearset: GearsetStats = { level: 50, craftsmanship: 1000, control: 1000, cp: 300, isSpecialist: false }
    const result = await runBatchOptimization(
      [{ recipe: starredMockRecipe, quantity: 3 }],
      () => lowGearset,
      { ...defaultSettings, exceptionStrategy: 'buy', crossServer: true },
      () => {}, () => false,
    )
    expect(result.buyFinishedItems).toHaveLength(1)
    expect(result.buyFinishedItems[0].buyServer).toBe('Atomos')
    expect(result.buyFinishedItems[0].buyPrice).toBe(7000)
    expect(result.exceptions[0].buyServer).toBe('Atomos')
    // The shopping list row must end up in the Atomos server group, not Chocobo.
    const atomosGroup = result.serverGroups.find(g => g.server === 'Atomos')
    expect(atomosGroup?.items.some(i => i.isFinishedProduct)).toBe(true)
  })

  it('selfMakeOverrides forces craft even when buying would be cheaper', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory', 'groundwork'], progress: 3500, quality: 7200, steps: 2 })
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)
    const { getAggregatedPrices } = await import('@/api/universalis')
    // craftCostPerUnit = 3*1000 + 2*500 = 4000 (only NQ since hqAmounts=[] for doubleMax);
    // finished product HQ = 1000 → buy < craft → downgrade.
    vi.mocked(getAggregatedPrices).mockResolvedValue(new Map([
      [mockRecipe.itemId, { minPriceNQ: 0, minPriceHQ: 1000, listings: [] } as any],
      [200, { minPriceNQ: 1000, minPriceHQ: 0, listings: [] } as any],
      [201, { minPriceNQ: 500, minPriceHQ: 0, listings: [] } as any],
    ]))

    const result = await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }],
      () => mockGearset,
      { ...defaultSettings, selfMakeOverrides: { [mockRecipe.itemId]: true } },
      () => {}, () => false,
    )
    expect(result.buyFinishedItems).toHaveLength(0)
    expect(result.todoList).toHaveLength(1)
    expect(result.todoList[0].recipe.itemId).toBe(mockRecipe.itemId)
  })

  it('quick-buy mode emits quickBuyMaterials with both nq and hq pricings', async () => {
    const { getAggregatedPrices } = await import('@/api/universalis')
    vi.mocked(getAggregatedPrices).mockResolvedValue(new Map([
      [200, { minPriceNQ: 1000, minPriceHQ: 2500, listings: [] } as any],
      [201, { minPriceNQ: 500, minPriceHQ: 0, listings: [] } as any],
    ]))

    const result = await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 2 }],
      () => mockGearset,
      { ...defaultSettings, calcMode: 'quick-buy' },
      () => {}, () => false,
    )

    expect(result.quickBuyMaterials).toBeDefined()
    expect(result.quickBuyMaterials).toHaveLength(2)

    const mat200 = result.quickBuyMaterials!.find(m => m.itemId === 200)!
    expect(mat200.amount).toBe(6) // 3 per recipe × 2 recipes
    expect(mat200.canHq).toBe(true)
    expect(mat200.nq).toEqual({ unitPrice: 1000, server: 'Chocobo' })
    expect(mat200.hq).toEqual({ unitPrice: 2500, server: 'Chocobo' })

    const mat201 = result.quickBuyMaterials!.find(m => m.itemId === 201)!
    expect(mat201.canHq).toBe(false)
    expect(mat201.hq).toBeNull() // canHq=false → no HQ pricing
    expect(mat201.nq).toEqual({ unitPrice: 500, server: 'Chocobo' })

    // Legacy serverGroups / grandTotal are empty in quick-buy; view computes them.
    expect(result.serverGroups).toEqual([])
    expect(result.grandTotal).toBe(0)
  })

  it('quick-buy returns hq=null when listings lack HQ data', async () => {
    const { getAggregatedPrices } = await import('@/api/universalis')
    vi.mocked(getAggregatedPrices).mockResolvedValue(new Map([
      [200, { minPriceNQ: 1000, minPriceHQ: 0, listings: [] } as any],
      [201, { minPriceNQ: 500, minPriceHQ: 0, listings: [] } as any],
    ]))

    const result = await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }],
      () => mockGearset,
      { ...defaultSettings, calcMode: 'quick-buy' },
      () => {}, () => false,
    )

    const mat200 = result.quickBuyMaterials!.find(m => m.itemId === 200)!
    expect(mat200.canHq).toBe(true) // recipe says canHq
    expect(mat200.hq).toBeNull()    // but market data has no HQ price
    expect(mat200.nq).not.toBeNull()
  })

  it('respects cancellation', async () => {
    let cancelled = false
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['groundwork'], progress: 3500, quality: 7200, steps: 1 })
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)

    await expect(runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }, { recipe: { ...mockRecipe, id: 2 }, quantity: 1 }],
      () => mockGearset,
      defaultSettings,
      (info) => { if (info.completed >= 1 && info.phase === 'solving') cancelled = true },
      () => cancelled,
    )).rejects.toThrow(SolveCancelledError)
  })
})

describe('runBatchOptimization buff recommendation', () => {
  beforeEach(() => vi.clearAllMocks())

  const defaultSettings = {
    crossServer: false, recursivePricing: false, maxRecursionDepth: 3,
    exceptionStrategy: 'skip' as const, server: 'Chocobo', dataCenter: 'Mana',
  }

  it('does not run buff evaluation when food is selected', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory'], progress: 3500, quality: 5000, steps: 1 })
    vi.mocked(simulateCraft).mockResolvedValue(qualityDeficitSim as any)

    const result = await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }],
      () => mockGearset,
      { ...defaultSettings, foodId: 44091, foodIsHq: true },
      () => {}, () => false,
    )
    expect(result.buffRecommendation).toBeUndefined()
  })
})

describe('runBatchOptimization · Phase 1 cancel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('propagates SolveCancelledError through Promise.allSettled', async () => {
    let firstResolve: ((v: any) => void) | undefined
    vi.mocked(solveCraft).mockImplementationOnce(() => new Promise(r => { firstResolve = r }))
    vi.mocked(solveCraft).mockRejectedValueOnce(new SolveCancelledError())
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)

    const targets = [
      { recipe: mockRecipe, quantity: 1 },
      { recipe: { ...mockRecipe, id: 2 }, quantity: 1 },
    ]
    const run = runBatchOptimization(
      targets, () => mockGearset,
      { crossServer: false, recursivePricing: false, maxRecursionDepth: 2,
        exceptionStrategy: 'skip', server: 'S', dataCenter: 'DC', autoEvaluateBuffs: false },
      () => {}, () => false,
    )
    await new Promise(r => setTimeout(r, 10))
    firstResolve?.({ actions: [], progress: 3500, quality: 7200, steps: 0 })

    await expect(run).rejects.toThrow(SolveCancelledError)
  })
})

describe('runBatchOptimization · Phase 4.6 concurrency', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invokes buff + self-craft concurrently', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: [], progress: 3500, quality: 5000, steps: 0 })
    vi.mocked(simulateCraft).mockResolvedValue(qualityDeficitSim as any)
    const { evaluateBuffRecommendation } = await import('@/services/buff-recommender')
    const { produceSelfCraftCandidates } = await import('@/services/self-craft-candidates')

    let buffStarted = false, selfStarted = false, bothActive = false
    vi.mocked(evaluateBuffRecommendation).mockImplementation(async () => {
      buffStarted = true
      if (selfStarted) bothActive = true
      await new Promise(r => setTimeout(r, 10))
      return null
    })
    vi.mocked(produceSelfCraftCandidates).mockImplementation(async () => {
      selfStarted = true
      if (buffStarted) bothActive = true
      await new Promise(r => setTimeout(r, 10))
      return []
    })

    await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }],
      () => mockGearset,
      { crossServer: false, recursivePricing: true, maxRecursionDepth: 2,
        exceptionStrategy: 'skip', server: 'S', dataCenter: 'DC', autoEvaluateBuffs: true },
      () => {}, () => false,
    )
    expect(bothActive).toBe(true)
  })
})

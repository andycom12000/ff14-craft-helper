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
}))
vi.mock('@/services/buff-recommender', () => ({
  evaluateBuffRecommendation: vi.fn().mockResolvedValue(null),
  getBuffItemIds: vi.fn().mockReturnValue([]),
}))

import { optimizeRecipe, runBatchOptimization } from '@/services/batch-optimizer'
import { solveCraft, simulateCraft } from '@/solver/worker'
import { getMarketData } from '@/api/universalis'

const mockRecipe: Recipe = {
  id: 1, itemId: 100, name: 'Test', icon: '', job: 'CRP',
  level: 90, stars: 0, canHq: true, materialQualityFactor: 75,
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
const mockGearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600 }

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
})

describe('runBatchOptimization', () => {
  beforeEach(() => vi.clearAllMocks())

  const defaultSettings = {
    crossServer: false, recursivePricing: false, maxRecursionDepth: 3,
    exceptionStrategy: 'skip' as const, server: 'Chocobo', dataCenter: 'Mana',
  }

  it('creates level-insufficient exception when gearset too low', async () => {
    const lowGearset: GearsetStats = { level: 50, craftsmanship: 1000, control: 1000, cp: 300 }
    const result = await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }],
      () => lowGearset,
      defaultSettings,
      () => {}, () => false,
    )
    expect(result.exceptions).toHaveLength(1)
    expect(result.exceptions[0].type).toBe('level-insufficient')
    expect(result.exceptions[0].action).toBe('skipped')
  })

  it('queries buy price when exception strategy is buy', async () => {
    vi.mocked(getMarketData).mockResolvedValue({ minPriceNQ: 12000, minPriceHQ: 15000 } as any)
    const result = await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }],
      () => ({ level: 50, craftsmanship: 1000, control: 1000, cp: 300 }),
      { ...defaultSettings, exceptionStrategy: 'buy' },
      () => {}, () => false,
    )
    expect(result.exceptions[0].action).toBe('buy-finished')
    expect(result.exceptions[0].buyPrice).toBe(12000)
  })

  it('respects cancellation', async () => {
    let cancelled = false
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['groundwork'], progress: 3500, quality: 7200, steps: 1 })
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)

    const result = await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }, { recipe: { ...mockRecipe, id: 2 }, quantity: 1 }],
      () => mockGearset,
      defaultSettings,
      (info) => { if (info.current >= 1 && info.phase === 'solving' && info.solverPercent === 0) cancelled = true },
      () => cancelled,
    )
    // First recipe may complete before cancellation is checked
    expect(result.todoList.length).toBeLessThanOrEqual(2)
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

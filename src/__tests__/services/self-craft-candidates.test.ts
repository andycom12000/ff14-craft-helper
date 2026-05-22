import { describe, it, expect, vi, beforeEach } from 'vitest'
import { filterCandidatesByThreshold, filterCandidatesByLevel, walkTreeForCandidates, computeRawMaterials } from '@/services/self-craft-candidates'
import type { CostDecision } from '@/services/bom-calculator'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { MaterialNode } from '@/stores/bom'

describe('filterCandidatesByThreshold', () => {
  it('keeps decisions with savingsRatio >= 0.05 and recommendation=craft', () => {
    const decisions: CostDecision[] = [
      { itemId: 1, name: 'A', icon: '', amount: 1, buyCost: 100, craftCost: 90, optimalCost: 90, savingsRatio: 0.10, recommendation: 'craft' },
      { itemId: 2, name: 'B', icon: '', amount: 1, buyCost: 100, craftCost: 97, optimalCost: 97, savingsRatio: 0.03, recommendation: 'craft' },
      { itemId: 3, name: 'C', icon: '', amount: 1, buyCost: 100, craftCost: 200, optimalCost: 100, savingsRatio: 0, recommendation: 'buy' },
      { itemId: 4, name: 'D', icon: '', amount: 1, buyCost: 100, craftCost: 95, optimalCost: 95, savingsRatio: 0.05, recommendation: 'craft' },
    ]
    const filtered = filterCandidatesByThreshold(decisions)
    expect(filtered.map(d => d.itemId)).toEqual([1, 4])
  })
})

const mkRecipe = (id: number, job: string, level: number): Recipe => ({
  id, itemId: id * 10, name: `Recipe ${id}`, icon: '', job,
  level, stars: 0, canHq: true, materialQualityFactor: 50, amountResult: 1, ingredients: [],
  recipeLevelTable: {
    classJobLevel: level, stars: 0, difficulty: 1000, quality: 2000,
    durability: 70, suggestedCraftsmanship: 0,
    progressDivider: 100, qualityDivider: 100, progressModifier: 100, qualityModifier: 100,
  },
})

describe('filterCandidatesByLevel', () => {
  it('keeps only candidates the player can craft', () => {
    const candidates = [
      { itemId: 1, recipe: mkRecipe(1, 'CRP', 80) },
      { itemId: 2, recipe: mkRecipe(2, 'BSM', 90) },
      { itemId: 3, recipe: mkRecipe(3, 'CRP', 100) },
    ] as any[]
    const getGearset = (job: string): GearsetStats | null => {
      if (job === 'CRP') return { level: 90, craftsmanship: 3000, control: 3000, cp: 500, isSpecialist: false }
      if (job === 'BSM') return { level: 80, craftsmanship: 3000, control: 3000, cp: 500, isSpecialist: false }
      return null
    }
    const filtered = filterCandidatesByLevel(candidates, getGearset)
    expect(filtered.map(c => c.itemId)).toEqual([1]) // CRP 90 ≥ 80 ✓, BSM 80 < 90 ✗, CRP 90 < 100 ✗
  })
})

describe('walkTreeForCandidates', () => {
  it('emits craftable intermediate nodes with depth', () => {
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 10,
        children: [
          {
            itemId: 50, name: 'Lumber', icon: '', amount: 10, recipeId: 5,
            children: [
              { itemId: 1, name: 'Log', icon: '', amount: 20 },
            ],
          },
          { itemId: 2, name: 'Leaf', icon: '', amount: 5 }, // raw, no children
        ],
      },
    ]
    const nodes = walkTreeForCandidates(tree)
    expect(nodes.map(n => n.itemId)).toEqual([50]) // only intermediates
    expect(nodes[0].depth).toBe(1) // 1 layer below batch root
  })

  it('skips collapsed nodes', () => {
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 'P', icon: '', amount: 1, recipeId: 10,
        children: [
          {
            itemId: 50, name: 'Intermediate', icon: '', amount: 1, recipeId: 5,
            collapsed: true,
            children: [{ itemId: 1, name: 'Raw', icon: '', amount: 1 }],
          },
        ],
      },
    ]
    const nodes = walkTreeForCandidates(tree)
    expect(nodes).toHaveLength(0)
  })
})

describe('computeRawMaterials', () => {
  it('returns immediate children of a candidate node (not deeper)', () => {
    const childNodes: MaterialNode[] = [
      { itemId: 100, name: 'Log', icon: '', amount: 20 },
      { itemId: 101, name: 'Sap', icon: '', amount: 4 },
    ]
    const raws = computeRawMaterials(childNodes, new Map(), false, 'Chocobo')
    expect(raws).toEqual([
      { itemId: 100, name: 'Log', icon: '', amount: 20, type: 'nq', unitPrice: 0, server: 'Chocobo' },
      { itemId: 101, name: 'Sap', icon: '', amount: 4, type: 'nq', unitPrice: 0, server: 'Chocobo' },
    ])
  })

  it('prices non-crystal children using listings (single server)', () => {
    const childNodes: MaterialNode[] = [
      { itemId: 200, name: 'Ore', icon: '', amount: 5 },
    ]
    const priceMap = new Map<number, any>([
      [200, {
        minPriceNQ: 100, minPriceHQ: 0,
        listings: [{ pricePerUnit: 90, quantity: 5, total: 450, hq: false, worldName: 'Chocobo' }],
      }],
    ])
    const raws = computeRawMaterials(childNodes, priceMap, false, 'Chocobo')
    expect(raws[0]).toMatchObject({ itemId: 200, unitPrice: 90, server: 'Chocobo', type: 'nq' })
  })

  it('prices non-crystal children using cheapest server (crossServer)', () => {
    const childNodes: MaterialNode[] = [
      { itemId: 300, name: 'Gem', icon: '', amount: 3 },
    ]
    const priceMap = new Map<number, any>([
      [300, {
        minPriceNQ: 120, minPriceHQ: 0,
        listings: [
          { pricePerUnit: 100, quantity: 3, total: 300, hq: false, worldName: 'Phoenix' },
          { pricePerUnit: 150, quantity: 3, total: 450, hq: false, worldName: 'Chocobo' },
        ],
      }],
    ])
    const raws = computeRawMaterials(childNodes, priceMap, true, 'Chocobo')
    expect(raws[0]).toMatchObject({ itemId: 300, unitPrice: 100, server: 'Phoenix' })
  })

  it('assigns crystals unitPrice 0 and home server', () => {
    const childNodes: MaterialNode[] = [
      { itemId: 2, name: 'Fire Crystal', icon: '', amount: 10 },
    ]
    const raws = computeRawMaterials(childNodes, new Map(), false, 'Chocobo')
    expect(raws[0]).toMatchObject({ itemId: 2, unitPrice: 0, server: 'Chocobo' })
  })
})

vi.mock('@/services/bom-calculator', async (importActual) => {
  const actual = await importActual<typeof import('@/services/bom-calculator')>()
  return {
    ...actual,
    buildMaterialTree: vi.fn(),
    computeOptimalCosts: vi.fn(),
  }
})
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
  SOLVE_CANCELLED: '求解已取消',
  SolveCancelledError: MockSolveCancelledError,
}))
vi.mock('@/api/xivapi', () => ({
  findRecipesByItemName: vi.fn(),
  getRecipe: vi.fn(),
}))
vi.mock('@/api/universalis', () => ({
  getAggregatedPrices: vi.fn().mockResolvedValue(new Map()),
}))

import { produceSelfCraftCandidates } from '@/services/self-craft-candidates'
import { buildMaterialTree, computeOptimalCosts } from '@/services/bom-calculator'
import { findRecipesByItemName, getRecipe } from '@/api/xivapi'
import { getAggregatedPrices } from '@/api/universalis'
import { simulateCraft } from '@/solver/worker'

describe('produceSelfCraftCandidates', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns [] when tree is empty', async () => {
    vi.mocked(buildMaterialTree).mockResolvedValue([])
    vi.mocked(computeOptimalCosts).mockReturnValue({ totalCost: 0, decisions: [] })
    const result = await produceSelfCraftCandidates({
      recipesToCraft: [],
      priceMap: new Map(),
      priceSource: 'Chocobo',
      crossServer: false,
      server: 'Chocobo',
      getGearset: () => ({ level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false }),
      maxDepth: 2,
      buffs: undefined,
      optimizeRecipe: vi.fn() as any,
      onProgress: () => {},
      isCancelled: () => false,
    })
    expect(result).toEqual([])
  })

  it('excludes candidates whose job level player does not meet', async () => {
    vi.mocked(buildMaterialTree).mockResolvedValue([{
      itemId: 100, name: 'Root', icon: '', amount: 1, recipeId: 10,
      children: [{
        itemId: 50, name: 'Inter', icon: '', amount: 10, recipeId: 5,
        children: [{ itemId: 1, name: 'Raw', icon: '', amount: 20 }],
      }],
    }])
    vi.mocked(computeOptimalCosts).mockReturnValue({
      totalCost: 0,
      decisions: [{
        itemId: 50, name: 'Inter', icon: '', amount: 10,
        buyCost: 10000, craftCost: 6000, optimalCost: 6000,
        savingsRatio: 0.4, recommendation: 'craft',
      }],
    })
    vi.mocked(findRecipesByItemName).mockResolvedValue([{ recipeId: 5, job: 'CRP' }])
    vi.mocked(getRecipe).mockResolvedValue({
      id: 5, itemId: 50, name: 'Inter', icon: '', job: 'CRP',
      level: 90, stars: 0, canHq: true, materialQualityFactor: 50,
      ingredients: [{ itemId: 1, name: 'Raw', icon: '', amount: 2, canHq: false, level: 1 }],
      recipeLevelTable: {
        classJobLevel: 90, stars: 0, difficulty: 1000, quality: 2000, durability: 70,
        suggestedCraftsmanship: 0, progressDivider: 100, qualityDivider: 100,
        progressModifier: 100, qualityModifier: 100,
      },
    } as any)
    const result = await produceSelfCraftCandidates({
      recipesToCraft: [{
        recipe: { id: 10, itemId: 100, name: 'Root', icon: '', job: 'CRP', level: 100 } as any,
        quantity: 1, outputAmount: 1, actions: [], hqAmounts: [], initialQuality: 0,
        isDoubleMax: true, materials: [], qualityDeficit: 0,
      }],
      priceMap: new Map(),
      priceSource: 'Chocobo',
      crossServer: false,
      server: 'Chocobo',
      getGearset: () => ({ level: 80, craftsmanship: 3000, control: 3000, cp: 500, isSpecialist: false }), // below 90
      maxDepth: 2,
      buffs: undefined,
      optimizeRecipe: vi.fn() as any,
      onProgress: () => {},
      isCancelled: () => false,
    })
    expect(result).toEqual([])
  })

  it('returns a candidate when all filters pass and solver achieves required quality', async () => {
    vi.mocked(buildMaterialTree).mockResolvedValue([{
      itemId: 100, name: 'Root', icon: '', amount: 1, recipeId: 10,
      children: [{
        itemId: 50, name: 'Inter', icon: '', amount: 10, recipeId: 5,
        children: [{ itemId: 1, name: 'Raw', icon: '', amount: 20 }],
      }],
    }])
    vi.mocked(computeOptimalCosts).mockReturnValue({
      totalCost: 0,
      decisions: [{
        itemId: 50, name: 'Inter', icon: '', amount: 10,
        buyCost: 10000, craftCost: 6000, optimalCost: 6000,
        savingsRatio: 0.4, recommendation: 'craft',
      }],
    })
    vi.mocked(findRecipesByItemName).mockResolvedValue([{ recipeId: 5, job: 'CRP' }])
    const mockRecipe = {
      id: 5, itemId: 50, name: 'Inter', icon: '', job: 'CRP',
      level: 80, stars: 0, canHq: true, materialQualityFactor: 50,
      ingredients: [{ itemId: 1, name: 'Raw', icon: '', amount: 2, canHq: false, level: 1 }],
      recipeLevelTable: {
        classJobLevel: 80, stars: 0, difficulty: 1000, quality: 2000, durability: 70,
        suggestedCraftsmanship: 0, progressDivider: 100, qualityDivider: 100,
        progressModifier: 100, qualityModifier: 100,
      },
    }
    vi.mocked(getRecipe).mockResolvedValue(mockRecipe as any)
    const mockOptimizeRecipe = vi.fn().mockResolvedValue({
      recipe: mockRecipe,
      quantity: 1,
      actions: ['muscle_memory', 'groundwork'],
      hqAmounts: [],
      initialQuality: 0,
      isDoubleMax: true,
      materials: [{ itemId: 1, name: 'Raw', icon: '', amount: 2 }],
      qualityDeficit: 0,
    })

    const parentResult = {
      recipe: { id: 10, itemId: 100, name: 'Root', icon: '', job: 'CRP', level: 90 } as any,
      quantity: 1, outputAmount: 1, actions: [], hqAmounts: [2, 0], initialQuality: 0,
      isDoubleMax: false,
      materials: [{ itemId: 50, name: 'Inter', icon: '', amount: 10 }],
      qualityDeficit: 0,
    }
    const result = await produceSelfCraftCandidates({
      recipesToCraft: [parentResult as any],
      priceMap: new Map(),
      priceSource: 'Chocobo',
      crossServer: false,
      server: 'Chocobo',
      getGearset: () => ({ level: 90, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false }),
      maxDepth: 2,
      buffs: undefined,
      optimizeRecipe: mockOptimizeRecipe as any,
      onProgress: () => {},
      isCancelled: () => false,
    })

    expect(result).toHaveLength(1)
    expect(result[0].itemId).toBe(50)
    expect(result[0].actions).toEqual(['muscle_memory', 'groundwork'])
    expect(result[0].hqRequired).toBe(true) // parent hqAmounts[0] = 2 > 0
    expect(result[0].rawMaterials).toEqual([
      { itemId: 1, name: 'Raw', icon: '', amount: 20, type: 'nq', unitPrice: 0, server: 'Chocobo' },
    ])
    expect(result[0].savings).toBe(4000) // 10000 - 6000
  })

  it('excludes root batch targets from candidate list', async () => {
    // Regression: computeOptimalCosts emits a decision for every node including root.
    // When the root's craft-vs-buy ratio passes the threshold it must NOT be offered
    // as a self-craft candidate — root is the batch target itself, not an intermediate
    // substitution. Root-level buy-vs-craft lives in Phase 4.5.
    vi.mocked(buildMaterialTree).mockResolvedValue([{
      itemId: 100, name: 'Root', icon: '', amount: 1, recipeId: 10,
      children: [{ itemId: 1, name: 'Raw', icon: '', amount: 5 }],
    }])
    vi.mocked(computeOptimalCosts).mockReturnValue({
      totalCost: 0,
      decisions: [{
        itemId: 100, name: 'Root', icon: '', amount: 1,
        buyCost: 5000, craftCost: 1000, optimalCost: 1000,
        savingsRatio: 0.8, recommendation: 'craft',
      }],
    })
    const result = await produceSelfCraftCandidates({
      recipesToCraft: [{
        recipe: { id: 10, itemId: 100, name: 'Root', icon: '', job: 'CRP', level: 90 } as any,
        quantity: 1, outputAmount: 1, actions: [], hqAmounts: [], initialQuality: 0,
        isDoubleMax: true, materials: [], qualityDeficit: 0,
      }],
      priceMap: new Map(),
      priceSource: 'Chocobo',
      crossServer: false,
      server: 'Chocobo',
      getGearset: () => ({ level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false }),
      maxDepth: 2,
      buffs: undefined,
      optimizeRecipe: vi.fn() as any,
      onProgress: () => {},
      isCancelled: () => false,
    })
    expect(result).toEqual([])
    expect(vi.mocked(findRecipesByItemName)).not.toHaveBeenCalled()
  })

  it('backfills prices for BOM descendants missing from the original priceMap', async () => {
    // Regression: Phase 4 only fetches direct materials. When the BOM tree expands deeper,
    // grandchild prices are missing — computeOptimalCosts then reads 0 for them, which
    // makes craftCost appear free and breaks the 5% savings calculation. Fix: re-fetch
    // missing descendant prices before computing costs.
    vi.mocked(buildMaterialTree).mockResolvedValue([{
      itemId: 100, name: 'Root', icon: '', amount: 1, recipeId: 10,
      children: [{
        itemId: 50, name: 'Inter', icon: '', amount: 2, recipeId: 5,
        children: [
          { itemId: 20, name: 'Grandchild A', icon: '', amount: 3 },
          { itemId: 21, name: 'Grandchild B', icon: '', amount: 1 },
        ],
      }],
    }])
    vi.mocked(computeOptimalCosts).mockReturnValue({ totalCost: 0, decisions: [] })
    const priceMap = new Map()
    priceMap.set(50, { minPriceNQ: 1000 } as any) // direct material only

    await produceSelfCraftCandidates({
      recipesToCraft: [{
        recipe: { id: 10, itemId: 100, name: 'Root', icon: '', job: 'CRP', level: 90 } as any,
        quantity: 1, outputAmount: 1, actions: [], hqAmounts: [], initialQuality: 0,
        isDoubleMax: true, materials: [], qualityDeficit: 0,
      }],
      priceMap,
      priceSource: 'Chocobo',
      crossServer: false,
      server: 'Chocobo',
      getGearset: () => ({ level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false }),
      maxDepth: 2,
      buffs: undefined,
      optimizeRecipe: vi.fn() as any,
      onProgress: () => {},
      isCancelled: () => false,
    })

    // Must have called getAggregatedPrices for the missing grandchildren (20, 21)
    expect(vi.mocked(getAggregatedPrices)).toHaveBeenCalledTimes(1)
    const [server, missingIds] = vi.mocked(getAggregatedPrices).mock.calls[0]
    expect(server).toBe('Chocobo')
    expect([...missingIds].sort((a, b) => a - b)).toEqual([20, 21, 100]) // root also missing from priceMap
    // And did NOT re-fetch item 50 (already in priceMap)
    expect(missingIds).not.toContain(50)
  })

  it('aggregates rawMaterials across every tree occurrence of the same intermediate', async () => {
    // Regression: when the same intermediate (e.g. 鐵雲母磨刀石) appears under multiple
    // batch targets, walkTreeForCandidates emits one TreeNodeInfo per occurrence but
    // produceSelfCraftCandidates previously kept only the last one's childNodes. That
    // under-counted raw material demand on the shopping list (showed 4 鐵雲母 instead of 16).
    // decision.amount from computeOptimalCosts is correctly aggregated, so raw materials
    // must scale with total demand, not just the last tree branch.
    vi.mocked(buildMaterialTree).mockResolvedValue([
      // Target A: 1 weapon, needs 1 whetstone → 4 ore in tree
      {
        itemId: 200, name: 'Weapon A', icon: '', amount: 1, recipeId: 20,
        children: [{
          itemId: 50, name: 'Whetstone', icon: '', amount: 1, recipeId: 5,
          children: [{ itemId: 1, name: 'Ore', icon: '', amount: 4 }],
        }],
      },
      // Target B: 3 weapons, needs 1 whetstone each → 12 ore under this branch
      {
        itemId: 201, name: 'Weapon B', icon: '', amount: 3, recipeId: 21,
        children: [{
          itemId: 50, name: 'Whetstone', icon: '', amount: 3, recipeId: 5,
          children: [{ itemId: 1, name: 'Ore', icon: '', amount: 12 }],
        }],
      },
    ])
    // Total: 4 whetstones, 16 ore
    vi.mocked(computeOptimalCosts).mockReturnValue({
      totalCost: 0,
      decisions: [{
        itemId: 50, name: 'Whetstone', icon: '', amount: 4, // aggregated across both branches
        buyCost: 4000, craftCost: 2000, optimalCost: 2000,
        savingsRatio: 0.5, recommendation: 'craft',
      }],
    })
    vi.mocked(findRecipesByItemName).mockResolvedValue([{ recipeId: 5, job: 'CRP' }])
    const whetstoneRecipe = {
      id: 5, itemId: 50, name: 'Whetstone', icon: '', job: 'CRP',
      level: 80, stars: 0, canHq: true, materialQualityFactor: 50,
      ingredients: [{ itemId: 1, name: 'Ore', icon: '', amount: 4, canHq: false, level: 1 }],
      recipeLevelTable: {
        classJobLevel: 80, stars: 0, difficulty: 1000, quality: 2000, durability: 70,
        suggestedCraftsmanship: 0, progressDivider: 100, qualityDivider: 100,
        progressModifier: 100, qualityModifier: 100,
      },
    }
    vi.mocked(getRecipe).mockResolvedValue(whetstoneRecipe as any)
    const mockOptimizeRecipe = vi.fn().mockResolvedValue({
      recipe: whetstoneRecipe, quantity: 1, outputAmount: 1, actions: [], hqAmounts: [],
      initialQuality: 0, isDoubleMax: true,
      materials: [{ itemId: 1, name: 'Ore', icon: '', amount: 4 }], qualityDeficit: 0,
    })

    const result = await produceSelfCraftCandidates({
      recipesToCraft: [
        {
          recipe: { id: 20, itemId: 200, name: 'Weapon A', icon: '', job: 'CRP', level: 90 } as any,
          quantity: 1, outputAmount: 1, actions: [], hqAmounts: [], initialQuality: 0,
          isDoubleMax: true, materials: [], qualityDeficit: 0,
        },
        {
          recipe: { id: 21, itemId: 201, name: 'Weapon B', icon: '', job: 'CRP', level: 90 } as any,
          quantity: 3, outputAmount: 3, actions: [], hqAmounts: [], initialQuality: 0,
          isDoubleMax: true, materials: [], qualityDeficit: 0,
        },
      ],
      priceMap: new Map(),
      priceSource: 'Chocobo',
      crossServer: false,
      server: 'Chocobo',
      getGearset: () => ({ level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false }),
      maxDepth: 2,
      buffs: undefined,
      optimizeRecipe: mockOptimizeRecipe as any,
      onProgress: () => {},
      isCancelled: () => false,
    })

    expect(result).toHaveLength(1)
    expect(result[0].itemId).toBe(50)
    expect(result[0].amount).toBe(4) // 1 + 3 whetstones
    // Ore must be summed across both branches: 4 + 12 = 16
    expect(result[0].rawMaterials).toHaveLength(1)
    expect(result[0].rawMaterials[0]).toMatchObject({ itemId: 1, amount: 16 })
  })
})

import { COMMON_FOODS } from '@/engine/food-medicine'
import type { RecipeOptimizeResult } from '@/services/batch-optimizer'

describe('validateNQ — stacking order matches batch-optimizer (#34)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('specialist + food: simulateCraft receives Soul→Food stats (cp=144, not 141)', async () => {
    const gearset: GearsetStats = {
      level: 100, craftsmanship: 4000, control: 100, cp: 100, isSpecialist: true,
    }
    const food = COMMON_FOODS.find(f => f.id === 36060)!  // cp +26% cap 78

    const captured: any[] = []
    vi.mocked(simulateCraft).mockImplementation(async (config: any) => {
      captured.push(config)
      return { progress: 0, max_progress: 999, quality: 0, max_quality: 999,
               durability: 70, max_durability: 70, cp: 0, max_cp: 100, steps_count: 0 } as any
    })

    const recipe = mkRecipe(1, 'CRP', 80)
    const deficitResult: RecipeOptimizeResult = {
      recipe, quantity: 1, outputAmount: 1,
      actions: [], hqAmounts: [], initialQuality: 0,
      isDoubleMax: false, materials: [], qualityDeficit: 100,
    }

    vi.mocked(buildMaterialTree).mockResolvedValue([
      {
        itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 1,
        children: [
          { itemId: 50, name: 'Intermediate', icon: '', amount: 1, recipeId: 5,
            children: [{ itemId: 1, name: 'Raw', icon: '', amount: 1 }] },
        ],
      } as any,
    ])
    vi.mocked(computeOptimalCosts).mockReturnValue({
      totalCost: 0,
      decisions: [{
        itemId: 50, name: 'Intermediate', icon: '', amount: 1,
        buyCost: 1000, craftCost: 800, optimalCost: 800,
        savingsRatio: 0.20, recommendation: 'craft',
      }],
    })
    vi.mocked(findRecipesByItemName).mockResolvedValue([{ recipeId: 5, job: 'CRP' }])
    vi.mocked(getRecipe).mockResolvedValue({
      id: 5, itemId: 50, name: 'Intermediate', icon: '', job: 'CRP',
      level: 80, stars: 0, canHq: true, materialQualityFactor: 50, amountResult: 1,
      ingredients: [],
      recipeLevelTable: {
        classJobLevel: 80, stars: 0, difficulty: 1000, quality: 2000, durability: 70,
        suggestedCraftsmanship: 0, progressDivider: 100, qualityDivider: 100,
        progressModifier: 100, qualityModifier: 100,
      },
    } as any)

    await produceSelfCraftCandidates({
      recipesToCraft: [deficitResult],
      priceMap: new Map(),
      priceSource: 'Chocobo', crossServer: false, server: 'Chocobo',
      getGearset: () => gearset,
      maxDepth: 3,
      buffs: { food, medicine: null },
      optimizeRecipe: vi.fn().mockResolvedValue({
        ...deficitResult, isDoubleMax: false, hqAmounts: [],
      }),
      onProgress: () => {},
      isCancelled: () => false,
    })

    expect(captured.length).toBeGreaterThan(0)
    expect(captured[0].cp).toBe(144)
  })
})

// ---------------------------------------------------------------------------
// Step 8 branch-rewrite tests: NQ template path + HQ prefilter path
// ---------------------------------------------------------------------------

const intermediateRecipe: Recipe = {
  id: 100, itemId: 200, name: 'test-intermediate', icon: '', job: 'CRP',
  level: 50, stars: 0, canHq: true, materialQualityFactor: 50, amountResult: 1,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 50, stars: 0, difficulty: 350, quality: 1100,
    durability: 60, suggestedCraftsmanship: 300,
    progressDivider: 50, qualityDivider: 30,
    progressModifier: 100, qualityModifier: 100,
  },
}
const ampleGearset: GearsetStats = { level: 90, craftsmanship: 1500, control: 1500, cp: 500, isSpecialist: false }
const starvedGearset: GearsetStats = { level: 90, craftsmanship: 100, control: 100, cp: 0, isSpecialist: false }
const passProgressSim = { progress: 350, max_progress: 350, quality: 0, max_quality: 1100, durability: 10, max_durability: 60, cp: 200, max_cp: 500, steps_count: 6 } as any
const failProgressSim = { progress: 200, max_progress: 350, quality: 0, max_quality: 1100, durability: 0, max_durability: 60, cp: 0, max_cp: 500, steps_count: 5 } as any

function stubOneCandidate(itemId: number) {
  vi.mocked(buildMaterialTree).mockResolvedValue([{
    itemId: 999, name: 'root', icon: '', amount: 1, recipeId: 999,
    children: [{
      itemId, name: 'test-intermediate', icon: '', amount: 1, recipeId: 100,
      children: [{ itemId: 1, name: 'raw-material', icon: '', amount: 2 }],
    }],
  }] as any)
  vi.mocked(computeOptimalCosts).mockReturnValue({
    totalCost: 0,
    decisions: [{
      itemId, name: 'test-intermediate', icon: '', amount: 1,
      buyCost: 1000, craftCost: 800, optimalCost: 800,
      savingsRatio: 0.20, recommendation: 'craft',
    }],
  })
  vi.mocked(findRecipesByItemName).mockResolvedValue([{ recipeId: 100, job: '木工' }])
  vi.mocked(getRecipe).mockResolvedValue(intermediateRecipe)
}

function buildArgs(overrides: Partial<Parameters<typeof produceSelfCraftCandidates>[0]> = {}) {
  return {
    recipesToCraft: [{
      recipe: { ...intermediateRecipe, id: 999, itemId: 999, level: 90 },
      quantity: 1, outputAmount: 1, actions: [], hqAmounts: [0, 0],
      initialQuality: 0, isDoubleMax: false, materials: [], qualityDeficit: 0,
    }] as any,
    priceMap: new Map() as any,
    priceSource: 'TestServer', crossServer: false, server: 'TestServer',
    getGearset: () => ampleGearset,
    maxDepth: 2, buffs: undefined,
    optimizeRecipe: vi.fn(),
    onProgress: () => {}, isCancelled: () => false,
    ...overrides,
  }
}

describe('produceSelfCraftCandidates – Step 8 branch rewrite', () => {
  beforeEach(() => vi.clearAllMocks())

  it('NQ: accepts when template simulate succeeds, no solver call', async () => {
    stubOneCandidate(200)
    vi.mocked(simulateCraft).mockResolvedValue(passProgressSim)
    const args = buildArgs()
    const out = await produceSelfCraftCandidates(args)
    expect(out).toHaveLength(1)
    expect(out[0].actions[0]).toBe('BasicSynthesis')
    expect(args.optimizeRecipe).not.toHaveBeenCalled()
  })

  it('NQ: template fails → solver fallback → drop when unreachable', async () => {
    stubOneCandidate(200)
    vi.mocked(simulateCraft).mockResolvedValue(failProgressSim)
    const optimizeFn = vi.fn().mockResolvedValue({
      isDoubleMax: false, actions: [], hqAmounts: [],
      qualityDeficit: 0, initialQuality: 0, materials: [],
      recipe: intermediateRecipe, quantity: 1, outputAmount: 1,
    })
    const out = await produceSelfCraftCandidates(buildArgs({ optimizeRecipe: optimizeFn as any }))
    expect(optimizeFn).toHaveBeenCalledTimes(1)
    expect(out).toHaveLength(0)
  })

  it('NQ: template fails → solver fallback → accept on reachable', async () => {
    stubOneCandidate(200)
    vi.mocked(simulateCraft).mockResolvedValue(failProgressSim)
    const optimizeFn = vi.fn().mockResolvedValue({
      isDoubleMax: false, actions: ['solver-action'], hqAmounts: [1, 0],
      qualityDeficit: 100, initialQuality: 0, materials: [],
      recipe: intermediateRecipe, quantity: 1, outputAmount: 1,
    })
    const out = await produceSelfCraftCandidates(buildArgs({ optimizeRecipe: optimizeFn as any }))
    expect(out).toHaveLength(1)
    expect(out[0].actions).toEqual(['solver-action'])
  })

  it('HQ: prefilter rejects starved gearset, no solver call', async () => {
    stubOneCandidate(300)
    const optimizeFn = vi.fn()
    const out = await produceSelfCraftCandidates(buildArgs({
      recipesToCraft: [{
        recipe: intermediateRecipe, quantity: 1, outputAmount: 1,
        actions: [], hqAmounts: [1, 1],
        initialQuality: 0, isDoubleMax: false,
        materials: [{ itemId: 300, name: 'test', icon: '', amount: 1 }],
        qualityDeficit: 100,
      }] as any,
      getGearset: () => starvedGearset,
      optimizeRecipe: optimizeFn as any,
    }))
    expect(optimizeFn).not.toHaveBeenCalled()
    expect(out).toHaveLength(0)
  })

  it('HQ: prefilter passes → solver accepts on doubleMax', async () => {
    stubOneCandidate(300)
    const optimizeFn = vi.fn().mockResolvedValue({
      isDoubleMax: true, actions: ['mm', 'careful'], hqAmounts: [],
      qualityDeficit: 0, initialQuality: 0, materials: [],
      recipe: intermediateRecipe, quantity: 1, outputAmount: 1,
    })
    const out = await produceSelfCraftCandidates(buildArgs({
      recipesToCraft: [{
        recipe: intermediateRecipe, quantity: 1, outputAmount: 1,
        actions: [], hqAmounts: [1, 1],
        initialQuality: 0, isDoubleMax: false,
        materials: [{ itemId: 300, name: 'test', icon: '', amount: 1 }],
        qualityDeficit: 100,
      }] as any,
      optimizeRecipe: optimizeFn as any,
    }))
    expect(optimizeFn).toHaveBeenCalledTimes(1)
    expect(out).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Reprice against listing fulfilment (issue #39):
// computeOptimalCosts thinks "self-craft saves X%" using minPriceNQ × amount,
// but the shopping list uses calculateBestPurchase / findCheapestServerPurchase
// which has to eat more-expensive listings once the cheapest stack runs out.
// Recommendations must match what the cart will actually charge.
// ---------------------------------------------------------------------------

describe('produceSelfCraftCandidates – reprices against listing fulfilment', () => {
  beforeEach(() => vi.clearAllMocks())

  function buildBugCaseArgs() {
    // Stub a 1→1 recipe whose raw material is itemId 20 (above crystal threshold).
    vi.mocked(buildMaterialTree).mockResolvedValue([{
      itemId: 999, name: 'root', icon: '', amount: 1, recipeId: 999,
      children: [{
        itemId: 200, name: 'self-craft target', icon: '', amount: 1, recipeId: 100,
        children: [{ itemId: 20, name: 'raw', icon: '', amount: 5 }],
      }],
    }] as any)
    vi.mocked(findRecipesByItemName).mockResolvedValue([{ recipeId: 100, job: '木工' }])
    vi.mocked(getRecipe).mockResolvedValue(intermediateRecipe)
    vi.mocked(simulateCraft).mockResolvedValue(passProgressSim)
    return buildArgs()
  }

  it('drops candidate when realistic fulfilment inverts the optimistic savings', async () => {
    // computeOptimalCosts says: buy 200 once costs 1000, craft for 800 (20% saved).
    // Reality: 200's market only has 1 stack at the cheap price; need to eat next
    // tier. And the raw material is sparser than its minPriceNQ suggests.
    vi.mocked(computeOptimalCosts).mockReturnValue({
      totalCost: 0,
      decisions: [{
        itemId: 200, name: 'self-craft target', icon: '', amount: 1,
        buyCost: 1000, craftCost: 800, optimalCost: 800,
        savingsRatio: 0.20, recommendation: 'craft',
      }],
    })
    const priceMap = new Map<number, any>([
      [200, {
        itemID: 200, lastUploadTime: 0, currentAveragePrice: 0,
        currentAveragePriceNQ: 0, currentAveragePriceHQ: 0,
        minPriceNQ: 1000, minPriceHQ: 0,
        listings: [{ pricePerUnit: 1000, quantity: 1, total: 1000, hq: false, lastReviewTime: 0 }],
        recentHistory: [],
      }],
      [20, {
        itemID: 20, lastUploadTime: 0, currentAveragePrice: 0,
        currentAveragePriceNQ: 0, currentAveragePriceHQ: 0,
        minPriceNQ: 160, minPriceHQ: 0,
        // Only 5 needed but cheapest 1-stack runs out fast → bid up.
        listings: [
          { pricePerUnit: 160, quantity: 1, total: 160, hq: false, lastReviewTime: 0 },
          { pricePerUnit: 300, quantity: 4, total: 1200, hq: false, lastReviewTime: 0 },
        ],
        recentHistory: [],
      }],
    ])
    const args = { ...buildBugCaseArgs(), priceMap: priceMap as any }
    const out = await produceSelfCraftCandidates(args)
    // Optimistic decision claimed 20% savings, but craft cost 160+1200=1360 > buy cost 1000.
    // Realistic ratio is negative → must be dropped.
    expect(out).toHaveLength(0)
  })

  it('rewrites buyCost/craftCost/savings to listing-fulfilment numbers when still profitable', async () => {
    // Optimistic numbers exaggerate the win; realistic ones still save 5%+ so candidate survives,
    // but the displayed figures must reflect what the cart will actually charge.
    vi.mocked(computeOptimalCosts).mockReturnValue({
      totalCost: 0,
      decisions: [{
        itemId: 200, name: 'self-craft target', icon: '', amount: 1,
        buyCost: 1000, craftCost: 500, optimalCost: 500,
        savingsRatio: 0.50, recommendation: 'craft',
      }],
    })
    // calculateBestPurchase buys whole stacks — listing quantities must match
    // the needed amounts exactly, otherwise the test would also exercise the
    // waste cost which isn't what we're verifying here.
    const priceMap = new Map<number, any>([
      [200, {
        itemID: 200, lastUploadTime: 0, currentAveragePrice: 0,
        currentAveragePriceNQ: 0, currentAveragePriceHQ: 0,
        minPriceNQ: 800, minPriceHQ: 0,
        listings: [{ pricePerUnit: 800, quantity: 1, total: 800, hq: false, lastReviewTime: 0 }],
        recentHistory: [],
      }],
      [20, {
        itemID: 20, lastUploadTime: 0, currentAveragePrice: 0,
        currentAveragePriceNQ: 0, currentAveragePriceHQ: 0,
        minPriceNQ: 100, minPriceHQ: 0,
        listings: [{ pricePerUnit: 100, quantity: 5, total: 500, hq: false, lastReviewTime: 0 }],
        recentHistory: [],
      }],
    ])
    const args = { ...buildBugCaseArgs(), priceMap: priceMap as any }
    const out = await produceSelfCraftCandidates(args)
    expect(out).toHaveLength(1)
    // Realistic: buy 1 × 800 = 800; craft uses 5 × 100 = 500; savings 300, ratio 0.375.
    expect(out[0].buyCost).toBe(800)
    expect(out[0].craftCost).toBe(500)
    expect(out[0].savings).toBe(300)
    expect(out[0].savingsRatio).toBeCloseTo(0.375, 3)
  })

  it('falls back to decision values when price map has no entry for the candidate', async () => {
    // Empty priceMap (test artifact) — no realistic data, keep optimistic numbers.
    vi.mocked(computeOptimalCosts).mockReturnValue({
      totalCost: 0,
      decisions: [{
        itemId: 200, name: 'self-craft target', icon: '', amount: 1,
        buyCost: 1000, craftCost: 800, optimalCost: 800,
        savingsRatio: 0.20, recommendation: 'craft',
      }],
    })
    const args = buildBugCaseArgs()  // priceMap: new Map()
    const out = await produceSelfCraftCandidates(args)
    expect(out).toHaveLength(1)
    expect(out[0].buyCost).toBe(1000)
    expect(out[0].craftCost).toBe(800)
    expect(out[0].savingsRatio).toBeCloseTo(0.20, 3)
  })
})

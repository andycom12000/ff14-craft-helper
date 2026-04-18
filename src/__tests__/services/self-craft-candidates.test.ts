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
  level, stars: 0, canHq: true, materialQualityFactor: 50, ingredients: [],
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
      if (job === 'CRP') return { level: 90, craftsmanship: 3000, control: 3000, cp: 500 }
      if (job === 'BSM') return { level: 80, craftsmanship: 3000, control: 3000, cp: 500 }
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
vi.mock('@/solver/worker', () => ({
  solveCraft: vi.fn(),
  simulateCraft: vi.fn(),
  waitForWasm: vi.fn().mockResolvedValue(undefined),
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
      getGearset: () => ({ level: 100, craftsmanship: 4000, control: 3800, cp: 600 }),
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
        quantity: 1, actions: [], hqAmounts: [], initialQuality: 0,
        isDoubleMax: true, materials: [], qualityDeficit: 0,
      }],
      priceMap: new Map(),
      priceSource: 'Chocobo',
      crossServer: false,
      server: 'Chocobo',
      getGearset: () => ({ level: 80, craftsmanship: 3000, control: 3000, cp: 500 }), // below 90
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
      quantity: 1, actions: [], hqAmounts: [2, 0], initialQuality: 0,
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
      getGearset: () => ({ level: 90, craftsmanship: 4000, control: 3800, cp: 600 }),
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
        quantity: 1, actions: [], hqAmounts: [], initialQuality: 0,
        isDoubleMax: true, materials: [], qualityDeficit: 0,
      }],
      priceMap: new Map(),
      priceSource: 'Chocobo',
      crossServer: false,
      server: 'Chocobo',
      getGearset: () => ({ level: 100, craftsmanship: 4000, control: 3800, cp: 600 }),
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
        quantity: 1, actions: [], hqAmounts: [], initialQuality: 0,
        isDoubleMax: true, materials: [], qualityDeficit: 0,
      }],
      priceMap,
      priceSource: 'Chocobo',
      crossServer: false,
      server: 'Chocobo',
      getGearset: () => ({ level: 100, craftsmanship: 4000, control: 3800, cp: 600 }),
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
})

import { describe, it, expect } from 'vitest'
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
      { itemId: 1, name: 'Log', icon: '', amount: 20 },
      { itemId: 2, name: 'Sap', icon: '', amount: 4 },
    ]
    const raws = computeRawMaterials(childNodes)
    expect(raws).toEqual([
      { itemId: 1, name: 'Log', icon: '', amount: 20 },
      { itemId: 2, name: 'Sap', icon: '', amount: 4 },
    ])
  })
})

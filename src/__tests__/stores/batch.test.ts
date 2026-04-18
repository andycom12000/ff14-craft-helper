import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBatchStore } from '@/stores/batch'
import type { Recipe } from '@/stores/recipe'

const mockRecipe: Recipe = {
  id: 100,
  itemId: 200,
  name: '探究者之鋸',
  icon: '/icon.png',
  job: 'CRP',
  level: 100,
  stars: 2,
  canHq: true,
  materialQualityFactor: 75,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 100, stars: 2, difficulty: 6600, quality: 14040,
    durability: 70, suggestedCraftsmanship: 0,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 80, qualityModifier: 70,
  },
}

describe('useBatchStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('adds a target with default quantity 1', () => {
    const store = useBatchStore()
    store.addTarget(mockRecipe)
    expect(store.targets).toHaveLength(1)
    expect(store.targets[0].recipe.id).toBe(100)
    expect(store.targets[0].quantity).toBe(1)
  })

  it('merges quantity when adding duplicate recipe', () => {
    const store = useBatchStore()
    store.addTarget(mockRecipe)
    store.addTarget(mockRecipe)
    expect(store.targets).toHaveLength(1)
    expect(store.targets[0].quantity).toBe(2)
  })

  it('removes a target', () => {
    const store = useBatchStore()
    store.addTarget(mockRecipe)
    store.removeTarget(100)
    expect(store.targets).toHaveLength(0)
  })

  it('updates quantity', () => {
    const store = useBatchStore()
    store.addTarget(mockRecipe)
    store.updateQuantity(100, 5)
    expect(store.targets[0].quantity).toBe(5)
  })

  it('clears all targets', () => {
    const store = useBatchStore()
    store.addTarget(mockRecipe)
    store.clearTargets()
    expect(store.targets).toHaveLength(0)
  })

  it('tracks running state and progress', () => {
    const store = useBatchStore()
    expect(store.isRunning).toBe(false)
    expect(store.progress).toEqual({ current: 0, total: 0, currentName: '', phase: 'idle', solverPercent: 0 })
  })
})

describe('batch store self-craft selection', () => {
  it('starts with empty selection', () => {
    setActivePinia(createPinia())
    const store = useBatchStore()
    expect(store.selectedSelfCraftIds.size).toBe(0)
  })

  it('toggleSelfCraft adds then removes id', () => {
    setActivePinia(createPinia())
    const store = useBatchStore()
    store.toggleSelfCraft(123)
    expect(store.selectedSelfCraftIds.has(123)).toBe(true)
    store.toggleSelfCraft(123)
    expect(store.selectedSelfCraftIds.has(123)).toBe(false)
  })

  it('selectAllSelfCraft selects every candidate id', () => {
    setActivePinia(createPinia())
    const store = useBatchStore()
    store.results = {
      serverGroups: [], crystals: [], todoList: [], exceptions: [],
      buyFinishedItems: [], grandTotal: 0,
      crossWorldCache: new Map(),
      selfCraftCandidates: [
        { itemId: 1 }, { itemId: 2 }, { itemId: 3 },
      ] as any,
    }
    store.selectAllSelfCraft()
    expect(store.selectedSelfCraftIds.size).toBe(3)
  })

  it('clearSelfCraftSelection empties the set', () => {
    setActivePinia(createPinia())
    const store = useBatchStore()
    store.toggleSelfCraft(1)
    store.toggleSelfCraft(2)
    store.clearSelfCraftSelection()
    expect(store.selectedSelfCraftIds.size).toBe(0)
  })
})

describe('batch store finalShoppingItems', () => {
  it('removes selected candidate itemIds from serverGroups and adds rawMaterials', () => {
    setActivePinia(createPinia())
    const store = useBatchStore()

    store.results = {
      serverGroups: [{
        server: 'Local',
        subtotal: 15000,
        items: [
          { itemId: 50, name: 'Lumber', icon: '', amount: 10, type: 'nq', unitPrice: 1000, server: 'Local' },
          { itemId: 60, name: 'Other', icon: '', amount: 5, type: 'nq', unitPrice: 1000, server: 'Local' },
        ],
      }],
      crystals: [],
      selfCraftCandidates: [{
        itemId: 50, name: 'Lumber', icon: '', amount: 10,
        recipe: { job: 'CRP' } as any, job: 'CRP',
        buyCost: 10000, craftCost: 6000, savings: 4000, savingsRatio: 0.4,
        actions: [], hqAmounts: [],
        rawMaterials: [{ itemId: 1, name: 'Log', icon: '', amount: 20 }],
        hqRequired: false, depth: 1,
      }],
      todoList: [],
      exceptions: [], buyFinishedItems: [], grandTotal: 0,
      crossWorldCache: new Map(),
    }

    // Nothing selected: no change
    let final = store.finalShoppingItems
    expect(final.length).toBe(2)

    store.toggleSelfCraft(50)
    final = store.finalShoppingItems
    // Lumber removed, Log raw added, Other kept
    expect(final.find(i => i.itemId === 50)).toBeUndefined()
    expect(final.find(i => i.itemId === 1)).toMatchObject({ amount: 20, type: 'nq' })
    expect(final.find(i => i.itemId === 60)).toBeDefined()
  })
})

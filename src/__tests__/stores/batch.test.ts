import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBatchStore } from '@/stores/batch'
import type { Recipe } from '@/stores/recipe'

vi.mock('@/utils/analytics', () => ({ trackEvent: vi.fn() }))
import { trackEvent } from '@/utils/analytics'

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 1, itemId: 100, name: 'Test', icon: '', job: 'CRP', level: 90,
    stars: 0, canHq: true, materialQualityFactor: 50, amountResult: 1,
    ingredients: [],
    recipeLevelTable: {
      classJobLevel: 90, stars: 0, difficulty: 0, quality: 0,
      durability: 0, suggestedCraftsmanship: 0,
      progressDivider: 0, qualityDivider: 0,
      progressModifier: 0, qualityModifier: 0,
    },
    isExpert: false, requiresSpecialist: false, isCollectable: false, craftKind: 'normal',
    ...overrides,
  } as Recipe
}

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
  amountResult: 1,
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
    expect(store.progress).toEqual({ completed: 0, total: 0, currentName: '', phase: 'idle', solverPercent: 0 })
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
      buyFinishedItems: [], grandTotal: 0, npcPurchaseCandidates: [],
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
        rawMaterials: [{ itemId: 100, name: 'Log', icon: '', amount: 20, type: 'nq', unitPrice: 50, server: 'Local' }],
        hqRequired: false, depth: 1,
      }],
      todoList: [],
      exceptions: [], buyFinishedItems: [], grandTotal: 0, npcPurchaseCandidates: [],
      crossWorldCache: new Map(),
    }

    // Nothing selected: no change
    let final = store.finalShoppingItems
    expect(final.length).toBe(2)

    store.toggleSelfCraft(50)
    final = store.finalShoppingItems
    // Lumber removed, Log raw added (with priced unitPrice + server), Other kept
    expect(final.find(i => i.itemId === 50)).toBeUndefined()
    expect(final.find(i => i.itemId === 100)).toMatchObject({ amount: 20, type: 'nq', unitPrice: 50, server: 'Local' })
    expect(final.find(i => i.itemId === 60)).toBeDefined()
  })

  it('merges duplicate rawMaterials across multiple selected candidates', () => {
    setActivePinia(createPinia())
    const store = useBatchStore()

    store.results = {
      serverGroups: [{
        server: 'Local', subtotal: 0,
        items: [
          { itemId: 100, name: 'Flower', icon: '', amount: 3, type: 'nq', unitPrice: 50, server: 'Local' },
        ],
      }],
      crystals: [],
      selfCraftCandidates: [
        {
          itemId: 50, name: 'Potion', icon: '', amount: 1,
          recipe: { job: 'ALC' } as any, job: 'ALC',
          buyCost: 0, craftCost: 0, savings: 0, savingsRatio: 0,
          actions: [], hqAmounts: [],
          rawMaterials: [
            { itemId: 100, name: 'Flower', icon: '', amount: 2, type: 'nq', unitPrice: 50, server: 'Local' },
            { itemId: 200, name: 'Water', icon: '', amount: 4, type: 'nq', unitPrice: 10, server: 'Local' },
          ],
          hqRequired: false, depth: 1,
        },
        {
          itemId: 51, name: 'Leather', icon: '', amount: 1,
          recipe: { job: 'LTW' } as any, job: 'LTW',
          buyCost: 0, craftCost: 0, savings: 0, savingsRatio: 0,
          actions: [], hqAmounts: [],
          rawMaterials: [
            { itemId: 100, name: 'Flower', icon: '', amount: 2, type: 'nq', unitPrice: 50, server: 'Local' },
            { itemId: 200, name: 'Water', icon: '', amount: 4, type: 'nq', unitPrice: 10, server: 'Local' },
          ],
          hqRequired: false, depth: 1,
        },
      ],
      todoList: [],
      exceptions: [], buyFinishedItems: [], grandTotal: 0, npcPurchaseCandidates: [],
      crossWorldCache: new Map(),
    }

    store.toggleSelfCraft(50)
    store.toggleSelfCraft(51)
    const final = store.finalShoppingItems

    // Flower: 3 (serverGroups) + 2 + 2 (two candidates) = 7 — one row
    // Water: 4 + 4 (two candidates) = 8 — one row
    expect(final.filter(i => i.itemId === 100)).toHaveLength(1)
    expect(final.find(i => i.itemId === 100)?.amount).toBe(7)
    expect(final.filter(i => i.itemId === 200)).toHaveLength(1)
    expect(final.find(i => i.itemId === 200)?.amount).toBe(8)
  })

  it('routes crystals from selected candidates into finalCrystals, not finalShoppingItems', () => {
    setActivePinia(createPinia())
    const store = useBatchStore()

    store.results = {
      serverGroups: [],
      crystals: [{ itemId: 2, name: 'Fire', amount: 5 }],
      selfCraftCandidates: [{
        itemId: 50, name: 'Lumber', icon: '', amount: 10,
        recipe: { job: 'CRP' } as any, job: 'CRP',
        buyCost: 10000, craftCost: 6000, savings: 4000, savingsRatio: 0.4,
        actions: [], hqAmounts: [],
        rawMaterials: [
          { itemId: 2, name: 'Fire', icon: '', amount: 7, type: 'nq', unitPrice: 0, server: 'Local' },
          { itemId: 5, name: 'Earth', icon: '', amount: 3, type: 'nq', unitPrice: 0, server: 'Local' },
          { itemId: 100, name: 'Log', icon: '', amount: 20, type: 'nq', unitPrice: 50, server: 'Local' },
        ],
        hqRequired: false, depth: 1,
      }],
      todoList: [],
      exceptions: [], buyFinishedItems: [], grandTotal: 0, npcPurchaseCandidates: [],
      crossWorldCache: new Map(),
    }

    store.toggleSelfCraft(50)

    // Crystals should appear only in finalCrystals (aggregated with existing)
    const crystals = store.finalCrystals
    expect(crystals.find(c => c.itemId === 2)).toMatchObject({ amount: 12 }) // 5 + 7
    expect(crystals.find(c => c.itemId === 5)).toMatchObject({ amount: 3 })

    // Non-crystal raw appears in shopping list; crystals do not
    const shopping = store.finalShoppingItems
    expect(shopping.find(i => i.itemId === 2)).toBeUndefined()
    expect(shopping.find(i => i.itemId === 5)).toBeUndefined()
    expect(shopping.find(i => i.itemId === 100)).toBeDefined()
  })
})

describe('batch store finalTodoList', () => {
  it('prepends semi-finished todos from selected candidates', () => {
    setActivePinia(createPinia())
    const store = useBatchStore()

    const parentRecipe = { id: 10, itemId: 100, name: 'Chair', icon: '', job: 'CRP' }
    const interRecipe = { id: 5, itemId: 50, name: 'Lumber', icon: '', job: 'CRP' }

    store.results = {
      serverGroups: [], crystals: [],
      selfCraftCandidates: [{
        itemId: 50, name: 'Lumber', icon: '', amount: 10,
        recipe: interRecipe as any, job: 'CRP',
        buyCost: 10000, craftCost: 6000, savings: 4000, savingsRatio: 0.4,
        actions: ['muscle_memory'], hqAmounts: [],
        rawMaterials: [], hqRequired: false, depth: 1,
      }],
      todoList: [{
        recipe: parentRecipe as any, quantity: 1, actions: ['careful_synthesis'],
        hqAmounts: [], isSemiFinished: false, done: false,
      }],
      exceptions: [], buyFinishedItems: [], grandTotal: 0, npcPurchaseCandidates: [],
      crossWorldCache: new Map(),
    }

    // Nothing selected: only the parent
    expect(store.finalTodoList).toHaveLength(1)

    store.toggleSelfCraft(50)
    const final = store.finalTodoList
    expect(final).toHaveLength(2)
    expect(final[0].recipe.id).toBe(5) // semi-finished first
    expect(final[0].isSemiFinished).toBe(true)
    expect(final[1].recipe.id).toBe(10)
  })

  it('markSelfCraftDone persists done state for semi-finished items', () => {
    setActivePinia(createPinia())
    const store = useBatchStore()

    const interRecipe = { id: 5, itemId: 50, name: 'Lumber', icon: '', job: 'CRP' }

    store.results = {
      serverGroups: [], crystals: [],
      selfCraftCandidates: [{
        itemId: 50, name: 'Lumber', icon: '', amount: 10,
        recipe: interRecipe as any, job: 'CRP',
        buyCost: 10000, craftCost: 6000, savings: 4000, savingsRatio: 0.4,
        actions: ['muscle_memory'], hqAmounts: [],
        rawMaterials: [], hqRequired: false, depth: 1,
      }],
      todoList: [],
      exceptions: [], buyFinishedItems: [], grandTotal: 0, npcPurchaseCandidates: [],
      crossWorldCache: new Map(),
    }

    store.toggleSelfCraft(50)
    expect(store.finalTodoList[0].done).toBe(false)

    store.markSelfCraftDone(50, true)
    expect(store.finalTodoList[0].done).toBe(true)

    store.markSelfCraftDone(50, false)
    expect(store.finalTodoList[0].done).toBe(false)
  })

  // Bug regression: SelfCraftCandidate.amount is items needed, but
  // TodoItem.quantity must be # of crafts (TodoList renders × amountResult).
  function withCandidate(itemId: number, amount: number, amountResult: number) {
    setActivePinia(createPinia())
    const store = useBatchStore()
    store.results = {
      serverGroups: [], crystals: [],
      selfCraftCandidates: [{
        itemId, name: 'X', icon: '', amount,
        recipe: { id: itemId, itemId, name: 'X', icon: '', job: 'CUL', amountResult } as any,
        job: 'CUL', buyCost: 0, craftCost: 0, savings: 0, savingsRatio: 0,
        actions: [], hqAmounts: [], rawMaterials: [], hqRequired: false, depth: 1,
      }],
      todoList: [],
      exceptions: [], buyFinishedItems: [], grandTotal: 0, npcPurchaseCandidates: [],
      crossWorldCache: new Map(),
    }
    store.toggleSelfCraft(itemId)
    return store
  }

  it('converts semi-finished amount (items) to quantity (crafts) when amountResult > 1', () => {
    expect(withCandidate(70, 24, 3).finalTodoList[0].quantity).toBe(8)
  })

  it('rounds up partial crafts when items needed is not divisible by amountResult', () => {
    expect(withCandidate(80, 25, 3).finalTodoList[0].quantity).toBe(9)
  })

  it('passes amount through unchanged when amountResult is 1', () => {
    expect(withCandidate(90, 7, 1).finalTodoList[0].quantity).toBe(7)
  })
})

describe('batch_add_recipe method param', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(trackEvent).mockClear()
  })

  it('passes method through to batch_add_recipe event', () => {
    const batch = useBatchStore()
    batch.addRecipe(makeRecipe({ id: 1 }), 1, 'search')
    expect(trackEvent).toHaveBeenCalledWith('batch_add_recipe', expect.objectContaining({ method: 'search' }))
  })

  it('defaults method to search when not passed', () => {
    const batch = useBatchStore()
    batch.addRecipe(makeRecipe({ id: 1 }), 1)
    expect(trackEvent).toHaveBeenCalledWith('batch_add_recipe', expect.objectContaining({ method: 'search' }))
  })

  it('passes cross_page_send method', () => {
    const batch = useBatchStore()
    batch.addRecipe(makeRecipe({ id: 2 }), 1, 'cross_page_send')
    expect(trackEvent).toHaveBeenCalledWith('batch_add_recipe', expect.objectContaining({ method: 'cross_page_send' }))
  })
})

describe('batch_optimization_start aggregate dims', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(trackEvent).mockClear()
  })

  it('emits rlv min/max, stars max, has_expert/collectable, unique_jobs', () => {
    const batch = useBatchStore()
    batch.addRecipe(makeRecipe({
      id: 1,
      recipeLevelTable: {
        classJobLevel: 640, stars: 2, difficulty: 0, quality: 0,
        durability: 0, suggestedCraftsmanship: 0,
        progressDivider: 0, qualityDivider: 0,
        progressModifier: 0, qualityModifier: 0,
      },
      stars: 2, isExpert: true, job: 'CRP',
    }), 1, 'search')
    batch.addRecipe(makeRecipe({
      id: 2,
      recipeLevelTable: {
        classJobLevel: 700, stars: 4, difficulty: 0, quality: 0,
        durability: 0, suggestedCraftsmanship: 0,
        progressDivider: 0, qualityDivider: 0,
        progressModifier: 0, qualityModifier: 0,
      },
      stars: 4, isExpert: false, isCollectable: true, job: 'BSM',
    }), 1, 'search')
    vi.mocked(trackEvent).mockClear()
    batch.recordOptimizationStart()
    expect(trackEvent).toHaveBeenCalledWith('batch_optimization_start', expect.objectContaining({
      targets_rlv_min: 640,
      targets_rlv_max: 700,
      targets_stars_max: 4,
      has_expert_in_batch: true,
      has_collectable_in_batch: true,
      unique_jobs_in_batch: 2,
    }))
  })
})

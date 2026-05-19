import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/analytics', () => ({
  trackEvent: vi.fn(),
}))

import { trackEvent } from '@/utils/analytics'
import { useRecipeStore } from '@/stores/recipe'
import type { Recipe } from '@/stores/recipe'

const mockRecipe = (id: number, name: string): Recipe => ({
  id,
  itemId: id + 10000,
  name,
  icon: '',
  job: '鍛造',
  level: 50,
  stars: 0,
  canHq: true,
  materialQualityFactor: 0,
  amountResult: 1,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 50, stars: 0, difficulty: 100, quality: 100,
    durability: 40, suggestedCraftsmanship: 0, progressDivider: 100,
    qualityDivider: 100, progressModifier: 100, qualityModifier: 100,
  },
})

describe('setRecipe payload', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(trackEvent).mockClear()
  })

  it('emits recipe_select with taxonomy + source', () => {
    const store = useRecipeStore()
    const recipe = {
      id: 33001, name: 'Test', job: 'CRP', level: 90,
      itemId: 5000, icon: '', stars: 2, canHq: true, materialQualityFactor: 50,
      amountResult: 1, ingredients: [],
      recipeLevelTable: {
        classJobLevel: 640, stars: 2, difficulty: 100, quality: 100,
        durability: 40, suggestedCraftsmanship: 0, progressDivider: 100,
        qualityDivider: 100, progressModifier: 100, qualityModifier: 100,
      },
      isExpert: false, requiresSpecialist: false,
      isCollectable: false, craftKind: 'normal' as const,
    } as Recipe
    store.setRecipe(recipe, 'search')

    expect(trackEvent).toHaveBeenCalledWith('recipe_select', expect.objectContaining({
      recipe_id: 33001, job: 'CRP', level: 90,
      rlv: 640, stars: 2, is_expert: false, is_collectable: false,
      craft_kind: 'normal',
      source: 'search',
    }))
  })

  it('defaults source to unknown if not passed', () => {
    const store = useRecipeStore()
    store.setRecipe({
      id: 1, name: '', job: 'CRP', level: 1,
      itemId: 0, icon: '', stars: 0, canHq: false,
      materialQualityFactor: 50, amountResult: 1, ingredients: [],
      recipeLevelTable: {
        classJobLevel: 1, stars: 0, difficulty: 100, quality: 100,
        durability: 40, suggestedCraftsmanship: 0, progressDivider: 100,
        qualityDivider: 100, progressModifier: 100, qualityModifier: 100,
      },
    } as Recipe)
    expect(trackEvent).toHaveBeenCalledWith('recipe_select', expect.objectContaining({ source: 'unknown' }))
  })
})

describe('recipe simulation queue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('adds recipes to queue without duplicates', () => {
    const store = useRecipeStore()
    store.addToQueue(mockRecipe(1, 'A'))
    store.addToQueue(mockRecipe(2, 'B'))
    store.addToQueue(mockRecipe(1, 'A'))  // duplicate
    expect(store.simulationQueue).toHaveLength(2)
  })

  it('removes recipe from queue', () => {
    const store = useRecipeStore()
    store.addToQueue(mockRecipe(1, 'A'))
    store.addToQueue(mockRecipe(2, 'B'))
    store.removeFromQueue(1)
    expect(store.simulationQueue).toHaveLength(1)
    expect(store.simulationQueue[0].id).toBe(2)
  })

  it('clears queue', () => {
    const store = useRecipeStore()
    store.addToQueue(mockRecipe(1, 'A'))
    store.addToQueue(mockRecipe(2, 'B'))
    store.clearQueue()
    expect(store.simulationQueue).toHaveLength(0)
  })
})

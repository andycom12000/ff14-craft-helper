import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRecipeStore } from '@/stores/recipe'
import type { Recipe } from '@/stores/recipe'

const mockRecipe = (id: number, name: string): Recipe => ({
  id,
  name,
  icon: '',
  job: '鍛造',
  level: 50,
  stars: 0,
  canHq: true,
  materialQualityFactor: 0,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 50, stars: 0, difficulty: 100, quality: 100,
    durability: 40, suggestedCraftsmanship: 0, progressDivider: 100,
    qualityDivider: 100, progressModifier: 100, qualityModifier: 100,
  },
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

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
    expect(store.progress).toEqual({ current: 0, total: 0, currentName: '' })
  })
})

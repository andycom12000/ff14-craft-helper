// src/__tests__/components/MacroExport.spec.ts
//
// #198: solver_macro_copy — one of the three macro-copy paths, and previously
// the only one that fired at all. It now also carries recipe taxonomy so the
// pipeline can attribute macro copies by craft_kind / rlv like every other
// taxonomy-bearing event.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import MacroExport from '@/components/simulator/MacroExport.vue'
import { useSimulatorStore } from '@/stores/simulator'
import { useRecipeStore } from '@/stores/recipe'
import type { Recipe } from '@/stores/recipe'

vi.mock('@/utils/analytics', () => ({ trackEvent: vi.fn(), trackError: vi.fn(), setUserProperty: vi.fn() }))
import { trackEvent } from '@/utils/analytics'

const mockRecipe: Recipe = {
  id: 1, itemId: 100, name: 'Test', icon: '', job: 'CRP',
  level: 90, stars: 2, canHq: true, materialQualityFactor: 75, amountResult: 1,
  isExpert: false, isCollectable: true, craftKind: 'quick', rlv: 640,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 90, stars: 2, difficulty: 3500, quality: 7200,
    durability: 80, suggestedCraftsmanship: 0,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 80,
  },
}

describe('MacroExport — solver_macro_copy taxonomy (#198)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
  })

  it('includes recipe taxonomy fields when a recipe is active', async () => {
    const simStore = useSimulatorStore()
    const recipeStore = useRecipeStore()
    simStore.actions = ['MuscleMemory', 'BasicSynthesis']
    recipeStore.currentRecipe = mockRecipe

    const w = mount(MacroExport)
    await w.vm.$nextTick()
    await w.find('.code-block').trigger('click')
    await w.vm.$nextTick()

    expect(vi.mocked(trackEvent)).toHaveBeenCalledWith('solver_macro_copy', expect.objectContaining({
      macro_index: 0,
      rlv: 640, stars: 2, is_expert: false, is_collectable: true, craft_kind: 'quick',
    }))
  })

  it('omits taxonomy fields when no recipe is active (still fires the event)', async () => {
    const simStore = useSimulatorStore()
    simStore.actions = ['MuscleMemory']

    const w = mount(MacroExport)
    await w.vm.$nextTick()
    await w.find('.code-block').trigger('click')
    await w.vm.$nextTick()

    const call = vi.mocked(trackEvent).mock.calls.find(c => c[0] === 'solver_macro_copy')
    expect(call).toBeDefined()
    expect(call![1]).not.toHaveProperty('craft_kind')
  })
})

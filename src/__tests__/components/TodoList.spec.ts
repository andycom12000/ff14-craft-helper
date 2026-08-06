// src/__tests__/components/TodoList.spec.ts
//
// #198: the batch page's macro-copy path previously fired NO analytics event
// at all (unlike the simulator's MacroExport path, which had an event but no
// taxonomy). This is the third of the three "macro copy" paths the ticket
// closes out.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TodoList from '@/components/batch/TodoList.vue'
import type { TodoItem } from '@/stores/batch'
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

const item: TodoItem = {
  recipe: mockRecipe,
  quantity: 1,
  actions: ['MuscleMemory', 'BasicSynthesis'],
  hqAmounts: [],
  isSemiFinished: false,
  done: false,
}

describe('TodoList — solver_macro_copy (#198)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
  })

  it('fires solver_macro_copy with taxonomy on the quick-copy button (single-macro case)', async () => {
    const w = mount(TodoList, { props: { items: [item] } })
    const button = w.findAll('el-button').find(b => b.text().includes('複製巨集'))
    expect(button).toBeDefined()
    await button!.trigger('click')
    await w.vm.$nextTick()

    expect(vi.mocked(trackEvent)).toHaveBeenCalledWith('solver_macro_copy', expect.objectContaining({
      macro_index: 0,
      total_macros: 1,
      action_count: 2,
      rlv: 640, stars: 2, is_expert: false, is_collectable: true, craft_kind: 'quick',
    }))
  })
})

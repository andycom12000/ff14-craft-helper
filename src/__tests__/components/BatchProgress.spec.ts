import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import BatchProgress from '@/components/batch/BatchProgress.vue'
import { useBatchStore } from '@/stores/batch'
import type { Recipe } from '@/stores/recipe'

function makeRecipe(id: number, name: string): Recipe {
  return {
    id, itemId: id, name, icon: '', job: 'CRP', level: 90,
    stars: 0, canHq: true, materialQualityFactor: 50, amountResult: 1,
    ingredients: [],
    recipeLevelTable: {
      classJobLevel: 90, stars: 0, difficulty: 0, quality: 0,
      durability: 0, suggestedCraftsmanship: 0,
      progressDivider: 0, qualityDivider: 0,
      progressModifier: 0, qualityModifier: 0,
    },
    isExpert: false, requiresSpecialist: false, isCollectable: false, craftKind: 'normal',
  } as Recipe
}

describe('BatchProgress', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders per-target rows with status labels during solving phase', async () => {
    const store = useBatchStore()
    store.isRunning = true
    store.targets = [
      { recipe: makeRecipe(1, 'A'), quantity: 1 },
      { recipe: makeRecipe(2, 'B'), quantity: 1 },
    ]
    store.liveTargetNames = ['A', 'B']
    store.progress = { ...store.progress, phase: 'solving', total: 2, completed: 0 }
    store.liveTargets = [
      { state: 'done', steps: 12, isDoubleMax: true },
      { state: 'solving', percent: 55 },
    ]

    const w = mount(BatchProgress)

    const list = w.find('[data-test="live-target-list"]')
    expect(list.exists()).toBe(true)
    const rows = w.findAll('.live-target-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('完成')
    expect(rows[0].text()).toContain('A')
    expect(rows[1].text()).toContain('55%')
    expect(rows[1].text()).toContain('B')
    expect(w.text()).toContain('已完成 1 / 2')
  })

  it('counts failed targets into the honest completed counter', async () => {
    const store = useBatchStore()
    store.isRunning = true
    store.targets = [
      { recipe: makeRecipe(1, 'A'), quantity: 1 },
      { recipe: makeRecipe(2, 'B'), quantity: 1 },
    ]
    store.liveTargetNames = ['A', 'B']
    store.progress = { ...store.progress, phase: 'solving', total: 2, completed: 0 }
    store.liveTargets = [
      { state: 'failed', reason: 'x' },
      { state: 'queued' },
    ]

    const w = mount(BatchProgress)

    expect(w.text()).toContain('已完成 1 / 2')
    const rows = w.findAll('.live-target-row')
    expect(rows[0].text()).toContain('失敗')
  })

  it('renders no target list when liveTargets is empty (pre-PR-3 behaviour)', () => {
    const store = useBatchStore()
    store.isRunning = true
    store.progress = { ...store.progress, phase: 'solving', total: 1, completed: 0 }
    store.liveTargets = []

    const w = mount(BatchProgress)

    expect(w.find('[data-test="live-target-list"]').exists()).toBe(false)
    // Original single progress bar still renders.
    expect(w.find('.progress-body').exists()).toBe(true)
  })

  it('renders names from the liveTargetNames snapshot, not the live targets list — a mid-run remove/reorder of targets must not desync the row label from its status', () => {
    const store = useBatchStore()
    store.isRunning = true
    // Snapshot taken when the run started: A, B in that order.
    store.liveTargetNames = ['A', 'B']
    store.progress = { ...store.progress, phase: 'solving', total: 2, completed: 0 }
    store.liveTargets = [
      { state: 'done', steps: 5, isDoubleMax: true },
      { state: 'solving', percent: 30 },
    ]
    // Mid-run edit: user removed the first target and the live `targets`
    // array is now reordered/shrunk relative to the snapshot.
    store.targets = [
      { recipe: makeRecipe(2, 'B'), quantity: 1 },
    ]

    const w = mount(BatchProgress)

    const rows = w.findAll('.live-target-row')
    expect(rows).toHaveLength(2)
    // Row 0's status (done) must still be labelled "A" — the snapshot name —
    // even though targets[0] is now "B" after the removal.
    expect(rows[0].text()).toContain('A')
    expect(rows[0].text()).toContain('完成')
    expect(rows[1].text()).toContain('B')
    expect(rows[1].text()).toContain('30%')
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { vi } from 'vitest'
import BatchView from '@/views/BatchView.vue'
import MeldAdvisorCard from '@/components/MeldAdvisorCard.vue'
import { useBatchStore } from '@/stores/batch'
import { getJobLabel } from '@/utils/jobs'
import type { MeldAdvice } from '@/services/meld-advisor'
import type { BatchResults } from '@/stores/batch.types'

// BatchView reads route.query.bench at setup — give it an empty query.
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))

// Stub the heavy child components so the test mounts the page shell without
// pulling their transitive deps. MeldAdvisorCard is intentionally NOT stubbed —
// the per-job meld grid is what we assert on. (Factories are hoisted above
// module scope, so the stub object must be inlined inside each one.)
vi.mock('@/components/batch/CostSummaryPanel.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/batch/BatchList.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/batch/BatchSettings.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/batch/BatchProgress.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/batch/ShoppingList.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/batch/SelfCraftSuggestions.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/batch/VendorRoster.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/batch/TodoList.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/batch/ExceptionList.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/recipe/RecipeSearchSidebar.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/batch/BuffRecommendationCard.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/common/FlowBreadcrumb.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/batch/ConfirmNewBatch.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/gearset/GearsetSheet.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/batch/BenchPanel.vue', () => ({ default: { template: '<div />' } }))

const advice = (): MeldAdvice => ({
  alreadyMeetsThreshold: false,
  hqSufficient: false,
  costOptimal: {
    feasible: true,
    deltaStats: { craftsmanship: 60, control: 0, cp: 0 },
    steps: [{ stat: 'craftsmanship', grade: 12, placedCount: 2, expectedCount: 2, unitPrice: 8000, subtotal: 16000 }],
    totalGil: 16000, confirmedBySolver: true,
  },
  bis: {
    feasible: true,
    deltaStats: { craftsmanship: 400, control: 400, cp: 50 },
    steps: [], totalGil: 2_400_000, confirmedBySolver: false,
  },
  gapGil: 2_384_000,
})

/** Minimal BatchResults satisfying the shape; only meldAdvicePerJob varies. */
const makeResults = (meldAdvicePerJob?: Map<string, MeldAdvice>): BatchResults => ({
  serverGroups: [],
  crystals: [],
  selfCraftCandidates: [],
  todoList: [],
  exceptions: [],
  buyFinishedItems: [],
  grandTotal: 0,
  crossWorldCache: new Map(),
  npcPurchaseCandidates: [],
  meldAdvicePerJob,
})

describe('BatchView — per-job meld advice section', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders one de-shelled meld card per job, labelled by job', async () => {
    const w = mount(BatchView)
    const store = useBatchStore()
    store.results = makeResults(new Map([['CRP', advice()], ['BSM', advice()]]))
    await w.vm.$nextTick()

    expect(w.find('.meld-advisor-section').exists()).toBe(true)
    const wraps = w.findAll('.meld-card-wrap')
    expect(wraps).toHaveLength(2)
    // Each wrap is titled by its job label (the host owns the title, not the card).
    expect(w.text()).toContain(getJobLabel('CRP'))
    expect(w.text()).toContain(getJobLabel('BSM'))
    // One MeldAdvisorCard per job.
    expect(w.findAllComponents(MeldAdvisorCard)).toHaveLength(2)
  })

  it('passes mode=cost + showApply=false so batch shows no 套用到配裝 CTA', async () => {
    const w = mount(BatchView)
    const store = useBatchStore()
    store.results = makeResults(new Map([['CRP', advice()]]))
    await w.vm.$nextTick()

    const card = w.findComponent(MeldAdvisorCard)
    expect(card.props('mode')).toBe('cost')
    expect(card.props('showApply')).toBe(false)
    // No actionable apply CTA anywhere in the batch meld section.
    const section = w.find('.meld-advisor-section')
    expect(section.findAll('button').some(b => b.text().includes('套用到配裝'))).toBe(false)
  })

  it('renders no meld section when results is null', () => {
    const w = mount(BatchView)
    expect(w.find('.meld-advisor-section').exists()).toBe(false)
  })

  it('renders no meld section when meldAdvicePerJob is empty', async () => {
    const w = mount(BatchView)
    const store = useBatchStore()
    store.results = makeResults(new Map())
    await w.vm.$nextTick()
    expect(w.find('.meld-advisor-section').exists()).toBe(false)
  })

  it('renders no meld section when meldAdvicePerJob is absent', async () => {
    const w = mount(BatchView)
    const store = useBatchStore()
    store.results = makeResults(undefined)
    await w.vm.$nextTick()
    expect(w.find('.meld-advisor-section').exists()).toBe(false)
  })
})

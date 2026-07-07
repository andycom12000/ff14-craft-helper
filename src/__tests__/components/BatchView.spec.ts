import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { vi } from 'vitest'
import BatchView from '@/views/BatchView.vue'
import MeldAdvisorCard from '@/components/MeldAdvisorCard.vue'
import { useBatchStore } from '@/stores/batch'
import { useGearsetsStore } from '@/stores/gearsets'
import { getJobLabel } from '@/utils/jobs'
import type { MeldAdvice } from '@/services/meld-advisor'
import type { BatchResults, BatchTargetStatus } from '@/stores/batch.types'
import type { Recipe } from '@/stores/recipe'

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

vi.mock('@/services/batch-optimizer', () => ({ runBatchOptimization: vi.fn() }))
import { runBatchOptimization } from '@/services/batch-optimizer'

const advice = (): MeldAdvice => ({
  status: 'feasible',
  alreadyMeetsThreshold: false,
  hqSufficient: false,
  rankedByCount: false,
  noHqLever: false,
  costOptimal: {
    feasible: true,
    deltaStats: { craftsmanship: 60, control: 0, cp: 0 },
    steps: [{ stat: 'craftsmanship', grade: 12, placedCount: 2, expectedCount: 2, unitPrice: 8000, subtotal: 16000 }],
    totalGil: 16000, confirmedBySolver: true,
  },
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

function makeTargetRecipe(id: number, name: string): Recipe {
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

/**
 * Click the "▶ 開始最佳化計算" CTA rendered by BatchView's prepare section.
 * It's an unregistered `<el-button>` in this test environment (no Element
 * Plus plugin installed), so it renders as a literal custom element rather
 * than a `<button>` — select on the wrapping class instead of tag/role.
 */
async function clickStartOptimization(w: ReturnType<typeof mount>) {
  const btn = w.find('.batch-action el-button')
  if (!btn.exists()) throw new Error('start-optimization button not found')
  await btn.trigger('click')
}

describe('BatchView — startOptimization liveTargets bridging', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(runBatchOptimization).mockReset()
  })

  it('seeds liveTargets to queued×N on start, routes onTargetUpdate writes into the store, and clears liveTargets after a successful run', async () => {
    const store = useBatchStore()
    const gearsets = useGearsetsStore()
    gearsets.updateGearset('CRP', { craftsmanship: 3000, control: 3000 })
    store.addTarget(makeTargetRecipe(1, 'Target A'))
    store.addTarget(makeTargetRecipe(2, 'Target B'))

    let seenAtCallTime: BatchTargetStatus[] = []
    let seenAfterUpdate: BatchTargetStatus[] = []
    let seenNamesAtCallTime: string[] = []
    vi.mocked(runBatchOptimization).mockImplementation(async (_targets, _getGearset, _settings, _onProgress, _isCancelled, onTargetUpdate) => {
      // By the time the optimizer is invoked, startOptimization has already
      // synchronously seeded liveTargets to queued×N (before the awaited call).
      seenAtCallTime = JSON.parse(JSON.stringify(store.liveTargets))
      seenNamesAtCallTime = JSON.parse(JSON.stringify(store.liveTargetNames))
      onTargetUpdate?.(0, { state: 'done', steps: 12, isDoubleMax: true })
      seenAfterUpdate = JSON.parse(JSON.stringify(store.liveTargets))
      return makeResults()
    })

    const w = mount(BatchView)
    await w.vm.$nextTick()
    await clickStartOptimization(w)
    await flushPromises()

    expect(seenAtCallTime).toEqual([{ state: 'queued' }, { state: 'queued' }])
    expect(seenNamesAtCallTime).toEqual(['Target A', 'Target B'])
    expect(seenAfterUpdate[0]).toEqual({ state: 'done', steps: 12, isDoubleMax: true })
    expect(seenAfterUpdate[1]).toEqual({ state: 'queued' })
    // Run finished successfully — liveTargets/liveTargetNames are cleared, results is populated.
    expect(store.liveTargets).toEqual([])
    expect(store.liveTargetNames).toEqual([])
    expect(store.results).not.toBeNull()
  })

  it('clears liveTargets when the run throws (catch branch)', async () => {
    const store = useBatchStore()
    const gearsets = useGearsetsStore()
    gearsets.updateGearset('CRP', { craftsmanship: 3000, control: 3000 })
    store.addTarget(makeTargetRecipe(1, 'Target A'))

    vi.mocked(runBatchOptimization).mockImplementation(async () => {
      throw new Error('boom')
    })

    const w = mount(BatchView)
    await w.vm.$nextTick()
    await clickStartOptimization(w)
    await flushPromises()

    expect(store.liveTargets).toEqual([])
  })

  it('does not seed a fake queued liveTargets list in quick-buy mode (quick-buy never calls onTargetUpdate, so a queued×N seed would stall forever)', async () => {
    const store = useBatchStore()
    const gearsets = useGearsetsStore()
    gearsets.updateGearset('CRP', { craftsmanship: 3000, control: 3000 })
    store.addTarget(makeTargetRecipe(1, 'Target A'))
    store.addTarget(makeTargetRecipe(2, 'Target B'))
    store.setCalcMode('quick-buy')

    let seenAtCallTime: BatchTargetStatus[] | null = null
    let seenNamesAtCallTime: string[] | null = null
    vi.mocked(runBatchOptimization).mockImplementation(async () => {
      // runQuickBuy never invokes onTargetUpdate — assert the seed itself
      // never happened, matching the real short-circuit in runBatchOptimization.
      seenAtCallTime = JSON.parse(JSON.stringify(store.liveTargets))
      seenNamesAtCallTime = JSON.parse(JSON.stringify(store.liveTargetNames))
      return makeResults()
    })

    const w = mount(BatchView)
    await w.vm.$nextTick()
    await clickStartOptimization(w)
    await flushPromises()

    expect(seenAtCallTime).toEqual([])
    expect(seenNamesAtCallTime).toEqual([])
    expect(store.liveTargets).toEqual([])
    expect(store.liveTargetNames).toEqual([])
  })
})

// Smoke tests for the GA dashboard v2 chart SFCs. happy-dom has no layout, so
// each chart falls back to its onMounted default width; we only assert that
// mounting with typical data renders without throwing and emits markup. D3
// charts need ResizeObserver, which happy-dom doesn't provide — stub it.
import { describe, it, expect, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'

import ToolUsageByRlv from '../ToolUsageByRlv.vue'
import RecipeDifficultyKind from '../RecipeDifficultyKind.vue'
import ExpertCollectableMatrix from '../ExpertCollectableMatrix.vue'
import MisuseHintTally from '../MisuseHintTally.vue'
import ApiFailureEndpoints from '../ApiFailureEndpoints.vue'
import SolverBatchFunnels from '../SolverBatchFunnels.vue'
import FailuresBar from '../FailuresBar.vue'
import FeatureAdoption from '../FeatureAdoption.vue'
import GearBucketOutcome from '../GearBucketOutcome.vue'
import RegionSplitLedger from '../../pieces/RegionSplitLedger.vue'

import type { GaSnapshot } from '@/types/ga-snapshot'

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
})

// #209: raw per-rlv rows, not the retired wide-bucket shape.
const toolUsage = [
  { rlv: 50, selectCount: 152, simulatorCount: 24, batchTargetCount: 12, bomTargetCount: 88 },
  { rlv: 660, selectCount: 1284, simulatorCount: 921, batchTargetCount: 287, bomTargetCount: 142 },
]

const rlvRaw = [
  { rlv: 50, events: 88 },
  { rlv: 660, events: 1284 },
]

const taxonomy = {
  rlvRaw,
  matrix: [
    { isExpert: false, isCollectable: false, starts: 2104, completes: 2043, macroCopies: 622, completeRate: 0.971, macroCopyRate: 0.304 },
    { isExpert: true, isCollectable: true, starts: 50, completes: 29, macroCopies: 6, completeRate: 0.58, macroCopyRate: 0.207 },
  ],
  // #209: craftKindBreakdown moved from RecipeDifficultyKind.vue into
  // ExpertCollectableMatrix.vue's third row — now carries completes/
  // macroCopies/macroCopyRate too, same shape as a TaxonomyCell.
  craftKindBreakdown: [
    { kind: 'normal', starts: 2104, completes: 2043, macroCopies: 622, completeRate: 0.971, macroCopyRate: 0.304 },
    { kind: 'expert', starts: 287, completes: 198, macroCopies: 41, completeRate: 0.69, macroCopyRate: 0.207 },
  ],
} as const

const misuse = [
  { type: 'single_recipe_in_batch', label: 'Single recipe in batch', gloss: 'gloss', eventCount: 87, affectedUsers: 64 },
] as const

const apiFailures = {
  matrix: [{ api: 'universalis', status: 404, count: 142 }],
  topEndpoints: [{ api: 'universalis', endpoint: '/Aether/38843', status: 404, count: 88 }],
} as const

const region = (g: { cht: number; intl: number; unset: number }) => ({
  cht: { value: g.cht, sparkPct: 0.5, secondary: 'x' },
  intl: { value: g.intl, sparkPct: 0.4, secondary: 'y' },
  unset: { value: g.unset, sparkPct: 0.2, secondary: 'z' },
})

function snapshotWith(byRegion: GaSnapshot['windows']['7d']['byRegion']): GaSnapshot {
  const glance = {
    activeUsers: { total: 1355, new: 943, returning: 412, returningPct: 0.304 },
    solver: { starts: 2683, completes: 2467, fails: 216, completePct: 0.919 },
    batch: { starts: 421, completes: 348, fails: 41, cancelled: 32, completePct: 0.826 },
    bom: { calculates: 312, sentToBatch: 38, handoffPct: 0.122 },
    infra: { sabUnavailable: 24, wasmLoadFailed: 7 },
  }
  const bundle = { window: { days: 7, startDate: '', endDate: '' }, glance, byRegion } as unknown as GaSnapshot['windows']['7d']
  return { schemaVersion: 1, generatedAt: '', propertyId: '527587379', windows: { '7d': bundle, '14d': bundle, '28d': bundle } }
}

describe('GA dashboard v2 charts render without throwing', () => {
  it('ToolUsageByRlv renders an svg', () => {
    const w = mount(ToolUsageByRlv, { props: { data: toolUsage as never } })
    expect(w.find('svg').exists()).toBe(true)
  })
  it('RecipeDifficultyKind renders the raw RLV histogram (#209)', () => {
    const w = mount(RecipeDifficultyKind, { props: { data: rlvRaw as never } })
    expect(w.find('svg').exists()).toBe(true)
  })
  it('ExpertCollectableMatrix renders an svg', () => {
    const w = mount(ExpertCollectableMatrix, { props: { data: taxonomy.matrix as never } })
    expect(w.find('svg').exists()).toBe(true)
  })
  it('ExpertCollectableMatrix renders the craft_kind third row (#209)', () => {
    const w = mount(ExpertCollectableMatrix, {
      props: { data: taxonomy.matrix as never, craftKindData: taxonomy.craftKindBreakdown as never },
    })
    expect(w.text()).toContain('normal')
    expect(w.text()).toContain('expert')
  })
  it('ExpertCollectableMatrix renders "—" (not "0.0%") when macroCopyRate is unattributable (#209 review 2)', () => {
    // Today's live shape: solver_macro_copy carries no taxonomy at all, so
    // pipeline reports macroCopies/macroCopyRate as undefined, not 0.
    const data = [
      { isExpert: false, isCollectable: false, starts: 2104, completes: 2043, completeRate: 0.971 },
    ]
    const craftKindData = [
      { kind: 'normal', starts: 2104, completes: 2043, completeRate: 0.971 },
    ]
    const w = mount(ExpertCollectableMatrix, { props: { data: data as never, craftKindData: craftKindData as never } })
    expect(w.text()).toContain('—')
    expect(w.text()).not.toContain('0.0%')
  })
  it('ExpertCollectableMatrix renders completeRate above 100% verbatim, not clamped (#209 review 3)', () => {
    // Live-observed shape: quick starts=1310, completes=1331 → 101.6%.
    const craftKindData = [
      { kind: 'quick', starts: 1310, completes: 1331, macroCopies: 40, completeRate: 1331 / 1310, macroCopyRate: 40 / 1331 },
    ]
    const w = mount(ExpertCollectableMatrix, {
      props: { data: taxonomy.matrix as never, craftKindData: craftKindData as never },
    })
    expect(w.text()).toContain('101.6%')
    expect(w.text()).not.toContain('100.0%')
  })
  it('ExpertCollectableMatrix renders the 態二 stripe pattern when stripeMacroBand is set (#208), still only over the macro-copy-rate band including the new craft_kind row (#209)', () => {
    const w = mount(ExpertCollectableMatrix, {
      props: {
        data: taxonomy.matrix as never,
        craftKindData: taxonomy.craftKindBreakdown as never,
        stripeMacroBand: true,
      },
    })
    expect(w.find('pattern#flag-stripe-pattern').exists()).toBe(true)
    // One stripe rect per cell (the fixture only supplies 2 of the 4 possible
    // is_expert × is_collectable quadrants, same as the pre-#209 fixture
    // above) — 2 from the 2×2 grid + 2 from the new craft_kind row confirms
    // BOTH halves of the matrix got the overlay, not just the original grid.
    expect(w.findAll('rect[fill="url(#flag-stripe-pattern)"]').length)
      .toBe(taxonomy.matrix.length + taxonomy.craftKindBreakdown.length)
  })
  it('SolverBatchFunnels renders an svg', () => {
    const data = {
      solver: [{ step: 'start', count: 100, tone: 'neutral' }, { step: 'complete', count: 90, tone: 'success' }],
      batch: [{ step: 'start', count: 40, tone: 'neutral' }, { step: 'complete', count: 32, tone: 'success' }],
    }
    const w = mount(SolverBatchFunnels, { props: { data: data as never } })
    expect(w.find('svg').exists()).toBe(true)
  })
  it('SolverBatchFunnels renders the 態二 stripe overlay over the Solver half when stripeSolver is set (#208)', () => {
    const data = {
      solver: [{ step: 'start', count: 100, tone: 'neutral' }, { step: 'complete', count: 90, tone: 'success' }],
      batch: [{ step: 'start', count: 40, tone: 'neutral' }, { step: 'complete', count: 32, tone: 'success' }],
    }
    const w = mount(SolverBatchFunnels, { props: { data: data as never, stripeSolver: true } })
    expect(w.find('.stripe-solver').exists()).toBe(true)
  })
  it('MisuseHintTally renders rows', () => {
    const w = mount(MisuseHintTally, { props: { data: misuse as never } })
    expect(w.text()).toContain('Single recipe in batch')
  })
  it('ApiFailureEndpoints renders the endpoint list', () => {
    const w = mount(ApiFailureEndpoints, { props: { data: apiFailures as never } })
    expect(w.text()).toContain('/Aether/38843')
  })

  // #211 — cost-mode dimension added to the existing batch-failures chart.
  it('FailuresBar renders an svg', () => {
    const data = [
      { event: 'solver', reason: 'timeout', count: 12 },
      { event: 'batch', reason: 'no route', count: 18, costModeBreakdown: [{ costMode: 'macro', count: 12 }, { costMode: 'quick-buy', count: 6 }] },
    ]
    const w = mount(FailuresBar, { props: { data: data as never } })
    expect(w.find('svg').exists()).toBe(true)
  })
  it('FailuresBar renders the cost-mode breakdown text for batch rows that carry it (#211)', () => {
    const data = [
      { event: 'batch', reason: 'no route', count: 18, costModeBreakdown: [{ costMode: 'macro', count: 12 }, { costMode: 'quick-buy', count: 6 }] },
    ]
    const w = mount(FailuresBar, { props: { data: data as never } })
    expect(w.text()).toContain('macro 12')
    expect(w.text()).toContain('quick-buy 6')
  })
  it('FailuresBar does not render any cost-mode text for solver/wasm rows, which never carry costModeBreakdown (#211)', () => {
    const data = [
      { event: 'solver', reason: 'timeout', count: 12 },
      { event: 'wasm', reason: 'SAB unavailable', count: 4 },
    ]
    const w = mount(FailuresBar, { props: { data: data as never } })
    expect(w.text()).not.toContain('macro')
    expect(w.text()).not.toContain('quick-buy')
  })

  // #211 — 功能採用率 · 跨服與鑲嵌 (spec §194 §C2).
  it('FeatureAdoption renders a real percentage when both rates have a sufficient sample (n ≥ 30)', () => {
    const data = { batchStarts: 1433, crossServerBatches: 86, meldAdvisorRuns: 200, meldApplies: 40 }
    const w = mount(FeatureAdoption, { props: { data: data as never } })
    expect(w.text()).toContain('6.0%') // 86/1433
    expect(w.text()).toContain('20.0%') // 40/200
  })
  it('FeatureAdoption renders "—" (never a confident 0.0%) when the denominator has a value but the numerator is 0 and n < 30 — the ticket\'s hard rule', () => {
    // Today's live shape: meldAdvisorRuns/meldApplies are both 0 (client
    // instrumentation on main, not yet deployed to production).
    const data = { batchStarts: 1433, crossServerBatches: 86, meldAdvisorRuns: 0, meldApplies: 0 }
    const w = mount(FeatureAdoption, { props: { data: data as never } })
    expect(w.text()).toContain('—')
    expect(w.text()).not.toContain('0.0%')
  })
  it('FeatureAdoption renders "—" when a metric is entirely absent (undefined fields, e.g. an old snapshot)', () => {
    const w = mount(FeatureAdoption, { props: { data: {} as never } })
    expect(w.text()).toContain('—')
    expect(w.text()).not.toContain('0.0%')
  })

  // #211 — 裝備水準 × 求解結果 (spec §194 §C3).
  it('GearBucketOutcome renders an svg with all three fixed buckets, even ones with zero traffic', () => {
    const data = [
      { bucket: 'entry', starts: 120, completes: 118, fails: 2, completeRate: 118 / 120, failRate: 2 / 120 },
      { bucket: 'mid', starts: 0, completes: 0, fails: 0, completeRate: 0, failRate: 0 },
      { bucket: 'bis', starts: 340, completes: 331, fails: 4, completeRate: 331 / 340, failRate: 4 / 340 },
    ]
    const w = mount(GearBucketOutcome, { props: { data: data as never } })
    expect(w.find('svg').exists()).toBe(true)
  })
  it('GearBucketOutcome renders "—" (not "0.0%") when failRate is unattributable (#200-style guard)', () => {
    const data = [
      { bucket: 'entry', starts: 120, completes: 118, completeRate: 118 / 120 }, // fails/failRate omitted — unattributable
    ]
    const w = mount(GearBucketOutcome, { props: { data: data as never } })
    expect(w.text()).toContain('—')
  })
  it('GearBucketOutcome renders "—" (not a confident "0.0%") when completeRate is unattributable — the #211 review 1 regression', () => {
    // Live production shape: solver_start has real starts, but solver_complete
    // hasn't started carrying gear_bucket yet — completes/completeRate must be
    // undefined, never a printed 0.
    const data = [
      { bucket: 'entry', starts: 528, fails: undefined, failRate: undefined }, // completes/completeRate omitted — unattributable
    ]
    const w = mount(GearBucketOutcome, { props: { data: data as never } })
    expect(w.text()).toContain('—')
    expect(w.text()).not.toContain('0.0%')
  })
})

describe('RegionSplitLedger', () => {
  it('renders five rows, with activeUsers un-split (#202)', () => {
    const byRegion = {
      solver: region({ cht: 1421, intl: 812, unset: 450 }),
      batch: region({ cht: 263, intl: 124, unset: 34 }),
      bom: region({ cht: 188, intl: 102, unset: 22 }),
      infra: region({ cht: 18, intl: 9, unset: 4 }),
    } as never
    const w = mount(RegionSplitLedger, { props: { snapshot: snapshotWith(byRegion), window: '7d' } })
    expect(w.text()).toContain('活躍使用者')
    expect(w.findAll('.rl-row').length).toBe(5)
    // activeUsers row renders the "not split" note, not a 3-region grid.
    const activeUsersRow = w.findAll('.rl-row')[0]
    expect(activeUsersRow.find('.rl-spark-note').exists()).toBe(true)
    expect(activeUsersRow.findAll('.rl-spark-cell').length).toBe(0)
    // The remaining four rows still split by region.
    const solverRow = w.findAll('.rl-row')[1]
    expect(solverRow.findAll('.rl-spark-cell').length).toBe(3)
  })

  it('degrades to "—" when byRegion is undefined (old snapshot)', () => {
    const w = mount(RegionSplitLedger, { props: { snapshot: snapshotWith(undefined), window: '7d' } })
    expect(w.findAll('.rl-row').length).toBe(5)
    expect(w.text()).toContain('—')
  })

  // Regression guard for #202: a pre-#202 snapshot may still carry a stray
  // `byRegion.activeUsers` key on disk (schemaVersion didn't bump, and old
  // history files aren't retroactively re-shaped). The component must never
  // read it — it renders the un-split note for that row unconditionally —
  // so the extra key is inert instead of throwing.
  it('does not throw when byRegion still carries a stray pre-#202 activeUsers key', () => {
    const byRegion = {
      activeUsers: region({ cht: 612, intl: 380, unset: 363 }),
      solver: region({ cht: 1421, intl: 812, unset: 450 }),
      batch: region({ cht: 263, intl: 124, unset: 34 }),
      bom: region({ cht: 188, intl: 102, unset: 22 }),
      infra: region({ cht: 18, intl: 9, unset: 4 }),
    } as never
    expect(() => mount(RegionSplitLedger, { props: { snapshot: snapshotWith(byRegion), window: '7d' } }))
      .not.toThrow()
    const w = mount(RegionSplitLedger, { props: { snapshot: snapshotWith(byRegion), window: '7d' } })
    const activeUsersRow = w.findAll('.rl-row')[0]
    expect(activeUsersRow.find('.rl-spark-note').exists()).toBe(true)
  })
})

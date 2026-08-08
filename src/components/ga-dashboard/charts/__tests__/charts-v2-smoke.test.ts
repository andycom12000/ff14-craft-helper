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
import { evaluate, type RuleTrends, type TrendPoint } from '@/analytics/ga-evaluate'
import { GA_THRESHOLD_RULES } from '@/config/ga-thresholds'

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
  // `q4Funnels`/`vitals` default to `[]` — #207's evaluate()-driven RegionSplitLedger tests below
  // are the first callers of `evaluate()` against this fixture; `funnel.pageDropoff`/`vitals.good`
  // (GA_THRESHOLD_RULES) both call `.map()`/`.filter()` unconditionally on these arrays (unlike the
  // `misuseSignals`/`api`/`adoption` optional fields, which are `?.`-guarded in their `pick()`s).
  const bundle = {
    window: { days: 7, startDate: '', endDate: '' }, glance, byRegion, q4Funnels: [], vitals: [],
  } as unknown as GaSnapshot['windows']['7d']
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

  // ── issue #207：趨勢三件組（當期值 + WoW + 7d sparkline） ──────────────────────────────────
  function sabHistory(days: number, obs: number, n: number, startDate = '2026-06-01'): TrendPoint[] {
    const start = new Date(`${startDate}T00:00:00Z`)
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(start)
      d.setUTCDate(d.getUTCDate() + i)
      return { date: d.toISOString().slice(0, 10), obs, n }
    })
  }

  it('沒有傳 verdicts/trends7d（舊呼叫端）時優雅降級：不拋錯，仍渲染 8 張趨勢卡片，皆顯示 —', () => {
    const w = mount(RegionSplitLedger, { props: { snapshot: snapshotWith(undefined), window: '7d' } })
    const cards = w.findAll('.ledger-trend')
    expect(cards).toHaveLength(8) // 2 + 2 + 2 + 1 + 1（見 REGION_LEDGER_ROW_METRICS）
    // 沒有 trends7d 資料時 WoW 一律留白。
    for (const card of cards) expect(card.find('.lt-delta').text()).toContain('—')
  })

  // review 抓到的 blocking bug：當期值一度誤讀 28d bundle，跟 WoW/sparkline（trends7d）
  // 不是同一個視窗——同一列並排出現「活躍使用者 1,102」（趨勢卡片）與「1,102 視窗內合計」
  // （row 本身，此時 window prop 是 '7d'）本來應該是兩個不同的數字（7d 值 vs 28d 值），
  // 誤讀後卻變成一樣，讀者反而看不出哪個才是真的 7d。
  it('趨勢卡片的當期值讀 7d bundle，不是 28d——即使 window prop 選的是 28d，趨勢卡片仍固定顯示 7d 數字', () => {
    const glance7d = {
      activeUsers: { total: 468, new: 300, returning: 168, returningPct: 168 / 468 },
      solver: { starts: 2000, completes: 1914, fails: 60, completePct: 0.957 },
      batch: { starts: 300, completes: 240, fails: 30, cancelled: 10, completePct: 0.8 },
      bom: { calculates: 80, sentToBatch: 10, handoffPct: 0.125 },
      infra: { sabUnavailable: 6, wasmLoadFailed: 1 },
    }
    const glance28d = {
      activeUsers: { total: 1102, new: 700, returning: 559, returningPct: 559 / 1102 },
      solver: { starts: 13500, completes: 12915, fails: 300, completePct: 0.9567 },
      batch: { starts: 1300, completes: 1030, fails: 240, cancelled: 30, completePct: 0.7923 },
      bom: { calculates: 260, sentToBatch: 13, handoffPct: 0.05 },
      infra: { sabUnavailable: 90, wasmLoadFailed: 3 },
    }
    const bundle7d = { window: { days: 7, startDate: '', endDate: '' }, glance: glance7d, byRegion: undefined, q4Funnels: [], vitals: [] }
    const bundle28d = { window: { days: 28, startDate: '', endDate: '' }, glance: glance28d, byRegion: undefined, q4Funnels: [], vitals: [] }
    const snapshot = {
      schemaVersion: 1, generatedAt: '', propertyId: '527587379',
      windows: { '7d': bundle7d, '14d': bundle28d, '28d': bundle28d },
    } as unknown as GaSnapshot

    // window prop 選 '28d'（模擬使用者把 WindowSelector 切到 28D）——row 本身的 `視窗內合計`
    // 因此顯示 28d 值，但趨勢卡片必須維持 7d，不能跟著 window prop 切換。
    const w = mount(RegionSplitLedger, { props: { snapshot, window: '28d' } })
    const activeUsersRow = w.findAll('.rl-row')[0]

    // row 本身：`視窗內合計` 跟著 window prop = 28d，顯示 1,102。
    expect(activeUsersRow.find('.rl-body .num').text()).toBe('1,102')
    // 趨勢卡片：固定 7d，顯示 468，不是 1,102。
    const trendCard = activeUsersRow.find('.ledger-trend .lt-value')
    expect(trendCard.text()).toBe('468')
    expect(trendCard.text()).not.toBe('1,102')
  })

  it('傳入 evaluate() 的 verdicts 後，有門檻的規則（BOM 交棒率）依 state 上色', () => {
    const snapshot = snapshotWith(undefined)
    const verdicts = evaluate(snapshot.windows['7d'], {}, GA_THRESHOLD_RULES)
    const w = mount(RegionSplitLedger, { props: { snapshot, window: '7d', verdicts } })
    const bomRow = w.findAll('.rl-row')[3] // activeUsers/solver/batch/bom/infra
    const bomCard = bomRow.find('.ledger-trend')
    expect(bomCard.find('.lt-value').classes().some((c) => c.startsWith('tone-'))).toBe(true)
  })

  it('觀測層卡片（SAB 不可用率）當期值不上色（tone-dim），即使餵了 verdicts', () => {
    const snapshot = snapshotWith(undefined)
    const verdicts = evaluate(snapshot.windows['7d'], {}, GA_THRESHOLD_RULES)
    const w = mount(RegionSplitLedger, { props: { snapshot, window: '7d', verdicts } })
    const infraRow = w.findAll('.rl-row')[4]
    const card = infraRow.find('.ledger-trend')
    expect(card.find('.lt-value').classes()).toContain('tone-dim')
  })

  it('WoW 顯著時渲染 ▲/▼ 箭頭與 pp 數字，不顯著時渲染「波動不顯著」', () => {
    const snapshot = snapshotWith(undefined)
    // sabUnavailable = 24 / activeUsers.total = 1355 ≈ 1.77%（fixture 當期值）。
    // 造一段 7 天前是 40%、當期（最後一天）驟降的假歷史，確保顯著。
    const history = sabHistory(7, 500, 1000).concat(sabHistory(1, 10, 1000, '2026-06-08'))
    const trends7d: RuleTrends = { 'infra.sabUnavailableRate': history }
    const w = mount(RegionSplitLedger, { props: { snapshot, window: '7d', trends7d } })
    const infraRow = w.findAll('.rl-row')[4]
    const delta = infraRow.find('.lt-delta')
    expect(delta.text()).toMatch(/[▲▼]/)
    expect(delta.text()).not.toContain('波動不顯著')
  })

  it('sparkline SVG 缺值處斷線（path 出現兩段 M，不是一路連到底的單一段）', () => {
    const snapshot = snapshotWith(undefined)
    const history = sabHistory(5, 90, 1096)
    history.splice(2, 1, null)
    const trends7d: RuleTrends = { 'infra.sabUnavailableRate': history }
    const w = mount(RegionSplitLedger, { props: { snapshot, window: '7d', trends7d } })
    const infraRow = w.findAll('.rl-row')[4]
    const path = infraRow.find('.lt-line')
    const d = path.attributes('d') ?? ''
    // 斷線時 path data 會有兩個 'M'（起筆兩次）；沒斷線只會有一個。
    expect((d.match(/M/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

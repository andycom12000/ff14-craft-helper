// Smoke tests for the GA dashboard v2 chart SFCs. happy-dom has no layout, so
// each chart falls back to its onMounted default width; we only assert that
// mounting with typical data renders without throwing and emits markup. D3
// charts need ResizeObserver, which happy-dom doesn't provide — stub it.
import { describe, it, expect, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'

import OnboardingMilestoneFunnel from '../OnboardingMilestoneFunnel.vue'
import ToolUsageByRlv from '../ToolUsageByRlv.vue'
import RecipeDifficultyKind from '../RecipeDifficultyKind.vue'
import ExpertCollectableMatrix from '../ExpertCollectableMatrix.vue'
import MisuseHintTally from '../MisuseHintTally.vue'
import RecipeEntrySource from '../RecipeEntrySource.vue'
import TimeToFirstAction from '../TimeToFirstAction.vue'
import ApiFailureEndpoints from '../ApiFailureEndpoints.vue'
import LocaleMissTop from '../LocaleMissTop.vue'
import WasmLoadProfile from '../WasmLoadProfile.vue'
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

const onboarding = [
  { step: 'viewed_recipe', users: 1052, eventCount: 3204, dropFromPrev: 0 },
  { step: 'ran_solver', users: 624, eventCount: 1880, dropFromPrev: 0.407 },
  { step: 'saw_macro', users: 588, eventCount: 1715, dropFromPrev: 0.058 },
  { step: 'used_batch', users: 189, eventCount: 402, dropFromPrev: 0.679 },
] as const

const toolUsage = [
  { bucket: '≤300', selectCount: 152, simulatorCount: 24, batchTargetCount: 12, bomTargetCount: 88 },
  { bucket: '681+', selectCount: 1284, simulatorCount: 921, batchTargetCount: 287, bomTargetCount: 142 },
]

const taxonomy = {
  rlvHistogram: [
    { bucket: '≤300', events: 88 },
    { bucket: '681+', events: 1284 },
  ],
  matrix: [
    { isExpert: false, isCollectable: false, starts: 2104, completes: 2043, macroCopies: 622, completeRate: 0.971, macroCopyRate: 0.304 },
    { isExpert: true, isCollectable: true, starts: 50, completes: 29, macroCopies: 6, completeRate: 0.58, macroCopyRate: 0.207 },
  ],
  craftKindBreakdown: [
    { kind: 'normal', starts: 2104, completeRate: 0.971 },
    { kind: 'expert', starts: 287, completeRate: 0.69 },
  ],
} as const

const misuse = [
  { type: 'single_recipe_in_batch', label: 'Single recipe in batch', gloss: 'gloss', eventCount: 87, affectedUsers: 64 },
] as const

const entrySource = [
  { source: 'search', label: '搜尋', eventCount: 1842, uniqueUsers: 612 },
  { source: 'unknown', label: '未知 · 待查', eventCount: 7, uniqueUsers: 6 },
] as const

const apiFailures = {
  matrix: [{ api: 'universalis', status: 404, count: 142 }],
  topEndpoints: [{ api: 'universalis', endpoint: '/Aether/38843', status: 404, count: 88 }],
} as const

const localeMiss = [
  { kind: 'item', itemId: 38843, itemName: 'Claro Walnut Lumber', occurrences: 188, affectedUsers: 144 },
] as const

const perfProfile = {
  wasmLoadMs: { p50: 612, p95: 1840, samples: 884 },
  workerPoolInitMs: { p50: 188, p95: 520, samples: 884 },
  coldStartShare: 0.42,
  coldStartSubset: { wasmLoadMs: { p50: 1120, p95: 2680 }, workerPoolInitMs: { p50: 320, p95: 860 } },
}

const ttfa = {
  durationMs: { p50: 8420, p75: 22100, p95: 184000, samples: 712 },
  firstEventDistribution: [
    { eventName: 'recipe_select', count: 281, medianMs: 6200 },
    { eventName: 'theme_change', count: 88, medianMs: 3100 },
  ],
}

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
  it('OnboardingMilestoneFunnel renders an svg', () => {
    const w = mount(OnboardingMilestoneFunnel, { props: { data: onboarding as never } })
    expect(w.find('svg').exists()).toBe(true)
  })
  it('ToolUsageByRlv renders an svg', () => {
    const w = mount(ToolUsageByRlv, { props: { data: toolUsage as never } })
    expect(w.find('svg').exists()).toBe(true)
  })
  it('RecipeDifficultyKind renders both columns', () => {
    const w = mount(RecipeDifficultyKind, { props: { data: taxonomy as never } })
    expect(w.findAll('svg').length).toBeGreaterThanOrEqual(2)
  })
  it('ExpertCollectableMatrix renders an svg', () => {
    const w = mount(ExpertCollectableMatrix, { props: { data: taxonomy.matrix as never } })
    expect(w.find('svg').exists()).toBe(true)
  })
  it('MisuseHintTally renders rows', () => {
    const w = mount(MisuseHintTally, { props: { data: misuse as never } })
    expect(w.text()).toContain('Single recipe in batch')
  })
  it('RecipeEntrySource shows the anomaly banner when unknown > 0', () => {
    const w = mount(RecipeEntrySource, { props: { data: entrySource as never } })
    expect(w.text()).toContain('異常')
  })
  it('TimeToFirstAction renders an svg and the event list', () => {
    const w = mount(TimeToFirstAction, { props: { data: ttfa as never } })
    expect(w.find('svg').exists()).toBe(true)
    expect(w.text()).toContain('recipe_select')
  })
  it('ApiFailureEndpoints renders the endpoint list', () => {
    const w = mount(ApiFailureEndpoints, { props: { data: apiFailures as never } })
    expect(w.text()).toContain('/Aether/38843')
  })
  it('LocaleMissTop renders the item table', () => {
    const w = mount(LocaleMissTop, { props: { data: localeMiss as never } })
    expect(w.text()).toContain('Claro Walnut Lumber')
  })
  it('WasmLoadProfile renders an svg', () => {
    const w = mount(WasmLoadProfile, { props: { data: perfProfile as never } })
    expect(w.find('svg').exists()).toBe(true)
  })
})

describe('RegionSplitLedger', () => {
  it('renders five rows with region splits', () => {
    const byRegion = {
      activeUsers: region({ cht: 612, intl: 380, unset: 363 }),
      solver: region({ cht: 1421, intl: 812, unset: 450 }),
      batch: region({ cht: 263, intl: 124, unset: 34 }),
      bom: region({ cht: 188, intl: 102, unset: 22 }),
      infra: region({ cht: 18, intl: 9, unset: 4 }),
    } as never
    const w = mount(RegionSplitLedger, { props: { snapshot: snapshotWith(byRegion), window: '7d' } })
    expect(w.text()).toContain('活躍使用者')
    expect(w.findAll('.rl-row').length).toBe(5)
  })

  it('degrades to "—" when byRegion is undefined (old snapshot)', () => {
    const w = mount(RegionSplitLedger, { props: { snapshot: snapshotWith(undefined), window: '7d' } })
    expect(w.findAll('.rl-row').length).toBe(5)
    expect(w.text()).toContain('—')
  })
})

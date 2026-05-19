# GA Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/admin/ga` Vue route with daily-cron-refreshed GA snapshot + window selector + 12 D3 charts, bundled with the `analytics.ts` `page_location` tracking fix.

**Architecture:** Cron workflow writes JSON snapshot to a dedicated `gh-data` branch (decoupled from deploy pipeline). Dashboard fetches snapshot via raw.githubusercontent.com at runtime so refreshes don't require tag/deploy. All 12 charts from `.tmp/ga/report.html` port to Vue SFCs with D3 v7 (npm).

**Tech Stack:** Vue 3 + TypeScript + Vite + D3 v7 (npm) + GitHub Actions cron + raw.githubusercontent.com cross-branch fetch. No Element Plus in dashboard, no Pinia (composable-only).

**Spec:** `docs/superpowers/specs/2026-05-20-ga-admin-dashboard-design.md`

---

## File structure

```
src/
├── views/admin/
│   └── GaDashboardView.vue                   ← page container
├── components/ga-dashboard/
│   ├── pieces/
│   │   ├── HeroBand.vue
│   │   ├── LedgerGlance.vue
│   │   ├── WindowSelector.vue
│   │   └── SectionHead.vue
│   └── charts/
│       ├── PagesTreemap.vue
│       ├── ChannelsBar.vue
│       ├── SolverBatchFunnels.vue
│       ├── SimulatorFunnel.vue
│       ├── FailuresBar.vue
│       ├── WebVitalsStack.vue
│       ├── EngagementScatter.vue
│       ├── FlipBands.vue
│       ├── ReturningEventsBar.vue
│       ├── PagesCompareBar.vue
│       ├── Q4FunnelDrops.vue
│       └── MarketRegionStack.vue
├── composables/
│   ├── useGaSnapshot.ts                      ← fetch + cache
│   ├── useD3Resize.ts                        ← ResizeObserver wrapper
│   └── useTooltip.ts                         ← shared tooltip layer
├── types/
│   └── ga-snapshot.ts                        ← TS types for snapshot JSON
└── utils/analytics.ts                        ← MODIFY: send() + page_location

scripts/dev/
└── ga-analyze.mjs                            ← MODIFY: add --snapshot flag

.github/workflows/
└── ga-snapshot.yml                           ← NEW cron workflow

src/router/index.ts                           ← MODIFY: add /admin/ga route
src/App.vue                                   ← MODIFY: bare-layout switch
```

Two existing routes (`/admin/ga` doesn't exist yet) plus 22 new files. Snapshot JSON lives on `gh-data` branch only, not in this repo's working tree.

---

## Task 1: Install D3 v7 + types

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install dependency**

```bash
npm install d3@^7.9.0
npm install -D @types/d3@^7.4.3
```

- [ ] **Step 2: Verify import works**

Create a one-off check at `scripts/dev/d3-import-check.mjs` (delete after):

```js
import * as d3 from 'd3'
console.log('d3 version:', d3.version)
```

Run: `node scripts/dev/d3-import-check.mjs`
Expected: prints `d3 version: 7.x.x`

- [ ] **Step 3: Clean up check + commit**

```bash
rm scripts/dev/d3-import-check.mjs
git add package.json package-lock.json
git commit -m "chore(deps): add d3 v7 for GA dashboard charts"
```

---

## Task 2: Tracking fix — page_location on custom events

**Files:**
- Modify: `src/utils/analytics.ts:12-15`
- Test: `src/utils/__tests__/analytics.test.ts` (create if missing)

- [ ] **Step 1: Check whether test file exists**

```bash
ls src/utils/__tests__/analytics.test.ts 2>&1
```

If missing, scaffold:

```ts
// src/utils/__tests__/analytics.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('analytics', () => {
  let gtag: ReturnType<typeof vi.fn>
  beforeEach(() => {
    gtag = vi.fn()
    ;(globalThis as Record<string, unknown>).window = {
      gtag,
      location: { origin: 'https://example.com', pathname: '/ff14-craft-helper/', hash: '#/simulator' },
    }
  })
  it('placeholder', () => { expect(true).toBe(true) })
})
```

- [ ] **Step 2: Write failing test for `page_location` on custom events**

Append to `src/utils/__tests__/analytics.test.ts`:

```ts
import { trackEvent } from '../analytics'

describe('trackEvent', () => {
  it('includes current page_location with hash for custom events', () => {
    trackEvent('solver_start', { foo: 'bar' })
    expect(gtag).toHaveBeenCalledWith('event', 'solver_start', expect.objectContaining({
      page_location: 'https://example.com/ff14-craft-helper/#/simulator',
      foo: 'bar',
    }))
  })

  it('caller-supplied page_location overrides default', () => {
    trackEvent('share_link_inbound', { page_location: 'https://override.com/' })
    expect(gtag).toHaveBeenCalledWith('event', 'share_link_inbound', expect.objectContaining({
      page_location: 'https://override.com/',
    }))
  })
})
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npm test -- src/utils/__tests__/analytics.test.ts`
Expected: FAIL — `expect(gtag).toHaveBeenCalledWith(...)` mismatch because `page_location` is not present.

- [ ] **Step 4: Apply the fix**

Edit `src/utils/analytics.ts:12-15` from:

```ts
function send(eventName: string, params?: GtagParams) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', eventName, params)
}
```

To:

```ts
function send(eventName: string, params?: GtagParams) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', eventName, {
    page_location: `${window.location.origin}${window.location.pathname}${window.location.hash}`,
    ...params,
  })
}
```

The spread order matters: caller params override defaults.

- [ ] **Step 5: Run test, verify it passes**

Run: `npm test -- src/utils/__tests__/analytics.test.ts`
Expected: PASS, 2 assertions.

- [ ] **Step 6: Commit**

```bash
git add src/utils/analytics.ts src/utils/__tests__/analytics.test.ts
git commit -m "fix(analytics): include page_location on every custom event

Custom events were inheriting gtag's initial config-level page_location
(the GH Pages base path) because send() didn't pass page_location per
call. Now every trackEvent() carries the current SPA hash route so
page-sliced funnels (solver_start, recipe_select, ...) can attribute
to /simulator, /batch, etc."
```

---

## Task 3: TS types for snapshot JSON

**Files:**
- Create: `src/types/ga-snapshot.ts`

- [ ] **Step 1: Create types file**

```ts
// src/types/ga-snapshot.ts

export type WindowKey = '7d' | '14d' | '28d'
export type PageFamily = 'core' | 'craft' | 'gather' | 'company' | 'meta' | 'market'
export type EventFamily = 'core' | 'craft' | 'gather' | 'company' | 'meta' | 'market' | 'error'
export type FailureEvent = 'solver' | 'batch' | 'wasm'
export type VitalMetric = 'INP' | 'TTFB' | 'CLS' | 'FCP' | 'LCP'
export type StepTone = 'neutral' | 'success' | 'danger' | 'warn'
export type Q4Flag = 'ok' | 'warn' | 'danger' | 'noise'

export interface PageRow {
  path: string
  title: string
  family: PageFamily
  views: number
  users: number
  sessions: number
  engagement: number
  bounce: number
  avgSession: number
}

export interface ChannelRow {
  channel: string
  source: string
  sessions: number
  users: number
  engagement: number
}

export interface FunnelStep {
  step: string
  count: number
  tone: StepTone
}

export interface SimulatorFunnel {
  entry: { label: string; count: number; users: number }
  macroCopy: { label: string; count: number; users: number }
  globalContext: Array<{ label: string; count: number }>
}

export interface FailureRow {
  event: FailureEvent
  reason: string
  count: number
}

export interface VitalRow {
  metric: VitalMetric
  good: number
  ni: number
  poor: number
}

export interface FlipBuckets {
  new: number
  returning: number
  other: number
}

export interface EventRow {
  event: string
  family: EventFamily
  count: number
  users: number
}

export interface ReturningPageRow {
  path: string
  returningViews: number
  returningUsers: number
  engagement: number
}

export interface Q4Funnel {
  name: string
  label: string
  from: number
  to: number
  note: string
  flag: Q4Flag
}

export interface MarketRegionRow {
  event: string
  notset: number
  unset: number
  cht?: number
  intl?: number
}

export interface MetricsBundle {
  window: { days: number; startDate: string; endDate: string }
  glance: {
    activeUsers: { total: number; new: number; returning: number; returningPct: number }
    solver: { starts: number; completes: number; fails: number; completePct: number }
    batch: { starts: number; completes: number; fails: number; cancelled: number; completePct: number }
    bom: { calculates: number; sentToBatch: number; handoffPct: number }
    infra: { sabUnavailable: number; wasmLoadFailed: number }
  }
  pages: PageRow[]
  channels: ChannelRow[]
  solverFunnel: FunnelStep[]
  batchFunnel: FunnelStep[]
  simulatorFunnel: SimulatorFunnel
  failures: FailureRow[]
  vitals: VitalRow[]
  flip: { users: FlipBuckets; sessions: FlipBuckets }
  returningEvents: EventRow[]
  returningPages: ReturningPageRow[]
  q4Funnels: Q4Funnel[]
  marketRegion: MarketRegionRow[]
}

export interface GaSnapshot {
  schemaVersion: 1
  generatedAt: string  // ISO 8601
  propertyId: string
  windows: Record<WindowKey, MetricsBundle>
}
```

- [ ] **Step 2: Verify TS compile**

Run: `npm run type-check`
Expected: PASS — no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add src/types/ga-snapshot.ts
git commit -m "feat(ga-dashboard): add TS types for snapshot JSON shape"
```

---

## Task 4: Refactor ga-analyze.mjs — add --snapshot flag

**Files:**
- Modify: `scripts/dev/ga-analyze.mjs`

- [ ] **Step 1: Read current main() and runReport() entry point**

```bash
grep -n "async function main\|runReport\|WINDOW_DAYS" scripts/dev/ga-analyze.mjs | head
```

Expected: locates `main()` around line 31, `runReport()` helper, and `WINDOW_DAYS` constant at line 29.

- [ ] **Step 2: Add CLI argument parsing**

Near top of `scripts/dev/ga-analyze.mjs` (after the imports, before `const WINDOW_DAYS`), add:

```js
function parseArgs(argv) {
  const args = { snapshot: false, out: null, history: null, windowDays: null }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--snapshot') args.snapshot = true
    else if (a === '--out')     args.out = argv[++i]
    else if (a === '--history') args.history = argv[++i]
    else if (a === '--window')  args.windowDays = Number(argv[++i])
  }
  return args
}
const CLI = parseArgs(process.argv)
```

Then change `const WINDOW_DAYS = Number(process.env.GA_WINDOW_DAYS ?? 28)` to use CLI as fallback:

```js
const WINDOW_DAYS = CLI.windowDays ?? Number(process.env.GA_WINDOW_DAYS ?? 28)
```

- [ ] **Step 3: Refactor main() to support snapshot mode**

Find the bottom of `main()` (after report.md write). The current entry point looks like:

```js
async function main() {
  // ... existing query + csv + md write
}
main().catch(...)
```

Replace the bottom-of-file call with branching logic:

```js
if (CLI.snapshot) {
  runSnapshot().catch((err) => { console.error(err); process.exit(1) })
} else {
  main().catch((err) => { console.error(err); process.exit(1) })
}
```

- [ ] **Step 4: Add `runSnapshot()` function**

Add the following BEFORE the `if (CLI.snapshot)` branching block:

```js
async function runSnapshot() {
  const propertyId = process.env.GA_PROPERTY_ID
  if (!propertyId) die('Missing env GA_PROPERTY_ID')
  const client = await buildClient()

  const out = CLI.out ?? path.join(ROOT, 'public', 'data', 'ga-snapshot.json')
  const historyDir = CLI.history  // optional

  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    propertyId,
    windows: {},
  }

  for (const days of [7, 14, 28]) {
    const key = `${days}d`
    console.log(`[snapshot] querying ${key}...`)
    snapshot.windows[key] = await buildBundle(client, propertyId, days)
  }

  await fs.mkdir(path.dirname(out), { recursive: true })
  await fs.writeFile(out, JSON.stringify(snapshot, null, 2))
  console.log(`[snapshot] wrote ${out}`)

  if (historyDir) {
    const stamp = snapshot.generatedAt.slice(0, 10)  // YYYY-MM-DD
    const histPath = path.join(historyDir, `${stamp}.json`)
    await fs.mkdir(historyDir, { recursive: true })
    await fs.writeFile(histPath, JSON.stringify(snapshot, null, 2))
    console.log(`[snapshot] archived ${histPath}`)
  }
}

async function buildClient() {
  const accessToken = process.env.GA_ACCESS_TOKEN
  if (accessToken) {
    const oauth = new OAuth2Client()
    oauth.setCredentials({ access_token: accessToken })
    return new BetaAnalyticsDataClient({ authClient: oauth })
  }
  try { await fs.access(SA_PATH) }
  catch { die(`Missing ${SA_PATH} (service-account JSON)`) }
  return new BetaAnalyticsDataClient({ keyFilename: SA_PATH })
}

async function buildBundle(client, propertyId, days) {
  // Will be implemented in Task 5.
  return { window: { days, startDate: `${days}daysAgo`, endDate: 'today' } }
}
```

- [ ] **Step 5: Test with stubbed buildBundle**

Run: `node --env-file=.env scripts/dev/ga-analyze.mjs --snapshot --out /tmp/ga-test.json`
Expected: prints 3 `[snapshot] querying Nd...` lines, writes `/tmp/ga-test.json` with empty bundles.

Inspect with: `node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('/tmp/ga-test.json')), null, 2))" | head -20`
Expected: shows `schemaVersion: 1`, `windows: { '7d', '14d', '28d' }`, each with stub `{window:{days:..., ...}}`.

- [ ] **Step 6: Commit scaffolding**

```bash
git add scripts/dev/ga-analyze.mjs
git commit -m "feat(ga-analyze): add --snapshot flag for multi-window JSON output

Scaffolds runSnapshot() entry point with --out/--history options.
buildBundle() is stubbed; actual GA queries land in next task."
```

---

## Task 5: Implement buildBundle() — port all queries

**Files:**
- Modify: `scripts/dev/ga-analyze.mjs:buildBundle`

- [ ] **Step 1: Locate the existing query blocks**

In `scripts/dev/ga-analyze.mjs`, the existing `main()` performs these queries (search by header comment):
- topPages, channels (Q1)
- solverFunnel, batchFunnel, failures, vitals, engagementByPage (Q2)
- newVsReturning, topReturningEvents, returningPages (Q3)
- funnelDropRates, funnelsByRegion (Q4)
- simulator: NEW — needs to be added (page_view on `/simulator` + `solver_macro_copy` totals)

- [ ] **Step 2: Replace the stub `buildBundle` with full implementation**

Replace the stub from Task 4 with the full implementation. The function pulls the same metrics as `main()` does but ranged per-window and returns a `MetricsBundle` shape. The implementation is long; reuse helper functions already in the file (`runReport`, `total`, `users`, etc.).

```js
async function buildBundle(client, propertyId, days) {
  const property = `properties/${propertyId}`
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'today' }]

  // helper for date string
  const today = new Date()
  const start = new Date(today)
  start.setDate(today.getDate() - days)
  const fmt = (d) => d.toISOString().slice(0, 10)

  // --- Q1: pages ----------------------------------------------------------
  const pagesRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [
      { name: 'screenPageViews' }, { name: 'totalUsers' },
      { name: 'sessions' }, { name: 'userEngagementDuration' },
      { name: 'engagementRate' }, { name: 'bounceRate' },
    ],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 20,
  })
  const pages = (pagesRes?.rows ?? []).map((r) => mapPageRow(r))

  // --- Q1: channels -------------------------------------------------------
  const channelsRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionSource' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'engagementRate' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 12,
  })
  const channels = (channelsRes?.rows ?? []).map((r) => ({
    channel: r.dimensionValues[0].value,
    source: r.dimensionValues[1].value,
    sessions: Number(r.metricValues[0].value),
    users: Number(r.metricValues[1].value),
    engagement: Number(r.metricValues[2].value),
  }))

  // --- Q2: funnels --------------------------------------------------------
  const evCounts = await fetchEventCounts(client, property, dateRanges, [
    'solver_start', 'solver_complete', 'solver_failed',
    'batch_optimization_start', 'batch_optimization_complete',
    'batch_optimization_failed', 'batch_optimization_cancelled',
    'page_view', 'solver_macro_copy', 'recipe_select',
    'bom_calculate', 'bom_send_to_batch', 'bom_item_check',
    'bom_copy_list', 'bom_target_add',
    'batch_add_recipe',
    'web_vitals',
    'wasm_load_failed', 'sab_unavailable',
  ])

  const solverFunnel = [
    { step: 'solver_start',    count: evCounts.get('solver_start') ?? 0,    tone: 'neutral' },
    { step: 'solver_complete', count: evCounts.get('solver_complete') ?? 0, tone: 'success' },
    { step: 'solver_failed',   count: evCounts.get('solver_failed') ?? 0,   tone: 'danger' },
  ]

  const batchFunnel = [
    { step: 'add → start',     count: evCounts.get('batch_optimization_start') ?? 0, tone: 'neutral' },
    { step: 'batch_complete',  count: evCounts.get('batch_optimization_complete') ?? 0, tone: 'success' },
    { step: 'batch_failed',    count: evCounts.get('batch_optimization_failed') ?? 0, tone: 'danger' },
    { step: 'batch_cancelled', count: evCounts.get('batch_optimization_cancelled') ?? 0, tone: 'warn' },
  ]

  // --- Q2: simulator funnel (inferred) ------------------------------------
  const simulatorPageView = pages.find((p) => p.path === '/simulator')
  const simulatorFunnel = {
    entry: {
      label: '/simulator page_view',
      count: simulatorPageView?.views ?? 0,
      users: simulatorPageView?.users ?? 0,
    },
    macroCopy: {
      label: 'solver_macro_copy',
      count: evCounts.get('solver_macro_copy') ?? 0,
      users: await uniqueUsersForEvent(client, property, dateRanges, 'solver_macro_copy'),
    },
    globalContext: [
      { label: 'recipe_select (any page)',   count: evCounts.get('recipe_select') ?? 0 },
      { label: 'solver_start (any page)',    count: evCounts.get('solver_start') ?? 0 },
      { label: 'solver_complete (any page)', count: evCounts.get('solver_complete') ?? 0 },
    ],
  }

  // --- Q2: failures -------------------------------------------------------
  const failuresRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }, { name: 'customEvent:reason' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: {
      values: ['solver_failed', 'batch_optimization_failed', 'wasm_load_failed'] } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  })
  const failures = (failuresRes?.rows ?? []).map((r) => ({
    event: r.dimensionValues[0].value.startsWith('solver') ? 'solver'
         : r.dimensionValues[0].value.startsWith('batch')  ? 'batch'
         : 'wasm',
    reason: r.dimensionValues[1].value || '(no reason)',
    count: Number(r.metricValues[0].value),
  }))

  // --- Q2: vitals ---------------------------------------------------------
  const vitalsRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:metric' }, { name: 'customEvent:rating' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'web_vitals' } } },
    limit: 60,
  })
  const vitals = buildVitalsRows(vitalsRes?.rows ?? [])

  // --- Q3: flip -----------------------------------------------------------
  const flipRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'newVsReturning' }],
    metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
  })
  const flip = mapFlip(flipRes?.rows ?? [])

  // --- Q3: returning events ----------------------------------------------
  const retEvRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: { filter: { fieldName: 'newVsReturning', stringFilter: { value: 'returning' } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 25,
  })
  const returningEvents = (retEvRes?.rows ?? []).map((r) => ({
    event: r.dimensionValues[0].value,
    family: familyForEvent(r.dimensionValues[0].value),
    count: Number(r.metricValues[0].value),
    users: Number(r.metricValues[1].value),
  }))

  // --- Q3: returning pages -----------------------------------------------
  const retPgRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }, { name: 'engagementRate' }],
    dimensionFilter: { filter: { fieldName: 'newVsReturning', stringFilter: { value: 'returning' } } },
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 15,
  })
  const returningPages = (retPgRes?.rows ?? []).map((r) => ({
    path: r.dimensionValues[0].value,
    returningViews: Number(r.metricValues[0].value),
    returningUsers: Number(r.metricValues[1].value),
    engagement: Number(r.metricValues[2].value),
  }))

  // --- Q4: funnel drop rates (reuse existing helpers) ---------------------
  const q4Funnels = [
    { name: 'Recipe → Solver',       label: 'recipe_select → solver_start',
      from: evCounts.get('recipe_select') ?? 0, to: evCounts.get('solver_start') ?? 0,
      note: 'inflated · batch internal solves', flag: 'noise' },
    { name: 'Solver → Macro',        label: 'solver_complete → solver_macro_copy',
      from: evCounts.get('solver_complete') ?? 0, to: evCounts.get('solver_macro_copy') ?? 0,
      note: 'user-facing only', flag: 'danger' },
    { name: 'Batch prep → Optimize', label: 'batch_add_recipe → batch_opt_start',
      from: evCounts.get('batch_add_recipe') ?? 0, to: evCounts.get('batch_optimization_start') ?? 0,
      note: 'healthy halfway', flag: 'ok' },
    { name: 'BOM → Consumed',        label: 'bom_calculate → (any consume)',
      from: evCounts.get('bom_calculate') ?? 0,
      to: ['bom_item_check', 'bom_copy_list', 'bom_send_to_batch', 'bom_target_add']
        .map((n) => evCounts.get(n) ?? 0).reduce((a, b) => a + b, 0),
      note: 'low handoff', flag: 'warn' },
  ]

  // --- Q4: market_region --------------------------------------------------
  const mrRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }, { name: 'customUser:market_region' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: {
      values: ['solver_start', 'solver_complete', 'batch_optimization_start',
               'batch_optimization_complete', 'bom_calculate', 'bom_send_to_batch',
               'solver_macro_copy'] } } },
    limit: 80,
  }, { soft: true })
  const marketRegion = buildMarketRegion(mrRes?.rows ?? [])

  // --- glance summary -----------------------------------------------------
  const flipUsers = flip.users.new + flip.users.returning + flip.users.other
  const glance = {
    activeUsers: {
      total: flipUsers,
      new: flip.users.new,
      returning: flip.users.returning,
      returningPct: flipUsers ? flip.users.returning / flipUsers : 0,
    },
    solver: {
      starts: solverFunnel[0].count,
      completes: solverFunnel[1].count,
      fails: solverFunnel[2].count,
      completePct: solverFunnel[0].count ? solverFunnel[1].count / solverFunnel[0].count : 0,
    },
    batch: {
      starts: batchFunnel[0].count,
      completes: batchFunnel[1].count,
      fails: batchFunnel[2].count,
      cancelled: batchFunnel[3].count,
      completePct: batchFunnel[0].count ? batchFunnel[1].count / batchFunnel[0].count : 0,
    },
    bom: {
      calculates: evCounts.get('bom_calculate') ?? 0,
      sentToBatch: evCounts.get('bom_send_to_batch') ?? 0,
      handoffPct: (evCounts.get('bom_calculate') ?? 0)
        ? (evCounts.get('bom_send_to_batch') ?? 0) / (evCounts.get('bom_calculate') ?? 1)
        : 0,
    },
    infra: {
      sabUnavailable: evCounts.get('sab_unavailable') ?? 0,
      wasmLoadFailed: evCounts.get('wasm_load_failed') ?? 0,
    },
  }

  return {
    window: { days, startDate: fmt(start), endDate: fmt(today) },
    glance, pages, channels, solverFunnel, batchFunnel, simulatorFunnel,
    failures, vitals, flip, returningEvents, returningPages, q4Funnels, marketRegion,
  }
}

// helpers
async function fetchEventCounts(client, property, dateRanges, eventNames) {
  const res = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: eventNames } } },
    limit: eventNames.length + 5,
  })
  const out = new Map()
  for (const r of res?.rows ?? []) {
    out.set(r.dimensionValues[0].value, Number(r.metricValues[0].value))
  }
  return out
}

async function uniqueUsersForEvent(client, property, dateRanges, eventName) {
  const res = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'totalUsers' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: eventName } } },
  })
  const row = res?.rows?.[0]
  return row ? Number(row.metricValues[0].value) : 0
}

function mapPageRow(r) {
  const path = r.dimensionValues[0].value
  return {
    path,
    title: r.dimensionValues[1].value,
    family: familyForPath(path),
    views: Number(r.metricValues[0].value),
    users: Number(r.metricValues[1].value),
    sessions: Number(r.metricValues[2].value),
    engagement: Number(r.metricValues[4].value),
    bounce: Number(r.metricValues[5].value),
    avgSession: Number(r.metricValues[2].value)
      ? Number(r.metricValues[3].value) / Number(r.metricValues[2].value)
      : 0,
  }
}

function familyForPath(path) {
  if (path === '/') return 'core'
  if (/^\/(batch|gearset|simulator|bom)/.test(path)) return 'craft'
  if (path === '/timer') return 'gather'
  if (path === '/company-craft') return 'company'
  if (path === '/market') return 'market'
  return 'meta'
}

function familyForEvent(event) {
  if (event.startsWith('universalis')) return 'market'
  if (event.startsWith('web_vitals') || event === 'page_view' || event === 'recipe_select') return 'meta'
  if (event.startsWith('solver') || event.startsWith('batch') || event.startsWith('bom') || event.startsWith('gearset') || event.startsWith('queue')) return 'craft'
  if (event === 'exception' || event === 'solver_failed' || event === 'batch_optimization_failed') return 'error'
  return 'meta'
}

function mapFlip(rows) {
  const init = { new: 0, returning: 0, other: 0 }
  const out = { users: { ...init }, sessions: { ...init } }
  for (const r of rows) {
    const k = r.dimensionValues[0].value
    const bucket = k === 'new' ? 'new' : k === 'returning' ? 'returning' : 'other'
    out.users[bucket] += Number(r.metricValues[0].value)
    out.sessions[bucket] += Number(r.metricValues[1].value)
  }
  return out
}

function buildVitalsRows(rows) {
  const metrics = ['INP', 'TTFB', 'CLS', 'FCP', 'LCP']
  const map = new Map(metrics.map((m) => [m, { metric: m, good: 0, ni: 0, poor: 0 }]))
  for (const r of rows) {
    const metric = r.dimensionValues[0].value.toUpperCase()
    const rating = r.dimensionValues[1].value
    const count = Number(r.metricValues[0].value)
    const target = map.get(metric)
    if (!target) continue
    if (rating === 'good') target.good += count
    else if (rating === 'needs-improvement') target.ni += count
    else if (rating === 'poor') target.poor += count
  }
  return [...map.values()]
}

function buildMarketRegion(rows) {
  const map = new Map()
  for (const r of rows) {
    const event = r.dimensionValues[0].value
    const region = r.dimensionValues[1].value
    if (!map.has(event)) map.set(event, { event, notset: 0, unset: 0, cht: 0, intl: 0 })
    const row = map.get(event)
    const count = Number(r.metricValues[0].value)
    if (region === '(not set)') row.notset += count
    else if (region === 'unset') row.unset += count
    else if (region === 'cht') row.cht += count
    else if (region === 'intl') row.intl += count
  }
  return [...map.values()]
}
```

- [ ] **Step 3: Run snapshot, verify shape**

Run: `node --env-file=.env scripts/dev/ga-analyze.mjs --snapshot --out /tmp/ga-snapshot.json`
Expected: 3 windows queried, no errors, `/tmp/ga-snapshot.json` ~30-40KB.

- [ ] **Step 4: Manual schema check**

```bash
node -e "const s=JSON.parse(require('fs').readFileSync('/tmp/ga-snapshot.json')); console.log({ schemaVersion: s.schemaVersion, windows: Object.keys(s.windows), pagesIn7d: s.windows['7d'].pages.length, solverIn7d: s.windows['7d'].solverFunnel[0].count })"
```

Expected: `{ schemaVersion: 1, windows: ['7d','14d','28d'], pagesIn7d: >= 5, solverIn7d: > 0 }`.

- [ ] **Step 5: Commit**

```bash
git add scripts/dev/ga-analyze.mjs
git commit -m "feat(ga-analyze): implement buildBundle for snapshot per-window queries"
```

---

## Task 6: Add `useGaSnapshot` composable

**Files:**
- Create: `src/composables/useGaSnapshot.ts`
- Test: `src/composables/__tests__/useGaSnapshot.test.ts`

The composable fetches the snapshot from the `gh-data` branch via raw.githubusercontent.com so refresh doesn't require a deploy. In dev mode (`import.meta.env.DEV`), it falls back to a local file at `public/data/ga-snapshot.json` (which the developer can populate manually).

- [ ] **Step 1: Write failing test**

```ts
// src/composables/__tests__/useGaSnapshot.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useGaSnapshot } from '../useGaSnapshot'

const FIXTURE = {
  schemaVersion: 1,
  generatedAt: '2026-05-20T04:00:00Z',
  propertyId: '527587379',
  windows: {
    '7d':  { window: { days: 7,  startDate: '2026-05-13', endDate: '2026-05-20' }, glance: {}, pages: [] },
    '14d': { window: { days: 14, startDate: '2026-05-06', endDate: '2026-05-20' }, glance: {}, pages: [] },
    '28d': { window: { days: 28, startDate: '2026-04-22', endDate: '2026-05-20' }, glance: {}, pages: [] },
  },
}

describe('useGaSnapshot', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve(FIXTURE),
    } as Response)))
  })

  it('fetches snapshot and exposes loading + data refs', async () => {
    const s = useGaSnapshot()
    expect(s.loading.value).toBe(true)
    await s.load()
    expect(s.loading.value).toBe(false)
    expect(s.error.value).toBeNull()
    expect(s.snapshot.value?.schemaVersion).toBe(1)
    expect(Object.keys(s.snapshot.value?.windows ?? {})).toEqual(['7d', '14d', '28d'])
  })

  it('marks stale when generatedAt is older than 36h', async () => {
    const old = new Date(Date.now() - 40 * 3600 * 1000).toISOString()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve({ ...FIXTURE, generatedAt: old }),
    } as Response)))
    const s = useGaSnapshot()
    await s.load()
    expect(s.staleHours.value).toBeGreaterThanOrEqual(36)
  })

  it('captures error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('boom'))))
    const s = useGaSnapshot()
    await s.load()
    expect(s.error.value?.message).toBe('boom')
    expect(s.snapshot.value).toBeNull()
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- src/composables/__tests__/useGaSnapshot.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement composable**

```ts
// src/composables/useGaSnapshot.ts
import { ref, computed } from 'vue'
import type { GaSnapshot } from '@/types/ga-snapshot'

const SNAPSHOT_URL_PROD = 'https://raw.githubusercontent.com/andycom12000/ff14-craft-helper/gh-data/snapshot.json'
const SNAPSHOT_URL_DEV  = `${import.meta.env.BASE_URL}data/ga-snapshot.json`

const snapshot = ref<GaSnapshot | null>(null)
const loading = ref(true)
const error = ref<Error | null>(null)

export function useGaSnapshot() {
  const staleHours = computed(() => {
    if (!snapshot.value) return 0
    const generated = new Date(snapshot.value.generatedAt).getTime()
    return Math.floor((Date.now() - generated) / 3600_000)
  })

  const isStale = computed(() => staleHours.value >= 36)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const url = import.meta.env.DEV ? SNAPSHOT_URL_DEV : SNAPSHOT_URL_PROD
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`snapshot fetch ${res.status}`)
      const json = (await res.json()) as GaSnapshot
      snapshot.value = json
    } catch (err) {
      error.value = err as Error
      snapshot.value = null
    } finally {
      loading.value = false
    }
  }

  return { snapshot, loading, error, staleHours, isStale, load }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm test -- src/composables/__tests__/useGaSnapshot.test.ts`
Expected: PASS, 3 assertions.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useGaSnapshot.ts src/composables/__tests__/useGaSnapshot.test.ts
git commit -m "feat(ga-dashboard): add useGaSnapshot composable with stale detection"
```

---

## Task 7: Add `useD3Resize` composable

**Files:**
- Create: `src/composables/useD3Resize.ts`

- [ ] **Step 1: Implement**

```ts
// src/composables/useD3Resize.ts
import { onMounted, onBeforeUnmount, ref, type Ref } from 'vue'

export function useD3Resize(elRef: Ref<HTMLElement | null>, onResize: (w: number, h: number) => void) {
  const width = ref(0)
  const height = ref(0)
  let ro: ResizeObserver | null = null

  onMounted(() => {
    if (!elRef.value) return
    ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width)
      const h = Math.round(entry.contentRect.height)
      if (w === width.value && h === height.value) return
      width.value = w
      height.value = h
      onResize(w, h)
    })
    ro.observe(elRef.value)
  })

  onBeforeUnmount(() => {
    ro?.disconnect()
    ro = null
  })

  return { width, height }
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/composables/useD3Resize.ts
git commit -m "feat(ga-dashboard): add useD3Resize composable"
```

---

## Task 8: Add `useTooltip` composable + tooltip layer DOM

**Files:**
- Create: `src/composables/useTooltip.ts`

- [ ] **Step 1: Implement**

```ts
// src/composables/useTooltip.ts
// Shared tooltip layer — one DOM node per page, all charts call into it.
// Tooltip element is created on first use and lives in document.body so it's
// not constrained by chart container overflow.

let tipEl: HTMLDivElement | null = null

function ensureTipEl() {
  if (tipEl) return tipEl
  const el = document.createElement('div')
  el.className = 'ga-tooltip'
  el.style.cssText = [
    'position:absolute', 'pointer-events:none', 'opacity:0',
    'transition:opacity 120ms ease-out', 'z-index:1000',
    'background:oklch(0.26 0.022 62)', 'color:oklch(0.94 0.022 82)',
    'border:1px solid oklch(0.42 0.035 60 / 0.36)', 'border-radius:6px',
    'padding:10px 14px', 'font-size:13px', 'line-height:1.5', 'max-width:280px',
    'box-shadow:0 16px 48px oklch(0.10 0 0 / 0.45)',
    "font-family:'Noto Sans TC', sans-serif",
  ].join(';')
  document.body.appendChild(el)
  tipEl = el
  return el
}

export function useTooltip() {
  function show(html: string, ev: MouseEvent) {
    const el = ensureTipEl()
    el.innerHTML = html
    el.style.opacity = '1'
    el.style.left = (ev.pageX + 14) + 'px'
    el.style.top  = (ev.pageY + 14) + 'px'
  }
  function move(ev: MouseEvent) {
    if (!tipEl) return
    tipEl.style.left = (ev.pageX + 14) + 'px'
    tipEl.style.top  = (ev.pageY + 14) + 'px'
  }
  function hide() {
    if (!tipEl) return
    tipEl.style.opacity = '0'
  }
  return { show, move, hide }
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npm run type-check`
Expected: PASS.

```bash
git add src/composables/useTooltip.ts
git commit -m "feat(ga-dashboard): add useTooltip composable"
```

---

## Task 9: Add bare layout support in `App.vue` + add `/admin/ga` route

**Files:**
- Modify: `src/App.vue`
- Modify: `src/router/index.ts`

- [ ] **Step 1: Read current App.vue template structure**

```bash
grep -n "<template>\|<router-view\|<aside\|<main\|<el-container" src/App.vue | head
```

Expected: locates template root, router-view, sidebar (`<aside>` or similar), main content area.

- [ ] **Step 2: Wrap chrome in conditional**

Find the `<template>` section. Look for the topmost wrapper that contains both sidebar and `<router-view />`. Add a check for `route.meta.layout === 'bare'` so that bare-layout routes skip the chrome entirely.

In `<script setup>`, add (after `const route = useRoute()`):

```ts
const isBare = computed(() => route.meta?.layout === 'bare')
```

In the template, restructure the root from (sketch):

```vue
<template>
  <el-container>
    <el-aside>...</el-aside>
    <el-main><router-view /></el-main>
  </el-container>
</template>
```

To:

```vue
<template>
  <router-view v-if="isBare" />
  <el-container v-else>
    <el-aside>...</el-aside>
    <el-main><router-view /></el-main>
  </el-container>
</template>
```

(The actual selector may use different Element Plus components; preserve them — only add the `v-if`/`v-else`.)

- [ ] **Step 3: Add route**

In `src/router/index.ts`, append to the `routes` array (before the closing `]`):

```ts
{
  path: '/admin/ga',
  name: 'admin-ga',
  component: () => import('@/views/admin/GaDashboardView.vue'),
  meta: { title: 'GA Analytics', layout: 'bare' },
},
```

- [ ] **Step 4: Create placeholder view to make the route resolvable**

```vue
<!-- src/views/admin/GaDashboardView.vue -->
<script setup lang="ts">
</script>

<template>
  <div style="padding:40px;color:#ccc;background:#1a1815;min-height:100vh">
    GA Dashboard placeholder — coming in subsequent tasks.
  </div>
</template>
```

- [ ] **Step 5: Verify**

Run: `npm run dev` (background, then open `http://localhost:5173/#/admin/ga`).
Expected: placeholder text shows, no sidebar visible. `http://localhost:5173/#/` still shows normal app with sidebar.

Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add src/App.vue src/router/index.ts src/views/admin/GaDashboardView.vue
git commit -m "feat(ga-dashboard): add /admin/ga route with bare layout"
```

---

## Task 10: Add scoped warm-dark theme tokens

**Files:**
- Create: `src/components/ga-dashboard/tokens.css`

- [ ] **Step 1: Create file**

```css
/* src/components/ga-dashboard/tokens.css
 * Scoped warm-dark theme for GA admin dashboard.
 * Decoupled from app-level theme store on purpose — this view is always dark.
 * Per DESIGN.md §6 dark mode rules: warm brown surfaces, never blue/gray.
 */
.ga-dashboard {
  --bg:           oklch(0.18 0.018 62);
  --bg-deep:      oklch(0.14 0.014 60);
  --surface:      oklch(0.225 0.018 62);
  --surface-2:    oklch(0.26  0.022 62);
  --surface-3:    oklch(0.30  0.025 64);
  --border:       oklch(0.42 0.035 60 / 0.36);
  --border-soft:  oklch(0.42 0.035 60 / 0.18);

  --ink:          oklch(0.94 0.022 82);
  --ink-mid:      oklch(0.80 0.022 75);
  --ink-muted:    oklch(0.66 0.024 68);
  --ink-faint:    oklch(0.52 0.028 62);

  --gold:         oklch(0.78 0.15 72);
  --gold-glow:    oklch(0.78 0.15 72 / 0.16);
  --crust:        oklch(0.66 0.11 50);
  --cocoa:        oklch(0.66 0.14 40);
  --cocoa-dark:   oklch(0.50 0.13 40);
  --strawberry:   oklch(0.70 0.18 15);
  --matcha:       oklch(0.72 0.15 138);
  --blueberry:    oklch(0.66 0.16 248);

  --success:      oklch(0.70 0.16 145);
  --warning:      oklch(0.74 0.16 60);
  --danger:       oklch(0.68 0.20 22);

  background:
    radial-gradient(1200px 700px at 20% -10%, oklch(0.26 0.04 60 / 0.55), transparent 60%),
    radial-gradient(900px 600px at 95% 8%, oklch(0.24 0.05 40 / 0.40), transparent 65%),
    var(--bg);
  color: var(--ink);
  font-family: 'Noto Sans TC', system-ui, -apple-system, sans-serif;
  font-size: 15px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}

.ga-dashboard ::selection { background: var(--gold-glow); color: var(--ink); }

/* family color helpers (used by chart components) */
.ga-dashboard .fam-core    { color: var(--gold); }
.ga-dashboard .fam-craft   { color: var(--cocoa); }
.ga-dashboard .fam-gather  { color: var(--matcha); }
.ga-dashboard .fam-company { color: var(--blueberry); }
.ga-dashboard .fam-meta    { color: var(--ink-muted); }
.ga-dashboard .fam-market  { color: var(--strawberry); }
.ga-dashboard .fam-error   { color: var(--danger); }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ga-dashboard/tokens.css
git commit -m "feat(ga-dashboard): add scoped warm-dark theme tokens"
```

---

## Task 11: Build `HeroBand` piece

**Files:**
- Create: `src/components/ga-dashboard/pieces/HeroBand.vue`

- [ ] **Step 1: Implement**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { GaSnapshot } from '@/types/ga-snapshot'

const props = defineProps<{ snapshot: GaSnapshot, window: '7d' | '14d' | '28d' }>()

const bundle = computed(() => props.snapshot.windows[props.window])
const days = computed(() => bundle.value.window.days)
const range = computed(() => `${bundle.value.window.startDate} → ${bundle.value.window.endDate}`)
const g = computed(() => bundle.value.glance)
const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
</script>

<template>
  <header class="hero">
    <div class="eyebrow">Toast Workshop · Analytics</div>
    <h1 class="display">Last {{ days }} Days, <em>drawn out in lines.</em></h1>
    <div class="hero-rule" />
    <p class="lede">
      這段視窗工坊裡走進 <span class="figure">{{ fmt(g.activeUsers.total) }}</span> 位活躍使用者，
      <span class="figure">{{ pct(g.activeUsers.returningPct) }}</span> 是回訪。
      Solver 跑 <span class="figure">{{ fmt(g.solver.starts) }}</span> 次收
      <span class="figure">{{ pct(g.solver.completePct) }}</span>，
      批量最佳化 <span class="figure">{{ fmt(g.batch.starts) }}</span> 次收
      <span class="figure">{{ pct(g.batch.completePct) }}</span>。
    </p>
    <div class="meta-row">
      <span>Window <strong>{{ range }}</strong></span>
      <span>Property <strong>{{ snapshot.propertyId }}</strong></span>
      <span>Generated <strong>{{ snapshot.generatedAt.slice(0, 10) }}</strong></span>
    </div>
  </header>
</template>

<style scoped>
.hero { margin-bottom: 88px; }
.eyebrow {
  font-family: 'Fira Code', monospace;
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.30em; text-transform: uppercase;
  color: var(--gold);
  display: inline-flex; align-items: center; gap: 14px;
  margin-bottom: 28px;
}
.eyebrow::before { content: ''; width: 32px; height: 1px; background: var(--gold); }
.display {
  font-family: 'Noto Serif TC', serif;
  font-size: clamp(44px, 6vw, 72px);
  font-weight: 700; line-height: 1.02; letter-spacing: -0.012em;
  color: var(--ink); margin: 0 0 18px;
}
.display em {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic; font-weight: 500;
  color: var(--ink-mid); letter-spacing: -0.005em;
}
.hero-rule {
  height: 1px;
  background: linear-gradient(90deg,
    var(--gold) 0, var(--gold) 92px,
    var(--border) 92px, var(--border) 100%);
  margin: 28px 0 32px;
}
.lede {
  font-family: 'Noto Serif TC', serif;
  font-size: 17px; line-height: 1.85;
  color: var(--ink-mid); max-width: 68ch;
}
.lede .figure {
  font-family: 'Fira Code', monospace;
  font-weight: 500; color: var(--ink); letter-spacing: 0.02em;
}
.meta-row {
  margin-top: 32px;
  display: flex; flex-wrap: wrap; gap: 24px;
  font-family: 'Fira Code', monospace;
  font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--ink-faint);
}
.meta-row span strong { color: var(--ink-mid); font-weight: 500; margin-left: 6px; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ga-dashboard/pieces/HeroBand.vue
git commit -m "feat(ga-dashboard): add HeroBand piece"
```

---

## Task 12: Build `LedgerGlance` piece

**Files:**
- Create: `src/components/ga-dashboard/pieces/LedgerGlance.vue`

- [ ] **Step 1: Implement**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { GaSnapshot } from '@/types/ga-snapshot'

const props = defineProps<{ snapshot: GaSnapshot, window: '7d' | '14d' | '28d' }>()
const g = computed(() => props.snapshot.windows[props.window].glance)
const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
</script>

<template>
  <div class="ledger" aria-label="At a glance">
    <div class="ledger-row">
      <div class="ledger-label">Active users</div>
      <div class="ledger-body">
        <span class="num">{{ fmt(g.activeUsers.total) }}</span>
        <span class="muted">new {{ fmt(g.activeUsers.new) }} · returning {{ fmt(g.activeUsers.returning) }}</span>
      </div>
      <div class="ledger-spark">{{ pct(g.activeUsers.returningPct) }} returning</div>
    </div>
    <div class="ledger-row">
      <div class="ledger-label">Solver throughput</div>
      <div class="ledger-body">
        <span class="num">{{ fmt(g.solver.starts) }} → {{ fmt(g.solver.completes) }}</span>
        <span class="muted">{{ fmt(g.solver.fails) }} failed</span>
      </div>
      <div class="ledger-spark success">{{ pct(g.solver.completePct) }} complete</div>
    </div>
    <div class="ledger-row">
      <div class="ledger-label">Batch optimisation</div>
      <div class="ledger-body">
        <span class="num">{{ fmt(g.batch.starts) }} → {{ fmt(g.batch.completes) }}</span>
        <span class="muted">{{ fmt(g.batch.fails) }} failed · {{ fmt(g.batch.cancelled) }} cancelled</span>
      </div>
      <div class="ledger-spark success">{{ pct(g.batch.completePct) }} complete</div>
    </div>
    <div class="ledger-row">
      <div class="ledger-label">BOM → Batch handoff</div>
      <div class="ledger-body">
        <span class="num">{{ fmt(g.bom.calculates) }} → {{ fmt(g.bom.sentToBatch) }}</span>
        <span class="muted">calculations sent to batch</span>
      </div>
      <div class="ledger-spark warn">{{ pct(g.bom.handoffPct) }} handoff</div>
    </div>
    <div class="ledger-row">
      <div class="ledger-label">Infra warnings</div>
      <div class="ledger-body">
        <span class="num">{{ fmt(g.infra.sabUnavailable) }}</span><span class="muted">SAB unavailable</span>
        <span class="num" style="margin-left:18px">{{ fmt(g.infra.wasmLoadFailed) }}</span><span class="muted">WASM load failed</span>
      </div>
      <div class="ledger-spark danger">needs attention</div>
    </div>
  </div>
</template>

<style scoped>
.ledger {
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  padding: 8px 0; margin-bottom: 96px;
}
.ledger-row {
  display: grid; grid-template-columns: 180px 1fr auto;
  gap: 32px; align-items: baseline;
  padding: 22px 4px;
  border-bottom: 1px solid var(--border-soft);
}
.ledger-row:last-child { border-bottom: 0; }
.ledger-label {
  font-family: 'Fira Code', monospace;
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--ink-faint);
}
.ledger-body { font-family: 'Noto Serif TC', serif; font-size: 17px; color: var(--ink); }
.ledger-body .num { font-family: 'Fira Code', monospace; font-weight: 500; letter-spacing: 0.02em; }
.ledger-body .muted { color: var(--ink-muted); font-size: 14px; margin-left: 8px; }
.ledger-spark {
  font-family: 'Fira Code', monospace;
  font-size: 13px; color: var(--gold); letter-spacing: 0.06em; white-space: nowrap;
}
.ledger-spark.warn { color: var(--warning); }
.ledger-spark.danger { color: var(--danger); }
.ledger-spark.success { color: var(--success); }

@media (max-width: 720px) {
  .ledger-row { grid-template-columns: 1fr; gap: 6px; padding: 18px 4px; }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ga-dashboard/pieces/LedgerGlance.vue
git commit -m "feat(ga-dashboard): add LedgerGlance piece"
```

---

## Task 13: Build `WindowSelector` piece

**Files:**
- Create: `src/components/ga-dashboard/pieces/WindowSelector.vue`

- [ ] **Step 1: Implement**

```vue
<script setup lang="ts">
import type { WindowKey } from '@/types/ga-snapshot'

defineProps<{ modelValue: WindowKey }>()
defineEmits<{ (e: 'update:modelValue', v: WindowKey): void }>()
const windows: Array<{ key: WindowKey, label: string }> = [
  { key: '7d',  label: '7d' },
  { key: '14d', label: '14d' },
  { key: '28d', label: '28d' },
]
</script>

<template>
  <div class="window-selector" role="tablist" aria-label="Time window">
    <button
      v-for="w in windows"
      :key="w.key"
      role="tab"
      :aria-selected="modelValue === w.key"
      :class="['win-btn', { active: modelValue === w.key }]"
      @click="$emit('update:modelValue', w.key)"
    >
      {{ w.label }}
    </button>
  </div>
</template>

<style scoped>
.window-selector {
  display: inline-flex; gap: 8px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 999px;
  margin-bottom: 32px;
}
.win-btn {
  appearance: none; border: none; background: transparent;
  color: var(--ink-muted);
  font-family: 'Fira Code', monospace;
  font-size: 12px; font-weight: 500;
  letter-spacing: 0.14em; text-transform: uppercase;
  padding: 8px 18px;
  border-radius: 999px;
  cursor: pointer;
  transition: color 160ms ease-out, background 160ms ease-out;
}
.win-btn:hover { color: var(--ink); }
.win-btn.active {
  background: var(--gold-glow); color: var(--gold);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ga-dashboard/pieces/WindowSelector.vue
git commit -m "feat(ga-dashboard): add WindowSelector piece"
```

---

## Task 14: Build `SectionHead` piece

**Files:**
- Create: `src/components/ga-dashboard/pieces/SectionHead.vue`

- [ ] **Step 1: Implement**

```vue
<script setup lang="ts">
defineProps<{ num: string, title: string, aside?: string }>()
</script>

<template>
  <div class="section-head">
    <div class="section-num">{{ num }}</div>
    <h2 class="section-title">{{ title }}</h2>
    <div v-if="aside" class="section-aside">{{ aside }}</div>
  </div>
</template>

<style scoped>
.section-head {
  display: flex; align-items: baseline; gap: 20px;
  margin-bottom: 28px; padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
}
.section-num {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic; font-weight: 500;
  font-size: 42px; line-height: 1;
  color: var(--gold); min-width: 44px;
}
.section-title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 700; font-size: 26px; line-height: 1.2;
  color: var(--ink); margin: 0; flex: 1;
}
.section-aside {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic; font-size: 18px; color: var(--ink-muted);
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ga-dashboard/pieces/SectionHead.vue
git commit -m "feat(ga-dashboard): add SectionHead piece"
```

---

## Tasks 15-26: Port chart components from `.tmp/ga/report.html`

All 12 chart tasks follow the same pattern:

1. Create `src/components/ga-dashboard/charts/<Name>.vue`
2. Copy SVG rendering logic from the corresponding `render*()` function in `.tmp/ga/report.html`
3. Wrap in `<script setup lang="ts">` using `useD3Resize` + `useTooltip`
4. Accept `data` prop typed from `src/types/ga-snapshot.ts`
5. Use `d3` from `import * as d3 from 'd3'`
6. Re-render on data change AND resize
7. Commit individually

Reference template (use this for every chart task):

```vue
<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
// import type { ... } from '@/types/ga-snapshot'

const props = defineProps<{ data: /* ChartDataType */ }>()
const root = ref<HTMLDivElement | null>(null)
const tip = useTooltip()

function render(w: number, h: number) {
  if (!root.value) return
  d3.select(root.value).selectAll('svg').remove()
  // ...port the corresponding render*() body from .tmp/ga/report.html
  // Replace any DATA.foo with props.data, use d3.format / d3 selections idiomatic.
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1068, 420)
})
</script>

<template><div ref="root" class="chart" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>
```

### Task 15: PagesTreemap.vue

**Source:** `.tmp/ga/report.html` `renderPagesTreemap()`
**Data prop type:** `PageRow[]`
**Notes:** Use `d3.hierarchy()` + `d3.treemap()`. Color via `familyForPath` mapping using the `family` field already on each PageRow. Height stays at 420px.

- [ ] Implement
- [ ] Commit: `feat(ga-dashboard): add PagesTreemap chart`

### Task 16: ChannelsBar.vue

**Source:** `renderChannels()`
**Data prop type:** `ChannelRow[]`
**Notes:** Horizontal bars, gold for top entry, crust for next two, cocoa-dark for tail. Height = `data.length * 30 + 42`.

- [ ] Implement
- [ ] Commit: `feat(ga-dashboard): add ChannelsBar chart`

### Task 17: SolverBatchFunnels.vue

**Source:** `renderFunnels()` + `drawFunnel()`
**Data prop type:** `{ solver: FunnelStep[], batch: FunnelStep[] }`
**Notes:** Two trapezoid funnels side by side. Height = 340.

- [ ] Implement
- [ ] Commit: `feat(ga-dashboard): add SolverBatchFunnels chart`

### Task 18: SimulatorFunnel.vue

**Source:** `renderSimulatorFunnel()`
**Data prop type:** `SimulatorFunnel`
**Notes:** Inferred-funnel layout with global-context strip at bottom. Height = 280.

- [ ] Implement
- [ ] Commit: `feat(ga-dashboard): add SimulatorFunnel chart`

### Task 19: FailuresBar.vue

**Source:** `renderFailures()`
**Data prop type:** `FailureRow[]`
**Notes:** Grouped horizontal bars; color by `event` family (cocoa / strawberry / matcha). Sorted desc by count in render (don't mutate prop).

- [ ] Implement
- [ ] Commit: `feat(ga-dashboard): add FailuresBar chart`

### Task 20: WebVitalsStack.vue

**Source:** `renderVitals()`
**Data prop type:** `VitalRow[]`
**Notes:** 5 stacked rows good/ni/poor with poor% annotation. Height = 230.

- [ ] Implement
- [ ] Commit: `feat(ga-dashboard): add WebVitalsStack chart`

### Task 21: EngagementScatter.vue

**Source:** `renderEngagement()`
**Data prop type:** `PageRow[]`
**Notes:** Scatter with x=avgSession, y=engagement, r=views. Height = 420. Axis titles.

- [ ] Implement
- [ ] Commit: `feat(ga-dashboard): add EngagementScatter chart`

### Task 22: FlipBands.vue

**Source:** `renderFlip()`
**Data prop type:** `{ users: FlipBuckets, sessions: FlipBuckets }`
**Notes:** Two stacked bars (Users above, Sessions below) with dashed arrow + italic caption. Height = 220.

- [ ] Implement
- [ ] Commit: `feat(ga-dashboard): add FlipBands chart`

### Task 23: ReturningEventsBar.vue

**Source:** `renderReturningEvents()`
**Data prop type:** `EventRow[]`
**Notes:** Top 15 horizontal bars by count, colored by family. Use `props.data.slice(0, 15)`.

- [ ] Implement
- [ ] Commit: `feat(ga-dashboard): add ReturningEventsBar chart`

### Task 24: PagesCompareBar.vue

**Source:** `renderPagesCompare()`
**Data prop type:** `{ all: PageRow[], returning: ReturningPageRow[] }`
**Notes:** Double-row bars (light = all, dark cocoa = returning) per page. The component itself does the join (`all.find(p => p.path === r.path)`).

- [ ] Implement
- [ ] Commit: `feat(ga-dashboard): add PagesCompareBar chart`

### Task 25: Q4FunnelDrops.vue

**Source:** `renderQ4Funnels()`
**Data prop type:** `Q4Funnel[]`
**Notes:** 4 separate trapezoid funnels stacked vertically, color by `flag`. Height = `data.length * 110 + 20`.

- [ ] Implement
- [ ] Commit: `feat(ga-dashboard): add Q4FunnelDrops chart`

### Task 26: MarketRegionStack.vue

**Source:** `renderMarketRegion()`
**Data prop type:** `MarketRegionRow[]`
**Notes:** Horizontal stacked bars (notset + unset + cht? + intl?). Top legend. Tooltip distinguishes "historical" from "PR #40 live" interpretations.

- [ ] Implement
- [ ] Commit: `feat(ga-dashboard): add MarketRegionStack chart`

---

## Task 27: Assemble `GaDashboardView.vue`

**Files:**
- Modify (overwrite placeholder): `src/views/admin/GaDashboardView.vue`

- [ ] **Step 1: Implement full view**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useGaSnapshot } from '@/composables/useGaSnapshot'
import type { WindowKey } from '@/types/ga-snapshot'

import HeroBand from '@/components/ga-dashboard/pieces/HeroBand.vue'
import LedgerGlance from '@/components/ga-dashboard/pieces/LedgerGlance.vue'
import WindowSelector from '@/components/ga-dashboard/pieces/WindowSelector.vue'
import SectionHead from '@/components/ga-dashboard/pieces/SectionHead.vue'

import PagesTreemap from '@/components/ga-dashboard/charts/PagesTreemap.vue'
import ChannelsBar from '@/components/ga-dashboard/charts/ChannelsBar.vue'
import SolverBatchFunnels from '@/components/ga-dashboard/charts/SolverBatchFunnels.vue'
import SimulatorFunnel from '@/components/ga-dashboard/charts/SimulatorFunnel.vue'
import FailuresBar from '@/components/ga-dashboard/charts/FailuresBar.vue'
import WebVitalsStack from '@/components/ga-dashboard/charts/WebVitalsStack.vue'
import EngagementScatter from '@/components/ga-dashboard/charts/EngagementScatter.vue'
import FlipBands from '@/components/ga-dashboard/charts/FlipBands.vue'
import ReturningEventsBar from '@/components/ga-dashboard/charts/ReturningEventsBar.vue'
import PagesCompareBar from '@/components/ga-dashboard/charts/PagesCompareBar.vue'
import Q4FunnelDrops from '@/components/ga-dashboard/charts/Q4FunnelDrops.vue'
import MarketRegionStack from '@/components/ga-dashboard/charts/MarketRegionStack.vue'

import '@/components/ga-dashboard/tokens.css'

const { snapshot, loading, error, isStale, staleHours, load } = useGaSnapshot()
const win = ref<WindowKey>('7d')

onMounted(load)
</script>

<template>
  <div class="ga-dashboard">
    <div class="wrap">
      <template v-if="loading">
        <div class="state">Loading snapshot…</div>
      </template>

      <template v-else-if="error">
        <div class="state error">
          無法載入 snapshot：{{ error.message }}
          <button @click="load">Retry</button>
        </div>
      </template>

      <template v-else-if="snapshot">
        <HeroBand :snapshot="snapshot" :window="win" />

        <div v-if="isStale" class="stale-badge">
          SNAPSHOT {{ staleHours }}h OLD · CRON MAY HAVE FAILED
        </div>

        <WindowSelector v-model="win" />
        <LedgerGlance :snapshot="snapshot" :window="win" />

        <section class="q">
          <SectionHead num="i." title="Q1 — Where attention landed" aside="treemap by views" />
          <PagesTreemap :data="snapshot.windows[win].pages" />
          <h3 class="sub-head">How they arrived</h3>
          <ChannelsBar :data="snapshot.windows[win].channels" />
        </section>

        <section class="q">
          <SectionHead num="ii." title="Q2 — Where the flow leaks" aside="funnels & friction" />
          <h3 class="sub-head">Funnels — solver &amp; batch</h3>
          <SolverBatchFunnels :data="{ solver: snapshot.windows[win].solverFunnel, batch: snapshot.windows[win].batchFunnel }" />
          <h3 class="sub-head">Simulator: visit → macro export</h3>
          <SimulatorFunnel :data="snapshot.windows[win].simulatorFunnel" />
          <h3 class="sub-head">Top failure reasons</h3>
          <FailuresBar :data="snapshot.windows[win].failures" />
          <h3 class="sub-head">Web vitals</h3>
          <WebVitalsStack :data="snapshot.windows[win].vitals" />
          <h3 class="sub-head">Engagement vs depth</h3>
          <EngagementScatter :data="snapshot.windows[win].pages" />
        </section>

        <section class="q">
          <SectionHead num="iii." title="Q3 — Who brings the weight" aside="new vs returning" />
          <h3 class="sub-head">The flip — users vs sessions</h3>
          <FlipBands :data="snapshot.windows[win].flip" />
          <h3 class="sub-head">What returnees do</h3>
          <ReturningEventsBar :data="snapshot.windows[win].returningEvents" />
          <h3 class="sub-head">Pages — all users vs returning</h3>
          <PagesCompareBar :data="{ all: snapshot.windows[win].pages, returning: snapshot.windows[win].returningPages }" />
        </section>

        <section class="q">
          <SectionHead num="iv." title="Q4 — New dimensions" aside="post-PR #40 instrumentation" />
          <h3 class="sub-head">Page funnel drop rates</h3>
          <Q4FunnelDrops :data="snapshot.windows[win].q4Funnels" />
          <h3 class="sub-head">Funnels × market_region</h3>
          <MarketRegionStack :data="snapshot.windows[win].marketRegion" />
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.wrap { max-width: 1180px; margin: 0 auto; padding: 80px 56px 120px; }
.state {
  padding: 60px 0; text-align: center;
  color: var(--ink-muted);
  font-family: 'Cormorant Garamond', serif;
  font-style: italic; font-size: 22px;
}
.state.error { color: var(--danger); }
.state.error button {
  margin-left: 14px;
  background: var(--gold); color: var(--bg-deep);
  border: none; border-radius: 6px;
  padding: 6px 14px;
  font-family: 'Fira Code', monospace; font-size: 12px;
  cursor: pointer;
}
.stale-badge {
  display: inline-block;
  margin-bottom: 24px;
  padding: 6px 14px;
  border: 1px solid var(--warning);
  border-radius: 999px;
  color: var(--warning);
  font-family: 'Fira Code', monospace; font-size: 11px;
  letter-spacing: 0.18em; text-transform: uppercase;
}
section.q { margin-bottom: 96px; }
.sub-head {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600; font-size: 16px; color: var(--ink);
  margin: 44px 0 14px;
  display: flex; align-items: center; gap: 12px;
}
.sub-head::before {
  content: ''; width: 18px; height: 1px;
  background: var(--gold); flex-shrink: 0;
}
@media (max-width: 720px) { .wrap { padding: 56px 24px 80px; } }
</style>
```

- [ ] **Step 2: Verify dev server**

Run: `npm run dev` (background).

Then in another terminal:

```bash
node --env-file=.env scripts/dev/ga-analyze.mjs --snapshot --out public/data/ga-snapshot.json
```

Expected: `public/data/ga-snapshot.json` exists, ~30KB.

Open `http://localhost:5173/#/admin/ga`. Expected: all 11 charts render, window selector switches data. No console errors.

Stop dev server.

- [ ] **Step 3: Add public/data path to gitignore (snapshot is fetched from gh-data branch in prod)**

Add to `.gitignore`:

```
# GA snapshot served from gh-data branch in prod; local copy is dev-only
public/data/ga-snapshot.json
public/data/ga-history/
```

- [ ] **Step 4: Commit**

```bash
git add src/views/admin/GaDashboardView.vue .gitignore
git commit -m "feat(ga-dashboard): assemble dashboard view with all 11 charts"
```

---

## Task 28: Type-check + lint full PR

**Files:**
- (verification only)

- [ ] **Step 1: Type-check**

Run: `npm run type-check`
Expected: PASS, 0 errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS, 0 warnings.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests PASS including new analytics + useGaSnapshot tests.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds; D3 chunk produced.

- [ ] **Step 5: Fix any issue surfaced; if none, commit nothing**

If anything was fixed:

```bash
git add -A
git commit -m "chore(ga-dashboard): fix type/lint/test issues from full check"
```

---

## Task 29: Cron workflow + gh-data branch setup

**Files:**
- Create: `.github/workflows/ga-snapshot.yml`

- [ ] **Step 1: Implement workflow**

```yaml
# .github/workflows/ga-snapshot.yml
name: GA daily snapshot

on:
  schedule:
    - cron: '0 4 * * *'   # 04:00 UTC = 12:00 Asia/Taipei
  workflow_dispatch: {}

permissions:
  contents: write

concurrency:
  group: ga-snapshot
  cancel-in-progress: false

jobs:
  snapshot:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout main
        uses: actions/checkout@v5

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm

      - name: Install deps
        run: npm ci

      - name: Write SA cred
        env:
          GA_SA_JSON: ${{ secrets.GA_SA_JSON }}
        run: |
          mkdir -p $HOME/.ff14-craft-helper
          printf '%s' "$GA_SA_JSON" > $HOME/.ff14-craft-helper/ga-sa.json

      - name: Prepare gh-data working tree
        run: |
          git fetch origin gh-data || true
          if git rev-parse --verify origin/gh-data >/dev/null 2>&1; then
            git worktree add /tmp/gh-data origin/gh-data
          else
            mkdir /tmp/gh-data
            cd /tmp/gh-data
            git init -b gh-data
            git remote add origin "${{ github.server_url }}/${{ github.repository }}"
            cd -
          fi

      - name: Run snapshot
        env:
          GA_PROPERTY_ID: ${{ secrets.GA_PROPERTY_ID }}
        run: |
          node scripts/dev/ga-analyze.mjs --snapshot \
            --out /tmp/gh-data/snapshot.json \
            --history /tmp/gh-data/history

      - name: Commit + push
        run: |
          cd /tmp/gh-data
          git config user.name "ga-snapshot-bot"
          git config user.email "ga-snapshot-bot@users.noreply.github.com"
          git add snapshot.json history/
          git diff --cached --quiet && exit 0
          git commit -m "data(snapshot): $(date -u +%Y-%m-%d)"
          git push -u origin gh-data
```

- [ ] **Step 2: Document required GitHub secrets**

Append to `docs/agents/` or create `docs/ga-snapshot-setup.md` (decide based on existing docs; if no existing convention, put in `docs/`):

```markdown
# GA daily snapshot setup

The `.github/workflows/ga-snapshot.yml` cron requires two repository secrets:

- `GA_SA_JSON` — full contents of the service-account JSON (paste as-is)
- `GA_PROPERTY_ID` — `527587379`

The SA must have **Viewer** access on the GA4 property.

Add at: GitHub repo → Settings → Secrets and variables → Actions → New repository secret.

Verify the workflow with: Actions tab → "GA daily snapshot" → Run workflow.
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ga-snapshot.yml docs/ga-snapshot-setup.md
git commit -m "feat(ga-dashboard): add daily cron workflow for snapshot on gh-data branch

Cron runs at 04:00 UTC, queries GA for 7d/14d/28d windows, writes
snapshot.json + history/YYYY-MM-DD.json to a dedicated gh-data branch.
Dashboard fetches via raw.githubusercontent.com so refresh doesn't
require a tag-triggered deploy."
```

- [ ] **Step 4: Manual setup (NOT a code step — engineer ack)**

Engineer must:
1. Add `GA_SA_JSON` and `GA_PROPERTY_ID` repo secrets.
2. Trigger workflow once manually (`workflow_dispatch`) to create the `gh-data` branch.
3. Verify `https://raw.githubusercontent.com/andycom12000/ff14-craft-helper/gh-data/snapshot.json` is accessible.

Acknowledge by leaving a comment in the PR description listing the steps performed.

---

## Self-review

**Spec coverage check** (against `docs/superpowers/specs/2026-05-20-ga-admin-dashboard-design.md`):

- ✅ Goal: `/admin/ga` route — Task 9
- ✅ Window selector — Task 13
- ✅ All 11 charts ported — Tasks 15-26 (note: SolverBatch is one component containing 2 funnels = 11 components for 12 chart "slots")
- ✅ Tracking fix — Task 2
- ✅ Cron snapshot — Task 29
- ✅ Snapshot JSON shape with schemaVersion — Task 3 + Task 4/5
- ✅ Stale badge — Task 27
- ✅ Locked dark theme — Task 10
- ✅ History from day 1 — Task 5 (`--history` flag) + Task 29 (workflow uses it)
- ⚠️ **Deviation from spec**: spec said `data/ga-snapshot.json` in main; plan moved this to `gh-data` branch with raw.githubusercontent fetch. Reason: `deploy.yml` is tag-triggered (not main-push), so committing to main would not refresh the deployed site. Cross-branch + raw fetch is the only way to satisfy "daily refresh without auto-deploy". Memory `feedback_no_deploy.md` exception still applies (workflow auto-commits to gh-data only; main and tags untouched).

**Placeholder scan**: no TBDs, no "fill in", every step has either code or exact command + expected output.

**Type consistency check**:
- `WindowKey`, `PageRow`, `ChannelRow`, `FunnelStep`, `SimulatorFunnel`, `FailureRow`, `VitalRow`, `FlipBuckets`, `EventRow`, `ReturningPageRow`, `Q4Funnel`, `MarketRegionRow`, `MetricsBundle`, `GaSnapshot` — defined in Task 3, referenced consistently by Tasks 11, 12, 13, 15-26, 27.
- `familyForPath` defined in Task 5 (ga-analyze.mjs side), used to set `PageRow.family` during snapshot generation. Dashboard components consume the pre-computed value — no need to redefine.
- `useGaSnapshot()` exposes `snapshot`, `loading`, `error`, `isStale`, `staleHours`, `load` — consumed correctly in Task 27.

**Suggested execution path**: subagent-driven, since each task is well-scoped, the 12 chart tasks are mechanical ports that can each ship + review independently, and dependencies are mostly linear (Task 3 → Task 4 → Task 5, then 6-14 in any order, then 15-26 in any order, then 27, then 28-29).

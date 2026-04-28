# GA4 Dashboard & 追蹤缺口補丁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Patch tracking events needed by the four-section GA4 dashboard, then configure the dashboard in GA4.

**Architecture:** Reuse the existing `trackEvent` helper in `src/utils/analytics.ts`. Add one new utility (`gear-bucket.ts`) for the BiS-ratio classifier. Instrument Universalis at the `fetchUniversalis()` chokepoint. Use the `web-vitals` npm package for Core Vitals. SAB canary checks `crossOriginIsolated` once per session at boot.

**Tech Stack:** Vue 3 + TypeScript + Vitest. GA4 (gtag.js, hash-router-aware). New dependency: `web-vitals` (~3KB).

**Spec:** `docs/superpowers/specs/2026-04-28-ga-dashboard-and-tracking-design.md`

---

## File Structure

**Create:**
- `src/utils/gear-bucket.ts` — `classifyGearBucket(level, craftsmanship, control)` + approx-BiS lookup
- `src/utils/web-vitals-tracking.ts` — register web-vitals callbacks → trackEvent
- `src/__tests__/utils/gear-bucket.test.ts` — TDD tests

**Modify:**
- `package.json` — add `web-vitals` dependency
- `src/main.ts` — register web-vitals + sab_unavailable canary
- `src/solver/worker.ts` — replace ad-hoc wasm error tracking with proper `wasm_load_failed` event; augment `solver_start` with `gear_bucket`
- `src/api/universalis.ts` — instrument `fetchUniversalis()` with optional tracking param; market endpoints pass `{ server, item_count }`
- `src/__tests__/api/universalis.test.ts` — assert `universalis_fetch` is emitted on success/failure
- `src/components/recipe/RecipeSearch.vue` — emit `search_query` after debounced search

**Manual (GA4 console, no code):**
- Register custom dimensions / metrics / key events
- Build the four dashboard sections (A/B/C/D)

---

## Task 1: Install web-vitals + tracking helper

**Files:**
- Modify: `package.json`
- Create: `src/utils/web-vitals-tracking.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Install web-vitals**

```bash
npm install web-vitals
```

Expected: `web-vitals` (latest 5.x) added to dependencies.

- [ ] **Step 2: Create the tracking helper**

Create `src/utils/web-vitals-tracking.ts`:

```ts
import { onLCP, onCLS, onINP, onFCP, onTTFB, type Metric } from 'web-vitals'
import { trackEvent } from './analytics'

function send(metric: Metric) {
  trackEvent('web_vitals', {
    metric: metric.name,
    value: metric.name === 'CLS' ? Number(metric.value.toFixed(4)) : Math.round(metric.value),
    rating: metric.rating,
  })
}

export function registerWebVitals(): void {
  onLCP(send)
  onCLS(send)
  onINP(send)
  onFCP(send)
  onTTFB(send)
}
```

> CLS is a unitless score in `[0, 1+]`; keep 4 decimals. Other metrics are ms; round to integer.

- [ ] **Step 3: Wire from main.ts**

Modify `src/main.ts` — after the existing imports, add:

```ts
import { registerWebVitals } from '@/utils/web-vitals-tracking'
```

After `app.mount('#app')` add:

```ts
registerWebVitals()
```

- [ ] **Step 4: Type-check**

```bash
npm run build
```

Expected: build succeeds, no TS errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/utils/web-vitals-tracking.ts src/main.ts
git commit -m "feat(analytics): track Core Web Vitals via web-vitals package"
```

---

## Task 2: SAB unavailable canary

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add canary in main.ts**

After the `registerWebVitals()` call from Task 1, add:

```ts
// Canary: GitHub Pages COOP/COEP headers should keep us isolated. If they
// break, this scorecard in C section will start firing and we notice fast.
if (typeof crossOriginIsolated === 'boolean' && !crossOriginIsolated) {
  const SAB_KEY = 'ff14ch.sab_unavailable_sent'
  if (!sessionStorage.getItem(SAB_KEY)) {
    import('@/utils/analytics').then(({ trackEvent }) => {
      trackEvent('sab_unavailable')
      sessionStorage.setItem(SAB_KEY, '1')
    })
  }
}
```

> The dynamic import avoids loading analytics again if it's already in the bundle, and per-session dedupe stops noise from route changes.

- [ ] **Step 2: Type-check**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(analytics): add sab_unavailable canary on app boot"
```

---

## Task 3: Proper wasm_load_failed event

**Files:**
- Modify: `src/solver/worker.ts:43-49`

The current code calls `trackError('wasm_load_failed', ...)` which sends an `exception` event with description string `'wasm_load_failed'` — not a real custom event. Replace.

- [ ] **Step 1: Replace the tracking call**

Find this block in `src/solver/worker.ts`:

```ts
} else if (data.type === 'init-error') {
  wasmStatus = 'error'
  wasmErrorMessage = data.error ?? 'WASM 初始化失敗'
  trackError('wasm_load_failed', { reason: wasmErrorMessage })
  const waiters = wasmErrorWaiters.splice(0)
  wasmReadyWaiters.length = 0
  for (const cb of waiters) cb(wasmErrorMessage)
}
```

Replace with:

```ts
} else if (data.type === 'init-error') {
  wasmStatus = 'error'
  wasmErrorMessage = data.error ?? 'WASM 初始化失敗'
  trackEvent('wasm_load_failed', {
    reason: wasmErrorMessage,
    fallback_used: false,
  })
  trackError(`WASM init failed: ${wasmErrorMessage}`)
  const waiters = wasmErrorWaiters.splice(0)
  wasmReadyWaiters.length = 0
  for (const cb of waiters) cb(wasmErrorMessage)
}
```

> `fallback_used: false` is a forward-compat field. There's no single-thread fallback today; if one is added later, set this to true on that path. Keep `trackError` so the exception list in C section still surfaces it.

- [ ] **Step 2: Type-check**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/solver/worker.ts
git commit -m "feat(analytics): emit wasm_load_failed as a dedicated event"
```

---

## Task 4: Instrument Universalis fetch

**Files:**
- Modify: `src/api/universalis.ts`
- Modify: `src/__tests__/api/universalis.test.ts`

- [ ] **Step 1: Read existing test to learn patterns**

Read `src/__tests__/api/universalis.test.ts` to see how `fetch` is mocked, then we'll mirror that.

- [ ] **Step 2: Write the failing test**

Append to `src/__tests__/api/universalis.test.ts`:

```ts
import { trackEvent } from '@/utils/analytics'

vi.mock('@/utils/analytics', () => ({
  trackEvent: vi.fn(),
  trackError: vi.fn(),
}))

describe('universalis_fetch tracking', () => {
  beforeEach(() => {
    vi.mocked(trackEvent).mockClear()
  })

  it('emits universalis_fetch with ok=true on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ itemID: 5057, listings: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await getMarketData('Tonberry', 5057)

    expect(trackEvent).toHaveBeenCalledWith(
      'universalis_fetch',
      expect.objectContaining({
        server: 'Tonberry',
        item_count: 1,
        ok: true,
        status: 200,
      }),
    )
    const call = vi.mocked(trackEvent).mock.calls[0][1]!
    expect(typeof call.duration_ms).toBe('number')
  })

  it('emits universalis_fetch with ok=false on HTTP error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getMarketData('Tonberry', 5057)).rejects.toThrow()

    expect(trackEvent).toHaveBeenCalledWith(
      'universalis_fetch',
      expect.objectContaining({ ok: false, status: 404, server: 'Tonberry' }),
    )
  })
})
```

> If `getMarketData` isn't already imported in this file, add it to the existing import line.

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/__tests__/api/universalis.test.ts
```

Expected: the two new tests FAIL — `trackEvent` not called.

- [ ] **Step 4: Add tracking param plumbing in universalis.ts**

In `src/api/universalis.ts`, add at top after `BASE_URL`:

```ts
import { trackEvent } from '@/utils/analytics'

interface FetchTracking {
  server: string
  item_count: number
}
```

Replace `fetchUniversalis` with:

```ts
async function fetchUniversalis<T>(
  path: string,
  timeoutMs = REQUEST_TIMEOUT_MS,
  tracking?: FetchTracking,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = performance.now()
  let status = 0
  let ok = false
  try {
    const response = await fetch(`${BASE_URL}/${path}`, { signal: controller.signal })
    status = response.status
    ok = response.ok
    if (!response.ok) {
      throw new Error(`Universalis request failed: ${response.status} ${response.statusText}`)
    }
    return await response.json()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Universalis 查詢逾時 (${timeoutMs / 1000}s)`)
    }
    throw err
  } finally {
    clearTimeout(timer)
    if (tracking) {
      trackEvent('universalis_fetch', {
        server: tracking.server,
        item_count: tracking.item_count,
        duration_ms: Math.round(performance.now() - startedAt),
        ok,
        status,
      })
    }
  }
}
```

- [ ] **Step 5: Pass tracking from market endpoints**

In the same file, modify market endpoints to pass tracking:

```ts
export function getMarketData(server: string, itemId: number): Promise<MarketData> {
  return fetchUniversalis(
    `${encodeURIComponent(server)}/${itemId}`,
    REQUEST_TIMEOUT_MS,
    { server, item_count: 1 },
  )
}

export function getMarketDataByDC(dcName: string, itemId: number): Promise<MarketData> {
  return fetchUniversalis(
    `${encodeURIComponent(dcName)}/${itemId}`,
    REQUEST_TIMEOUT_MS,
    { server: dcName, item_count: 1 },
  )
}
```

In `getAggregatedPrices`, replace the `fetchUniversalis` call inside `Promise.all(...)` with:

```ts
const data = await fetchUniversalis<MarketData | { items: Record<string, MarketData> }>(
  `${encodeURIComponent(server)}/${ids}`,
  REQUEST_TIMEOUT_MS,
  { server, item_count: chunk.length },
)
```

> `getWorlds`, `getDataCenters`, `refreshWorldsFromApi` deliberately omit tracking — they're metadata calls, not market lookups, and would pollute the success-rate scorecard.

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/api/universalis.test.ts
```

Expected: all tests PASS (including the existing ones — they should not be affected).

- [ ] **Step 7: Commit**

```bash
git add src/api/universalis.ts src/__tests__/api/universalis.test.ts
git commit -m "feat(analytics): instrument Universalis market fetches"
```

---

## Task 5: gear-bucket utility (TDD)

**Files:**
- Create: `src/utils/gear-bucket.ts`
- Test: `src/__tests__/utils/gear-bucket.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/utils/gear-bucket.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { classifyGearBucket } from '@/utils/gear-bucket'

describe('classifyGearBucket', () => {
  it('returns bis when ratio >= 0.95 at lv100', () => {
    // approx BiS: 5400/5200, 95% = 5130/4940
    expect(classifyGearBucket(100, 5400, 5200)).toBe('bis')
    expect(classifyGearBucket(100, 5130, 4940)).toBe('bis')
  })

  it('returns mid for 0.70 <= ratio < 0.95', () => {
    // 80% of (5400, 5200) = (4320, 4160)
    expect(classifyGearBucket(100, 4320, 4160)).toBe('mid')
  })

  it('returns entry when ratio < 0.70', () => {
    // 50% of (5400, 5200)
    expect(classifyGearBucket(100, 2700, 2600)).toBe('entry')
  })

  it('uses lv80 thresholds for level 87 (floors to 80)', () => {
    // approx BiS at 80 cap: 2700/2600. 95% = 2565/2470
    expect(classifyGearBucket(87, 2565, 2470)).toBe('bis')
    expect(classifyGearBucket(87, 100, 100)).toBe('entry')
  })

  it('uses lv50 thresholds for level 50', () => {
    // approx BiS: 410/410, 95% = 390/390
    expect(classifyGearBucket(50, 410, 410)).toBe('bis')
  })

  it('uses lv50 thresholds for sub-50 levels (clamps down)', () => {
    expect(classifyGearBucket(20, 410, 410)).toBe('bis')
    expect(classifyGearBucket(20, 50, 50)).toBe('entry')
  })

  it('handles 0 stats as entry', () => {
    expect(classifyGearBucket(100, 0, 0)).toBe('entry')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/utils/gear-bucket.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/utils/gear-bucket.ts`:

```ts
export type GearBucket = 'entry' | 'mid' | 'bis'

interface BisPoint {
  level: number
  craftsmanship: number
  control: number
}

// Approximate BiS at each crafter level cap. Values are intentionally
// conservative round numbers — used only for three-bucket classification,
// not precision math. Calibrate against community BiS guides if the
// distribution looks off.
const APPROX_BIS: BisPoint[] = [
  { level: 50, craftsmanship: 410, control: 410 },
  { level: 60, craftsmanship: 760, control: 760 },
  { level: 70, craftsmanship: 1750, control: 1700 },
  { level: 80, craftsmanship: 2700, control: 2600 },
  { level: 90, craftsmanship: 4070, control: 3900 },
  { level: 100, craftsmanship: 5400, control: 5200 },
]

function lookupBis(level: number): BisPoint {
  // Floor to the largest cap <= level. Below lv50, clamp to lv50.
  let chosen = APPROX_BIS[0]
  for (const point of APPROX_BIS) {
    if (point.level <= level) chosen = point
  }
  return chosen
}

export function classifyGearBucket(
  level: number,
  craftsmanship: number,
  control: number,
): GearBucket {
  const bis = lookupBis(level)
  const ratio = (craftsmanship / bis.craftsmanship + control / bis.control) / 2
  if (ratio >= 0.95) return 'bis'
  if (ratio >= 0.70) return 'mid'
  return 'entry'
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/utils/gear-bucket.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/gear-bucket.ts src/__tests__/utils/gear-bucket.test.ts
git commit -m "feat(analytics): add gear bucket classifier"
```

---

## Task 6: Augment solver_start with gear_bucket

**Files:**
- Modify: `src/solver/worker.ts:110-114`

- [ ] **Step 1: Import the classifier**

At the top of `src/solver/worker.ts`, alongside the existing analytics import:

```ts
import { classifyGearBucket } from '@/utils/gear-bucket'
```

- [ ] **Step 2: Augment the event**

Replace the existing `solver_start` block:

```ts
trackEvent('solver_start', {
  crafter_level: config.crafter_level,
  recipe_level: config.recipe_level,
  hq_target: config.hq_target,
})
```

With:

```ts
trackEvent('solver_start', {
  crafter_level: config.crafter_level,
  recipe_level: config.recipe_level,
  hq_target: config.hq_target,
  gear_bucket: classifyGearBucket(
    config.crafter_level,
    config.craftsmanship,
    config.control,
  ),
})
```

- [ ] **Step 3: Type-check + run all tests**

```bash
npm run build
npx vitest run
```

Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/solver/worker.ts
git commit -m "feat(analytics): add gear_bucket dimension to solver_start"
```

---

## Task 7: search_query event from RecipeSearch

**Files:**
- Modify: `src/components/recipe/RecipeSearch.vue` (the `<script setup>` block, around the existing debounced watch)

- [ ] **Step 1: Add the import**

At the top of `<script setup>`:

```ts
import { trackEvent } from '@/utils/analytics'
```

- [ ] **Step 2: Emit after the search resolves**

The existing watch (around line 36–57) currently does:

```ts
debounceTimer = setTimeout(async () => {
  loading.value = true
  try {
    allResults.value = await searchRecipes(trimmed)
  } catch {
    allResults.value = []
  } finally {
    loading.value = false
  }
}, 200)
```

Replace with:

```ts
debounceTimer = setTimeout(async () => {
  loading.value = true
  try {
    allResults.value = await searchRecipes(trimmed)
  } catch {
    allResults.value = []
  } finally {
    loading.value = false
    trackEvent('search_query', {
      query: trimmed,
      result_count: allResults.value.length,
      source: 'recipe',
    })
  }
}, 200)
```

> Tracking after `loading.value = false` ensures the user-visible result count matches what we report. Errors land here too with `result_count = 0`, which is the correct signal for "search failed to find anything from the user's POV".

- [ ] **Step 3: Type-check**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Manual smoke test in browser**

```bash
npm run dev
```

Open the app, type a recipe name in the recipe search, wait for results. Open GA4 DebugView (DevTools → Network → look for `?en=search_query` to gtag) — confirm event fires with correct params.

- [ ] **Step 5: Commit**

```bash
git add src/components/recipe/RecipeSearch.vue
git commit -m "feat(analytics): emit search_query from recipe search"
```

---

## Task 8: GA4 admin — register custom dimensions, metrics, key events

**This is a manual GA4 console task. No code, no commit.**

Open GA4 → Admin → Data display → Custom definitions.

- [ ] **Step 1: Register custom dimensions (event-scoped)**

For each of the following, click "Create custom dimension", scope = `Event`, set the parameter name to match exactly:

| Dimension name | Event parameter | Description |
|---|---|---|
| Job | `job` | CRP/BSM/ARM/GSM/... |
| Calc mode | `calc_mode` | macro / quick-buy |
| HQ target | `hq_target` | numeric, 0–100 |
| Gear bucket | `gear_bucket` | entry / mid / bis |
| Web Vitals metric | `metric` | LCP / CLS / INP / FCP / TTFB |
| Web Vitals rating | `rating` | good / needs-improvement / poor |
| Search source | `source` | recipe / item |
| Search query | `query` | the search string |
| Universalis server | `server` | world or DC name |
| Fetch ok | `ok` | true / false |
| Failure reason | `reason` | error message |
| Fallback used | `fallback_used` | true / false |

- [ ] **Step 2: Register custom metrics**

Click "Create custom metric" for each:

| Metric name | Parameter | Unit |
|---|---|---|
| Duration ms | `duration_ms` | milliseconds |
| Action count | `action_count` | standard |
| Steps | `steps` | standard |
| Target count | `target_count` | standard |
| Total quantity | `total_quantity` | standard |
| Todo count | `todo_count` | standard |
| Queue size | `queue_size` | standard |
| Web Vitals value | `value` | standard |
| Result count | `result_count` | standard |
| Item count | `item_count` | standard |
| Crafter level | `crafter_level` | standard |
| Recipe level | `recipe_level` | standard |

- [ ] **Step 3: Mark key events**

GA4 → Admin → Data display → Events → toggle "Mark as key event" for:

- `solver_complete`
- `batch_optimization_complete`

- [ ] **Step 4: Wait 24–48 hours for data**

Custom dimensions/metrics take up to 48h before they're queryable in Reports/Explorations. (DebugView shows them immediately.)

---

## Task 9: GA4 admin — build the four dashboard sections

**Manual GA4 console task. Reference the spec for the chart list per section.**

- [ ] **Step 1: Create the collection**

GA4 → Reports → Library → Create new collection → name **吐司工坊**. Add four topics: **使用者規模**, **功能使用**, **效能與穩定**, **玩家洞察**.

- [ ] **Step 2: Section A — 使用者規模**

Add the standard "User acquisition", "Demographic details", "Tech overview" reports to the **使用者規模** topic. They cover DAU, new vs returning, language, device, country, source/medium, engagement time without configuration.

- [ ] **Step 3: Section B — 功能使用**

Build:

1. **Top events report** filtered to `solver_complete`, `batch_optimization_complete`, `search_query` → add to **功能使用** topic.
2. **Pages and screens report** → add same topic.
3. **Free-form exploration** "Search insights":
   - Dimensions: `query`, `source`
   - Metrics: Event count, Average `result_count`
   - Filter view: `result_count` exactly matches `0` → "Top no-result queries"
4. **Funnel exploration** "Solver funnel":
   - Step 1: any page_view
   - Step 2: `recipe_select`
   - Step 3: `solver_start`
   - Step 4: `solver_complete`
5. **Funnel exploration** "Batch funnel":
   - Step 1: `page_view` where `page_path` contains `/batch`
   - Step 2: `batch_add_recipe`
   - Step 3: `batch_optimization_start`
   - Step 4: `batch_optimization_complete`

Save and link the explorations from the topic.

- [ ] **Step 4: Section C — 效能與穩定**

Single Free-form exploration **"Performance & stability"**:

- Tab 1 "Solver duration": Histogram of `duration_ms` from `solver_complete`, buckets `<1000`, `1000-3000`, `3000-10000`, `10000-30000`, `30000+`. Plus three scorecards (P50/P75/P95).
- Tab 2 "Batch duration": same shape on `batch_optimization_complete.duration_ms`.
- Tab 3 "Failure rates": Two scorecards — `solver_failed`/`solver_start` ratio, `batch_optimization_failed`/`batch_optimization_start` ratio. Table of `exception` events grouped by `description`.
- Tab 4 "Web Vitals": Five scorecards, P75 of `value` filtered per `metric` = LCP/CLS/INP/FCP/TTFB.
- Tab 5 "WASM/SAB canaries": Scorecards for `wasm_load_failed` count and `sab_unavailable` count.
- Tab 6 "Universalis": Success rate (`ok=true` count / total), avg `duration_ms`, bar of events by `server`.

- [ ] **Step 5: Section D — 玩家洞察**

Single Free-form exploration **"Player insights"**:

- Tab 1 "Level distribution": histogram of `crafter_level` and `recipe_level` from `solver_start`.
- Tab 2 "Crafter × Recipe heatmap": pivot with `crafter_level` rows × `recipe_level` columns, value = event count.
- Tab 3 "Gear bucket": bar of `solver_start` count by `gear_bucket`.
- Tab 4 "Batch scale": histogram of `target_count` (buckets 1 / 2-3 / 4-9 / 10-19 / 20+) and `total_quantity` (1-10 / 10-50 / 50-200 / 200+).
- Tab 5 "Batch settings": donut of `cross_server` and `calc_mode` from `batch_optimization_start`.

- [ ] **Step 6: Publish the collection**

Reports → Library → 吐司工坊 → Publish. Verify it appears in the left nav.

- [ ] **Step 7: Final verification**

Wait 24–48h after Task 8. Then revisit and confirm the custom-dimension cards render real data (not "(not set)" everywhere). If a card is empty, recheck the dimension/metric registration parameter name spelling.

---

## Self-Review Notes (for the writer)

Spec coverage:
- A/B/C/D sections: Tasks 9 covers all four
- search_query: Task 7
- web_vitals: Task 1
- wasm_load_failed: Task 3
- sab_unavailable: Task 2
- universalis_fetch: Task 4
- solver_start.gear_bucket: Tasks 5+6
- Custom dimensions/metrics/key events registration: Task 8
- Excluded events (macro_export etc.): correctly absent

No placeholders. All code is complete. Type names (`GearBucket`, `classifyGearBucket`, `FetchTracking`) consistent across tasks.

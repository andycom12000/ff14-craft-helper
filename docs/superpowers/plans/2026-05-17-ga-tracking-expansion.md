# GA Tracking Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 new GA4 events + augment `sab_unavailable` to fill the analytics blind spots identified in the 2026-05-17 GA Data API analysis (BOM→Batch 9.7% mystery, solver result consumption, new-user funnel, browser distribution).

**Architecture:** Reuse the existing `trackEvent` helper in `src/utils/analytics.ts`. Add two new files: `src/utils/browser-info.ts` (UA detection, pure) and `src/stores/milestones.ts` (milestone state, idempotent + localStorage). Wire events at existing hook points — store functions for state mutations, component handlers for UI interactions. Settings tracking introduces explicit setters on the settings store (small refactor of SettingsView callers).

**Tech Stack:** Vue 3 + Pinia + TypeScript + vitest. Existing `trackEvent(name, params)` helper. No new deps.

**Spec:** `docs/superpowers/specs/2026-05-17-ga-tracking-expansion-design.md`

---

## File Structure Overview

### New files

| Path | Responsibility |
|---|---|
| `src/utils/browser-info.ts` | Parse `navigator.userAgent` → `{ family, isInAppWebview, uaShort }`. Pure functions, no side effects. |
| `src/__tests__/utils/browser-info.test.ts` | UA fixture matrix. |
| `src/stores/milestones.ts` | Tracks first-time-per-device milestones. Persists to localStorage; idempotent. (Named `milestones` to avoid clashing with the existing `src/utils/onboarding.ts` which gates the welcome-setup flow — different concern.) |
| `src/__tests__/stores/milestones.test.ts` | Idempotency + persistence. |

### Modified files

| Path | What changes |
|---|---|
| `src/main.ts` | `sab_unavailable` payload gains `browser_family`, `is_in_app_webview`, `ua_short`. |
| `src/stores/bom.ts` | `toggleChecked` + `toggleRowExpanded` emit events; expand uses session-Set to dedupe. |
| `src/stores/recipe.ts` | `setRecipe` marks `viewed_recipe` milestone. |
| `src/stores/settings.ts` | Adds 9 explicit setters (`setServer`, `setDataCenter`, ...) each emitting `settings_change`. |
| `src/stores/locale.ts` | `setLocale` emits `settings_change` for `language`. |
| `src/solver/worker.ts` | Adds rerun fingerprint counter, post-fail flag, marks `ran_solver` milestone. |
| `src/views/BatchView.vue` | Marks `used_batch` milestone in `runOptimization`. |
| `src/views/SettingsView.vue` | Switches from `store.x = v` to `store.setX(v)` in `autoSave`. |
| `src/components/simulator/MacroExport.vue` | `copyMacro` emits `solver_macro_copy` + marks `saw_macro` milestone (on first non-empty `macros`); add post-fail input watch. |
| `src/components/bom/BomTotalsBar.vue` | `copyTeamcraftUrl` / `copyMaterialsMarkdown` emit `bom_copy_list`. |
| `src/components/bom/BomTotalsReceipt.vue` | Same as above. |
| `src/components/bom/BomAcquisitionDetail.vue` | `copyTp` emits `aetheryte_tp_copy(source: 'bom_detail')`. |
| `src/components/bom/ZoneMapSheet.vue` | `copyTp` emits `aetheryte_tp_copy(source: 'zone_map')`. |
| `src/components/batch/NpcShoppingGroup.vue` | `copyTp` emits `aetheryte_tp_copy(source: 'npc_shop')`. |

### Deviations from spec

- **`bom_breakdown_expand`**: Spec listed `BomDecisionRow.vue` + `RoutePlannerGroupCard.vue` with `source: 'decision_row' | 'route_planner'`. On review, `RoutePlannerGroupCard.toggleCollapse` operates on zone groups, not single items, so it doesn't match the event's intent ("使用者點開單一物品的採集細節"). **Hook in `bom.toggleRowExpanded(itemId)` only; drop the `source` param.** This is the single chokepoint for item-level drill-downs.

---

## Conventions

- **Test files** live in `src/__tests__/<area>/<name>.test.ts`. We do NOT colocate.
- **Run a single test file**: `npx vitest run src/__tests__/<area>/<name>.test.ts`
- **Run the full suite**: `npm test`
- **Type check**: `npm run type-check`
- **Lint**: `npm run lint`
- **Mock `trackEvent`** in component / store tests via:
  ```ts
  vi.mock('@/utils/analytics', () => ({
    trackEvent: vi.fn(),
    trackError: vi.fn(),
    trackPageView: vi.fn(),
  }))
  ```
- **Commit each task separately** so review is bounded.

---

## Task 1 — `browser-info` utility

**Files:**
- Create: `src/utils/browser-info.ts`
- Create: `src/__tests__/utils/browser-info.test.ts`

- [ ] **Step 1.1 — Write the failing test**

Create `src/__tests__/utils/browser-info.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { detectBrowserFamily, isInAppWebview, getBrowserInfo } from '@/utils/browser-info'

describe('detectBrowserFamily', () => {
  it('detects Chrome', () => {
    expect(detectBrowserFamily(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    )).toBe('chrome')
  })

  it('detects Safari (desktop)', () => {
    expect(detectBrowserFamily(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    )).toBe('safari')
  })

  it('detects Firefox', () => {
    expect(detectBrowserFamily(
      'Mozilla/5.0 (Windows NT 10.0; rv:120.0) Gecko/20100101 Firefox/120.0',
    )).toBe('firefox')
  })

  it('detects Edge as edge (not chrome)', () => {
    expect(detectBrowserFamily(
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0',
    )).toBe('edge')
  })

  it('returns other for unknown UA', () => {
    expect(detectBrowserFamily('SomeBot/1.0')).toBe('other')
  })

  it('returns other for empty UA', () => {
    expect(detectBrowserFamily('')).toBe('other')
  })
})

describe('isInAppWebview', () => {
  it('detects Facebook in-app', () => {
    expect(isInAppWebview('Mozilla/5.0 (iPhone) FBAN/FBIOS;FBAV/420.0')).toBe(true)
  })

  it('detects Line in-app', () => {
    expect(isInAppWebview('Mozilla/5.0 (iPhone) Line/13.0.0')).toBe(true)
  })

  it('detects Instagram in-app', () => {
    expect(isInAppWebview('Mozilla/5.0 (iPhone) Instagram 300.0')).toBe(true)
  })

  it('detects Android WebView (wv tag)', () => {
    expect(isInAppWebview('Mozilla/5.0 (Linux; Android 13; wv) Chrome/120.0')).toBe(true)
  })

  it('detects WeChat (MicroMessenger)', () => {
    expect(isInAppWebview('Mozilla/5.0 (iPhone) MicroMessenger/8.0')).toBe(true)
  })

  it('returns false for normal Chrome', () => {
    expect(isInAppWebview(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36',
    )).toBe(false)
  })
})

describe('getBrowserInfo', () => {
  it('returns family + isInAppWebview + uaShort', () => {
    const info = getBrowserInfo(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    )
    expect(info.family).toBe('chrome')
    expect(info.isInAppWebview).toBe(false)
    expect(info.uaShort.length).toBeLessThanOrEqual(100)
    expect(info.uaShort).toContain('Chrome/120.0')
  })

  it('truncates uaShort to 100 chars', () => {
    const longUa = 'x'.repeat(500)
    const info = getBrowserInfo(longUa)
    expect(info.uaShort.length).toBe(100)
  })

  it('reads navigator.userAgent when called with no argument', () => {
    const info = getBrowserInfo()
    expect(typeof info.family).toBe('string')
    expect(typeof info.isInAppWebview).toBe('boolean')
    expect(typeof info.uaShort).toBe('string')
  })
})
```

- [ ] **Step 1.2 — Run the test, watch it fail**

```
npx vitest run src/__tests__/utils/browser-info.test.ts
```

Expected: FAIL with `Cannot find module '@/utils/browser-info'`.

- [ ] **Step 1.3 — Implement**

Create `src/utils/browser-info.ts`:

```ts
export type BrowserFamily = 'chrome' | 'safari' | 'firefox' | 'edge' | 'other'

export interface BrowserInfo {
  family: BrowserFamily
  isInAppWebview: boolean
  uaShort: string
}

export function detectBrowserFamily(ua: string): BrowserFamily {
  if (!ua) return 'other'
  // Order matters: Edge identifies itself as Chrome via Chromium; check Edge first.
  if (/\bEdg\//.test(ua)) return 'edge'
  if (/\bFirefox\//.test(ua)) return 'firefox'
  if (/\bChrome\//.test(ua)) return 'chrome'
  // Safari UA includes "Safari/..." but so do Chrome/Edge — must check after them.
  if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) return 'safari'
  return 'other'
}

const IN_APP_PATTERNS = [
  /FBAN\//,           // Facebook
  /FBAV\//,           // Facebook (variant)
  /Instagram/,        // Instagram
  /\bLine\//,         // Line
  /MicroMessenger/,   // WeChat
  /; wv\)/,           // Android WebView marker
  /TwitterAndroid/,   // X / Twitter
]

export function isInAppWebview(ua: string): boolean {
  return IN_APP_PATTERNS.some((re) => re.test(ua))
}

export function getBrowserInfo(ua?: string): BrowserInfo {
  const effective = ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  return {
    family: detectBrowserFamily(effective),
    isInAppWebview: isInAppWebview(effective),
    uaShort: effective.slice(0, 100),
  }
}
```

- [ ] **Step 1.4 — Re-run the test, watch it pass**

```
npx vitest run src/__tests__/utils/browser-info.test.ts
```

Expected: PASS, all assertions green.

- [ ] **Step 1.5 — Type check + lint**

```
npm run type-check
npm run lint
```

Expected: both clean.

- [ ] **Step 1.6 — Commit**

```bash
git add src/utils/browser-info.ts src/__tests__/utils/browser-info.test.ts
git commit -m "feat(utils): add browser-info UA detection helper"
```

---

## Task 2 — `milestones` store

**Files:**
- Create: `src/stores/milestones.ts`
- Create: `src/__tests__/stores/milestones.test.ts`

- [ ] **Step 2.1 — Write the failing test**

Create `src/__tests__/stores/milestones.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/analytics', () => ({
  trackEvent: vi.fn(),
}))

import { trackEvent } from '@/utils/analytics'
import { useMilestonesStore, type OnboardingMilestone } from '@/stores/milestones'

const STORAGE_KEY = 'ff14ch.onboarding-milestones'

describe('useMilestonesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.mocked(trackEvent).mockClear()
  })

  it('hasMilestone returns false on fresh state', () => {
    const store = useMilestonesStore()
    expect(store.hasMilestone('viewed_recipe')).toBe(false)
  })

  it('markMilestoneOnce sends trackEvent + persists', () => {
    const store = useMilestonesStore()
    store.markMilestoneOnce('viewed_recipe')

    expect(trackEvent).toHaveBeenCalledOnce()
    expect(trackEvent).toHaveBeenCalledWith('first_session_milestone', { step: 'viewed_recipe' })
    expect(store.hasMilestone('viewed_recipe')).toBe(true)

    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as string[]
    expect(parsed).toContain('viewed_recipe')
  })

  it('markMilestoneOnce is idempotent — second call is a no-op', () => {
    const store = useMilestonesStore()
    store.markMilestoneOnce('ran_solver')
    store.markMilestoneOnce('ran_solver')

    expect(trackEvent).toHaveBeenCalledOnce()
  })

  it('restores prior milestones from localStorage on init', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['used_batch']))

    const store = useMilestonesStore()
    expect(store.hasMilestone('used_batch')).toBe(true)
    expect(store.hasMilestone('viewed_recipe')).toBe(false)
  })

  it('does not throw if localStorage write fails', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    const store = useMilestonesStore()
    expect(() => store.markMilestoneOnce('saw_macro')).not.toThrow()
    expect(trackEvent).toHaveBeenCalledWith('first_session_milestone', { step: 'saw_macro' })

    setItemSpy.mockRestore()
  })

  it('does not throw if existing localStorage payload is corrupted', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')
    expect(() => useMilestonesStore()).not.toThrow()
  })

  it('ignores unknown values in persisted payload', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['used_batch', 'bogus_step']))

    const store = useMilestonesStore()
    expect(store.hasMilestone('used_batch')).toBe(true)
    // Bogus values don't pollute state — they're filtered on read.
  })

  it('all four milestone steps are independent', () => {
    const store = useMilestonesStore()
    const steps: OnboardingMilestone[] = ['viewed_recipe', 'ran_solver', 'saw_macro', 'used_batch']
    for (const step of steps) {
      expect(store.hasMilestone(step)).toBe(false)
      store.markMilestoneOnce(step)
      expect(store.hasMilestone(step)).toBe(true)
    }
    expect(trackEvent).toHaveBeenCalledTimes(4)
  })
})
```

- [ ] **Step 2.2 — Run the test, watch it fail**

```
npx vitest run src/__tests__/stores/milestones.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 2.3 — Implement**

Create `src/stores/milestones.ts`:

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { trackEvent } from '@/utils/analytics'

export type OnboardingMilestone =
  | 'viewed_recipe'
  | 'ran_solver'
  | 'saw_macro'
  | 'used_batch'

const ALL_STEPS: readonly OnboardingMilestone[] =
  ['viewed_recipe', 'ran_solver', 'saw_macro', 'used_batch']

const STORAGE_KEY = 'ff14ch.onboarding-milestones'

function readInitial(): Set<OnboardingMilestone> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((s): s is OnboardingMilestone =>
        ALL_STEPS.includes(s as OnboardingMilestone),
      ))
    }
  } catch {
    // Corrupted JSON / blocked localStorage — fall through.
  }
  return new Set()
}

function persist(state: Set<OnboardingMilestone>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...state]))
  } catch {
    // Quota exceeded / private mode — non-critical; event already fired.
  }
}

export const useMilestonesStore = defineStore('milestones', () => {
  const reached = ref<Set<OnboardingMilestone>>(readInitial())

  function hasMilestone(step: OnboardingMilestone): boolean {
    return reached.value.has(step)
  }

  function markMilestoneOnce(step: OnboardingMilestone): void {
    if (reached.value.has(step)) return
    reached.value = new Set(reached.value).add(step)
    persist(reached.value)
    trackEvent('first_session_milestone', { step })
  }

  return { hasMilestone, markMilestoneOnce }
})
```

- [ ] **Step 2.4 — Run the test, watch it pass**

```
npx vitest run src/__tests__/stores/milestones.test.ts
```

Expected: PASS — all 8 tests green.

- [ ] **Step 2.5 — Type check + lint**

```
npm run type-check
npm run lint
```

Expected: both clean.

- [ ] **Step 2.6 — Commit**

```bash
git add src/stores/milestones.ts src/__tests__/stores/milestones.test.ts
git commit -m "feat(stores): add milestones store for onboarding funnel"
```

---

## Task 3 — Augment `sab_unavailable` with browser info

**Files:**
- Modify: `src/main.ts:55-63`

- [ ] **Step 3.1 — Locate the current canary block**

Open `src/main.ts`. The current SAB canary block (around lines 55-63) sends `trackEvent('sab_unavailable')` with no payload.

- [ ] **Step 3.2 — Augment the event payload**

Replace the block:

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

with:

```ts
// Canary: GitHub Pages COOP/COEP headers should keep us isolated. If they
// break, this scorecard in C section will start firing and we notice fast.
if (typeof crossOriginIsolated === 'boolean' && !crossOriginIsolated) {
  const SAB_KEY = 'ff14ch.sab_unavailable_sent'
  if (!sessionStorage.getItem(SAB_KEY)) {
    Promise.all([
      import('@/utils/analytics'),
      import('@/utils/browser-info'),
    ]).then(([{ trackEvent }, { getBrowserInfo }]) => {
      const info = getBrowserInfo()
      trackEvent('sab_unavailable', {
        browser_family: info.family,
        is_in_app_webview: info.isInAppWebview,
        ua_short: info.uaShort,
      })
      sessionStorage.setItem(SAB_KEY, '1')
    })
  }
}
```

- [ ] **Step 3.3 — Type check + lint + tests**

```
npm run type-check
npm run lint
npm test
```

Expected: all clean. No new tests for this — `main.ts` integration; covered by `browser-info` unit tests.

- [ ] **Step 3.4 — Commit**

```bash
git add src/main.ts
git commit -m "feat(analytics): augment sab_unavailable with browser info"
```

---

## Task 4 — `bom_item_check` event

**Files:**
- Modify: `src/stores/bom.ts:906-910` (function `toggleChecked`)
- Modify: `src/__tests__/stores/bom.test.ts`

- [ ] **Step 4.1 — Write the failing test**

Open `src/__tests__/stores/bom.test.ts`. Find the existing setup pattern and add a new test block. If `trackEvent` is not already mocked at the top of the file, add this near the imports:

```ts
vi.mock('@/utils/analytics', async () => {
  const actual = await vi.importActual<typeof import('@/utils/analytics')>('@/utils/analytics')
  return { ...actual, trackEvent: vi.fn(), trackError: vi.fn() }
})
import { trackEvent } from '@/utils/analytics'
```

Then add this test (use whatever `describe` / `beforeEach` structure already exists in the file; insert as a new `describe` block):

```ts
describe('toggleChecked tracking', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(trackEvent).mockClear()
  })

  it('emits bom_item_check on first check (checked=true)', () => {
    const bom = useBomStore()
    bom.toggleChecked(12345)
    expect(trackEvent).toHaveBeenCalledWith('bom_item_check', { item_id: 12345, checked: true })
  })

  it('emits bom_item_check with checked=false on second toggle', () => {
    const bom = useBomStore()
    bom.toggleChecked(12345)
    vi.mocked(trackEvent).mockClear()
    bom.toggleChecked(12345)
    expect(trackEvent).toHaveBeenCalledWith('bom_item_check', { item_id: 12345, checked: false })
  })
})
```

- [ ] **Step 4.2 — Run the test, watch it fail**

```
npx vitest run src/__tests__/stores/bom.test.ts -t 'toggleChecked tracking'
```

Expected: FAIL — `trackEvent` not called.

- [ ] **Step 4.3 — Implement**

Open `src/stores/bom.ts`. Find `function toggleChecked(itemId: number)` (around line 906). Modify:

```ts
function toggleChecked(itemId: number) {
  const next = new Set(routeViewSession.value.checked)
  const willBeChecked = !next.has(itemId)
  if (willBeChecked) next.add(itemId); else next.delete(itemId)
  routeViewSession.value = { ...routeViewSession.value, checked: next }
  trackEvent('bom_item_check', { item_id: itemId, checked: willBeChecked })
}
```

Note: `trackEvent` should already be imported at the top of `bom.ts` (existing `bom_*_set` events use it). Verify the import is present; add if missing:

```ts
import { trackEvent } from '@/utils/analytics'
```

- [ ] **Step 4.4 — Run the test, watch it pass**

```
npx vitest run src/__tests__/stores/bom.test.ts -t 'toggleChecked tracking'
```

Expected: PASS.

- [ ] **Step 4.5 — Run the full bom suite to catch regressions**

```
npx vitest run src/__tests__/stores/bom.test.ts
```

Expected: all bom tests pass.

- [ ] **Step 4.6 — Commit**

```bash
git add src/stores/bom.ts src/__tests__/stores/bom.test.ts
git commit -m "feat(analytics): bom_item_check event on toggleChecked"
```

---

## Task 5 — `bom_breakdown_expand` event

**Files:**
- Modify: `src/stores/bom.ts:712-719` (function `toggleRowExpanded`)
- Modify: `src/__tests__/stores/bom.test.ts`

> **Deviation from spec:** spec listed `BomDecisionRow` + `RoutePlannerGroupCard` with a `source` param. `RoutePlannerGroupCard.toggleCollapse` operates on zone groups (not items), so it doesn't fit the event's intent. We hook at the single chokepoint (`toggleRowExpanded` in the store) and **drop the `source` param**.

- [ ] **Step 5.1 — Write the failing test**

Add to `src/__tests__/stores/bom.test.ts` (alongside the test from Task 4):

```ts
describe('toggleRowExpanded tracking', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(trackEvent).mockClear()
  })

  it('emits bom_breakdown_expand on first expand of an item', () => {
    const bom = useBomStore()
    bom.toggleRowExpanded(7777)
    expect(trackEvent).toHaveBeenCalledWith('bom_breakdown_expand', { item_id: 7777 })
  })

  it('does not re-emit on collapse + same-session re-expand of the same item', () => {
    const bom = useBomStore()
    bom.toggleRowExpanded(7777) // expand → emit
    bom.toggleRowExpanded(7777) // collapse → no emit
    bom.toggleRowExpanded(7777) // expand again → no emit (session dedupe)
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })

  it('emits for different item_ids independently in the same session', () => {
    const bom = useBomStore()
    bom.toggleRowExpanded(1)
    bom.toggleRowExpanded(2)
    expect(trackEvent).toHaveBeenCalledTimes(2)
    expect(trackEvent).toHaveBeenNthCalledWith(1, 'bom_breakdown_expand', { item_id: 1 })
    expect(trackEvent).toHaveBeenNthCalledWith(2, 'bom_breakdown_expand', { item_id: 2 })
  })
})
```

- [ ] **Step 5.2 — Run the test, watch it fail**

```
npx vitest run src/__tests__/stores/bom.test.ts -t 'toggleRowExpanded tracking'
```

Expected: FAIL.

- [ ] **Step 5.3 — Implement**

In `src/stores/bom.ts`, inside the `defineStore` setup function (alongside `expandedRows`), add the session dedupe Set:

```ts
// Session dedupe for `bom_breakdown_expand` — same item should only fire
// the event once per store lifetime, even if the user collapses + re-expands.
// Lives inside the store setup so `setActivePinia(createPinia())` in tests
// resets it automatically; no test-only export needed.
const trackedExpands = new Set<number>()
```

Then modify `toggleRowExpanded`:

```ts
function toggleRowExpanded(itemId: number) {
  const willBeExpanded = !expandedRows.value.has(itemId)
  if (willBeExpanded) {
    expandedRows.value.add(itemId)
    if (!trackedExpands.has(itemId)) {
      trackedExpands.add(itemId)
      trackEvent('bom_breakdown_expand', { item_id: itemId })
    }
  } else {
    expandedRows.value.delete(itemId)
  }
  expandedRows.value = new Set(expandedRows.value)
}
```

`trackedExpands` does NOT need to be exposed in the store's return statement — it's internal state.

- [ ] **Step 5.4 — Run the test, watch it pass**

```
npx vitest run src/__tests__/stores/bom.test.ts -t 'toggleRowExpanded tracking'
```

Expected: PASS.

- [ ] **Step 5.5 — Run the full bom suite**

```
npx vitest run src/__tests__/stores/bom.test.ts
```

Expected: all pass.

- [ ] **Step 5.6 — Commit**

```bash
git add src/stores/bom.ts src/__tests__/stores/bom.test.ts
git commit -m "feat(analytics): bom_breakdown_expand event on first item drill-down"
```

---

## Task 6 — `bom_copy_list` event

**Files:**
- Modify: `src/components/bom/BomTotalsBar.vue` (`copyTeamcraftUrl`, `copyMaterialsMarkdown`)
- Modify: `src/components/bom/BomTotalsReceipt.vue` (same two functions)

> No tests added — these are thin UI wrappers calling existing helpers; trackEvent assertions at this layer would be redundant with the store-level tests in other tasks. The integration is small and visually verifiable via GA Realtime.

- [ ] **Step 6.1 — Add import + tracking to `BomTotalsBar.vue`**

Open `src/components/bom/BomTotalsBar.vue`. Ensure `trackEvent` is imported at the top of `<script setup>`:

```ts
import { trackEvent } from '@/utils/analytics'
```

Modify `copyTeamcraftUrl`:

```ts
async function copyTeamcraftUrl() {
  if (bom.targets.length === 0) {
    ElMessage.warning('清單為空')
    return
  }
  const url = buildTeamcraftImportUrl(
    bom.targets.map((t) => ({ itemId: t.itemId, recipeId: t.kind === 'recipe' ? t.recipeId : null, qty: t.quantity })),
  )
  trackEvent('bom_copy_list', { format: 'teamcraft', target_count: bom.targets.length })
  await copyToClipboard(url, '已複製 Teamcraft 連結')
}
```

Modify `copyMaterialsMarkdown`:

```ts
async function copyMaterialsMarkdown() {
  if (bom.flatMaterials.length === 0) {
    ElMessage.warning('還沒計算材料，先按「計算」')
    return
  }
  const lines: string[] = []
  for (const m of bom.flatMaterials) lines.push(`- ×${m.totalAmount} ${m.name}`)
  trackEvent('bom_copy_list', { format: 'markdown', target_count: bom.targets.length })
  await copyToClipboard(lines.join('\n'), '已複製材料清單 (Markdown)')
}
```

- [ ] **Step 6.2 — Repeat in `BomTotalsReceipt.vue`**

Open `src/components/bom/BomTotalsReceipt.vue`. Same import + same two function changes — copy verbatim from Step 6.1.

- [ ] **Step 6.3 — Type check + lint + run full test suite**

```
npm run type-check
npm run lint
npm test
```

Expected: all clean. No new tests added in this task; verify no existing tests for these components broke.

- [ ] **Step 6.4 — Commit**

```bash
git add src/components/bom/BomTotalsBar.vue src/components/bom/BomTotalsReceipt.vue
git commit -m "feat(analytics): bom_copy_list event on teamcraft/markdown copy"
```

---

## Task 7 — `aetheryte_tp_copy` event

**Files:**
- Modify: `src/components/bom/BomAcquisitionDetail.vue` (`copyTp`)
- Modify: `src/components/bom/ZoneMapSheet.vue` (`copyTp`)
- Modify: `src/components/batch/NpcShoppingGroup.vue` (`copyTp`)

- [ ] **Step 7.1 — `BomAcquisitionDetail.vue`**

Open the file. Verify `trackEvent` is imported in `<script setup>` (add if missing):

```ts
import { trackEvent } from '@/utils/analytics'
```

Modify `copyTp`:

```ts
async function copyTp(aetheryteName: string) {
  try {
    await navigator.clipboard.writeText(`/tp ${aetheryteName}`)
    trackEvent('aetheryte_tp_copy', { source: 'bom_detail' })
    ElMessage({ message: `已複製：/tp ${aetheryteName}`, type: 'success', duration: 2000 })
  } catch {
    ElMessage({ message: '複製失敗', type: 'error', duration: 2000 })
  }
}
```

- [ ] **Step 7.2 — `ZoneMapSheet.vue`**

Same import; modify `copyTp`:

```ts
async function copyTp() {
  if (!props.aetheryteName) return
  try {
    await navigator.clipboard.writeText(buildTpCommand(props.aetheryteName))
    trackEvent('aetheryte_tp_copy', { source: 'zone_map' })
    ElMessage({ message: `已複製：/tp ${props.aetheryteName}`, type: 'success', duration: 1500 })
  } catch {
    ElMessage({ message: '複製失敗', type: 'error', duration: 1500 })
  }
}
```

- [ ] **Step 7.3 — `NpcShoppingGroup.vue`**

Same import; modify `copyTp`:

```ts
async function copyTp() {
  if (!aetheryteName.value) {
    ElMessage({ message: '此 NPC 附近沒有傳送點資料', type: 'info', duration: 1500 })
    return
  }
  try {
    await navigator.clipboard.writeText(buildTpCommand(aetheryteName.value))
    trackEvent('aetheryte_tp_copy', { source: 'npc_shop' })
    ElMessage({
      message: `已複製：/tp ${aetheryteName.value}`,
      type: 'success',
      duration: 1500,
    })
  } catch {
    ElMessage({ message: '複製失敗', type: 'error', duration: 1500 })
  }
}
```

- [ ] **Step 7.4 — Type check + lint + tests**

```
npm run type-check
npm run lint
npm test
```

Expected: clean.

- [ ] **Step 7.5 — Commit**

```bash
git add src/components/bom/BomAcquisitionDetail.vue src/components/bom/ZoneMapSheet.vue src/components/batch/NpcShoppingGroup.vue
git commit -m "feat(analytics): aetheryte_tp_copy event with source attribution"
```

---

## Task 8 — `solver_macro_copy` + `saw_macro` milestone

**Files:**
- Modify: `src/components/simulator/MacroExport.vue`

- [ ] **Step 8.1 — Add imports**

Open `src/components/simulator/MacroExport.vue`. At the top of `<script setup>`, add:

```ts
import { watch } from 'vue'
import { trackEvent } from '@/utils/analytics'
import { useMilestonesStore } from '@/stores/milestones'
```

(`watch` may already be imported as part of the existing `{ ref, computed }` import line — combine if so.)

In the script body, after the existing `const simStore = useSimulatorStore()` line, add:

```ts
const milestones = useMilestonesStore()
```

- [ ] **Step 8.2 — Wire `saw_macro` milestone**

Add a watcher right after the existing `macros` computed. Skip `{ immediate: true }` — on mount, `macros.value.length` is 0 until the user runs the solver, so the immediate fire would be a no-op anyway:

```ts
watch(
  () => macros.value.length,
  (count) => {
    if (count > 0) milestones.markMilestoneOnce('saw_macro')
  },
)
```

- [ ] **Step 8.3 — Track macro copy**

Modify `copyMacro`:

```ts
async function copyMacro(text: string, index: number) {
  try {
    await navigator.clipboard.writeText(text)
    trackEvent('solver_macro_copy', {
      macro_index: index,
      total_macros: macros.value.length,
      action_count: simStore.actions.length,
      wait_time: waitTime.value,
      include_echo: includeEcho.value,
    })
    ElMessage.success(`巨集 ${index + 1} 已複製`)
  } catch {
    ElMessage.error('複製失敗，請手動複製')
  }
}
```

- [ ] **Step 8.4 — Type check + lint + tests**

```
npm run type-check
npm run lint
npm test
```

Expected: clean.

- [ ] **Step 8.5 — Commit**

```bash
git add src/components/simulator/MacroExport.vue
git commit -m "feat(analytics): solver_macro_copy event + saw_macro milestone"
```

---

## Task 9 — `solver_rerun` event

**Files:**
- Modify: `src/solver/worker.ts` (around line 184-194)

- [ ] **Step 9.1 — Add fingerprint counter**

Open `src/solver/worker.ts`. Near the other module-level state (around the imports / file-top), add:

```ts
// Tab-session rerun counter: keyed by input fingerprint so we can flag
// "user tried the same config 2+ times in a row". Cleared on page reload.
const solverRerunCounts = new Map<string, number>()

function solverInputFingerprint(config: SolverConfig): string {
  return [
    config.crafter_level,
    config.recipe_level,
    config.craftsmanship,
    config.control,
    config.cp,
    config.hq_target,
  ].join('|')
}
```

If `SolverConfig` is not imported in this file (it should be — the existing `solveCraft(config: SolverConfig, ...)` uses it), no import change needed. Verify.

- [ ] **Step 9.2 — Emit `solver_rerun` in `solveCraft`**

Modify the start of `solveCraft` (around line 184-194):

```ts
export function solveCraft(
  config: SolverConfig,
  onProgress?: (percent: number) => void,
): Promise<SolverResultWithTiming> {
  const requestId = nextRequestId++
  const startedAt = performance.now()
  const fp = solverInputFingerprint(config)
  const prevRunCount = solverRerunCounts.get(fp) ?? 0
  const runIndex = prevRunCount + 1
  solverRerunCounts.set(fp, runIndex)

  trackEvent('solver_start', {
    crafter_level: config.crafter_level, recipe_level: config.recipe_level,
    hq_target: config.hq_target,
    gear_bucket: classifyGearBucket(config.crafter_level, config.craftsmanship, config.control),
  })
  if (runIndex >= 2) {
    trackEvent('solver_rerun', { run_index: runIndex })
  }
  return new Promise<SolverResultWithTiming>((resolve, reject) => {
    // ... rest unchanged
```

- [ ] **Step 9.3 — Type check + lint + tests**

```
npm run type-check
npm run lint
npm test
```

Expected: clean. Worker tests in `src/__tests__/solver/worker-pool.test.ts` should still pass.

- [ ] **Step 9.4 — Commit**

```bash
git add src/solver/worker.ts
git commit -m "feat(analytics): solver_rerun event on repeated same-input solve"
```

---

## Task 10 — `solver_input_change_after_fail` event

**Files:**
- Create: `src/composables/useSolverFailState.ts` (small module holding the post-fail flag)
- Modify: `src/solver/worker.ts` (signal failure via the composable)
- Create: `src/composables/useSolverInputAudit.ts` (watcher composable)
- Modify: `src/views/SimulatorView.vue` (mount the audit)

- [ ] **Step 10.1 — Field scope decision**

Solver inputs that are actually user-editable:

| Field | Source |
|---|---|
| `crafter_level` | `gearsetsStore.gearsets[currentJob].level` |
| `craftsmanship` | `gearsetsStore.gearsets[currentJob].craftsmanship` |
| `control` | `gearsetsStore.gearsets[currentJob].control` |
| `cp` | `gearsetsStore.gearsets[currentJob].cp` |
| `recipe` | `recipeStore.currentRecipe?.id` |

> **`hq_target` is excluded** — it's derived at solve time (`rlt.quality > 0` in `SolverPanel.vue:74`), not a user-toggleable input. Don't watch it.

The "current job" is `recipeStore.currentRecipe?.job`. The watched gearset stats must follow whichever job is currently active.

- [ ] **Step 10.2 — Create the fail-state composable**

Create `src/composables/useSolverFailState.ts`:

```ts
// Tracks the timestamp of the most recent solver failure so that
// `useSolverInputAudit` can detect "user edited input within 60s of failing".
// Module-private state — only the helpers below are public.

let failedAt: number | null = null

export function noteSolverFailed(): void {
  failedAt = Date.now()
}

export function consumeRecentFailure(windowMs: number): boolean {
  if (failedAt === null) return false
  const recent = Date.now() - failedAt <= windowMs
  failedAt = null
  return recent
}
```

- [ ] **Step 10.3 — Signal failure from `worker.ts`**

Open `src/solver/worker.ts`. At the top, add:

```ts
import { noteSolverFailed } from '@/composables/useSolverFailState'
```

Modify the existing `reject` callback in `solveCraft`:

```ts
reject: (err: Error) => {
  trackEvent('solver_failed', { reason: err.message })
  trackError(`solver_failed: ${err.message}`)
  noteSolverFailed()
  reject(err)
},
```

- [ ] **Step 10.4 — Create the audit composable**

Create `src/composables/useSolverInputAudit.ts`:

```ts
import { watch, type Ref } from 'vue'
import { trackEvent } from '@/utils/analytics'
import { consumeRecentFailure } from '@/composables/useSolverFailState'

const FAIL_WINDOW_MS = 60_000

type Field =
  | 'crafter_level'
  | 'craftsmanship'
  | 'control'
  | 'cp'
  | 'recipe'

export interface SolverInputs {
  crafterLevel: Ref<number | undefined>
  craftsmanship: Ref<number | undefined>
  control: Ref<number | undefined>
  cp: Ref<number | undefined>
  recipeId: Ref<number | null | undefined>
}

export function useSolverInputAudit(inputs: SolverInputs): void {
  function tryEmit(field: Field): void {
    if (!consumeRecentFailure(FAIL_WINDOW_MS)) return
    trackEvent('solver_input_change_after_fail', { field })
  }

  watch(inputs.crafterLevel, () => tryEmit('crafter_level'))
  watch(inputs.craftsmanship, () => tryEmit('craftsmanship'))
  watch(inputs.control, () => tryEmit('control'))
  watch(inputs.cp, () => tryEmit('cp'))
  watch(inputs.recipeId, () => tryEmit('recipe'))
}
```

- [ ] **Step 10.5 — Call the composable from `SimulatorView.vue`**

Open `src/views/SimulatorView.vue` (the view that owns recipe + gearset reactive state). At the top of `<script setup>`, add imports:

```ts
import { computed } from 'vue'
import { useSolverInputAudit } from '@/composables/useSolverInputAudit'
import { useGearsetsStore } from '@/stores/gearsets'
import { useRecipeStore } from '@/stores/recipe'
```

(Some imports may already exist — merge into existing lines.)

Below the existing store setup, add:

```ts
const gearsetsStore = useGearsetsStore()
const recipeStore = useRecipeStore()

// Resolve the active job from the current recipe, then read that job's
// gearset stats. The composable receives reactive refs — when either the
// recipe job or the gearset map mutates, the computed re-evaluates.
const activeJob = computed(() => recipeStore.currentRecipe?.job ?? null)
const activeGearset = computed(() => {
  const job = activeJob.value
  if (!job) return null
  return gearsetsStore.gearsets[job] ?? null
})

useSolverInputAudit({
  crafterLevel: computed(() => activeGearset.value?.level),
  craftsmanship: computed(() => activeGearset.value?.craftsmanship),
  control: computed(() => activeGearset.value?.control),
  cp: computed(() => activeGearset.value?.cp),
  recipeId: computed(() => recipeStore.currentRecipe?.id ?? null),
})
```

> **If `SimulatorView.vue` is not the right scope** (e.g., the user can also edit gearset stats outside it), you may need to host the composable on `App.vue` or a router-level guard. Verify by checking where gearset editing UI lives — if it's only inside `/simulator`, `SimulatorView.vue` is correct.

- [ ] **Step 10.6 — Type check + lint + tests**

```
npm run type-check
npm run lint
npm test
```

Expected: clean.

- [ ] **Step 10.7 — Commit**

```bash
git add src/solver/worker.ts \
        src/composables/useSolverFailState.ts \
        src/composables/useSolverInputAudit.ts \
        src/views/SimulatorView.vue
git commit -m "feat(analytics): solver_input_change_after_fail event (60s window)"
```

---

## Task 11 — Wire remaining onboarding milestones

**Files:**
- Modify: `src/stores/recipe.ts` (`setRecipe` — `viewed_recipe`)
- Modify: `src/components/simulator/SolverPanel.vue` (call site of `solveCraft` — `ran_solver`)
- Modify: `src/views/BatchView.vue` (`runOptimization` — `used_batch`)

`saw_macro` was already wired in Task 8. This task wires the other three.

> **Why `ran_solver` lives in `SolverPanel.vue`, not `worker.ts`**: `solveCraft` is also called from `batch-optimizer.ts` (per-recipe loop, not a user-initiated solve) and `buff-recommender.ts` (internal). Firing the milestone in `worker.ts` would count those as "user ran the solver" — wrong. The user-initiated entry point is `SolverPanel.vue:93`. Also, putting Pinia calls in `worker.ts` (which is a dispatcher module) couples it to the Vue app's store graph unnecessarily.

- [ ] **Step 11.1 — `viewed_recipe` in `recipe.ts`**

Open `src/stores/recipe.ts`. Add the milestones store import at the top:

```ts
import { useMilestonesStore } from '@/stores/milestones'
```

Modify `setRecipe`:

```ts
function setRecipe(recipe: Recipe) {
  currentRecipe.value = recipe
  trackEvent('recipe_select', {
    recipe_id: recipe.id,
    job: recipe.job,
    level: recipe.level,
  })
  useMilestonesStore().markMilestoneOnce('viewed_recipe')
}
```

> `useMilestonesStore()` is called inside the function body (not at module-top) so the cross-store call happens at mutation time, when Pinia is guaranteed active.

- [ ] **Step 11.2 — `ran_solver` in `SolverPanel.vue`**

Open `src/components/simulator/SolverPanel.vue`. Find the `solveCraft(config, ...)` call (around line 93). Add the import at the top of `<script setup>`:

```ts
import { useMilestonesStore } from '@/stores/milestones'
```

In the script body, add (alongside the other store inits):

```ts
const milestones = useMilestonesStore()
```

Then, right BEFORE the `const result = await solveCraft(config, ...)` call:

```ts
milestones.markMilestoneOnce('ran_solver')
const result = await solveCraft(config, (percent) => {
  // ... existing body
})
```

- [ ] **Step 11.3 — `used_batch` in `BatchView.vue`**

Open `src/views/BatchView.vue`. Find the `trackEvent('batch_optimization_start', ...)` call (around line 236). Add the import at the top:

```ts
import { useMilestonesStore } from '@/stores/milestones'
```

Below the existing `trackEvent('batch_optimization_start', ...)` call:

```ts
trackEvent('batch_optimization_start', {
  target_count: batchStore.targets.length,
  total_quantity: batchStore.targets.reduce((sum, t) => sum + t.quantity, 0),
  calc_mode: batchStore.calcMode,
  cross_server: settings.crossServer,
})
useMilestonesStore().markMilestoneOnce('used_batch')
```

- [ ] **Step 11.4 — Type check + lint + tests**

```
npm run type-check
npm run lint
npm test
```

Expected: clean. The existing `useRecipeStore` test (`src/__tests__/stores/recipe-queue.test.ts`) may need the analytics mock updated — if `trackEvent` was previously not mocked there and now `setRecipe` calls `markMilestoneOnce` which uses `trackEvent`, the test environment must tolerate it. Add the standard mock at the top of `recipe-queue.test.ts` if missing:

```ts
vi.mock('@/utils/analytics', () => ({
  trackEvent: vi.fn(),
  trackError: vi.fn(),
  trackPageView: vi.fn(),
}))
```

- [ ] **Step 11.5 — Commit**

```bash
git add src/stores/recipe.ts \
        src/components/simulator/SolverPanel.vue \
        src/views/BatchView.vue \
        src/__tests__/stores/recipe-queue.test.ts
git commit -m "feat(analytics): wire viewed_recipe/ran_solver/used_batch milestones"
```

---

## Task 12 — `settings_change` event (refactor settings store + locale)

**Files:**
- Create: `src/utils/settings-change.ts` (helper)
- Create: `src/__tests__/utils/settings-change.test.ts`
- Modify: `src/stores/settings.ts` (add explicit setters)
- Modify: `src/stores/locale.ts` (`setLocale` emits)
- Modify: `src/views/SettingsView.vue` (`autoSave` uses setters)
- Modify: `src/__tests__/stores/settings.test.ts` (update direct-assignment test → setter pattern)

- [ ] **Step 12.1 — Write the failing helper test**

Create `src/__tests__/utils/settings-change.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/analytics', () => ({ trackEvent: vi.fn() }))

import { trackEvent } from '@/utils/analytics'
import { emitSettingsChange } from '@/utils/settings-change'

describe('emitSettingsChange', () => {
  beforeEach(() => {
    vi.mocked(trackEvent).mockClear()
  })

  it('emits settings_change with stringified prev/next', () => {
    emitSettingsChange('region', '', '繁中服')
    expect(trackEvent).toHaveBeenCalledWith('settings_change', {
      key: 'region',
      prev: '',
      value: '繁中服',
    })
  })

  it('stringifies booleans', () => {
    emitSettingsChange('cross_server', true, false)
    expect(trackEvent).toHaveBeenCalledWith('settings_change', {
      key: 'cross_server',
      prev: 'true',
      value: 'false',
    })
  })

  it('stringifies numbers', () => {
    emitSettingsChange('max_recursion_depth', 2, 5)
    expect(trackEvent).toHaveBeenCalledWith('settings_change', {
      key: 'max_recursion_depth',
      prev: '2',
      value: '5',
    })
  })

  it('handles null and undefined', () => {
    emitSettingsChange('region', null, undefined)
    expect(trackEvent).toHaveBeenCalledWith('settings_change', {
      key: 'region',
      prev: '',
      value: '',
    })
  })

  it('truncates strings longer than 100 chars', () => {
    const long = 'x'.repeat(500)
    emitSettingsChange('server', '', long)
    const call = vi.mocked(trackEvent).mock.calls[0][1] as Record<string, string>
    expect(call.value.length).toBe(100)
  })

  it('does not emit when prev === next', () => {
    emitSettingsChange('region', '繁中服', '繁中服')
    expect(trackEvent).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 12.2 — Run, watch it fail**

```
npx vitest run src/__tests__/utils/settings-change.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 12.3 — Implement helper**

Create `src/utils/settings-change.ts`:

```ts
import { trackEvent } from '@/utils/analytics'

export type SettingsKey =
  | 'server'
  | 'data_center'
  | 'region'
  | 'price_display_mode'
  | 'cross_server'
  | 'recursive_pricing'
  | 'max_recursion_depth'
  | 'exception_strategy'
  | 'raw_material_default'
  | 'language'

type SettingsValue = string | number | boolean | null | undefined

function stringify(value: SettingsValue): string {
  if (value === null || value === undefined) return ''
  return String(value).slice(0, 100)
}

export function emitSettingsChange(
  key: SettingsKey,
  prev: SettingsValue,
  next: SettingsValue,
): void {
  const prevStr = stringify(prev)
  const nextStr = stringify(next)
  if (prevStr === nextStr) return
  trackEvent('settings_change', { key, prev: prevStr, value: nextStr })
}
```

Why `SettingsKey` is a literal union: the GA schema for `settings_change` is small and known. Typing `key` as `string` invites silent typos that survive the build and corrupt the dashboard; a union makes them compile errors.

- [ ] **Step 12.4 — Run, watch it pass**

```
npx vitest run src/__tests__/utils/settings-change.test.ts
```

Expected: PASS.

- [ ] **Step 12.5 — Refactor `src/stores/settings.ts` to add setters**

Open `src/stores/settings.ts`. Replace the entire store body. The new shape adds setters for every persisted field; the bare refs remain readable, but writes go through setters:

```ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type { Locale } from '@/services/local-data-source.types'
import { emitSettingsChange } from '@/utils/settings-change'

export type PriceDisplayMode = 'nq' | 'hq' | 'minOf'

export const useSettingsStore = defineStore('settings', () => {
  const server = ref('')
  const dataCenter = ref('')
  const region = ref('')
  const priceDisplayMode = ref<PriceDisplayMode>('minOf')
  const crossServer = ref(true)
  const recursivePricing = ref(true)
  const maxRecursionDepth = ref(2)
  const exceptionStrategy = ref<'skip' | 'buy'>('buy')
  const rawMaterialDefault = ref<'buy' | 'gather'>('buy')

  const localeStore = useLocaleStore()
  const language = computed<Locale>({
    get: () => localeStore.current,
    set: (value: Locale) => { void localeStore.setLocale(value) },
  })

  function setServer(v: string) {
    const prev = server.value; if (prev === v) return
    server.value = v; emitSettingsChange('server', prev, v)
  }
  function setDataCenter(v: string) {
    const prev = dataCenter.value; if (prev === v) return
    dataCenter.value = v; emitSettingsChange('data_center', prev, v)
  }
  function setRegion(v: string) {
    const prev = region.value; if (prev === v) return
    region.value = v; emitSettingsChange('region', prev, v)
  }
  function setPriceDisplayMode(v: PriceDisplayMode) {
    const prev = priceDisplayMode.value; if (prev === v) return
    priceDisplayMode.value = v; emitSettingsChange('price_display_mode', prev, v)
  }
  function setCrossServer(v: boolean) {
    const prev = crossServer.value; if (prev === v) return
    crossServer.value = v; emitSettingsChange('cross_server', prev, v)
  }
  function setRecursivePricing(v: boolean) {
    const prev = recursivePricing.value; if (prev === v) return
    recursivePricing.value = v; emitSettingsChange('recursive_pricing', prev, v)
  }
  function setMaxRecursionDepth(v: number) {
    const prev = maxRecursionDepth.value; if (prev === v) return
    maxRecursionDepth.value = v; emitSettingsChange('max_recursion_depth', prev, v)
  }
  function setExceptionStrategy(v: 'skip' | 'buy') {
    const prev = exceptionStrategy.value; if (prev === v) return
    exceptionStrategy.value = v; emitSettingsChange('exception_strategy', prev, v)
  }
  function setRawMaterialDefault(v: 'buy' | 'gather') {
    const prev = rawMaterialDefault.value; if (prev === v) return
    rawMaterialDefault.value = v; emitSettingsChange('raw_material_default', prev, v)
  }

  return {
    server, dataCenter, region, language, priceDisplayMode, crossServer,
    recursivePricing, maxRecursionDepth, exceptionStrategy, rawMaterialDefault,
    setServer, setDataCenter, setRegion, setPriceDisplayMode, setCrossServer,
    setRecursivePricing, setMaxRecursionDepth, setExceptionStrategy, setRawMaterialDefault,
  }
}, {
  persist: {
    pick: [
      'server', 'dataCenter', 'region', 'priceDisplayMode',
      'crossServer', 'recursivePricing', 'maxRecursionDepth',
      'exceptionStrategy', 'rawMaterialDefault',
    ],
  },
})
```

Note: existing callers that do `store.foo = v` will still type-check because the refs are still exposed; **we don't enforce setter-only**. The audit point is that all *known* user-mutation sites (`SettingsView`, Batch settings dialogs if any) go through setters. Persistence rehydration writes to the underlying ref via `store.$patch()` (verified against `pinia-plugin-persistedstate`), bypassing setters — so no spurious `settings_change` events on hydration.

> **Cascade behavior**: in `SettingsView.vue`, picking a region cascades through three watchers (region → DC autoselect → server autoselect). Each setter that detects a real change emits one `settings_change`, so one user action can fire up to 3 events. This is intentional — they're genuinely three state changes the user caused. The setter's `if (prev === v) return` guard handles the no-op case (e.g., the server didn't actually need to change because the cascade settled to the same value).

- [ ] **Step 12.6 — Wire `locale.ts`**

Open `src/stores/locale.ts`. Add the import:

```ts
import { emitSettingsChange } from '@/utils/settings-change'
```

Modify `setLocale`:

```ts
async function setLocale(locale: Locale): Promise<void> {
  if (!(LOCALES as readonly string[]).includes(locale)) return
  const prev = current.value
  if (prev === locale) return
  current.value = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // ignore
  }
  emitSettingsChange('language', prev, locale)
  await localDataSource.setLocale(locale)
}
```

- [ ] **Step 12.7 — Update `SettingsView.vue` `autoSave`**

Open `src/views/SettingsView.vue`. Find `autoSave` (around line 124). Replace:

```ts
function autoSave() {
  settingsStore.setRegion(selectedRegion.value)
  settingsStore.setDataCenter(selectedDC.value)
  settingsStore.setServer(selectedServer.value)
  settingsStore.setPriceDisplayMode(selectedPriceMode.value)
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => ElMessage.success('設定已自動儲存'), 300)
}
```

> **Other call sites**: there may be additional places that mutate the store directly (e.g., a Batch settings dialog for `crossServer`, `recursivePricing`, etc.). Grep:
> `grep -rn 'settings\.\(crossServer\|recursivePricing\|maxRecursionDepth\|exceptionStrategy\|rawMaterialDefault\)\s*=' src/`
> For each match found, switch to the corresponding setter (`store.setCrossServer(v)`, etc.). Include the change in the commit.

- [ ] **Step 12.8 — Update `settings.test.ts`**

Open `src/__tests__/stores/settings.test.ts`. The "allows updating all settings" test currently writes via direct assignment. Add coverage that setters emit:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/analytics', () => ({ trackEvent: vi.fn() }))
import { trackEvent } from '@/utils/analytics'
import { useSettingsStore } from '@/stores/settings'

describe('useSettingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(trackEvent).mockClear()
  })

  it('defaults server/dataCenter/region to empty strings (for onboarding gate)', () => {
    const store = useSettingsStore()
    expect(store.server).toBe('')
    expect(store.dataCenter).toBe('')
    expect(store.region).toBe('')
  })

  it('defaults priceDisplayMode to minOf', () => {
    const store = useSettingsStore()
    expect(store.priceDisplayMode).toBe('minOf')
  })

  it('has default batch settings', () => {
    const store = useSettingsStore()
    expect(store.crossServer).toBe(true)
    expect(store.recursivePricing).toBe(true)
    expect(store.maxRecursionDepth).toBe(2)
    expect(store.exceptionStrategy).toBe('buy')
  })

  it('setter mutates the underlying ref', () => {
    const store = useSettingsStore()
    store.setServer('伊弗利特')
    store.setPriceDisplayMode('hq')
    expect(store.server).toBe('伊弗利特')
    expect(store.priceDisplayMode).toBe('hq')
  })

  it('setter emits settings_change', () => {
    const store = useSettingsStore()
    store.setRegion('繁中服')
    expect(trackEvent).toHaveBeenCalledWith('settings_change', {
      key: 'region',
      prev: '',
      value: '繁中服',
    })
  })

  it('setter is a no-op when value is unchanged', () => {
    const store = useSettingsStore()
    store.setServer('')           // already ''
    expect(trackEvent).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 12.9 — Run all of it**

```
npx vitest run src/__tests__/stores/settings.test.ts
npx vitest run src/__tests__/utils/settings-change.test.ts
npm run type-check
npm run lint
npm test
```

Expected: all green.

- [ ] **Step 12.10 — Commit**

```bash
git add src/utils/settings-change.ts \
        src/__tests__/utils/settings-change.test.ts \
        src/stores/settings.ts \
        src/stores/locale.ts \
        src/views/SettingsView.vue \
        src/__tests__/stores/settings.test.ts
# include any other files touched in Step 12.7 grep
git commit -m "feat(analytics): unified settings_change event with explicit setters"
```

---

## Final verification

After all 12 tasks land:

- [ ] **Full suite**

```
npm run type-check
npm run lint
npm test
```

All green.

- [ ] **Dev server smoke**

```
npm run dev
```

Open the app, click through:
1. Recipe search → select one (expect `recipe_select` + `first_session_milestone[viewed_recipe]` in GA Realtime)
2. Open Simulator, run solver (expect `solver_start` + `ran_solver` milestone; if same input run twice, also `solver_rerun`)
3. Macros panel: copy a macro (expect `solver_macro_copy` + `saw_macro` milestone)
4. BOM page: expand a row (expect `bom_breakdown_expand`), check an item (`bom_item_check`), copy a list (`bom_copy_list`)
5. Click any aetheryte chip (expect `aetheryte_tp_copy`)
6. Change a setting in `/settings` (expect `settings_change`)
7. Batch page: run optimization (`used_batch` milestone first time)

GA Realtime → Events should show every new event name accumulating.

- [ ] **Document the rollout**

This plan does NOT include a changelog entry. Add one to `src/views/ChangelogView.vue` only after merge to main, as a separate small commit, **before** tagging the release. (Per `CLAUDE.md`, the pre-commit hook blocks tags without a matching changelog entry.)

---

## Out of scope reminder

These were explicitly excluded by the spec and should NOT be added in this plan:

- SAB fallback UI (separate spec)
- GA dashboard updates (do after 2 weeks of data accumulation)
- `bom_target_change`, `solver_action_view_ms`, `landed`
- Cross-device onboarding sync
- BomTotals duplicate copy logic refactor

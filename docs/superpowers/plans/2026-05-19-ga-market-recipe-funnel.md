# GA Tracking 擴充 (Market Region + Recipe Taxonomy + Page Funnel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補上 market_region 切片、recipe taxonomy 維度、page funnel 與誤用頁面訊號、效能事件、6 個 user_properties — 共新增 11 個 event、擴充 4 個既有 event、加入 6 個 user_properties。

**Architecture:** 兩個新 util 集中邏輯（`recipe-taxonomy.ts` 純函式、`user-properties.ts` user_property 註冊 + market_region 推斷）。事件透過既有 `trackEvent`、user_properties 透過新增的 `gtag('set', 'user_properties', ...)` wrapper。誤用訊號用 composable hook 到 store mutators。所有 event payload 在 store/composable 層發送，component 端不直接 trackEvent（既有 pattern）。

**Tech Stack:** Vue 3 + Pinia + TypeScript + vitest。沿用 `2026-05-17-ga-tracking-expansion.md` 同樣的 `trackEvent`、mock pattern。

**Spec:** `docs/superpowers/specs/2026-05-19-ga-market-recipe-funnel-design.md`

**Depends on:** `2026-05-17-ga-tracking-expansion.md` plan 完成（特別是 milestones store、settings_change setters、browser-info util）。

---

## File Structure Overview

### New files

| Path | Responsibility |
|---|---|
| `src/utils/recipe-taxonomy.ts` | Recipe → RecipeTaxonomy 純函式（stars / is_expert / requires_specialist / is_collectable / craft_kind / category / expected_action_count_bucket） |
| `src/utils/user-properties.ts` | gtag user_property 註冊 + market_region 推斷 + 各 property 計算 |
| `src/composables/useFunnelMisuseDetector.ts` | 三種誤用訊號 watch + session-scoped dedupe |
| `src/__tests__/utils/recipe-taxonomy.test.ts` | XIVAPI fixture matrix |
| `src/__tests__/utils/user-properties.test.ts` | market_region 推斷 / endgame_tier / viewport_bucket 邊界值 |
| `src/__tests__/composables/useFunnelMisuseDetector.test.ts` | 三種訊號觸發 + dedupe |

### Modified files

| Path | What changes |
|---|---|
| `src/utils/analytics.ts` | 加 `setUserProperty(key, value)` wrapper |
| `src/utils/web-vitals-tracking.ts` | 每筆 web_vitals 加 `page_path` 參數 |
| `src/main.ts` | mount 後呼叫 `syncUserProperties()`；`time_to_first_action` 監聽 |
| `src/stores/recipe.ts` | `setRecipe(recipe, source?)` 加 source；`recipe_select` 帶 taxonomy |
| `src/stores/settings.ts` | `setRegion` 觸發 user_property re-sync；首次設定送 `region_resolution` |
| `src/stores/bom.ts` | `addTarget` 觸發 `bom_target_add`；`recalculate` 觸發誤用訊號 |
| `src/stores/batch.ts` | `addRecipe(recipe, method)` 加 method；optimization start 觸發誤用訊號 |
| `src/stores/simulator.ts` | queue length watcher → 誤用訊號 |
| `src/stores/gearsets.ts` | mutate 後重算 `endgame_tier` |
| `src/stores/theme.ts` | toggle 後 sync `theme_mode` user_property |
| `src/services/local-data-source.ts` | recipe／item 名稱回退時送 `recipe_name_locale_miss` |
| `src/components/recipe/RecipeSearch.vue` | 0 結果送 `search_no_result` |
| `src/router/index.ts` | Simulator route enter 送 `simulator_entry_source`；hash payload 進站送 `share_link_inbound` |
| `src/solver/worker.ts` | `wasm_load_ms`, `worker_pool_init_ms`, augment `solver_start` |
| `src/api/universalis.ts` | 失敗時送 `api_failure` |
| `src/api/xivapi.ts` | 失敗時送 `api_failure` |

---

## Conventions

- **Test files** 在 `src/__tests__/<area>/<name>.test.ts`，不 colocate
- **單一測試檔**：`npx vitest run src/__tests__/<area>/<name>.test.ts`
- **全套**：`npm test`
- **Type check**：`npm run type-check`
- **Lint**：`npm run lint`
- **Mock `trackEvent` + `setUserProperty`**：

  ```ts
  vi.mock('@/utils/analytics', () => ({
    trackEvent: vi.fn(),
    trackError: vi.fn(),
    trackPageView: vi.fn(),
    setUserProperty: vi.fn(),
  }))
  ```

- **每個 Task 獨立 commit**，方便 review／回滾

---

## Task 1 — `setUserProperty` analytics wrapper

**Files:**
- Modify: `src/utils/analytics.ts`

- [ ] **Step 1.1 — Write the failing test**

Create or append `src/__tests__/utils/analytics.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('setUserProperty', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls gtag("set", "user_properties", { key: value }) when gtag exists', async () => {
    const gtag = vi.fn()
    vi.stubGlobal('gtag', gtag)
    Object.defineProperty(window, 'gtag', { value: gtag, configurable: true })

    const { setUserProperty } = await import('@/utils/analytics')
    setUserProperty('market_region', 'cht')

    expect(gtag).toHaveBeenCalledWith('set', 'user_properties', { market_region: 'cht' })
  })

  it('is a no-op when window.gtag is undefined', async () => {
    Object.defineProperty(window, 'gtag', { value: undefined, configurable: true })
    const { setUserProperty } = await import('@/utils/analytics')
    expect(() => setUserProperty('market_region', 'cht')).not.toThrow()
  })

  it('accepts string, number, boolean values', async () => {
    const gtag = vi.fn()
    Object.defineProperty(window, 'gtag', { value: gtag, configurable: true })

    const { setUserProperty } = await import('@/utils/analytics')
    setUserProperty('viewport_bucket', 'wide')
    setUserProperty('endgame_tier_lv', 100)
    setUserProperty('pwa_standalone', true)

    expect(gtag).toHaveBeenNthCalledWith(1, 'set', 'user_properties', { viewport_bucket: 'wide' })
    expect(gtag).toHaveBeenNthCalledWith(2, 'set', 'user_properties', { endgame_tier_lv: 100 })
    expect(gtag).toHaveBeenNthCalledWith(3, 'set', 'user_properties', { pwa_standalone: true })
  })
})
```

- [ ] **Step 1.2 — Run, watch fail**

```
npx vitest run src/__tests__/utils/analytics.test.ts
```

Expected: FAIL — `setUserProperty` not exported.

- [ ] **Step 1.3 — Implement**

Append to `src/utils/analytics.ts`:

```ts
export function setUserProperty(key: string, value: string | number | boolean) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('set', 'user_properties', { [key]: value })
}
```

- [ ] **Step 1.4 — Run, watch pass**

```
npx vitest run src/__tests__/utils/analytics.test.ts
npm run type-check
npm run lint
```

Expected: PASS, clean.

- [ ] **Step 1.5 — Commit**

```bash
git add src/utils/analytics.ts src/__tests__/utils/analytics.test.ts
git commit -m "feat(analytics): add setUserProperty helper"
```

---

## Task 2 — `recipe-taxonomy` util

**Files:**
- Create: `src/utils/recipe-taxonomy.ts`
- Create: `src/__tests__/utils/recipe-taxonomy.test.ts`

> **Pre-task check:** Open `src/types/recipe.ts` (or wherever `Recipe` type lives — grep `export.*type.*Recipe ` / `export.*interface.*Recipe `). Verify the field names below match the actual Recipe shape. If field names differ, adapt the implementation; the test fixtures should still cover the same categories.

- [ ] **Step 2.1 — Write the failing test**

Create `src/__tests__/utils/recipe-taxonomy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeRecipeTaxonomy } from '@/utils/recipe-taxonomy'
import type { Recipe } from '@/types/recipe'

function makeRecipe(overrides: Partial<Recipe>): Recipe {
  return {
    id: 1,
    name: 'Test',
    job: 'CRP',
    level: 90,
    rlv: 640,
    stars: 0,
    isExpert: false,
    requiresSpecialist: false,
    isCollectable: false,
    craftType: 'normal',
    category: 'gear',
    progress: 4500,
    quality: 14500,
    durability: 70,
    ...overrides,
  } as Recipe
}

describe('computeRecipeTaxonomy', () => {
  it('extracts plain fields from a recipe', () => {
    const r = makeRecipe({ rlv: 640, stars: 2, isExpert: true })
    const t = computeRecipeTaxonomy(r)
    expect(t.rlv).toBe(640)
    expect(t.stars).toBe(2)
    expect(t.is_expert).toBe(true)
  })

  it('defaults expected_action_count_bucket to unknown when not provided', () => {
    const r = makeRecipe({})
    expect(computeRecipeTaxonomy(r).expected_action_count_bucket).toBe('unknown')
  })

  it('classifies action_count buckets (< 15 short / 15–25 medium / > 25 long)', () => {
    expect(computeRecipeTaxonomy(makeRecipe({}), 10).expected_action_count_bucket).toBe('short')
    expect(computeRecipeTaxonomy(makeRecipe({}), 20).expected_action_count_bucket).toBe('medium')
    expect(computeRecipeTaxonomy(makeRecipe({}), 30).expected_action_count_bucket).toBe('long')
    // boundary
    expect(computeRecipeTaxonomy(makeRecipe({}), 14).expected_action_count_bucket).toBe('short')
    expect(computeRecipeTaxonomy(makeRecipe({}), 15).expected_action_count_bucket).toBe('medium')
    expect(computeRecipeTaxonomy(makeRecipe({}), 25).expected_action_count_bucket).toBe('medium')
    expect(computeRecipeTaxonomy(makeRecipe({}), 26).expected_action_count_bucket).toBe('long')
  })

  it('maps craft_kind values', () => {
    expect(computeRecipeTaxonomy(makeRecipe({ craftType: 'normal' })).craft_kind).toBe('normal')
    expect(computeRecipeTaxonomy(makeRecipe({ craftType: 'quick' })).craft_kind).toBe('quick')
    expect(computeRecipeTaxonomy(makeRecipe({ craftType: 'expert' })).craft_kind).toBe('expert')
  })

  it('falls back to unknown for missing fields', () => {
    const partial = { id: 99, name: 'Mystery' } as unknown as Recipe
    const t = computeRecipeTaxonomy(partial)
    expect(t.stars).toBe(0)
    expect(t.is_expert).toBe(false)
    expect(t.craft_kind).toBe('normal')
    expect(t.category).toBe('misc')
  })

  it('flattenForEvent returns flat snake_case keys suitable for trackEvent', () => {
    const r = makeRecipe({ rlv: 640, stars: 2, isExpert: true, isCollectable: true })
    const { flattenTaxonomyForEvent } = require('@/utils/recipe-taxonomy')
    const flat = flattenTaxonomyForEvent(computeRecipeTaxonomy(r))
    expect(flat).toMatchObject({
      rlv: 640,
      stars: 2,
      is_expert: true,
      is_collectable: true,
    })
  })
})
```

- [ ] **Step 2.2 — Run, watch fail**

```
npx vitest run src/__tests__/utils/recipe-taxonomy.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 2.3 — Implement**

Create `src/utils/recipe-taxonomy.ts`:

```ts
import type { Recipe } from '@/types/recipe'

export type CraftKind = 'normal' | 'quick' | 'custom_delivery' | 'company' | 'expert'
export type RecipeCategory = 'gear' | 'consumable' | 'housing' | 'material' | 'misc'
export type ActionCountBucket = 'short' | 'medium' | 'long' | 'unknown'

export interface RecipeTaxonomy {
  rlv: number
  stars: number
  is_expert: boolean
  requires_specialist: boolean
  is_collectable: boolean
  craft_kind: CraftKind
  category: RecipeCategory
  expected_action_count_bucket: ActionCountBucket
}

const KNOWN_CRAFT_KINDS: readonly CraftKind[] =
  ['normal', 'quick', 'custom_delivery', 'company', 'expert']

const KNOWN_CATEGORIES: readonly RecipeCategory[] =
  ['gear', 'consumable', 'housing', 'material', 'misc']

function asCraftKind(value: unknown): CraftKind {
  if (typeof value === 'string' && KNOWN_CRAFT_KINDS.includes(value as CraftKind)) {
    return value as CraftKind
  }
  return 'normal'
}

function asCategory(value: unknown): RecipeCategory {
  if (typeof value === 'string' && KNOWN_CATEGORIES.includes(value as RecipeCategory)) {
    return value as RecipeCategory
  }
  return 'misc'
}

function bucketActionCount(count: number | undefined): ActionCountBucket {
  if (count === undefined || count === null) return 'unknown'
  if (count < 15) return 'short'
  if (count <= 25) return 'medium'
  return 'long'
}

export function computeRecipeTaxonomy(recipe: Recipe, actionCount?: number): RecipeTaxonomy {
  // Defensive defaults — XIVAPI schema may not always provide every field.
  const r = recipe as Partial<Recipe> & Record<string, unknown>
  return {
    rlv: typeof r.rlv === 'number' ? r.rlv : 0,
    stars: typeof r.stars === 'number' ? r.stars : 0,
    is_expert: r.isExpert === true,
    requires_specialist: r.requiresSpecialist === true,
    is_collectable: r.isCollectable === true,
    craft_kind: asCraftKind(r.craftType),
    category: asCategory(r.category),
    expected_action_count_bucket: bucketActionCount(actionCount),
  }
}

// Flat snake_case suitable for trackEvent payload spread.
export function flattenTaxonomyForEvent(t: RecipeTaxonomy): Record<string, string | number | boolean> {
  return {
    rlv: t.rlv,
    stars: t.stars,
    is_expert: t.is_expert,
    requires_specialist: t.requires_specialist,
    is_collectable: t.is_collectable,
    craft_kind: t.craft_kind,
    category: t.category,
    expected_action_count_bucket: t.expected_action_count_bucket,
  }
}
```

- [ ] **Step 2.4 — Run, watch pass**

```
npx vitest run src/__tests__/utils/recipe-taxonomy.test.ts
npm run type-check
npm run lint
```

Expected: PASS, clean.

- [ ] **Step 2.5 — Commit**

```bash
git add src/utils/recipe-taxonomy.ts src/__tests__/utils/recipe-taxonomy.test.ts
git commit -m "feat(utils): add recipe-taxonomy classifier"
```

---

## Task 3 — `user-properties` util (market_region + computed properties)

**Files:**
- Create: `src/utils/user-properties.ts`
- Create: `src/__tests__/utils/user-properties.test.ts`

- [ ] **Step 3.1 — Write the failing test**

Create `src/__tests__/utils/user-properties.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/analytics', () => ({
  setUserProperty: vi.fn(),
  trackEvent: vi.fn(),
}))

import { setUserProperty } from '@/utils/analytics'
import {
  inferMarketRegion,
  computeViewportBucket,
  computeDeviceClass,
  computeEndgameTier,
  syncUserProperties,
} from '@/utils/user-properties'

describe('inferMarketRegion', () => {
  it('zh-TW → cht', () => { expect(inferMarketRegion('zh-TW')).toBe('cht') })
  it('TW → cht', () => { expect(inferMarketRegion('TW')).toBe('cht') })
  it('CN (simplified Chinese) → intl', () => { expect(inferMarketRegion('CN')).toBe('intl') })
  it('Japan → intl', () => { expect(inferMarketRegion('Japan')).toBe('intl') })
  it('North-America → intl', () => { expect(inferMarketRegion('North-America')).toBe('intl') })
  it('empty → unset', () => { expect(inferMarketRegion('')).toBe('unset') })
})

describe('computeViewportBucket', () => {
  it('width >= 1440 → wide', () => { expect(computeViewportBucket(1440)).toBe('wide') })
  it('width 1024–1439 → standard', () => {
    expect(computeViewportBucket(1024)).toBe('standard')
    expect(computeViewportBucket(1439)).toBe('standard')
  })
  it('width < 1024 → narrow', () => { expect(computeViewportBucket(1023)).toBe('narrow') })
})

describe('computeDeviceClass', () => {
  it('mobile UA → mobile', () => {
    expect(computeDeviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Mobile')).toBe('mobile')
  })
  it('tablet UA → tablet', () => {
    expect(computeDeviceClass('Mozilla/5.0 (iPad; CPU OS 17_0) AppleWebKit')).toBe('tablet')
  })
  it('desktop UA → desktop', () => {
    expect(computeDeviceClass('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0')).toBe('desktop')
  })
})

describe('computeEndgameTier', () => {
  it('lv 100 → 7.x', () => { expect(computeEndgameTier({ CRP: { level: 100 } })).toBe('7.x') })
  it('lv 90 → 6.x', () => { expect(computeEndgameTier({ CRP: { level: 90 } })).toBe('6.x') })
  it('lv 80 → 5.x', () => { expect(computeEndgameTier({ CRP: { level: 80 } })).toBe('5.x') })
  it('takes max across jobs', () => {
    expect(computeEndgameTier({ CRP: { level: 80 }, BSM: { level: 100 } })).toBe('7.x')
  })
  it('empty gearsets → none', () => { expect(computeEndgameTier({})).toBe('none') })
})

describe('syncUserProperties', () => {
  beforeEach(() => { vi.mocked(setUserProperty).mockClear() })

  it('calls setUserProperty for each computed property', () => {
    syncUserProperties({
      region: 'zh-TW',
      gearsets: { CRP: { level: 100 } },
      themeMode: 'light',
      viewportWidth: 1500,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0',
      pwaStandalone: false,
    })
    expect(setUserProperty).toHaveBeenCalledWith('market_region', 'cht')
    expect(setUserProperty).toHaveBeenCalledWith('endgame_tier', '7.x')
    expect(setUserProperty).toHaveBeenCalledWith('theme_mode', 'light')
    expect(setUserProperty).toHaveBeenCalledWith('viewport_bucket', 'wide')
    expect(setUserProperty).toHaveBeenCalledWith('device_class', 'desktop')
    expect(setUserProperty).toHaveBeenCalledWith('pwa_standalone', false)
  })
})
```

- [ ] **Step 3.2 — Run, watch fail**

```
npx vitest run src/__tests__/utils/user-properties.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3.3 — Implement**

Create `src/utils/user-properties.ts`:

```ts
import { setUserProperty } from '@/utils/analytics'

export type MarketRegion = 'cht' | 'intl' | 'unset'
export type ViewportBucket = 'wide' | 'standard' | 'narrow'
export type DeviceClass = 'mobile' | 'tablet' | 'desktop'
export type EndgameTier = '7.x' | '6.x' | '5.x' | '4.x' | '3.x' | '2.x' | 'none'

// Universalis API region strings: 'zh-TW' / 'TW' = 繁中服; 'CN' = 簡中(國服) → intl.
const CHT_VALUES = new Set(['zh-TW', 'TW'])

export function inferMarketRegion(region: string): MarketRegion {
  if (!region) return 'unset'
  if (CHT_VALUES.has(region)) return 'cht'
  return 'intl'
}

export function computeViewportBucket(width: number): ViewportBucket {
  if (width >= 1440) return 'wide'
  if (width >= 1024) return 'standard'
  return 'narrow'
}

export function computeDeviceClass(ua: string): DeviceClass {
  if (/iPad|tablet/i.test(ua)) return 'tablet'
  if (/Mobile|iPhone|Android/i.test(ua)) return 'mobile'
  return 'desktop'
}

interface GearsetLike { level?: number }

export function computeEndgameTier(gearsets: Record<string, GearsetLike>): EndgameTier {
  let max = 0
  for (const g of Object.values(gearsets)) {
    if (typeof g?.level === 'number' && g.level > max) max = g.level
  }
  if (max === 0) return 'none'
  if (max >= 100) return '7.x'
  if (max >= 90) return '6.x'
  if (max >= 80) return '5.x'
  if (max >= 70) return '4.x'
  if (max >= 60) return '3.x'
  return '2.x'
}

export interface UserPropertySnapshot {
  region: string
  gearsets: Record<string, GearsetLike>
  themeMode: 'light' | 'dark'
  viewportWidth: number
  userAgent: string
  pwaStandalone: boolean
}

export function syncUserProperties(snapshot: UserPropertySnapshot): void {
  setUserProperty('market_region', inferMarketRegion(snapshot.region))
  setUserProperty('endgame_tier', computeEndgameTier(snapshot.gearsets))
  setUserProperty('theme_mode', snapshot.themeMode)
  setUserProperty('viewport_bucket', computeViewportBucket(snapshot.viewportWidth))
  setUserProperty('device_class', computeDeviceClass(snapshot.userAgent))
  setUserProperty('pwa_standalone', snapshot.pwaStandalone)
}
```

- [ ] **Step 3.4 — Run, watch pass + type check + lint**

```
npx vitest run src/__tests__/utils/user-properties.test.ts
npm run type-check
npm run lint
```

Expected: PASS, clean.

- [ ] **Step 3.5 — Commit**

```bash
git add src/utils/user-properties.ts src/__tests__/utils/user-properties.test.ts
git commit -m "feat(utils): add user-properties util with market_region inference"
```

---

## Task 4 — Wire `syncUserProperties` from `main.ts` + store hooks

**Files:**
- Modify: `src/main.ts`
- Modify: `src/stores/settings.ts`（setRegion → re-sync）
- Modify: `src/stores/gearsets.ts`（mutate → re-sync）
- Modify: `src/stores/theme.ts`（toggle → re-sync theme_mode）

- [ ] **Step 4.1 — Add a `syncFromStores()` orchestrator**

Append to `src/utils/user-properties.ts`:

```ts
// Convenience wrapper that pulls live state from stores. Called by main.ts
// after Pinia is mounted, and re-called by individual store mutations.
import { useSettingsStore } from '@/stores/settings'
import { useGearsetsStore } from '@/stores/gearsets'
import { useThemeStore } from '@/stores/theme'

export function syncFromStores(): void {
  if (typeof window === 'undefined') return
  const settings = useSettingsStore()
  const gearsets = useGearsetsStore()
  const theme = useThemeStore()

  syncUserProperties({
    region: settings.region,
    gearsets: gearsets.gearsets as Record<string, GearsetLike>,
    themeMode: theme.current === 'dark' ? 'dark' : 'light',
    viewportWidth: window.innerWidth,
    userAgent: navigator.userAgent,
    pwaStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
  })
}
```

> **Verify the field names** before commit: open `src/stores/theme.ts` and confirm the active mode field. If it's not `current`, swap accordingly (the value should be `'dark' | 'light'`).

- [ ] **Step 4.2 — Call from `main.ts` after Pinia mount**

Open `src/main.ts`. After the existing `app.use(pinia)` line and before `app.mount(...)`, do not call yet — Pinia needs to be active. Instead call **after** mount:

```ts
app.mount('#app')

// User properties: sync once after Pinia stores hydrate.
import('@/utils/user-properties').then(({ syncFromStores }) => {
  syncFromStores()
})
```

- [ ] **Step 4.3 — Re-sync hooks in mutation points**

In `src/stores/settings.ts`, append to `setRegion`:

```ts
function setRegion(v: string) {
  const prev = region.value; if (prev === v) return
  region.value = v; emitSettingsChange('region', prev, v)
  import('@/utils/user-properties').then(({ syncFromStores }) => syncFromStores())
}
```

> **Why dynamic import**: avoids circular import (user-properties imports the store).

In `src/stores/gearsets.ts`, find the main mutation point (e.g. `setGearset` / `setGearsetField` — grep for the public setter). After the mutation:

```ts
import('@/utils/user-properties').then(({ syncFromStores }) => syncFromStores())
```

In `src/stores/theme.ts`, in the toggle / setTheme function, append the same dynamic import after the mutation.

- [ ] **Step 4.4 — Smoke test + lint**

```
npm run type-check
npm run lint
npm test
```

Expected: clean. (No new unit test — covered by `user-properties.test.ts` and store tests still pass.)

- [ ] **Step 4.5 — Commit**

```bash
git add src/utils/user-properties.ts src/main.ts src/stores/settings.ts src/stores/gearsets.ts src/stores/theme.ts
git commit -m "feat(analytics): wire syncFromStores from main + store mutations"
```

---

## Task 5 — `region_resolution` event (first-time region set)

**Files:**
- Modify: `src/stores/settings.ts` — `setRegion`
- Modify: `src/__tests__/stores/settings.test.ts`

- [ ] **Step 5.1 — Write the failing test**

Append to `src/__tests__/stores/settings.test.ts`:

```ts
describe('region_resolution event', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(trackEvent).mockClear()
  })

  it('emits region_resolution on first region set (prev empty → non-empty)', () => {
    const store = useSettingsStore()
    store.setRegion('zh-TW')
    expect(trackEvent).toHaveBeenCalledWith('region_resolution', {
      from_default: false,
      market_region: 'cht',
    })
  })

  it('does NOT emit region_resolution on subsequent changes', () => {
    const store = useSettingsStore()
    store.setRegion('zh-TW')
    vi.mocked(trackEvent).mockClear()
    store.setRegion('Japan')
    // settings_change still emits; region_resolution does not
    expect(trackEvent).not.toHaveBeenCalledWith('region_resolution', expect.anything())
  })
})
```

- [ ] **Step 5.2 — Run, watch fail**

```
npx vitest run src/__tests__/stores/settings.test.ts -t 'region_resolution'
```

Expected: FAIL.

- [ ] **Step 5.3 — Implement**

Modify `setRegion` in `src/stores/settings.ts`:

```ts
function setRegion(v: string) {
  const prev = region.value; if (prev === v) return
  region.value = v
  emitSettingsChange('region', prev, v)
  if (prev === '' && v !== '') {
    import('@/utils/user-properties').then(({ inferMarketRegion }) => {
      trackEvent('region_resolution', {
        from_default: false,  // accepting default would be a different code path
        market_region: inferMarketRegion(v),
      })
    })
  }
  import('@/utils/user-properties').then(({ syncFromStores }) => syncFromStores())
}
```

> `from_default` is `false` here — explicit user setting always goes through `setRegion`. A future "accept default" UI path (if added) would call a separate setter with `from_default: true`.

- [ ] **Step 5.4 — Run, watch pass**

```
npx vitest run src/__tests__/stores/settings.test.ts
npm run type-check
npm run lint
```

Expected: PASS, clean.

- [ ] **Step 5.5 — Commit**

```bash
git add src/stores/settings.ts src/__tests__/stores/settings.test.ts
git commit -m "feat(analytics): region_resolution event on first region set"
```

---

## Task 6 — Augment `recipe_select` with taxonomy + source

**Files:**
- Modify: `src/stores/recipe.ts` — `setRecipe(recipe, source?)`
- Modify: `src/__tests__/stores/recipe-queue.test.ts` (or recipe store test if separate)

- [ ] **Step 6.1 — Write the failing test**

Find the existing test for `setRecipe` (or create a new describe block). Add:

```ts
describe('setRecipe payload', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(trackEvent).mockClear()
  })

  it('emits recipe_select with taxonomy + source', () => {
    const store = useRecipeStore()
    const recipe = {
      id: 33001, name: 'Test', job: 'CRP', level: 90,
      rlv: 640, stars: 2, isExpert: false, requiresSpecialist: false,
      isCollectable: false, craftType: 'normal', category: 'gear',
    } as Recipe
    store.setRecipe(recipe, 'search')

    expect(trackEvent).toHaveBeenCalledWith('recipe_select', expect.objectContaining({
      recipe_id: 33001, job: 'CRP', level: 90,
      rlv: 640, stars: 2, is_expert: false, is_collectable: false,
      craft_kind: 'normal', category: 'gear',
      source: 'search',
    }))
  })

  it('defaults source to unknown if not passed', () => {
    const store = useRecipeStore()
    store.setRecipe({ id: 1, name: '', job: 'CRP', level: 1 } as Recipe)
    expect(trackEvent).toHaveBeenCalledWith('recipe_select', expect.objectContaining({ source: 'unknown' }))
  })
})
```

- [ ] **Step 6.2 — Run, watch fail**

```
npx vitest run src/__tests__/stores/recipe-queue.test.ts -t 'setRecipe payload'
```

Expected: FAIL.

- [ ] **Step 6.3 — Implement**

Modify `setRecipe` in `src/stores/recipe.ts`:

```ts
import { computeRecipeTaxonomy, flattenTaxonomyForEvent } from '@/utils/recipe-taxonomy'

export type RecipeOpenSource =
  | 'search' | 'queue' | 'batch_target' | 'bom_drilldown'
  | 'company_craft' | 'deep_link' | 'changelog' | 'unknown'

function setRecipe(recipe: Recipe, source: RecipeOpenSource = 'unknown') {
  currentRecipe.value = recipe
  const taxonomy = flattenTaxonomyForEvent(computeRecipeTaxonomy(recipe))
  trackEvent('recipe_select', {
    recipe_id: recipe.id,
    job: recipe.job,
    level: recipe.level,
    source,
    ...taxonomy,
  })
  useMilestonesStore().markMilestoneOnce('viewed_recipe')
}
```

- [ ] **Step 6.4 — Update all call sites to pass `source`**

Grep:
```
grep -rn 'setRecipe(' src/ --include='*.ts' --include='*.vue'
```

For each call site, pass the correct source. Common locations:
- `src/components/recipe/RecipeSearch.vue` → `'search'`
- `src/stores/recipe.ts` queue-related actions → `'queue'`
- `src/views/BatchView.vue` (or batch target click handler) → `'batch_target'`
- `src/components/bom/*` (if any drilldown re-opens recipe) → `'bom_drilldown'`
- `src/views/CompanyCraftView.vue` → `'company_craft'`
- `src/router/index.ts` (deep-link route handler) → `'deep_link'`

If a call site genuinely can't classify, leave default `'unknown'` but **list it in the commit message** so future review can revisit.

- [ ] **Step 6.5 — Run, watch pass**

```
npx vitest run src/__tests__/stores/recipe-queue.test.ts
npm run type-check
npm run lint
npm test
```

Expected: PASS, clean.

- [ ] **Step 6.6 — Commit**

```bash
git add src/stores/recipe.ts src/__tests__/stores/recipe-queue.test.ts \
        src/components/recipe/RecipeSearch.vue \
        src/views/BatchView.vue \
        src/views/CompanyCraftView.vue \
        src/router/index.ts
# add any other touched call sites from Step 6.4 grep
git commit -m "feat(analytics): augment recipe_select with taxonomy + source"
```

---

## Task 7 — Augment `solver_start` with extra taxonomy fields

**Files:**
- Modify: `src/solver/worker.ts` (around the existing `solver_start` trackEvent call)

> **Note:** `solver_start` already has `crafter_level`, `recipe_level`, `hq_target`, `gear_bucket`. We add `stars`, `is_expert`, `is_collectable`, `craft_kind`.

- [ ] **Step 7.1 — Decide where taxonomy comes from**

`solveCraft(config, ...)` currently receives `SolverConfig` (numeric stats only). It does NOT have access to the original Recipe. Options:

a. Pass the source Recipe alongside config (touches every caller).
b. Read `recipeStore.currentRecipe` inside `solveCraft` (couples worker module to Pinia — bad).
c. Augment `SolverConfig` to optionally carry taxonomy fields.

Pick **(c)** — least invasive. Recipe-derived fields go on the config.

- [ ] **Step 7.2 — Write the failing test**

Find or create `src/__tests__/solver/worker.test.ts`. Add:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/analytics', () => ({
  trackEvent: vi.fn(),
  trackError: vi.fn(),
}))

import { trackEvent } from '@/utils/analytics'

describe('solveCraft taxonomy payload', () => {
  beforeEach(() => { vi.mocked(trackEvent).mockClear() })

  it('emits solver_start with taxonomy fields when provided', async () => {
    // Use a config that fails fast (no actual WASM) — we only check the start event
    const { solveCraft } = await import('@/solver/worker')
    try {
      await solveCraft({
        crafter_level: 100, recipe_level: 640,
        craftsmanship: 4000, control: 4000, cp: 600,
        hq_target: 80,
        taxonomy: { stars: 2, is_expert: false, is_collectable: false, craft_kind: 'normal' },
      } as any).catch(() => {})
    } catch { /* worker may reject; we only check the start event */ }
    expect(trackEvent).toHaveBeenCalledWith('solver_start', expect.objectContaining({
      stars: 2, is_expert: false, is_collectable: false, craft_kind: 'normal',
    }))
  })
})
```

- [ ] **Step 7.3 — Run, watch fail**

```
npx vitest run src/__tests__/solver/worker.test.ts -t 'taxonomy payload'
```

Expected: FAIL.

- [ ] **Step 7.4 — Implement**

In `src/solver/worker.ts`, find the `SolverConfig` type. Add optional taxonomy:

```ts
export interface SolverConfig {
  crafter_level: number
  recipe_level: number
  craftsmanship: number
  control: number
  cp: number
  hq_target: number
  // ... existing fields
  taxonomy?: {
    stars: number
    is_expert: boolean
    is_collectable: boolean
    craft_kind: string
  }
}
```

In the `solver_start` trackEvent call, spread taxonomy when present:

```ts
trackEvent('solver_start', {
  crafter_level: config.crafter_level,
  recipe_level: config.recipe_level,
  hq_target: config.hq_target,
  gear_bucket: classifyGearBucket(config.crafter_level, config.craftsmanship, config.control),
  ...(config.taxonomy ?? {}),
})
```

- [ ] **Step 7.5 — Update SolverPanel call site to pass taxonomy**

In `src/components/simulator/SolverPanel.vue` (the user-initiated solveCraft caller, around line 93 from prior plan):

```ts
import { computeRecipeTaxonomy } from '@/utils/recipe-taxonomy'

// ... in the solve handler:
const recipe = recipeStore.currentRecipe
const taxonomy = recipe ? computeRecipeTaxonomy(recipe) : undefined
const config: SolverConfig = {
  ...existingConfig,
  taxonomy: taxonomy && {
    stars: taxonomy.stars,
    is_expert: taxonomy.is_expert,
    is_collectable: taxonomy.is_collectable,
    craft_kind: taxonomy.craft_kind,
  },
}
const result = await solveCraft(config, ...)
```

> **Note:** `batch-optimizer.ts` / `buff-recommender.ts` callers can leave taxonomy undefined (they're not user-initiated solves; reporting their taxonomy would skew dashboards).

- [ ] **Step 7.6 — Run, watch pass**

```
npx vitest run src/__tests__/solver/worker.test.ts
npm run type-check
npm run lint
npm test
```

Expected: PASS, clean.

- [ ] **Step 7.7 — Commit**

```bash
git add src/solver/worker.ts src/components/simulator/SolverPanel.vue src/__tests__/solver/worker.test.ts
git commit -m "feat(analytics): augment solver_start with recipe taxonomy"
```

---

## Task 8 — Augment `batch_optimization_start` + `batch_add_recipe` (taxonomy + method)

**Files:**
- Modify: `src/stores/batch.ts` — `addRecipe(recipe, method)` and optimization-start payload
- Modify: `src/__tests__/stores/batch.test.ts` (or wherever batch tests live)

- [ ] **Step 8.1 — Write the failing test**

Append to the batch store test file:

```ts
describe('batch_add_recipe method param', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(trackEvent).mockClear()
  })

  it('passes method through to event', () => {
    const batch = useBatchStore()
    batch.addRecipe(makeRecipe({ id: 1 }), 1, 'search')
    expect(trackEvent).toHaveBeenCalledWith('batch_add_recipe', expect.objectContaining({ method: 'search' }))
  })
})

describe('batch_optimization_start aggregate dims', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(trackEvent).mockClear()
  })

  it('emits rlv min/max, stars max, has_expert/collectable, unique_jobs', () => {
    const batch = useBatchStore()
    batch.addRecipe(makeRecipe({ id: 1, rlv: 640, stars: 2, isExpert: true, job: 'CRP' }), 1, 'search')
    batch.addRecipe(makeRecipe({ id: 2, rlv: 700, stars: 4, isExpert: false, isCollectable: true, job: 'BSM' }), 1, 'search')
    batch.startOptimization()
    expect(trackEvent).toHaveBeenCalledWith('batch_optimization_start', expect.objectContaining({
      targets_rlv_min: 640, targets_rlv_max: 700, targets_stars_max: 4,
      has_expert_in_batch: true, has_collectable_in_batch: true,
      unique_jobs_in_batch: 2,
    }))
  })
})
```

- [ ] **Step 8.2 — Run, watch fail**

```
npx vitest run src/__tests__/stores/batch.test.ts
```

Expected: FAIL.

- [ ] **Step 8.3 — Implement**

In `src/stores/batch.ts`:

```ts
export type BatchAddMethod = 'search' | 'paste_teamcraft' | 'queue_import' | 'favorite' | 'cross_page_send'

function addRecipe(recipe: Recipe, quantity: number, method: BatchAddMethod = 'search') {
  // existing logic ...
  trackEvent('batch_add_recipe', {
    recipe_id: recipe.id,
    method,
  })
}

function startOptimization() {
  const targets = /* existing targets array */
  const rlvs = targets.map(t => t.recipe.rlv ?? 0).filter(v => v > 0)
  const starsMax = Math.max(0, ...targets.map(t => t.recipe.stars ?? 0))
  const jobs = new Set(targets.map(t => t.recipe.job))
  trackEvent('batch_optimization_start', {
    target_count: targets.length,
    total_quantity: targets.reduce((sum, t) => sum + t.quantity, 0),
    calc_mode: calcMode.value,
    cross_server: settingsStore.crossServer,
    targets_rlv_min: rlvs.length ? Math.min(...rlvs) : 0,
    targets_rlv_max: rlvs.length ? Math.max(...rlvs) : 0,
    targets_stars_max: starsMax,
    has_expert_in_batch: targets.some(t => t.recipe.isExpert === true),
    has_collectable_in_batch: targets.some(t => t.recipe.isCollectable === true),
    unique_jobs_in_batch: jobs.size,
  })
  // existing logic ...
}
```

- [ ] **Step 8.4 — Update call sites passing `method`**

Grep `batch.addRecipe(`. Pass the right method at each site:
- `RecipeSearch.vue` → `'search'`
- Teamcraft import handler → `'paste_teamcraft'`
- Queue → batch handler → `'queue_import'`
- Favorite list → `'favorite'`
- BOM → batch (if exists) → `'cross_page_send'`

- [ ] **Step 8.5 — Run, watch pass**

```
npx vitest run src/__tests__/stores/batch.test.ts
npm run type-check
npm run lint
npm test
```

- [ ] **Step 8.6 — Commit**

```bash
git add src/stores/batch.ts src/__tests__/stores/batch.test.ts
# + any call site files
git commit -m "feat(analytics): augment batch events with method + aggregate taxonomy"
```

---

## Task 9 — New `bom_target_add` event

**Files:**
- Modify: `src/stores/bom.ts` — find the `addTarget` mutator (grep `targets.value.push` or `addTarget`)
- Modify: `src/__tests__/stores/bom.test.ts`

- [ ] **Step 9.1 — Write the failing test**

```ts
describe('bom_target_add', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(trackEvent).mockClear()
  })

  it('emits with taxonomy when adding a recipe target', () => {
    const bom = useBomStore()
    bom.addTarget({
      kind: 'recipe',
      itemId: 5000, recipeId: 33001, quantity: 3,
      recipe: { id: 33001, rlv: 640, stars: 2, isExpert: true, job: 'CRP', level: 90, isCollectable: false, craftType: 'normal', category: 'gear' } as any,
    }, 'search')

    expect(trackEvent).toHaveBeenCalledWith('bom_target_add', expect.objectContaining({
      recipe_id: 33001, item_id: 5000, quantity: 3,
      source: 'search',
      rlv: 640, stars: 2, is_expert: true,
    }))
  })

  it('emits without taxonomy when adding a raw-item target', () => {
    const bom = useBomStore()
    bom.addTarget({ kind: 'item', itemId: 12, quantity: 99 }, 'search')
    expect(trackEvent).toHaveBeenCalledWith('bom_target_add', expect.objectContaining({
      item_id: 12, quantity: 99, source: 'search',
    }))
  })
})
```

- [ ] **Step 9.2 — Run, watch fail**

- [ ] **Step 9.3 — Implement**

In `src/stores/bom.ts`:

```ts
import { computeRecipeTaxonomy, flattenTaxonomyForEvent } from '@/utils/recipe-taxonomy'
import type { RecipeOpenSource } from '@/stores/recipe'

function addTarget(target: BomTarget, source: RecipeOpenSource = 'unknown') {
  targets.value.push(target)
  const base: Record<string, unknown> = {
    item_id: target.itemId,
    quantity: target.quantity,
    source,
  }
  if (target.kind === 'recipe' && target.recipe) {
    base.recipe_id = target.recipeId
    Object.assign(base, flattenTaxonomyForEvent(computeRecipeTaxonomy(target.recipe)))
  }
  trackEvent('bom_target_add', base)
}
```

- [ ] **Step 9.4 — Update call sites**

Grep `bomStore.addTarget(` or `bom.addTarget(`. Pass `source` at each site (e.g., `'search'`, `'cross_page_send'` from batch, etc.).

- [ ] **Step 9.5 — Run, watch pass + commit**

```
npx vitest run src/__tests__/stores/bom.test.ts
npm run type-check
npm run lint
git add src/stores/bom.ts src/__tests__/stores/bom.test.ts
# + call sites
git commit -m "feat(analytics): bom_target_add event with taxonomy + source"
```

---

## Task 10 — `useFunnelMisuseDetector` composable + three misuse signals

**Files:**
- Create: `src/composables/useFunnelMisuseDetector.ts`
- Create: `src/__tests__/composables/useFunnelMisuseDetector.test.ts`
- Modify: `src/stores/batch.ts` (call detector in `startOptimization`)
- Modify: `src/stores/bom.ts` (call detector in `recalculate` or BOM calc trigger)
- Modify: `src/stores/simulator.ts` (queue length watcher)

- [ ] **Step 10.1 — Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/analytics', () => ({ trackEvent: vi.fn() }))
import { trackEvent } from '@/utils/analytics'
import {
  emitSingleRecipeInBatch,
  emitLargeQueueInSimulator,
  emitBomWithoutQuantity,
  resetMisuseDedupeForTests,
} from '@/composables/useFunnelMisuseDetector'

describe('useFunnelMisuseDetector', () => {
  beforeEach(() => {
    resetMisuseDedupeForTests()
    vi.mocked(trackEvent).mockClear()
  })

  describe('single_recipe_in_batch', () => {
    it('emits when target_count===1 and total_quantity <= 3', () => {
      emitSingleRecipeInBatch({ target_count: 1, total_quantity: 3 })
      expect(trackEvent).toHaveBeenCalledWith('page_misuse_hint', {
        type: 'single_recipe_in_batch', target_count: 1, total_quantity: 3,
      })
    })

    it('does NOT emit when target_count > 1', () => {
      emitSingleRecipeInBatch({ target_count: 2, total_quantity: 2 })
      expect(trackEvent).not.toHaveBeenCalled()
    })

    it('does NOT emit when total_quantity > 3', () => {
      emitSingleRecipeInBatch({ target_count: 1, total_quantity: 4 })
      expect(trackEvent).not.toHaveBeenCalled()
    })

    it('dedupes per session', () => {
      emitSingleRecipeInBatch({ target_count: 1, total_quantity: 1 })
      emitSingleRecipeInBatch({ target_count: 1, total_quantity: 2 })
      expect(trackEvent).toHaveBeenCalledTimes(1)
    })
  })

  describe('large_queue_in_simulator', () => {
    it('emits when queue length transitions to >= 5', () => {
      emitLargeQueueInSimulator(5)
      expect(trackEvent).toHaveBeenCalledWith('page_misuse_hint', {
        type: 'large_queue_in_simulator', queue_length: 5,
      })
    })

    it('does NOT emit when queue length < 5', () => {
      emitLargeQueueInSimulator(4)
      expect(trackEvent).not.toHaveBeenCalled()
    })

    it('dedupes per session', () => {
      emitLargeQueueInSimulator(5)
      emitLargeQueueInSimulator(7)
      expect(trackEvent).toHaveBeenCalledTimes(1)
    })
  })

  describe('bom_without_quantity', () => {
    it('emits when single target with qty 1', () => {
      emitBomWithoutQuantity({ targets: [{ quantity: 1 }] })
      expect(trackEvent).toHaveBeenCalledWith('page_misuse_hint', {
        type: 'bom_without_quantity', target_count: 1,
      })
    })

    it('does NOT emit when qty > 1', () => {
      emitBomWithoutQuantity({ targets: [{ quantity: 5 }] })
      expect(trackEvent).not.toHaveBeenCalled()
    })

    it('does NOT emit when multiple targets', () => {
      emitBomWithoutQuantity({ targets: [{ quantity: 1 }, { quantity: 1 }] })
      expect(trackEvent).not.toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 10.2 — Run, watch fail**

- [ ] **Step 10.3 — Implement**

Create `src/composables/useFunnelMisuseDetector.ts`:

```ts
import { trackEvent } from '@/utils/analytics'

type MisuseType = 'single_recipe_in_batch' | 'large_queue_in_simulator' | 'bom_without_quantity'

// Session-scoped dedupe (module-level Set; cleared on page reload).
const fired = new Set<MisuseType>()

function emit(type: MisuseType, payload: Record<string, unknown>): void {
  if (fired.has(type)) return
  fired.add(type)
  trackEvent('page_misuse_hint', { type, ...payload })
}

export function emitSingleRecipeInBatch(p: { target_count: number; total_quantity: number }): void {
  if (p.target_count === 1 && p.total_quantity <= 3) {
    emit('single_recipe_in_batch', p)
  }
}

export function emitLargeQueueInSimulator(queue_length: number): void {
  if (queue_length >= 5) emit('large_queue_in_simulator', { queue_length })
}

export function emitBomWithoutQuantity(p: { targets: Array<{ quantity: number }> }): void {
  if (p.targets.length === 1 && p.targets[0].quantity === 1) {
    emit('bom_without_quantity', { target_count: 1 })
  }
}

// Test-only escape hatch — DO NOT call from production code.
export function resetMisuseDedupeForTests(): void {
  fired.clear()
}
```

- [ ] **Step 10.4 — Wire to stores**

In `src/stores/batch.ts` `startOptimization`, after the `batch_optimization_start` trackEvent:

```ts
import { emitSingleRecipeInBatch } from '@/composables/useFunnelMisuseDetector'

emitSingleRecipeInBatch({
  target_count: targets.length,
  total_quantity: targets.reduce((sum, t) => sum + t.quantity, 0),
})
```

In `src/stores/bom.ts`, find the `bom_calculate` trackEvent emit point. After it:

```ts
import { emitBomWithoutQuantity } from '@/composables/useFunnelMisuseDetector'
emitBomWithoutQuantity({ targets: targets.value })
```

In `src/stores/simulator.ts`, find the simulationQueue ref. Add a watcher:

```ts
import { watch } from 'vue'
import { emitLargeQueueInSimulator } from '@/composables/useFunnelMisuseDetector'

watch(
  () => simulationQueue.value.length,
  (len) => emitLargeQueueInSimulator(len),
)
```

- [ ] **Step 10.5 — Run, watch pass + commit**

```
npx vitest run src/__tests__/composables/useFunnelMisuseDetector.test.ts
npm run type-check
npm run lint
npm test
git add src/composables/useFunnelMisuseDetector.ts \
        src/__tests__/composables/useFunnelMisuseDetector.test.ts \
        src/stores/batch.ts src/stores/bom.ts src/stores/simulator.ts
git commit -m "feat(analytics): page_misuse_hint event with three detectors"
```

---

## Task 11 — `search_no_result` event

**Files:**
- Modify: `src/components/recipe/RecipeSearch.vue`

- [ ] **Step 11.1 — Pre-task: locate the search submit / results handler**

Open `src/components/recipe/RecipeSearch.vue`. Grep for the spot where the search results array is set (probably named `searchResults`, `results`, `filtered`, or via a debounced watcher). Identify the moment when results become 0 after a non-empty query.

- [ ] **Step 11.2 — Add tracking with debounce**

Add at the top of `<script setup>`:

```ts
import { trackEvent } from '@/utils/analytics'

let noResultTimer: ReturnType<typeof setTimeout> | null = null
function reportNoResult(query: string) {
  if (noResultTimer) clearTimeout(noResultTimer)
  noResultTimer = setTimeout(() => {
    const cjk = /[一-鿿぀-ヿ]/.test(query)
    const latin = /[a-zA-Z]/.test(query)
    const lang: 'cjk' | 'latin' | 'mixed' =
      cjk && latin ? 'mixed' : cjk ? 'cjk' : 'latin'
    trackEvent('search_no_result', {
      query_length: query.length,
      query_lang_hint: lang,
    })
  }, 1000)
}
```

In the search results computation watcher (wherever results land), after results are computed:

```ts
watch(
  () => [searchQuery.value, searchResults.value.length] as const,
  ([q, count]) => {
    if (q.trim().length > 0 && count === 0) reportNoResult(q.trim())
  },
)
```

> **Note:** The 1s debounce inside `reportNoResult` covers fast typing. The watcher fires per render; the debounce ensures we only count a "settled" 0-result state.

- [ ] **Step 11.3 — Smoke test**

No unit test for this — it's a thin UI wrapper, will be visually verified via GA Realtime.

```
npm run type-check
npm run lint
npm test
```

Expected: clean.

- [ ] **Step 11.4 — Commit**

```bash
git add src/components/recipe/RecipeSearch.vue
git commit -m "feat(analytics): search_no_result event with debounce + lang hint"
```

---

## Task 12 — `simulator_entry_source` event

**Files:**
- Modify: `src/router/index.ts`

- [ ] **Step 12.1 — Locate Simulator route**

Open `src/router/index.ts`. Find the route entry for `/simulator` (path or name 'Simulator').

- [ ] **Step 12.2 — Add per-navigation guard**

Inside the simulator route definition, add a `beforeEnter`:

```ts
import { trackEvent } from '@/utils/analytics'

{
  path: '/simulator',
  name: 'Simulator',
  component: SimulatorView,
  beforeEnter: (to, from) => {
    let source: 'recipe_auto' | 'manual_nav' | 'queue_jump' | 'share_url' | 'unknown' = 'unknown'
    if (to.query.macro || to.hash.includes('macro')) source = 'share_url'
    else if (from.name === 'Recipe') source = 'recipe_auto'
    else if (from.name === 'Queue' || to.query.from === 'queue') source = 'queue_jump'
    else if (from.name) source = 'manual_nav'
    trackEvent('simulator_entry_source', { source })
  },
}
```

> **Adapt route name strings** to whatever exists in this router. Grep for `name:` literals.

- [ ] **Step 12.3 — Smoke test + commit**

```
npm run type-check
npm run lint
git add src/router/index.ts
git commit -m "feat(analytics): simulator_entry_source per-route event"
```

---

## Task 13 — `share_link_inbound` event

**Files:**
- Modify: `src/router/index.ts` (or `src/main.ts` if more appropriate)

- [ ] **Step 13.1 — Locate app entry / initial route resolution**

The signal fires once per session at landing. In `src/router/index.ts` add an `isReady().then(...)` listener, or in `main.ts` after mount:

```ts
import { trackEvent } from '@/utils/analytics'

router.isReady().then(() => {
  const url = new URL(window.location.href)
  const hash = url.hash || ''
  const referrerHost = (() => {
    try { return new URL(document.referrer).host } catch { return '' }
  })()

  const hasRecipe = /\b(recipe|recipeId)=/.test(hash) || hash.includes('/recipe/')
  const hasBatch = hash.includes('batch=') || hash.includes('targets=')
  const hasMacro = hash.includes('macro=')

  let payload_kind: 'recipe' | 'batch' | 'macro' | 'mixed' | null = null
  const kinds = [hasRecipe, hasBatch, hasMacro].filter(Boolean).length
  if (kinds > 1) payload_kind = 'mixed'
  else if (hasRecipe) payload_kind = 'recipe'
  else if (hasBatch) payload_kind = 'batch'
  else if (hasMacro) payload_kind = 'macro'

  if (payload_kind) {
    trackEvent('share_link_inbound', { payload_kind, referrer_host: referrerHost })
  }
})
```

> **Adapt the regex** to actual hash conventions used in this app's deep links. Grep `window.location.hash` to find existing patterns.

- [ ] **Step 13.2 — Smoke test + commit**

```
npm run type-check
npm run lint
git add src/router/index.ts
git commit -m "feat(analytics): share_link_inbound event at app entry"
```

---

## Task 14 — `recipe_name_locale_miss` event

**Files:**
- Modify: `src/services/local-data-source.ts` (or wherever item/recipe names resolve from locale data)

- [ ] **Step 14.1 — Pre-task: locate locale resolution**

Grep for where the app picks a localized name from a recipe/item object. Common shape: `recipe.name?.zh || recipe.name?.en` or similar. The fallback branch is the trigger.

- [ ] **Step 14.2 — Add tracking with session dedupe**

In the data source module, near the top:

```ts
import { trackEvent } from '@/utils/analytics'

const localeMissReported = new Set<string>()

function reportLocaleMiss(kind: 'recipe' | 'item', itemId: number) {
  const key = `${kind}:${itemId}`
  if (localeMissReported.has(key)) return
  localeMissReported.add(key)
  trackEvent('recipe_name_locale_miss', { kind, item_id: itemId, expected_locale: 'zh' })
}
```

At each fallback site (zh name missing → fallback to en):

```ts
function resolveRecipeName(recipe: Recipe, locale: string): string {
  if (locale === 'zh-TW' && !recipe.name?.zh) {
    reportLocaleMiss('recipe', recipe.id)
    return recipe.name?.en ?? ''
  }
  return recipe.name?.[locale] ?? recipe.name?.en ?? ''
}
```

> **Adapt to actual shape**: if names live elsewhere (e.g., separate locale maps), apply the same pattern at that resolution point.

- [ ] **Step 14.3 — Smoke test + commit**

```
npm run type-check
npm run lint
git add src/services/local-data-source.ts
git commit -m "feat(analytics): recipe_name_locale_miss event for zh fallback"
```

---

## Task 15 — `wasm_load_ms` + `worker_pool_init_ms` events

**Files:**
- Modify: `src/solver/worker.ts` (worker pool init code)

- [ ] **Step 15.1 — Locate the WASM load + pool init points**

Grep `wasm_load_failed` to find the WASM load block. The success path needs `performance.now()` deltas.

- [ ] **Step 15.2 — Implement**

```ts
import { trackEvent } from '@/utils/analytics'

async function initWorkerPool() {
  const t0 = performance.now()
  let wasmLoadMs = 0
  let workerCount = 0
  try {
    const wasmT0 = performance.now()
    // ... existing WASM load logic ...
    wasmLoadMs = performance.now() - wasmT0
    workerCount = /* existing pool size */
    trackEvent('wasm_load_ms', {
      duration_ms: Math.round(wasmLoadMs),
      worker_count: workerCount,
      is_cold_start: !sessionStorage.getItem('ff14ch.wasm_loaded_once'),
    })
    sessionStorage.setItem('ff14ch.wasm_loaded_once', '1')
  } catch (e) {
    trackEvent('wasm_load_failed', { reason: String(e) })
    throw e
  }

  // ... rest of pool init ...

  trackEvent('worker_pool_init_ms', {
    duration_ms: Math.round(performance.now() - t0),
    worker_count: workerCount,
  })
}
```

- [ ] **Step 15.3 — Smoke test + commit**

```
npm run type-check
npm run lint
npm test
git add src/solver/worker.ts
git commit -m "feat(analytics): wasm_load_ms + worker_pool_init_ms events"
```

---

## Task 16 — `api_failure` event (XIVAPI + Universalis)

**Files:**
- Modify: `src/api/universalis.ts`
- Modify: `src/api/xivapi.ts` (or wherever XIVAPI calls live — grep `xivapi`)

- [ ] **Step 16.1 — Pre-task: locate failure handlers**

Grep `catch` blocks in both files. Failures should already be caught for fallback; we add an event emit alongside the existing handling.

- [ ] **Step 16.2 — Implement (Universalis)**

In `src/api/universalis.ts`, in each `catch` of a fetch:

```ts
import { trackEvent } from '@/utils/analytics'

function emitApiFailure(endpoint: string, status: number, retryCount: number) {
  // Strip query string for grouping
  const cleanEndpoint = endpoint.split('?')[0]
  trackEvent('api_failure', {
    api: 'universalis',
    endpoint: cleanEndpoint,
    status,
    retry_count: retryCount,
  })
}

// in the catch:
} catch (err) {
  emitApiFailure(url, (err as { status?: number }).status ?? 0, retryCount)
  // existing handling (re-throw / fallback)
}
```

- [ ] **Step 16.3 — Implement (XIVAPI)**

Same pattern in `src/api/xivapi.ts`. The `emitApiFailure` helper can live in a shared `src/utils/api-failure.ts` if both files use it, otherwise just duplicate the 5-line helper.

- [ ] **Step 16.4 — Smoke test + commit**

```
npm run type-check
npm run lint
npm test
git add src/api/universalis.ts src/api/xivapi.ts
git commit -m "feat(analytics): api_failure event for universalis + xivapi (parallel with universalis_fetch)"
```

> Existing `universalis_fetch` event remains; both run in parallel. Deprecate `universalis_fetch` 1 month after this lands (separate PR).

---

## Task 17 — Add `page_path` to `web_vitals`

**Files:**
- Modify: `src/utils/web-vitals-tracking.ts`

- [ ] **Step 17.1 — Read current implementation**

```bash
grep -n 'web_vitals' src/utils/web-vitals-tracking.ts
```

- [ ] **Step 17.2 — Add page_path to payload**

In the function that emits web_vitals, augment:

```ts
trackEvent('web_vitals', {
  metric, rating, value,
  page_path: typeof window !== 'undefined' ? window.location.pathname + window.location.hash : '',
})
```

- [ ] **Step 17.3 — Type check + lint + commit**

```
npm run type-check
npm run lint
git add src/utils/web-vitals-tracking.ts
git commit -m "feat(analytics): augment web_vitals with page_path"
```

---

## Task 18 — `time_to_first_action` event

**Files:**
- Modify: `src/main.ts` (or `src/utils/analytics.ts` if cleaner)

- [ ] **Step 18.1 — Implement (in main.ts after Pinia mount)**

```ts
// time_to_first_action: log the timestamp of the first user-meaningful event in a session.
const TTFA_KEY = 'ff14ch.ttfa_sent'
const AUTO_EVENTS = new Set([
  'page_view', 'session_start', 'first_visit',
  'user_engagement', 'scroll', 'web_vitals', 'exception',
])

if (!sessionStorage.getItem(TTFA_KEY)) {
  const startedAt = performance.now()
  const originalGtag = window.gtag
  if (typeof originalGtag === 'function') {
    window.gtag = function (...args: unknown[]) {
      const [cmd, name] = args as [string, string, ...unknown[]]
      if (cmd === 'event' && name && !AUTO_EVENTS.has(name) && !sessionStorage.getItem(TTFA_KEY)) {
        sessionStorage.setItem(TTFA_KEY, '1')
        const duration = Math.round(performance.now() - startedAt)
        originalGtag('event', 'time_to_first_action', {
          duration_ms_since_load: duration,
          first_event_name: name,
        })
      }
      return originalGtag.apply(window, args)
    } as typeof window.gtag
  }
}
```

> **Note:** This is a wrapper around `window.gtag` — risky if other code paths assume the original signature. Sanity-test with `npm run dev` and click around; first non-auto event should fire `time_to_first_action`.

- [ ] **Step 18.2 — Smoke test in dev**

```
npm run dev
```

Open browser, click recipe search → check Network tab for `collect?v=2&...&en=time_to_first_action`.

- [ ] **Step 18.3 — Type check + lint + commit**

```
npm run type-check
npm run lint
git add src/main.ts
git commit -m "feat(analytics): time_to_first_action event"
```

---

## Final Verification

After all 18 tasks land:

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

Walk the funnel:
1. Fresh tab → expect `time_to_first_action` after first click
2. Set region in /settings → expect `region_resolution` (first time) + user_property `market_region`
3. Recipe search → select a recipe → expect `recipe_select` with full taxonomy + source
4. Run solver → expect `solver_start` with taxonomy fields
5. Open Batch, add a single recipe qty 1 → run optimization → expect `page_misuse_hint(single_recipe_in_batch)`
6. Add 5 recipes to Simulator queue → expect `page_misuse_hint(large_queue_in_simulator)`
7. Calculate BOM with single qty-1 target → expect `page_misuse_hint(bom_without_quantity)`
8. Trigger an empty search → expect `search_no_result`
9. Open a share URL → expect `share_link_inbound`
10. Trigger a 404 from Universalis → expect `api_failure`

- [ ] **GA Realtime spot-check** — all 11 new event names + 6 user_properties accumulating.

- [ ] **`recipe_open_source = 'unknown'` is 0**:

```bash
grep -rn "setRecipe(" src/ | grep -v "test"
```

Every call site has an explicit source argument.

- [ ] **No changelog entry in this PR** — add to `src/views/ChangelogView.vue` only after merge, as a separate small commit before tagging.

---

## Out of Scope (reminder)

- In-app misuse banner UI (events only, banner is future work)
- A/B framework, NPS, satisfaction surveys
- Deprecating old `universalis_fetch` (separate 1-month-later PR)
- `ga-analyze.mjs` report restructure to use new dims (separate PR — see spec §5.4)
- Cross-device user_property sync

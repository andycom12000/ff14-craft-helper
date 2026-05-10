# BOM Purchase Mode Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓使用者在 BOM 切「完成品預設：自製 / 直購」全域選項；直購模式自動為每個 craftable target 抓同 DC 跨伺服器最低價，receipt / cockpit / row 同步反映本服 vs 跨服最佳的金額差。

**Architecture:** 跨服查價基礎建設（`useCrossWorldPricing`、`getMarketDataByDC`、`CrossWorldPriceDetail`、`settings.crossServer`）已存在。本案在 BOM store 加 `targetDefaultMode` state、`crossWorldBestPriceMap` 與相關 action，讓 craftable target row 解鎖 immutable，並把跨服最佳價傳到 BomDecisionRow / BomTotalsReceipt / BomTotalsBar 三處呈現。

**Tech Stack:** Vue 3 + Pinia + Element Plus + TypeScript + Vitest。Spec: `docs/superpowers/specs/2026-05-10-bom-purchase-mode-toggle-design.md`。

---

## File Structure

**Modify:**
- `src/stores/bom.ts` — 加 `TargetDefaultMode` 型別、`crossWorldBestPriceMap` state、`setTargetDefaultMode` / `applyTargetDefault` / `fetchCrossWorldBestForTargets` / `retryCrossWorldFetch` actions、`effectiveGrandTotalBreakdown` computed；調整 `applyOptimalDefaults` 對 craftable target 的處理；擴充 LS prefs 序列化
- `src/components/bom/BomSettingsCard.vue` — 加「完成品預設」radio group（desktop）+ segmented cell（mobile）+ 動態 hint + inline「啟用跨服採購」按鈕
- `src/components/bom/BomDecisionTable.vue` — 移除 craftable target 的 `:immutable` 鎖定；group hint 隨 mode 變化
- `src/components/bom/BomDecisionRow.vue` — target row 在 market mode 顯示 server pill、改用跨服最低單價；fetch 中 / 失敗 / 無掛單三狀態
- `src/components/bom/BomTotalsReceipt.vue` — 新增「跨服最佳 / 跨服可省」segment（market mode + crossServer 時）
- `src/components/bom/BomTotalsBar.vue` — 副標顯示節省金額
- `src/__tests__/stores/bom.test.ts` — 新增 store actions / computed 的 unit tests
- `src/__tests__/components/bom/BomDecisionRow.test.ts` — 新增 target row market-mode 視覺測試
- `src/__tests__/components/bom/BomDecisionTable.test.ts` — 確認 craftable target 不再 immutable

---

## Task 1: Add TargetDefaultMode type & LS persistence

**Files:**
- Modify: `src/stores/bom.ts`
- Test: `src/__tests__/stores/bom.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/stores/bom.test.ts`:

```ts
describe('targetDefaultMode persistence', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('defaults to "craft" when LS is empty', () => {
    const bom = useBomStore()
    expect(bom.targetDefaultMode).toBe('craft')
  })

  it('reads "market" from existing bom-route-prefs LS entry', () => {
    localStorage.setItem('bom-route-prefs', JSON.stringify({
      optimizeBy: 'gil',
      targetDefaultMode: 'market',
    }))
    setActivePinia(createPinia())
    const bom = useBomStore()
    expect(bom.targetDefaultMode).toBe('market')
  })

  it('persists changes via setTargetDefaultMode', () => {
    const bom = useBomStore()
    bom.setTargetDefaultMode('market')
    const raw = JSON.parse(localStorage.getItem('bom-route-prefs')!)
    expect(raw.targetDefaultMode).toBe('market')
    expect(raw.optimizeBy).toBe('gil')
  })

  it('falls back to "craft" for invalid LS values', () => {
    localStorage.setItem('bom-route-prefs', JSON.stringify({ targetDefaultMode: 'lol' }))
    setActivePinia(createPinia())
    const bom = useBomStore()
    expect(bom.targetDefaultMode).toBe('craft')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bom.test`
Expected: FAIL — `bom.targetDefaultMode is undefined` and `bom.setTargetDefaultMode is not a function`.

- [ ] **Step 3: Add TargetDefaultMode type and extend LS prefs**

In `src/stores/bom.ts`, add the type next to `AcquisitionSource` (around line 18):

```ts
export type TargetDefaultMode = 'craft' | 'market'
```

Replace `readPrefsFromLs` (around line 106) with:

```ts
interface RoutePrefs {
  optimizeBy: 'gil' | 'hop'
  targetDefaultMode: TargetDefaultMode
}

function readPrefsFromLs(): RoutePrefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const optimizeBy = parsed?.optimizeBy === 'hop' ? 'hop' : 'gil'
    const targetDefaultMode: TargetDefaultMode =
      parsed?.targetDefaultMode === 'market' ? 'market' : 'craft'
    return { optimizeBy, targetDefaultMode }
  } catch { return null }
}

function writePrefsToLs(prefs: RoutePrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch {}
}
```

Inside `useBomStore`, replace the `routeViewPrefs` declaration (around line 217):

```ts
const initialPrefs = readPrefsFromLs() ?? { optimizeBy: 'gil' as const, targetDefaultMode: 'craft' as const }
const routeViewPrefs = ref<{ optimizeBy: 'gil' | 'hop' }>({ optimizeBy: initialPrefs.optimizeBy })
const targetDefaultMode = ref<TargetDefaultMode>(initialPrefs.targetDefaultMode)
```

Update `setOptimizeBy` (around line 693) to keep `targetDefaultMode` in the LS write:

```ts
function setOptimizeBy(mode: 'gil' | 'hop') {
  if (routeViewPrefs.value.optimizeBy === mode) return
  routeViewPrefs.value = { optimizeBy: mode }
  writePrefsToLs({ optimizeBy: mode, targetDefaultMode: targetDefaultMode.value })
}
```

Add new action above `setOptimizeBy`:

```ts
function setTargetDefaultMode(mode: TargetDefaultMode) {
  if (targetDefaultMode.value === mode) return
  targetDefaultMode.value = mode
  writePrefsToLs({ optimizeBy: routeViewPrefs.value.optimizeBy, targetDefaultMode: mode })
  trackEvent('bom_target_default_set', { mode })
}
```

Add to the store's `return` block (alongside `setOptimizeBy`):

```ts
    targetDefaultMode,
    setTargetDefaultMode,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- bom.test`
Expected: PASS — all four `targetDefaultMode persistence` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/stores/bom.ts src/__tests__/stores/bom.test.ts
git commit -m "feat(bom): add targetDefaultMode persistence

Store + LS round-trip for the BOM '完成品預設：自製 / 直購' toggle.
Backward-compatible read; falls back to 'craft'."
```

---

## Task 2: Add cross-world price state shape

**Files:**
- Modify: `src/stores/bom.ts`
- Test: `src/__tests__/stores/bom.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `bom.test.ts`:

```ts
describe('crossWorldBestPriceMap state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('initializes empty', () => {
    const bom = useBomStore()
    expect(bom.crossWorldBestPriceMap.size).toBe(0)
    expect(bom.crossWorldFetchStatus.size).toBe(0)
    expect(bom.fetchingCrossWorldIds.size).toBe(0)
  })

  it('exposes CrossWorldBest entries with worldName + minPrice + fetchedAt', () => {
    const bom = useBomStore()
    bom.crossWorldBestPriceMap.set(123, {
      worldName: 'Tonberry',
      minPrice: 1500,
      fetchedAt: Date.now(),
    })
    const entry = bom.crossWorldBestPriceMap.get(123)
    expect(entry?.worldName).toBe('Tonberry')
    expect(entry?.minPrice).toBe(1500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bom.test`
Expected: FAIL — properties don't exist.

- [ ] **Step 3: Add state**

In `src/stores/bom.ts`, add the type definition next to `PriceFetchStatus` (around line 16):

```ts
export interface CrossWorldBest {
  worldName: string
  minPrice: number
  fetchedAt: number
}
```

Inside `useBomStore`, after the `priceFetchStatus` block (around line 207), add:

```ts
  /**
   * For each craftable target, the cheapest world in the user's DC and its
   * price. Populated by fetchCrossWorldBestForTargets when targetDefaultMode
   * is 'market' and settings.crossServer is on. May store the home server
   * if home is the cheapest — savings then naturally evaluates to 0.
   */
  const crossWorldBestPriceMap = ref<Map<number, CrossWorldBest>>(new Map())
  const crossWorldFetchStatus = ref<Map<number, PriceFetchStatus>>(new Map())
  const fetchingCrossWorldIds = ref<Set<number>>(new Set())
```

Add to the store's `return`:

```ts
    crossWorldBestPriceMap,
    crossWorldFetchStatus,
    fetchingCrossWorldIds,
```

- [ ] **Step 4: Run tests**

Run: `npm test -- bom.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/bom.ts src/__tests__/stores/bom.test.ts
git commit -m "feat(bom): add crossWorldBestPriceMap state

Empty maps + status + in-flight set for per-target cross-DC pricing.
Action that populates them lands in the next commit."
```

---

## Task 3: applyTargetDefault + adjust applyOptimalDefaults for craftable targets

**Files:**
- Modify: `src/stores/bom.ts`
- Test: `src/__tests__/stores/bom.test.ts`

The existing `applyOptimalDefaults` (line ~413, see `bom.ts:450-462`) hard-codes "isTarget && isCraftable → always craft". We need to change that branch so the global toggle drives the choice when the row is not user-touched.

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('applyTargetDefault', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('craft mode: keeps craftable targets expanded', () => {
    const bom = useBomStore()
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
        children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
      },
    ]
    bom.materialTree = tree
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.setTargetDefaultMode('craft')
    bom.applyTargetDefault()
    expect(tree[0].collapsed).toBeFalsy()
    expect(bom.getEffectiveMode(100)).toBe('craft')
  })

  it('market mode: collapses untouched craftable targets', () => {
    const bom = useBomStore()
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
        children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
      },
    ]
    bom.materialTree = tree
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.setTargetDefaultMode('market')
    bom.applyTargetDefault()
    expect(tree[0].collapsed).toBe(true)
    expect(bom.getEffectiveMode(100)).toBe('market')
  })

  it('market mode: leaves user-touched targets alone', () => {
    const bom = useBomStore()
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
        children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
      },
    ]
    bom.materialTree = tree
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    // User explicitly chose craft (fromUser=true marks it)
    bom.setAcquisitionMode(100, 'craft', true)
    bom.setTargetDefaultMode('market')
    bom.applyTargetDefault()
    expect(tree[0].collapsed).toBeFalsy()
    expect(bom.getEffectiveMode(100)).toBe('craft')
  })

  it('non-craftable targets are unaffected by targetDefaultMode', () => {
    const bom = useBomStore()
    const tree: MaterialNode[] = [
      { itemId: 200, name: 'npc-only', icon: '', amount: 1 },
    ]
    bom.materialTree = tree
    bom.targets = [{ itemId: 200, recipeId: null, name: 'npc-only', icon: '', quantity: 1 }]
    bom.setTargetDefaultMode('market')
    bom.applyTargetDefault()
    // Non-craftable target has no recipeId → applyTargetDefault skips it
    expect(bom.getEffectiveMode(200)).toBe('market')  // default fallback in store
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- bom.test`
Expected: FAIL — `bom.applyTargetDefault is not a function`.

- [ ] **Step 3: Implement applyTargetDefault**

In `src/stores/bom.ts`, after `setAcquisitionMode` (around line 575), add:

```ts
  /**
   * Walk targets and flip every craftable, non-user-touched target according
   * to the global targetDefaultMode. 'craft' → ensure expanded; 'market' →
   * collapse via setAcquisitionMode (fromUser=false so we don't taint
   * userTouchedModes).
   */
  function applyTargetDefault() {
    const mode = targetDefaultMode.value
    for (const t of targets.value) {
      if (t.recipeId === null) continue
      if (userTouchedModes.value.has(t.itemId)) continue
      const node = findNode(t.itemId)
      if (!node || !node.recipeId || !node.children || node.children.length === 0) continue

      if (mode === 'craft') {
        if (node.collapsed) {
          node.collapsed = false
          acquisitionMode.value.delete(t.itemId)
          acquisitionMode.value = new Map(acquisitionMode.value)
        }
      } else {
        // mode === 'market'
        if (!node.collapsed) {
          setAcquisitionMode(t.itemId, 'market', false)
        }
      }
    }
    recalcFlat()
  }
```

Update `setTargetDefaultMode` (added in Task 1) to call it:

```ts
function setTargetDefaultMode(mode: TargetDefaultMode) {
  if (targetDefaultMode.value === mode) return
  targetDefaultMode.value = mode
  writePrefsToLs({ optimizeBy: routeViewPrefs.value.optimizeBy, targetDefaultMode: mode })
  trackEvent('bom_target_default_set', { mode })
  applyTargetDefault()
}
```

Add to store's `return` block:

```ts
    applyTargetDefault,
```

- [ ] **Step 4: Modify applyOptimalDefaults to honor targetDefaultMode**

In `applyOptimalDefaults`, replace the `isTarget && isCraftable` block (around line 450-462):

```ts
      if (isTarget && isCraftable) {
        // When targetDefaultMode is 'market', a craftable target falls
        // through to the cheapest-mode logic below so applyOptimalDefaults
        // can flip it into market alongside other rows. When mode is
        // 'craft' (default), the target stays on craft regardless of cost
        // — that's the whole point of putting it in the BOM.
        if (targetDefaultMode.value === 'craft') {
          const cost = Number.isFinite(craftCost)
            ? craftCost
            : Number.isFinite(marketCost)
              ? marketCost
              : 0
          costCache.set(node.itemId, cost)
          return cost
        }
        // else: drop through
      }
```

Then at the end of `applyOptimalDefaults` (after `recalcFlat()`, around line 502), add:

```ts
    applyTargetDefault()
```

This lets the global preference override the mode picker for any craftable target that didn't get touched by the cheapest-mode pass (e.g., when craftCost was Infinity but mode === 'market').

- [ ] **Step 5: Run tests**

Run: `npm test -- bom.test`
Expected: PASS — all four `applyTargetDefault` tests + Task 1's tests still green.

- [ ] **Step 6: Commit**

```bash
git add src/stores/bom.ts src/__tests__/stores/bom.test.ts
git commit -m "feat(bom): applyTargetDefault flips untouched craftable targets

setTargetDefaultMode now drives a per-target collapse/expand pass and
runs at the tail of applyOptimalDefaults. User-touched rows are
preserved."
```

---

## Task 4: fetchCrossWorldBestForTargets + retry

**Files:**
- Modify: `src/stores/bom.ts`
- Test: `src/__tests__/stores/bom.test.ts`

- [ ] **Step 1: Add module mock for getMarketDataByDC**

At the top of `src/__tests__/stores/bom.test.ts`, extend the existing `vi.mock('@/api/universalis')`:

```ts
vi.mock('@/api/universalis', () => ({
  getAggregatedPrices: vi.fn(),
  getMarketDataByDC: vi.fn(),
  aggregateByWorld: vi.fn(),
}))
import {
  getAggregatedPrices,
  getMarketDataByDC,
  aggregateByWorld,
} from '@/api/universalis'
```

- [ ] **Step 2: Write the failing test**

Append:

```ts
describe('fetchCrossWorldBestForTargets', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.mocked(getMarketDataByDC).mockReset()
    vi.mocked(aggregateByWorld).mockReset()
  })

  it('writes the cheapest world (incl. home) into crossWorldBestPriceMap', async () => {
    vi.mocked(getMarketDataByDC).mockResolvedValue({ listings: [] } as never)
    vi.mocked(aggregateByWorld).mockReturnValue([
      { worldName: 'Mandragora', minPriceNQ: 2000, minPriceHQ: 0, avgPriceNQ: 2100, avgPriceHQ: 0, lastUploadTime: 0, listingCount: 1 },
      { worldName: 'Tonberry',   minPriceNQ: 1500, minPriceHQ: 0, avgPriceNQ: 1600, avgPriceHQ: 0, lastUploadTime: 0, listingCount: 1 },
    ])
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.dataCenter = 'Materia'
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]

    await bom.fetchCrossWorldBestForTargets()

    const entry = bom.crossWorldBestPriceMap.get(100)
    expect(entry?.worldName).toBe('Tonberry')
    expect(entry?.minPrice).toBe(1500)
    expect(bom.crossWorldFetchStatus.get(100)).toBe('ok')
  })

  it('marks status="ok" but writes no entry when no NQ listings exist', async () => {
    vi.mocked(getMarketDataByDC).mockResolvedValue({ listings: [] } as never)
    vi.mocked(aggregateByWorld).mockReturnValue([
      { worldName: 'Mandragora', minPriceNQ: 0, minPriceHQ: 0, avgPriceNQ: 0, avgPriceHQ: 0, lastUploadTime: 0, listingCount: 0 },
    ])
    const bom = useBomStore()
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]

    await bom.fetchCrossWorldBestForTargets()

    expect(bom.crossWorldBestPriceMap.has(100)).toBe(false)
    expect(bom.crossWorldFetchStatus.get(100)).toBe('ok')
  })

  it('marks status="failed" on API error', async () => {
    vi.mocked(getMarketDataByDC).mockRejectedValue(new Error('boom'))
    const bom = useBomStore()
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]

    await bom.fetchCrossWorldBestForTargets()

    expect(bom.crossWorldFetchStatus.get(100)).toBe('failed')
    expect(bom.crossWorldBestPriceMap.has(100)).toBe(false)
  })

  it('skips items already in the cache', async () => {
    const bom = useBomStore()
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.crossWorldBestPriceMap.set(100, { worldName: 'Tonberry', minPrice: 1500, fetchedAt: 1 })

    await bom.fetchCrossWorldBestForTargets()

    expect(vi.mocked(getMarketDataByDC)).not.toHaveBeenCalled()
  })

  it('retryCrossWorldFetch clears status and refetches a single item', async () => {
    vi.mocked(getMarketDataByDC).mockResolvedValue({ listings: [] } as never)
    vi.mocked(aggregateByWorld).mockReturnValue([
      { worldName: 'Tonberry', minPriceNQ: 1500, minPriceHQ: 0, avgPriceNQ: 1600, avgPriceHQ: 0, lastUploadTime: 0, listingCount: 1 },
    ])
    const bom = useBomStore()
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.crossWorldFetchStatus.set(100, 'failed')

    await bom.retryCrossWorldFetch(100)

    expect(bom.crossWorldBestPriceMap.get(100)?.minPrice).toBe(1500)
    expect(bom.crossWorldFetchStatus.get(100)).toBe('ok')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- bom.test`
Expected: FAIL — `bom.fetchCrossWorldBestForTargets is not a function`.

- [ ] **Step 4: Implement actions**

At the top of `src/stores/bom.ts`, extend the universalis import:

```ts
import { getAggregatedPrices, getMarketDataByDC, aggregateByWorld } from '@/api/universalis'
```

Inside `useBomStore`, after `applyTargetDefault` (added in Task 3), add:

```ts
  /**
   * For each craftable target without a cached cross-world entry, fetch
   * the DC's listings and pick the cheapest world (incl. home — when home
   * IS the cheapest, savings naturally evaluates to 0).
   */
  async function fetchCrossWorldBestForTargets() {
    const settings = useSettingsStore()
    if (!settings.dataCenter) return

    const targetIds = targets.value
      .filter((t) => t.recipeId !== null)
      .map((t) => t.itemId)
      .filter((id) => !crossWorldBestPriceMap.value.has(id))
      .filter((id) => !fetchingCrossWorldIds.value.has(id))

    if (targetIds.length === 0) return

    const inflight = new Set(fetchingCrossWorldIds.value)
    for (const id of targetIds) inflight.add(id)
    fetchingCrossWorldIds.value = inflight

    await Promise.allSettled(targetIds.map(async (itemId) => {
      try {
        const md = await getMarketDataByDC(settings.dataCenter, itemId)
        const rows = aggregateByWorld(md.listings)
        const candidates = rows.filter((r) => r.minPriceNQ > 0)
        if (candidates.length > 0) {
          const cheapest = candidates.reduce((a, b) => (b.minPriceNQ < a.minPriceNQ ? b : a))
          const next = new Map(crossWorldBestPriceMap.value)
          next.set(itemId, {
            worldName: cheapest.worldName,
            minPrice: cheapest.minPriceNQ,
            fetchedAt: Date.now(),
          })
          crossWorldBestPriceMap.value = next
        }
        const status = new Map(crossWorldFetchStatus.value)
        status.set(itemId, 'ok')
        crossWorldFetchStatus.value = status
      } catch (err) {
        console.error('[BOM] cross-world fetch failed:', err)
        const status = new Map(crossWorldFetchStatus.value)
        status.set(itemId, 'failed')
        crossWorldFetchStatus.value = status
      }
    }))

    const after = new Set(fetchingCrossWorldIds.value)
    for (const id of targetIds) after.delete(id)
    fetchingCrossWorldIds.value = after
  }

  async function retryCrossWorldFetch(itemId: number) {
    const next = new Map(crossWorldBestPriceMap.value)
    next.delete(itemId)
    crossWorldBestPriceMap.value = next
    const status = new Map(crossWorldFetchStatus.value)
    status.delete(itemId)
    crossWorldFetchStatus.value = status
    await fetchCrossWorldBestForTargets()
  }
```

Add to the store's `return`:

```ts
    fetchCrossWorldBestForTargets,
    retryCrossWorldFetch,
```

Extend `clearTargets` (line 294) so the new maps die with the rest of the BOM session:

```ts
  function clearTargets() {
    targets.value = []
    materialTree.value = []
    flatMaterials.value = []
    acquisitionMode.value = new Map()
    expandedRows.value = new Set()
    userTouchedModes.value = new Set()
    acquisitionAvailability.value = new Map()
    priceFetchStatus.value = new Map()
    fetchingPriceIds.value = new Set()
    crossWorldBestPriceMap.value = new Map()
    crossWorldFetchStatus.value = new Map()
    fetchingCrossWorldIds.value = new Set()
  }
```

- [ ] **Step 5: Run tests**

Run: `npm test -- bom.test`
Expected: PASS — all five `fetchCrossWorldBestForTargets` tests green.

- [ ] **Step 6: Commit**

```bash
git add src/stores/bom.ts src/__tests__/stores/bom.test.ts
git commit -m "feat(bom): fetchCrossWorldBestForTargets + retry

Per-target DC pricing pull. Picks the cheapest world from listings
(including home — savings then evaluates to 0). Cache-friendly,
status-tracked, retry by single itemId. clearTargets resets the maps."
```

---

## Task 5: effectiveGrandTotalBreakdown computed

**Files:**
- Modify: `src/stores/bom.ts`
- Test: `src/__tests__/stores/bom.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('effectiveGrandTotalBreakdown', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('home === crossWorldBest in craft mode (no swap)', () => {
    const bom = useBomStore()
    bom.flatMaterials = [{ itemId: 50, name: 'c', icon: '', totalAmount: 5, isRaw: true }]
    bom.prices.set(50, priceInfo(50, 100))
    const breakdown = bom.effectiveGrandTotalBreakdown
    expect(breakdown.home).toBe(500)
    expect(breakdown.crossWorldBest).toBe(500)
    expect(breakdown.savings).toBe(0)
  })

  it('market mode: swaps craftable target price to crossWorldBest', () => {
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.crossServer = true
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 2 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 2, recipeId: 9001, collapsed: true,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.flatMaterials = [{ itemId: 100, name: 't', icon: '', totalAmount: 2, isRaw: true }]
    bom.prices.set(100, priceInfo(100, 1000))         // home price 1000
    bom.crossWorldBestPriceMap.set(100, {
      worldName: 'Tonberry', minPrice: 800, fetchedAt: 1,
    })
    bom.setTargetDefaultMode('market')

    const breakdown = bom.effectiveGrandTotalBreakdown
    expect(breakdown.home).toBe(2000)            // 1000 × 2
    expect(breakdown.crossWorldBest).toBe(1600)  // 800 × 2
    expect(breakdown.savings).toBe(400)
  })

  it('falls back to home price when crossWorldBestPriceMap entry missing', () => {
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.crossServer = true
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001, collapsed: true,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.flatMaterials = [{ itemId: 100, name: 't', icon: '', totalAmount: 1, isRaw: true }]
    bom.prices.set(100, priceInfo(100, 1000))
    bom.setTargetDefaultMode('market')

    const breakdown = bom.effectiveGrandTotalBreakdown
    expect(breakdown.home).toBe(1000)
    expect(breakdown.crossWorldBest).toBe(1000)
    expect(breakdown.savings).toBe(0)
  })

  it('savings clamps to 0 when home < crossWorldBest (defensive)', () => {
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.crossServer = true
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001, collapsed: true,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.flatMaterials = [{ itemId: 100, name: 't', icon: '', totalAmount: 1, isRaw: true }]
    bom.prices.set(100, priceInfo(100, 500))
    bom.crossWorldBestPriceMap.set(100, {
      worldName: 'Tonberry', minPrice: 800, fetchedAt: 1,
    })
    bom.setTargetDefaultMode('market')

    expect(bom.effectiveGrandTotalBreakdown.savings).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- bom.test`
Expected: FAIL — `effectiveGrandTotalBreakdown is undefined`.

- [ ] **Step 3: Add the computed**

In `src/stores/bom.ts`, after `effectiveGrandTotal` (around line 645), add:

```ts
  /**
   * Three-way breakdown for the receipt: 'home' uses the user's server
   * for every row (the existing total). 'crossWorldBest' swaps in cross-DC
   * cheapest for craftable targets when targetDefaultMode === 'market' and
   * settings.crossServer === true. 'savings' = max(0, home - crossWorldBest).
   *
   * In craft mode, or when crossServer is off, all three fall to:
   * home, home, 0.
   */
  const effectiveGrandTotalBreakdown = computed(() => {
    const settings = useSettingsStore()
    const home = effectiveGrandTotal.value
    const useSwap =
      targetDefaultMode.value === 'market' &&
      settings.crossServer === true
    if (!useSwap) {
      return { home, crossWorldBest: home, savings: 0 }
    }

    const targetSet = new Set(targets.value.filter(t => t.recipeId !== null).map(t => t.itemId))
    let crossWorldBest = 0
    for (const mat of flatMaterials.value) {
      if (!mat.isRaw) continue
      const isCraftableTarget = targetSet.has(mat.itemId)
      if (isCraftableTarget) {
        const cw = crossWorldBestPriceMap.value.get(mat.itemId)
        if (cw) {
          crossWorldBest += cw.minPrice * mat.totalAmount
          continue
        }
        // No cross-world entry: fall back to home unit price for this row
      }
      // Same logic as effectiveGrandTotal for non-target rows
      const mode = getEffectiveMode(mat.itemId)
      if (mode === 'gather') continue
      if (mode === 'npc') {
        const npc = acquisitionAvailability.value.get(mat.itemId)?.npcPrice
        if (npc != null) crossWorldBest += npc * mat.totalAmount
        continue
      }
      const p = prices.value.get(mat.itemId)
      if (p) crossWorldBest += getPrice(p, settings.priceDisplayMode) * mat.totalAmount
    }

    return {
      home,
      crossWorldBest,
      savings: Math.max(0, home - crossWorldBest),
    }
  })
```

Add to the store's `return`:

```ts
    effectiveGrandTotalBreakdown,
```

- [ ] **Step 4: Run tests**

Run: `npm test -- bom.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/bom.ts src/__tests__/stores/bom.test.ts
git commit -m "feat(bom): effectiveGrandTotalBreakdown computed

Three-way breakdown {home, crossWorldBest, savings}. Falls through to
home when targetDefaultMode is craft or crossServer is off."
```

---

## Task 6: Watch crossServer & dataCenter changes

**Files:**
- Modify: `src/stores/bom.ts`
- Test: `src/__tests__/stores/bom.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('cross-world reactivity', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.mocked(getMarketDataByDC).mockReset()
    vi.mocked(aggregateByWorld).mockReset()
  })

  it('clears crossWorldBestPriceMap when dataCenter changes', async () => {
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.dataCenter = 'Materia'
    bom.crossWorldBestPriceMap.set(100, { worldName: 'Tonberry', minPrice: 1500, fetchedAt: 1 })

    settings.dataCenter = 'Mana'
    await flushPromises()

    expect(bom.crossWorldBestPriceMap.has(100)).toBe(false)
  })

  it('clears crossWorldBestPriceMap when crossServer turns off', async () => {
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.crossServer = true
    bom.crossWorldBestPriceMap.set(100, { worldName: 'Tonberry', minPrice: 1500, fetchedAt: 1 })

    settings.crossServer = false
    await flushPromises()

    expect(bom.crossWorldBestPriceMap.has(100)).toBe(false)
  })
})
```

Add `flushPromises` import at the top if not present:

```ts
import { flushPromises } from '@vue/test-utils'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- bom.test`
Expected: FAIL — map keeps entry.

- [ ] **Step 3: Add watchers**

In `src/stores/bom.ts`, near the bottom of `useBomStore` (before `return`), add:

```ts
  // Reactive cleanup: stale cross-DC entries die when the user changes
  // their DC or turns off cross-server pricing. Re-fetching is cheap; serving
  // a price from the wrong DC is misleading.
  const _settingsForWatch = useSettingsStore()
  watch(
    () => _settingsForWatch.dataCenter,
    () => {
      if (crossWorldBestPriceMap.value.size > 0) {
        crossWorldBestPriceMap.value = new Map()
        crossWorldFetchStatus.value = new Map()
      }
      if (targetDefaultMode.value === 'market' && _settingsForWatch.crossServer) {
        void fetchCrossWorldBestForTargets()
      }
    },
  )
  watch(
    () => _settingsForWatch.crossServer,
    (on) => {
      if (!on) {
        crossWorldBestPriceMap.value = new Map()
        crossWorldFetchStatus.value = new Map()
      } else if (targetDefaultMode.value === 'market') {
        void fetchCrossWorldBestForTargets()
      }
    },
  )
```

- [ ] **Step 4: Run tests**

Run: `npm test -- bom.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/bom.ts src/__tests__/stores/bom.test.ts
git commit -m "feat(bom): clear cross-world cache on DC/crossServer change

Stale DC pricing is misleading. Watcher clears the map and re-fetches
when targetDefaultMode === 'market' is still active."
```

---

## Task 7: BomSettingsCard adds 完成品預設 toggle (desktop + mobile)

**Files:**
- Modify: `src/components/bom/BomSettingsCard.vue`

- [ ] **Step 1: Add desktop row**

In `src/components/bom/BomSettingsCard.vue`, add a new row inside the `el-card` body, after the `<el-switch v-model="settings.crossServer">` row (around line 24) and before `<el-switch v-model="settings.recursivePricing">`:

```vue
      <div class="bom-settings__row">
        <div class="bom-settings__cell">
          <span class="bom-settings__label">完成品預設</span>
          <el-radio-group
            v-model="bom.targetDefaultMode"
            size="small"
            :disabled="!hasCraftableTarget"
            @change="onTargetDefaultChange"
          >
            <el-radio-button value="craft">自製</el-radio-button>
            <el-radio-button value="market">直購</el-radio-button>
          </el-radio-group>
        </div>
        <span class="bom-settings__hint">
          <template v-if="!hasCraftableTarget">
            目前清單無可製作的完成品
          </template>
          <template v-else-if="bom.targetDefaultMode === 'craft'">
            完成品預設自己做，材料逐筆比價
          </template>
          <template v-else-if="settings.crossServer">
            完成品預設買成品，自動找同 DC 最便宜的伺服器
          </template>
          <template v-else>
            完成品預設買成品，目前用本服價
            <button type="button" class="bom-settings__inline-action" @click="enableCrossServer">
              啟用跨服採購
            </button>
          </template>
        </span>
      </div>
```

- [ ] **Step 2: Wire script**

Replace the `<script setup>` block at the top of the file with:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useBomStore, type TargetDefaultMode } from '@/stores/bom'
import { useIsMobile } from '@/composables/useMediaQuery'

const settings = useSettingsStore()
const bom = useBomStore()
const isMobile = useIsMobile()

const hasCraftableTarget = computed(() =>
  bom.targets.some((t) => t.recipeId !== null),
)

function onTargetDefaultChange(value: TargetDefaultMode) {
  bom.setTargetDefaultMode(value)
  if (value === 'market' && settings.crossServer) {
    void bom.fetchCrossWorldBestForTargets()
  }
}

function enableCrossServer() {
  settings.crossServer = true
  if (bom.targetDefaultMode === 'market') {
    void bom.fetchCrossWorldBestForTargets()
  }
}
</script>
```

- [ ] **Step 3: Add mobile cell**

After the existing `<div class="m-cell">…原料準備</div>` block in the mobile template (around line 110-129), add a new cell:

```vue
      <div class="m-cell">
        <span class="m-cell-icon" aria-hidden="true">🥖</span>
        <div class="m-cell-body">
          <div class="m-cell-title">完成品預設</div>
          <div class="m-cell-sub">
            <template v-if="!hasCraftableTarget">
              清單無可製作的完成品
            </template>
            <template v-else-if="bom.targetDefaultMode === 'craft'">
              完成品預設自己做
            </template>
            <template v-else-if="settings.crossServer">
              買成品，找同 DC 最便宜
            </template>
            <template v-else>
              買成品（本服價，可<a class="m-inline-action" @click="enableCrossServer">啟用跨服</a>）
            </template>
          </div>
        </div>
        <el-segmented
          :model-value="bom.targetDefaultMode"
          :options="[
            { label: '自製', value: 'craft' },
            { label: '直購', value: 'market' },
          ]"
          size="small"
          :disabled="!hasCraftableTarget"
          @update:model-value="(v: TargetDefaultMode) => onTargetDefaultChange(v)"
        />
      </div>
```

- [ ] **Step 4: Add styles**

At the end of `<style scoped>`, append:

```css
.bom-settings__inline-action {
  background: none;
  border: none;
  padding: 0;
  margin-left: 4px;
  color: var(--app-craft);
  cursor: pointer;
  font-size: 11.5px;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.bom-settings__inline-action:hover {
  color: var(--app-craft-strong, var(--app-craft));
}

.m-inline-action {
  color: var(--app-craft);
  text-decoration: underline;
  cursor: pointer;
}
```

- [ ] **Step 5: Type check**

Run: `npx vue-tsc --noEmit`
Expected: no errors related to `BomSettingsCard.vue` or `TargetDefaultMode`.

- [ ] **Step 6: Manual smoke**

Run dev server: `npm run dev`. Open BOM page, confirm:
1. New 「完成品預設」row appears between 跨服採購 and 遞迴查價
2. Toggling craft ↔ market updates hint text and persists across reload
3. With cross-server OFF, hint shows the 「啟用跨服採購」inline action; clicking it enables the global toggle and the hint updates

- [ ] **Step 7: Commit**

```bash
git add src/components/bom/BomSettingsCard.vue
git commit -m "feat(bom): 完成品預設 toggle in BomSettingsCard

Sibling to 原料準備 — radio group desktop, segmented mobile.
Inline 'enable cross-server' affordance when the global flag is off."
```

---

## Task 8: BomDecisionTable unlocks craftable target + mode-aware hint

**Files:**
- Modify: `src/components/bom/BomDecisionTable.vue`
- Test: `src/__tests__/components/bom/BomDecisionTable.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/components/bom/BomDecisionTable.test.ts` (or create if absent — check existing first):

```ts
describe('BomDecisionTable target group', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('does not lock craftable target rows', async () => {
    const bom = useBomStore()
    bom.materialTree = [{
      itemId: 100, name: 'target', icon: '', amount: 1, recipeId: 9001,
      children: [{ itemId: 50, name: 'mat', icon: '', amount: 1 }],
    }]
    const wrapper = mount(BomDecisionTable, {
      props: {
        materials: [],
        materialTree: bom.materialTree,
        targetItemIds: [100],
      },
    })
    const targetRow = wrapper.findAllComponents(BomDecisionRow)[0]
    expect(targetRow.props('immutable')).toBe(false)
  })
})
```

(If the test file already exists, follow its existing imports and `mount` setup. Otherwise reference `BomDecisionRow.test.ts` for the pattern.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- BomDecisionTable`
Expected: FAIL — currently `immutable === true` on craftable targets.

- [ ] **Step 3: Unlock the row**

In `src/components/bom/BomDecisionTable.vue` line 174, change:

```vue
:immutable="row.isCraftable"
```

to:

```vue
:immutable="false"
```

- [ ] **Step 4: Mode-aware group hint**

In `BomDecisionTable.vue` script (top of file), add the bom store reference if not already present, and import settings:

```ts
import { useSettingsStore } from '@/stores/settings'
const settings = useSettingsStore()
```

Replace line 155:

```vue
<span class="bdt-group__hint">這些是你要做出來的東西，自製是預設選擇</span>
```

with:

```vue
<span class="bdt-group__hint">
  <template v-if="bom.targetDefaultMode === 'craft'">
    這些是你要做出來的東西，自製是預設選擇
  </template>
  <template v-else-if="settings.crossServer">
    直購：自動挑同 DC 最便宜的伺服器
  </template>
  <template v-else>
    直購：使用本服市場價
  </template>
</span>
```

- [ ] **Step 5: Run tests**

Run: `npm test -- BomDecisionTable`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/bom/BomDecisionTable.vue src/__tests__/components/bom/BomDecisionTable.test.ts
git commit -m "feat(bom): unlock craftable target rows + mode-aware hint

Removes the :immutable lock on craftable targets so the global toggle
can drive them. Group hint reflects current mode + crossServer state."
```

---

## Task 9: BomDecisionRow target market-mode visuals

**Files:**
- Modify: `src/components/bom/BomDecisionRow.vue`
- Test: `src/__tests__/components/bom/BomDecisionRow.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `BomDecisionRow.test.ts`:

```ts
describe('BomDecisionRow target market-mode visuals', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders cross-world server pill when target is in market mode', async () => {
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.crossServer = true
    settings.server = 'Tonberry'
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001, collapsed: true,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.crossWorldBestPriceMap.set(100, { worldName: 'Mandragora', minPrice: 800, fetchedAt: 1 })
    bom.setTargetDefaultMode('market')

    const wrapper = mount(BomDecisionRow, {
      props: { itemId: 100, name: 't', icon: '', amount: 1, isCraftable: true },
    })

    const pill = wrapper.find('[data-testid="cross-world-pill"]')
    expect(pill.exists()).toBe(true)
    expect(pill.text()).toContain('Mandragora')
    expect(pill.classes()).not.toContain('is-home')
  })

  it('marks pill as home when home server is the cheapest', async () => {
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.crossServer = true
    settings.server = 'Tonberry'
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001, collapsed: true,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.crossWorldBestPriceMap.set(100, { worldName: 'Tonberry', minPrice: 800, fetchedAt: 1 })
    bom.setTargetDefaultMode('market')

    const wrapper = mount(BomDecisionRow, {
      props: { itemId: 100, name: 't', icon: '', amount: 1, isCraftable: true },
    })

    const pill = wrapper.find('[data-testid="cross-world-pill"]')
    expect(pill.classes()).toContain('is-home')
  })

  it('shows retry chip on fetch failure', async () => {
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.crossServer = true
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001, collapsed: true,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.crossWorldFetchStatus.set(100, 'failed')
    bom.setTargetDefaultMode('market')

    const wrapper = mount(BomDecisionRow, {
      props: { itemId: 100, name: 't', icon: '', amount: 1, isCraftable: true },
    })

    const retry = wrapper.find('[data-testid="cross-world-retry"]')
    expect(retry.exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- BomDecisionRow`
Expected: FAIL — pill doesn't exist.

- [ ] **Step 3: Update the script for cross-world derived state**

In `src/components/bom/BomDecisionRow.vue` script section, after the existing `marketPrice` computed (around line 64), add:

```ts
const isTarget = computed(() => bom.targets.some(t => t.itemId === props.itemId))
const isMarketMode = computed(() => mode.value === 'market')
const showCrossWorld = computed(() =>
  isTarget.value && isMarketMode.value && settings.crossServer && props.isCraftable,
)
const crossWorldEntry = computed(() => bom.crossWorldBestPriceMap.get(props.itemId))
const crossWorldStatus = computed(() => bom.crossWorldFetchStatus.get(props.itemId))
const crossWorldFetching = computed(() => bom.fetchingCrossWorldIds.has(props.itemId))
const isHomeServer = computed(() =>
  crossWorldEntry.value?.worldName === settings.server,
)
```

Replace `unitPrice` to prefer cross-world price when in target market mode:

```ts
const unitPrice = computed<number | null>(() => {
  if (showCrossWorld.value && crossWorldEntry.value) {
    return crossWorldEntry.value.minPrice
  }
  if (mode.value === 'market') return marketPrice.value
  if (mode.value === 'npc') return npcPrice.value
  return null
})
```

Add a retry handler:

```ts
async function onRetryCrossWorld() {
  await bom.retryCrossWorldFetch(props.itemId)
}
```

- [ ] **Step 4: Add the pill + retry chip in the template**

Find the row that renders the item name (it uses `<ItemName>` somewhere in the template). Locate that line and append the pill markup directly after the `<ItemName>` tag inside the same name container:

```vue
<span
  v-if="showCrossWorld && crossWorldEntry"
  class="bdr__cross-pill"
  :class="{ 'is-home': isHomeServer }"
  data-testid="cross-world-pill"
>
  {{ crossWorldEntry.worldName }}<small v-if="isHomeServer">你</small>
</span>
<span
  v-else-if="showCrossWorld && crossWorldStatus === 'failed'"
  class="bdr__cross-retry"
  role="button"
  tabindex="0"
  data-testid="cross-world-retry"
  @click="onRetryCrossWorld"
  @keydown.enter="onRetryCrossWorld"
>
  跨服查價失敗 ↻
</span>
<span
  v-else-if="showCrossWorld && crossWorldFetching"
  class="bdr__cross-skel"
  aria-hidden="true"
/>
<span
  v-else-if="showCrossWorld && crossWorldStatus === 'ok' && !crossWorldEntry"
  class="bdr__cross-empty"
>
  跨服無掛單
</span>
```

- [ ] **Step 5: Add styles**

At the end of `<style scoped>`:

```css
.bdr__cross-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: oklch(0.58 0.20 15);              /* strawberry-jam */
  background: transparent;
  border: 1px solid oklch(0.58 0.20 15 / 0.35);
}

.bdr__cross-pill.is-home {
  color: var(--app-text);
  border-color: oklch(0.65 0.18 65 / 0.4); /* toast-gold */
  font-weight: 600;
}

.bdr__cross-pill small {
  font-size: 9.5px;
  padding: 1px 4px;
  border-radius: 999px;
  background: oklch(0.65 0.18 65 / 0.2);
  color: oklch(0.65 0.18 65);
  letter-spacing: 0.05em;
}

.bdr__cross-retry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--app-craft);
  background: transparent;
  border: 1px dashed var(--app-craft);
  cursor: pointer;
}

.bdr__cross-skel {
  display: inline-block;
  width: 4em;
  height: 14px;
  margin-left: 8px;
  background: linear-gradient(
    90deg,
    var(--app-cream-hover, oklch(0.94 0.025 85)) 0%,
    var(--app-border) 50%,
    var(--app-cream-hover, oklch(0.94 0.025 85)) 100%
  );
  background-size: 200% 100%;
  animation: bdr-skel 1.2s ease-in-out infinite;
  border-radius: 4px;
}

@keyframes bdr-skel {
  0%   { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

.bdr__cross-empty {
  margin-left: 8px;
  font-size: 11px;
  color: var(--app-text-muted);
  font-style: italic;
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- BomDecisionRow`
Expected: PASS.

- [ ] **Step 7: Manual smoke**

`npm run dev` → BOM page → switch 完成品預設 to 直購 with crossServer ON → confirm:
1. Target row shows the cheapest world's name as a pill next to the item name
2. Unit price column shows the cross-world minPrice (Fira Code, formatGil)
3. If home is the cheapest, pill says `{home server} · 你` with toast-gold accent
4. Toggling crossServer off makes the pill disappear

- [ ] **Step 8: Commit**

```bash
git add src/components/bom/BomDecisionRow.vue src/__tests__/components/bom/BomDecisionRow.test.ts
git commit -m "feat(bom): cross-world pill + price swap on target rows

Strawberry-jam pill marks the cheapest DC world; toast-gold-accented
when home itself wins. Skeleton / failed-retry / no-listings states."
```

---

## Task 10: BomTotalsReceipt cross-world segment

**Files:**
- Modify: `src/components/bom/BomTotalsReceipt.vue`

- [ ] **Step 1: Wire the breakdown**

In `BomTotalsReceipt.vue` script (after line 33), add:

```ts
const breakdown = computed(() => bom.effectiveGrandTotalBreakdown)
const showCrossWorldSegment = computed(() =>
  bom.targetDefaultMode === 'market' &&
  settings.crossServer === true &&
  bom.crossWorldBestPriceMap.size > 0 &&
  breakdown.value.savings > 0,
)
const crossServerCheapestWorlds = computed(() => {
  const worlds = new Set<string>()
  for (const entry of bom.crossWorldBestPriceMap.values()) {
    worlds.add(entry.worldName)
  }
  return Array.from(worlds).slice(0, 5).join(', ')
})
```

- [ ] **Step 2: Add the new totals lines**

In the methods column's `receipt__totals` block (around line 187-196), insert after the `vs 全部市買基準` line:

```vue
<div
  v-if="showCrossWorldSegment"
  class="receipt__totals-line receipt__totals-line--xworld"
  :title="`由 ${bom.crossWorldBestPriceMap.size} 個目標跨服比價得到。最低 server: ${crossServerCheapestWorlds}`"
>
  <span>跨服最佳</span>
  <b>{{ formatGil(breakdown.crossWorldBest) }} Gil</b>
</div>
<div
  v-if="showCrossWorldSegment"
  class="receipt__totals-line receipt__totals-line--saving"
>
  <span>跨服可省</span>
  <b>{{ formatGil(breakdown.savings) }} Gil</b>
</div>
```

- [ ] **Step 3: Add styles**

At the end of `<style scoped>`:

```css
.receipt__totals-line--xworld b {
  color: oklch(0.58 0.20 15);  /* strawberry-jam */
}

.receipt__totals-line--saving b {
  color: var(--app-success);
}
```

- [ ] **Step 4: Manual smoke**

`npm run dev` → BOM with at least one craftable target → 切到直購 + crossServer ON → 確認 receipt 中欄出現「跨服最佳」與「跨服可省」兩行；hover「跨服最佳」顯示 tooltip 列出 server 名稱。切回自製或關 crossServer，兩行消失。

- [ ] **Step 5: Commit**

```bash
git add src/components/bom/BomTotalsReceipt.vue
git commit -m "feat(bom): cross-world segment in receipt

Adds 跨服最佳 / 跨服可省 lines to the methods column when market mode
+ crossServer + measurable savings. Tooltip lists contributing worlds."
```

---

## Task 11: BomTotalsBar cockpit subtitle

**Files:**
- Modify: `src/components/bom/BomTotalsBar.vue`

The bar uses BEM-like `strip__*` prefix (see `BomTotalsBar.vue:107-126`). The hero is `<div class="strip__hero">` containing `<span class="strip__num">` and a `<span class="strip__pct">` chip. The subtitle slots in below the hero (sibling element).

- [ ] **Step 1: Wire breakdown + savings**

Open `src/components/bom/BomTotalsBar.vue`. The script already imports `useBomStore`, `useSettingsStore`, `formatGil`, and `computed`. Append to the script's computed block:

```ts
const breakdown = computed(() => bom.effectiveGrandTotalBreakdown)
const showSavings = computed(() =>
  bom.targetDefaultMode === 'market' &&
  settings.crossServer === true &&
  breakdown.value.savings > 0,
)
```

- [ ] **Step 2: Add subtitle to template**

In `BomTotalsBar.vue` template, immediately after the closing `</div>` of `<div class="strip__hero">` (around line 126), insert:

```vue
<div v-if="showSavings" class="strip__sub">
  省 {{ formatGil(breakdown.savings) }}g（vs 本服 {{ formatGil(breakdown.home) }}g）
</div>
```

- [ ] **Step 3: Add styles**

In `<style scoped>` of the same file, append:

```css
.strip__sub {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  color: var(--app-success);
  margin-top: 2px;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

- [ ] **Step 4: Manual smoke**

`npm run dev` → narrow viewport (≤ 767px) → BOM cockpit bar → confirm subtitle appears only when 直購 + crossServer + savings > 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/bom/BomTotalsBar.vue
git commit -m "feat(bom): savings subtitle on cockpit bar

Single-line 'save Xg (vs home Yg)' under the main total. Renders only
when market mode + crossServer + measurable savings."
```

---

## Task 12: Hook into calculate flow

**Files:**
- Modify: `src/views/BomView.vue`
- Test: smoke only

The calculate path triggers `bomStore.applyOptimalDefaults()` at `BomView.vue:126`. After it, we want the cross-world fetch to run automatically when the global toggle wants it.

- [ ] **Step 1: Add the auto-fetch**

In `src/views/BomView.vue`, after line 126 (`bomStore.applyOptimalDefaults()`), insert:

```ts
if (bomStore.targetDefaultMode === 'market' && settingsStore.crossServer) {
  void bomStore.fetchCrossWorldBestForTargets()
}
```

(If `settingsStore` is named differently in this file — `settings` is also common — match the local variable name. Check the existing imports at the top.)

- [ ] **Step 2: Run all tests + type check**

```
npm test
npx vue-tsc --noEmit
```

Expected: all green.

- [ ] **Step 4: Manual end-to-end smoke**

`npm run dev`:
1. Add a craftable target to BOM (e.g., a 50-level recipe)
2. Toggle 完成品預設 to 直購
3. Confirm row pill, unit price, receipt segment, cockpit subtitle all populate
4. Toggle crossServer off → segment + subtitle disappear, pill disappears
5. Reload page → 直購 mode persists
6. Refresh prices → cross-world map repopulates

- [ ] **Step 5: Commit**

```bash
git add src/views/BomView.vue
git commit -m "feat(bom): auto-fetch cross-world after calculate

When the global toggle is set to '直購' and crossServer is on, a
calculate triggers fetchCrossWorldBestForTargets without a separate
button press."
```

---

## Verification

- [ ] All Vitest tests pass: `npm test`
- [ ] TypeScript compiles: `npx vue-tsc --noEmit`
- [ ] Lint clean: `npm run lint` (if available)
- [ ] Manual smoke checklist (Task 12 Step 4) all green
- [ ] BOM tests cover: persistence, applyTargetDefault (4 cases), fetch (5 cases), breakdown (4 cases), reactivity (2 cases)
- [ ] Component tests cover: BomDecisionTable immutable=false, BomDecisionRow pill / retry / home variants

## Open follow-ups (out of scope)

- 「已自訂」flag 視覺（spec §10.2）
- Cockpit bar 在極窄寬度下的 fallback 文案
- Tooltip 中 server 列表超過 5 個的折疊規則
- en/ja 翻譯

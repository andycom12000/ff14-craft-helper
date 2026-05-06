# BOM 採購地點 + 採買路線規劃 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Each task is designed to be dispatched to a fresh subagent.** Each task header lists the spec sections to read and any prior tasks whose output it depends on. Do NOT try to read the whole plan into one subagent — the spec + the task body are enough context.

**Goal:** 在 BOM 頁面新增「採購地點展開區」與「採買路線 tab」兩塊功能；讓使用者展開 npc/gather row 可看到 NPC/採集點 + 地圖，切到「採買路線」tab 可看到分區的 checklist 邊跑邊勾。

**Architecture:** Pure-function 演算法（`route-planner.ts`）+ lazy-fetch 資料服務（`item-locations.ts` / `zone-meta.ts`）+ Pinia store 擴充 + 6 個新 Vue 元件。完全不重構 `item-acquisition.ts`、不動 `BomCraftTreeNode`、不動 `BomTotalsBar`。Tab 切換用 inline `<el-segmented>`、不包元件。

**Tech Stack:** Vue 3 + Pinia + Element Plus + TypeScript + vitest（unit）+ Chrome DevTools MCP（integration）。所有色彩用 OKLCH，遵守 Toast Workshop Jam-Jar Rule（cocoa-only marker，禁借 strawberry / matcha）。

**Spec:** `docs/superpowers/specs/2026-05-06-bom-acquisition-locations-and-route-planner-design.md`（必讀）

---

## Task Dependency Map

```
Phase 1: Foundation (independent, can dispatch in parallel)
  T1: map-coords + buildMapAssetUrl 抽 helper
  T2: aetherytes.json 靜態資料
  T3: route-planner.ts 純函式（完整 TDD）

Phase 2: Data services (depend on Phase 1; T4/T5/T6 independent of each other)
  T4: zone-meta.ts            depends-on: T1
  T5: item-locations.ts       depends-on: (none of above hard, but reads garland fixtures)
  T6: useZoneName + useNpcName composables   depends-on: T4

Phase 3: Store (sequential)
  T7: bom.ts store extension  depends-on: T3, T5

Phase 4: Components (depend on Phase 2/3; T8/T9 independent, T10-T12 sequentially or parallel)
  T8: BomAcquisitionDetail.vue              depends-on: T1, T5, T6
  T9: ZoneMapSheet.vue                      depends-on: T1, T6
  T10: RoutePlannerEyebrow + Toolbar        depends-on: T7
  T11: RoutePlannerGroupCard.vue            depends-on: T1, T6, T9
  T12: BomRoutePlanner.vue                  depends-on: T2, T3, T7, T10, T11

Phase 5: Wiring (sequential)
  T13: BomDecisionRow.vue 接 BomAcquisitionDetail   depends-on: T8
  T14: BomView.vue 接 tab + BomRoutePlanner        depends-on: T12, T13

Phase 6: Verification (sequential, last)
  T15: Integration smoke (Chrome DevTools MCP)     depends-on: T14
  T16: Brand QA (toast-gold ≤10% measurement)      depends-on: T14
```

---

## Task 1: 抽 `buildMapAssetUrl` helper + 加 `pixelToPercent`

**Spec sections to read:** §6.2 (重用清單), §7.2

**Files:**
- Modify: `src/api/garland.ts:115-134` — 把 inline 的 map asset URL 邏輯抽成 export helper
- Modify: `src/utils/map-coords.ts` — 加 `pixelToPercent`
- Test: `src/__tests__/utils/map-coords.test.ts`（新檔）

- [ ] **Step 1: Read 既存的 map asset URL 寫法**

讀 `src/api/garland.ts:115-134` 看現有 inline 實作（`const [folder, sub] = mapStringId.split('/')` + `const assetPath = ...`）。

- [ ] **Step 2: 寫 failing test for `buildMapAssetUrl`**

建檔 `src/__tests__/utils/map-coords.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildMapAssetUrl, pixelToPercent } from '@/utils/map-coords'

describe('buildMapAssetUrl', () => {
  it('builds canonical xivapi map asset path from "folder/sub" id', () => {
    expect(buildMapAssetUrl('r1f1/00')).toBe('ui/map/r1f1/00/r1f1_00_m.tex')
    expect(buildMapAssetUrl('w1d3/01')).toBe('ui/map/w1d3/01/w1d3_01_m.tex')
  })

  it('returns empty string for malformed id', () => {
    expect(buildMapAssetUrl('')).toBe('')
    expect(buildMapAssetUrl('no-slash')).toBe('')
  })
})

describe('pixelToPercent', () => {
  it('converts pixel coords to css percentage with default 2048 map', () => {
    expect(pixelToPercent(1024, 1024)).toEqual({ left: '50%', top: '50%' })
    expect(pixelToPercent(512, 0)).toEqual({ left: '25%', top: '0%' })
  })

  it('honors custom map pixel size', () => {
    expect(pixelToPercent(512, 512, 1024)).toEqual({ left: '50%', top: '50%' })
  })
})
```

- [ ] **Step 3: Run — should fail（function not exported）**

`pnpm test src/__tests__/utils/map-coords.test.ts`
Expected: FAIL — `buildMapAssetUrl is not a function` / `pixelToPercent is not a function`

- [ ] **Step 4: Implement in `src/utils/map-coords.ts`**

Append to existing file（保留現有 `convertToPixel` 與 `cropRegion`）：

```ts
export function buildMapAssetUrl(mapStringId: string): string {
  if (!mapStringId.includes('/')) return ''
  const [folder, sub] = mapStringId.split('/')
  if (!folder || !sub) return ''
  return `ui/map/${folder}/${sub}/${folder}_${sub}_m.tex`
}

export function pixelToPercent(px: number, py: number, mapPx = 2048): { left: string; top: string } {
  return {
    left: `${(px / mapPx) * 100}%`,
    top: `${(py / mapPx) * 100}%`,
  }
}
```

⚠️ **Note**：existing `garland.ts:126` 寫的是 `${folder}${sub}_m.tex`（沒底線）。確認真實 xivapi URL 模式——讀 `src/api/garland.ts:124-126` 對照，若實際用法不含底線就改 `${folder}${sub}_m.tex`。**對齊既有用法為準**，不要單方面變更。

- [ ] **Step 5: Run — should pass**

`pnpm test src/__tests__/utils/map-coords.test.ts`
Expected: PASS（4 tests）— 若 fail 是因為底線/格式判斷，調整 helper 與 test 至與 garland.ts 既有 URL 一致。

- [ ] **Step 6: Refactor `garland.ts` 使用 helper**

Modify `src/api/garland.ts:124-126`，把 inline `const [folder, sub] = ...; const assetPath = ...` 換成 `const assetPath = buildMapAssetUrl(mapStringId)`。

加 import：`import { buildMapAssetUrl } from '@/utils/map-coords'`

- [ ] **Step 7: Run 既有測試確保 garland.ts 沒壞**

`pnpm test`
Expected: 全綠

- [ ] **Step 8: Commit**

```bash
git add src/utils/map-coords.ts src/__tests__/utils/map-coords.test.ts src/api/garland.ts
git commit -m "refactor(utils): extract buildMapAssetUrl helper from garland.ts; add pixelToPercent"
```

---

## Task 2: 建 `public/data/aetherytes.json`

**Spec sections to read:** §6.2（aetherytes.json 段）

**Files:**
- Create: `public/data/aetherytes.json`
- Create: `scripts/build-aetherytes.mjs`（半自動產生用，optional）

**Approach**：手寫覆蓋核心地區（A Realm Reborn ~30 zones、Heavensward ~10、Stormblood ~10、Shadowbringers ~10、Endwalker ~10、Dawntrail ~10、住宅區 4）。Aetheryte 名稱與座標可從 [garlandtools.org](https://garlandtools.org/db/#group/aetherytes) 或 xivapi `Aetheryte` sheet 抓取後人工驗證。

`tpCostBase` 用「中等等級角色（Lv60）的傳送成本」估值，~150-450G 之間（不模擬熟悉度折扣）。

- [ ] **Step 1: 寫 schema commit 的最小可運作 fixture**

Create `public/data/aetherytes.json`：

```json
{
  "schema": 1,
  "zones": {
    "146": {
      "zoneName": "拉諲西亞低地",
      "aetherytes": [
        { "name": "莫拉比造船廠", "x": 28.7, "y": 33.1, "tpCostBase": 213 }
      ]
    },
    "153": {
      "zoneName": "東拉諲西亞",
      "aetherytes": [
        { "name": "葛利達尼亞", "x": 23.6, "y": 18.8, "tpCostBase": 213 }
      ]
    },
    "155": {
      "zoneName": "庫爾札斯西部高地",
      "aetherytes": [
        { "name": "鏡石之間", "x": 26.5, "y": 28.9, "tpCostBase": 425 }
      ]
    }
  }
}
```

- [ ] **Step 2: 寫 type guard test 確保檔案結構正確**

Create `src/__tests__/utils/aetherytes-data.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import data from '../../../public/data/aetherytes.json'

describe('aetherytes.json', () => {
  it('has schema=1', () => {
    expect(data.schema).toBe(1)
  })

  it('has at least 3 zones in initial commit', () => {
    expect(Object.keys(data.zones).length).toBeGreaterThanOrEqual(3)
  })

  it('every aetheryte has name, x, y, tpCostBase', () => {
    for (const [zid, zone] of Object.entries(data.zones)) {
      expect(zone.zoneName).toBeTruthy()
      for (const a of zone.aetherytes) {
        expect(a.name, `zone ${zid}`).toBeTruthy()
        expect(typeof a.x).toBe('number')
        expect(typeof a.y).toBe('number')
        expect(a.tpCostBase).toBeGreaterThan(0)
      }
    }
  })
})
```

- [ ] **Step 3: Run test — should pass**

`pnpm test src/__tests__/utils/aetherytes-data.test.ts`

- [ ] **Step 4: Commit MVP fixture**

```bash
git add public/data/aetherytes.json src/__tests__/utils/aetherytes-data.test.ts
git commit -m "feat(bom): aetherytes.json initial fixture (3 zones for MVP)"
```

- [ ] **Step 5: Expand to ~150 zones（後續可分批 commit）**

從 garlandtools 抓所有 zone，整理成 same schema，分批 commit：
- Commit A: ARR 30 zones
- Commit B: HW + SB 20 zones
- Commit C: ShB + EW + DT 30 zones
- Commit D: 住宅區 + 公會領地

每批 commit message：`data(bom): aetherytes for <expansion>`。每批跑 `pnpm test src/__tests__/utils/aetherytes-data.test.ts` 確認 schema 不破。

⚠️ 若時間有限，可只先 commit MVP fixture，剩下 zones 標 TODO 在 issue 並繼續 plan；UI 對 zone 找不到的 case 已有 fallback（顯示 `?G` warning）。

---

## Task 3: `route-planner.ts` — 純函式演算法（完整 TDD）

**Spec sections to read:** §7.1（演算法步驟與 type）, §3（marker 視覺對應）

**Files:**
- Create: `src/services/route-planner.ts`
- Create: `src/__tests__/services/route-planner.test.ts`

**Self-contained types**（這些只在這個 task 內定義，後面 T11/T12 會 import）：

```ts
export type RouteMode = 'npc' | 'gather'

export interface ChosenSource {
  zoneId: number
  x: number
  y: number
  vendorName?: string
  nodeLevel?: number
  itemPrice?: number
}

export interface RouteRow {
  itemId: number
  mode: RouteMode
  qty: number
  sources: ChosenSource[]
}

export interface AetheryteInfo {
  name: string
  x: number
  y: number
  tpCostBase: number
}

export interface Group {
  zoneId: number
  aetheryte: AetheryteInfo | null
  tpCost: number
  rows: Array<{ itemId: number; source: ChosenSource; orderInZone: number }>
  isHero?: boolean
}

export interface RouteInput {
  rows: RouteRow[]
  aetherytes: Map<number, AetheryteInfo[]>
  optimizeBy: 'gil' | 'hop'
  excluded: Set<number>
}

export interface RouteOutput {
  groups: Group[]
  totalTpCost: number
  totalHops: number
}
```

- [ ] **Step 1: 建測試檔的骨架 + 第一個案例（empty input）**

```ts
import { describe, it, expect } from 'vitest'
import { sortRoute, type RouteInput } from '@/services/route-planner'

const baseInput = (overrides: Partial<RouteInput> = {}): RouteInput => ({
  rows: [],
  aetherytes: new Map(),
  optimizeBy: 'gil',
  excluded: new Set(),
  ...overrides,
})

describe('sortRoute', () => {
  it('returns empty groups for empty input', () => {
    const out = sortRoute(baseInput())
    expect(out.groups).toEqual([])
    expect(out.totalTpCost).toBe(0)
    expect(out.totalHops).toBe(0)
  })
})
```

- [ ] **Step 2: Run — fail（module not found）**

`pnpm test src/__tests__/services/route-planner.test.ts`
Expected: FAIL — `Cannot find module '@/services/route-planner'`

- [ ] **Step 3: 最小 implementation 讓 empty case 過**

Create `src/services/route-planner.ts` with the type exports above plus:

```ts
export function sortRoute(_input: RouteInput): RouteOutput {
  return { groups: [], totalTpCost: 0, totalHops: 0 }
}
```

- [ ] **Step 4: Run — pass**

- [ ] **Step 5: 加 case「過濾水晶與 excluded」**

```ts
it('filters crystals (itemId<20) and excluded items', () => {
  const out = sortRoute(baseInput({
    rows: [
      { itemId: 5, mode: 'gather', qty: 1, sources: [{ zoneId: 146, x: 1, y: 1 }] },     // crystal
      { itemId: 100, mode: 'gather', qty: 1, sources: [{ zoneId: 146, x: 1, y: 1 }] },   // excluded
      { itemId: 200, mode: 'npc', qty: 1, sources: [{ zoneId: 146, x: 1, y: 1, itemPrice: 50 }] },
    ],
    aetherytes: new Map([[146, [{ name: 'A', x: 0, y: 0, tpCostBase: 100 }]]]),
    excluded: new Set([100]),
  }))
  expect(out.groups).toHaveLength(1)
  expect(out.groups[0].rows.map(r => r.itemId)).toEqual([200])
})
```

- [ ] **Step 6: Implement filtering**

```ts
export function sortRoute(input: RouteInput): RouteOutput {
  const filtered = input.rows.filter(r => r.itemId >= 20 && !input.excluded.has(r.itemId))
  if (filtered.length === 0) return { groups: [], totalTpCost: 0, totalHops: 0 }
  // ... continue below
}
```

- [ ] **Step 7-15: TDD 後續案例 — 一次一案例 + 一次 implementation**

逐案加，每案 commit 一次（小步前進）。完整案例清單：

7. **`pickPrimarySource` Pass 1（gil mode 挑最便宜）**：兩個 sources，回傳便宜那個的 zoneId
8. **Tie-break**：itemPrice 相同時，gather 用 nodeLevel ASC、npc 用 vendorName 字典序
9. **`pickNearestAetheryte`**：zone 內多 aetheryte 時取距 centroid 最近
10. **Zone 內排序**：依距 aetheryte 升冪，編號 1..N
11. **Zone 之間排序**：tpCost ASC；null aetheryte 排最後
12. **Pass 2（hop mode）**：把冷門 zone 的 row 移到熱門 zone（驗 30% gil cap 不被踩過）
13. **`markHero`**：≥2 groups 時挑「件數最多 or 預估 gil 最大」標 isHero；單 group 不標
14. **`tpCost` 計算**：zone 在 `aetherytes.json` 中 → tpCost = aetheryte.tpCostBase；不在 → 0
15. **stress: 20 列、5 zone、混 npc/gather**：驗整體 group/order 結構

每個 step：
- 先寫 test
- Run — fail
- 加 implementation
- Run — pass
- Commit `test(route-planner): <case>` + `feat(route-planner): <case>`

- [ ] **Step 16: 完整 commit**

```bash
git add src/services/route-planner.ts src/__tests__/services/route-planner.test.ts
git commit -m "feat(bom): route-planner pure function with greedy hop heuristic"
```

---

## Task 4: `zone-meta.ts` — xivapi bulk metadata

**Spec sections to read:** §6.2（zone-meta 段）, 既有範本 `src/api/garland.ts:104-134`

**Depends on:** T1（buildMapAssetUrl）

**Files:**
- Create: `src/services/zone-meta.ts`
- Create: `src/__tests__/services/zone-meta.test.ts`

**核心責任**：給一批 zoneIds 或 npcIds，**一次** xivapi 查回所有名稱與地圖 asset，cache 在模組層。**不**像 `garland.ts` 那樣 per-id loop。

**xivapi bulk query 範例**：
- `GET /Sheet/PlaceName?rows=146,147,148&fields=Name,Name_ja,Name_en,Name_chs`
- `GET /Sheet/Map?rows=12,13,14&fields=Id,SizeFactor,PlaceName.Id`
- `GET /Sheet/ENpcResident?rows=1001,1002&fields=Singular_chs`

`Name_chs` 拿到後用 `sToT()`（已存在於 `src/utils/s2t.ts`）轉繁中。

- [ ] **Step 1: 定義 export 介面 + 模組 cache**

Create `src/services/zone-meta.ts`：

```ts
import { sToT } from '@/utils/s2t'
import { buildMapAssetUrl } from '@/utils/map-coords'

export type Locale = 'zh-TW' | 'zh-CN' | 'en' | 'ja'

export interface ZoneMeta {
  zoneNameByLocale: Map<Locale, string>
  mapAssetUrl: string
  sizeFactor: number
}

const zoneCache = new Map<number, ZoneMeta>()
const npcCache = new Map<number, Map<Locale, string>>()
const zoneInflight = new Map<string, Promise<void>>()  // key = sorted ids csv
const npcInflight = new Map<string, Promise<void>>()

export async function fetchZoneMetaBulk(zoneIds: number[]): Promise<Map<number, ZoneMeta>> {
  // ... step 4
}

export function getZoneMetaSync(zoneId: number): ZoneMeta | null {
  return zoneCache.get(zoneId) ?? null
}

export async function fetchNpcNameBulk(npcIds: number[]): Promise<Map<number, Map<Locale, string>>> {
  // ... step 6
}

export function getNpcNameSync(npcId: number, locale: Locale): string | null {
  return npcCache.get(npcId)?.get(locale) ?? null
}

// for tests
export function __clearCache() {
  zoneCache.clear()
  npcCache.clear()
  zoneInflight.clear()
  npcInflight.clear()
}
```

- [ ] **Step 2: 寫 fetch 與 parse 的 test fixture**

Create `src/__tests__/services/zone-meta.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  fetchZoneMetaBulk,
  getZoneMetaSync,
  fetchNpcNameBulk,
  getNpcNameSync,
  __clearCache,
} from '@/services/zone-meta'

beforeEach(() => {
  __clearCache()
  vi.restoreAllMocks()
})

const mockFetch = (responses: Record<string, unknown>) => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    for (const [pattern, body] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return { ok: true, json: async () => body } as Response
      }
    }
    return { ok: false, status: 404 } as Response
  }))
}

describe('fetchZoneMetaBulk', () => {
  it('issues a single PlaceName query and a single Map query for N zoneIds', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ rows: [
        { row_id: 146, fields: { Name_chs: '拉诺西亚低地', Name_en: 'Lower La Noscea', Name_ja: '低地ラノシア', Name: '低地拉諾西亞' } },
        { row_id: 153, fields: { Name_chs: '东拉诺西亚', Name_en: 'Eastern La Noscea', Name_ja: '東ラノシア', Name: '東拉諾西亞' } },
      ] }),
    } as Response))
    vi.stubGlobal('fetch', fetchSpy)

    await fetchZoneMetaBulk([146, 153])
    // PlaceName + Map = 2 calls regardless of how many zones
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('caches results — second call with same ids does no fetch', async () => {
    mockFetch({
      'PlaceName': { rows: [{ row_id: 146, fields: { Name_chs: '拉诺西亚低地' } }] },
      'Map': { rows: [{ row_id: 12, fields: { Id: 'r1f1/00', SizeFactor: 100, 'PlaceName.Id': 146 } }] },
    })
    await fetchZoneMetaBulk([146])
    const fetchSpy = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>)
    fetchSpy.mockClear()
    await fetchZoneMetaBulk([146])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('exposes zh-TW name (s2t-converted from Name_chs)', async () => {
    mockFetch({
      'PlaceName': { rows: [{ row_id: 146, fields: { Name_chs: '拉诺西亚低地', Name_en: 'X', Name_ja: 'Y' } }] },
      'Map': { rows: [{ row_id: 12, fields: { Id: 'r1f1/00', SizeFactor: 100, 'PlaceName.Id': 146 } }] },
    })
    await fetchZoneMetaBulk([146])
    const meta = getZoneMetaSync(146)
    expect(meta?.zoneNameByLocale.get('zh-TW')).toMatch(/拉|諾|諲/)  // zh-TW form
    expect(meta?.zoneNameByLocale.get('en')).toBe('X')
    expect(meta?.mapAssetUrl).toContain('r1f1')
  })

  it('inflight dedupe — concurrent calls share one fetch', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ rows: [] }),
    } as Response))
    vi.stubGlobal('fetch', fetchSpy)
    await Promise.all([fetchZoneMetaBulk([146]), fetchZoneMetaBulk([146])])
    expect(fetchSpy).toHaveBeenCalledTimes(2)  // PlaceName + Map, NOT 4
  })
})

describe('fetchNpcNameBulk', () => {
  it('returns localized NPC names', async () => {
    mockFetch({
      'ENpcResident': { rows: [
        { row_id: 1001, fields: { Singular_chs: '商人甲', Singular_en: 'Vendor A', Singular_ja: '商人甲' } },
      ] },
    })
    await fetchNpcNameBulk([1001])
    expect(getNpcNameSync(1001, 'en')).toBe('Vendor A')
    expect(getNpcNameSync(1001, 'zh-TW')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run — fail (functions not implemented)**

- [ ] **Step 4-6: Implement `fetchZoneMetaBulk`、`fetchNpcNameBulk`**

關鍵實作點：
- xivapi base URL：read `src/api/xivapi.ts` 看 `XIVAPI_SHEET_BASE`，用同一個（避免硬寫常數）
- inflight key = `[...new Set(ids)].sort().join(',')`，先 dedupe 已 cached 的 id
- PlaceName + Map 兩個 query 用 `Promise.all` 並行
- 對每個 zone：把 PlaceName.Id 反查回 zoneId（PlaceName.Id IS the zoneId per spec）；Map.PlaceName.Id 連到 zone
- `Name_chs` → `sToT(name)` → 存入 `zoneNameByLocale.set('zh-TW', tName)`
- 失敗 → cache 不寫，回傳已 cached 的 partial map（不 throw，與 `item-acquisition.ts` PERMISSIVE 模式一致）

- [ ] **Step 7: Run — all pass**

- [ ] **Step 8: Commit**

```bash
git add src/services/zone-meta.ts src/__tests__/services/zone-meta.test.ts
git commit -m "feat(bom): zone-meta service with bulk xivapi lookup and module cache"
```

---

## Task 5: `item-locations.ts` — garlandtools partials parser

**Spec sections to read:** §6.2（item-locations 段）, §8（edge cases for garlandtools）, 既有範本 `src/services/item-acquisition.ts:25-106`

**Files:**
- Create: `src/services/item-locations.ts`
- Create: `src/__tests__/services/item-locations.test.ts`

**Self-contained types**（後面 T7/T8/T11 會 import）：

```ts
export interface ItemLocations {
  npcVendors: Array<{ npcId: number; zoneId: number; x: number; y: number; price?: number }>
  gatherNodes: Array<{ nodeId: number; type: 'MIN' | 'BTN' | 'FSH'; level: number; zoneId: number; x: number; y: number }>
}
```

**garlandtools partials shape**（從 `https://garlandtools.org/db/doc/item/en/3/<id>.json`）：

```jsonc
{
  "item": {
    "id": 5057,
    "vendors": [1001234, 1001235],   // npcIds
    "nodes": [12345, 12346],          // nodeIds
    "fishingSpots": [],
    // ...
  },
  "partials": [
    { "type": "npc", "id": "1001234", "obj": { "n": "Vendor A", "c": [25.4, 31.2], "z": 146 } },
    { "type": "node", "id": "12345", "obj": { "n": "Lv45 採金點", "l": 45, "t": 0, "c": [22, 18], "z": 146 } }
  ]
}
```

`obj.t`：node type 編號（0/1=MIN，2/3=BTN，4=FSH）— 沿用 `garland.ts:34-36` 的 `classFromType()`。
`obj.z` = zoneId。
`obj.c` = `[x, y]`。
NPC 的 price 在 `item.price` 欄位（gil-only vendor 才有）。

- [ ] **Step 1: 寫 `parseGarlandLocations` 純函式 + 一組 fixture test**

Create `src/__tests__/services/item-locations.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { parseGarlandLocations, type GarlandItemDocument } from '@/services/item-locations'

const doc = (item: GarlandItemDocument['item'], partials: GarlandItemDocument['partials']): GarlandItemDocument =>
  ({ item, partials })

describe('parseGarlandLocations', () => {
  it('extracts NPC vendors from partials', () => {
    const out = parseGarlandLocations(doc(
      { id: 1, vendors: [1001234], price: 240 },
      [{ type: 'npc', id: '1001234', obj: { n: 'X', c: [25.4, 31.2], z: 146 } }],
    ))
    expect(out.npcVendors).toEqual([{ npcId: 1001234, zoneId: 146, x: 25.4, y: 31.2, price: 240 }])
  })

  it('extracts gather nodes with classified type and level', () => {
    const out = parseGarlandLocations(doc(
      { id: 1, nodes: [12345] },
      [{ type: 'node', id: '12345', obj: { n: 'X', l: 45, t: 0, c: [22, 18], z: 146 } }],
    ))
    expect(out.gatherNodes).toEqual([
      { nodeId: 12345, type: 'MIN', level: 45, zoneId: 146, x: 22, y: 18 },
    ])
  })

  it('classifies BTN (t=2,3) and FSH (t=4)', () => {
    const out = parseGarlandLocations(doc(
      { id: 1, nodes: [1, 2] },
      [
        { type: 'node', id: '1', obj: { n: 'A', l: 50, t: 2, c: [0, 0], z: 1 } },
        { type: 'node', id: '2', obj: { n: 'B', l: 50, t: 4, c: [0, 0], z: 1 } },
      ],
    ))
    expect(out.gatherNodes.map(n => n.type)).toEqual(['BTN', 'FSH'])
  })

  it('drops vendor partials missing zoneId or coords', () => {
    const out = parseGarlandLocations(doc(
      { id: 1, vendors: [1, 2, 3] },
      [
        { type: 'npc', id: '1', obj: { n: 'No coords', z: 146 } },
        { type: 'npc', id: '2', obj: { n: 'No zone', c: [10, 10] } },
        { type: 'npc', id: '3', obj: { n: 'OK', c: [10, 10], z: 146 } },
      ],
    ))
    expect(out.npcVendors.map(v => v.npcId)).toEqual([3])
  })

  it('returns empty arrays when item has no vendors/nodes/fishingSpots', () => {
    const out = parseGarlandLocations(doc({ id: 1 }, []))
    expect(out).toEqual({ npcVendors: [], gatherNodes: [] })
  })
})
```

- [ ] **Step 2-3: Run fail → implement parser → pass**

```ts
export interface GarlandItemDocument {
  item?: {
    id: number
    vendors?: number[]
    nodes?: number[]
    fishingSpots?: number[]
    spearfishingSpots?: number[]
    price?: number
  }
  partials?: Array<{ type: string; id: string; obj: { n?: string; c?: [number, number]; z?: number; l?: number; t?: number } }>
}

export function parseGarlandLocations(doc: GarlandItemDocument): ItemLocations {
  const partials = doc.partials ?? []
  const item = doc.item ?? { id: 0 }
  const price = typeof item.price === 'number' && item.price > 0 ? item.price : undefined

  const npcVendors: ItemLocations['npcVendors'] = []
  for (const id of item.vendors ?? []) {
    const p = partials.find(x => x.type === 'npc' && Number(x.id) === id)
    if (!p?.obj.c || typeof p.obj.z !== 'number') continue
    npcVendors.push({ npcId: id, zoneId: p.obj.z, x: p.obj.c[0], y: p.obj.c[1], price })
  }

  const gatherNodes: ItemLocations['gatherNodes'] = []
  const nodeIds = [...(item.nodes ?? []), ...(item.fishingSpots ?? []), ...(item.spearfishingSpots ?? [])]
  for (const id of nodeIds) {
    const p = partials.find(x => x.type === 'node' && Number(x.id) === id)
    if (!p?.obj.c || typeof p.obj.z !== 'number') continue
    const t = p.obj.t ?? 0
    const type: 'MIN' | 'BTN' | 'FSH' = t <= 1 ? 'MIN' : t <= 3 ? 'BTN' : 'FSH'
    gatherNodes.push({ nodeId: id, type, level: p.obj.l ?? 0, zoneId: p.obj.z, x: p.obj.c[0], y: p.obj.c[1] })
  }

  return { npcVendors, gatherNodes }
}
```

- [ ] **Step 4: Add network wrapper + LRU + inflight dedupe**

```ts
const LRU_LIMIT = 500
const cache = new Map<number, ItemLocations>()
const inflight = new Map<number, Promise<ItemLocations>>()
const accessOrder: number[] = []  // most-recently-used last

function evictIfFull() {
  while (cache.size > LRU_LIMIT && accessOrder.length > 0) {
    const oldest = accessOrder.shift()!
    cache.delete(oldest)
  }
}

function touch(id: number) {
  const idx = accessOrder.indexOf(id)
  if (idx >= 0) accessOrder.splice(idx, 1)
  accessOrder.push(id)
}

const GARLAND_ITEM = 'https://garlandtools.org/db/doc/item/en/3'

export async function fetchItemLocations(itemId: number): Promise<ItemLocations> {
  const cached = cache.get(itemId)
  if (cached) { touch(itemId); return cached }
  const existing = inflight.get(itemId)
  if (existing) return existing
  const p = (async () => {
    try {
      const resp = await fetch(`${GARLAND_ITEM}/${itemId}.json`)
      if (!resp.ok) return { npcVendors: [], gatherNodes: [] }
      const doc: GarlandItemDocument = await resp.json()
      const result = parseGarlandLocations(doc)
      cache.set(itemId, result)
      touch(itemId)
      evictIfFull()
      return result
    } catch {
      return { npcVendors: [], gatherNodes: [] }
    } finally {
      inflight.delete(itemId)
    }
  })()
  inflight.set(itemId, p)
  return p
}

export async function fetchItemLocationsBatch(itemIds: number[], concurrency = 6): Promise<Map<number, ItemLocations>> {
  const results = new Map<number, ItemLocations>()
  const queue = [...new Set(itemIds)]
  async function worker() {
    while (queue.length > 0) {
      const id = queue.shift()!
      const info = await fetchItemLocations(id)
      results.set(id, info)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  return results
}

export function __clearCache() { cache.clear(); inflight.clear(); accessOrder.length = 0 }
```

- [ ] **Step 5: 加 LRU 與 dedupe 測試**

```ts
import { fetchItemLocations, fetchItemLocationsBatch, __clearCache } from '@/services/item-locations'
import { vi, beforeEach } from 'vitest'

beforeEach(() => { __clearCache(); vi.restoreAllMocks() })

it('LRU evicts oldest when over 500 entries', async () => {
  // mock fetch to return empty
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ item: { id: 1 } }) }) as Response))
  for (let i = 1; i <= 501; i++) await fetchItemLocations(i)
  // touch id=1 by re-fetching — but it should have been evicted, so a new fetch happens
  const fetchSpy = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>)
  fetchSpy.mockClear()
  await fetchItemLocations(1)
  expect(fetchSpy).toHaveBeenCalled()
})

it('inflight dedupe — concurrent fetchItemLocations(same id) shares one fetch', async () => {
  const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ item: { id: 100 } }) }) as Response)
  vi.stubGlobal('fetch', fetchSpy)
  await Promise.all([fetchItemLocations(100), fetchItemLocations(100), fetchItemLocations(100)])
  expect(fetchSpy).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 6: Run — all pass**

- [ ] **Step 7: Commit**

```bash
git add src/services/item-locations.ts src/__tests__/services/item-locations.test.ts
git commit -m "feat(bom): item-locations service with garlandtools partials parser, LRU 500"
```

---

## Task 6: `useZoneName` + `useNpcName` composables

**Spec sections to read:** §6.2（composable 段）, 範本 `src/composables/useItemName.ts:1-14`

**Depends on:** T4（zone-meta cache）

**Files:**
- Create: `src/composables/useZoneName.ts`
- Create: `src/composables/useNpcName.ts`
- Create: `src/__tests__/composables/useZoneName.test.ts`

- [ ] **Step 1: Read 範本**

讀 `src/composables/useItemName.ts:1-14` — 14 行的整個檔。

- [ ] **Step 2: Implement `useZoneName`**

Create `src/composables/useZoneName.ts`：

```ts
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { getZoneMetaSync, type Locale } from '@/services/zone-meta'

export function useZoneName(zoneId: MaybeRefOrGetter<number>): ComputedRef<string> {
  const localeStore = useLocaleStore()
  return computed(() => {
    const locale = localeStore.current as Locale
    const id = toValue(zoneId)
    const meta = getZoneMetaSync(id)
    return meta?.zoneNameByLocale.get(locale) ?? meta?.zoneNameByLocale.get('en') ?? `#zone:${id}`
  })
}
```

- [ ] **Step 3: Implement `useNpcName`** — 同樣模板，讀 `getNpcNameSync(id, locale)`

```ts
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { getNpcNameSync, type Locale } from '@/services/zone-meta'

export function useNpcName(npcId: MaybeRefOrGetter<number>): ComputedRef<string> {
  const localeStore = useLocaleStore()
  return computed(() => {
    const locale = localeStore.current as Locale
    const id = toValue(npcId)
    return getNpcNameSync(id, locale) ?? getNpcNameSync(id, 'en') ?? `#npc:${id}`
  })
}
```

- [ ] **Step 4: Smoke test**

Create `src/__tests__/composables/useZoneName.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useZoneName } from '@/composables/useZoneName'
import { fetchZoneMetaBulk, __clearCache } from '@/services/zone-meta'

beforeEach(() => {
  setActivePinia(createPinia())
  __clearCache()
  vi.restoreAllMocks()
})

it('reactive to locale switch', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => url.includes('PlaceName')
      ? { rows: [{ row_id: 146, fields: { Name_chs: '拉诺西亚低地', Name_en: 'Lower La Noscea' } }] }
      : { rows: [{ row_id: 12, fields: { Id: 'r1f1/00', SizeFactor: 100, 'PlaceName.Id': 146 } }] },
  } as Response)))
  await fetchZoneMetaBulk([146])
  const name = useZoneName(() => 146)
  expect(name.value).toMatch(/拉|諾|諲/)  // current locale is zh-TW
})
```

- [ ] **Step 5: Commit**

```bash
git add src/composables/useZoneName.ts src/composables/useNpcName.ts src/__tests__/composables/useZoneName.test.ts
git commit -m "feat(bom): useZoneName / useNpcName composables (locale-reactive, no re-fetch)"
```

---

## Task 7: 擴充 `bom.ts` store

**Spec sections to read:** §6.3（Store 改動完整段）

**Depends on:** T3（route-planner types）, T5（item-locations types）

**Files:**
- Modify: `src/stores/bom.ts` — 加 state + actions（**保留所有既有內容**）
- Modify: `src/__tests__/stores/bom.test.ts` — 加新 state 的測試
- Create: `src/__tests__/stores/bom-route-session.test.ts` — 隔離測試新邏輯

**新增的 state**（加在現有 ref 旁，不取代任何既有 ref）：

```ts
import type { ItemLocations } from '@/services/item-locations'
import { fetchItemLocationsBatch } from '@/services/item-locations'

const itemLocations = ref<Map<number, ItemLocations>>(new Map())

const routeViewPrefs = ref<{ optimizeBy: 'gil' | 'hop' }>({
  optimizeBy: readPrefsFromLs() ?? 'gil',
})

const routeViewSession = ref<{
  excluded: Set<number>
  checked: Set<number>
  collapsedGroups: Set<number>
}>({ excluded: new Set(), checked: new Set(), collapsedGroups: new Set() })
```

- [ ] **Step 1: 寫 `targetSig` computed + 測 stable**

加在 store 內：

```ts
const targetSig = computed(() => {
  return targets.value
    .slice()
    .sort((a, b) => a.itemId - b.itemId)
    .map(t => `${t.itemId}:${t.quantity}`)
    .join(',')
})
```

寫 test in `bom-route-session.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBomStore } from '@/stores/bom'

beforeEach(() => setActivePinia(createPinia()))

describe('targetSig', () => {
  it('canonical CSV stable regardless of insert order', () => {
    const a = useBomStore()
    a.addTarget({ itemId: 100, recipeId: 1, name: 'A', icon: '', quantity: 2 })
    a.addTarget({ itemId: 50, recipeId: 2, name: 'B', icon: '', quantity: 1 })
    const sigA = a.targetSig

    setActivePinia(createPinia())
    const b = useBomStore()
    b.addTarget({ itemId: 50, recipeId: 2, name: 'B', icon: '', quantity: 1 })
    b.addTarget({ itemId: 100, recipeId: 1, name: 'A', icon: '', quantity: 2 })
    expect(b.targetSig).toBe(sigA)
  })
})
```

- [ ] **Step 2: 加 LRU 儲存 helper（純函式，可單測）**

```ts
const ROUTE_LRU_LIMIT = 8
const ROUTE_KEY_PREFIX = 'bom-route::'
const PREFS_KEY = 'bom-route-prefs'

function readPrefsFromLs(): 'gil' | 'hop' | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed.optimizeBy === 'hop' ? 'hop' : parsed.optimizeBy === 'gil' ? 'gil' : null
  } catch { return null }
}

function writePrefsToLs(prefs: { optimizeBy: 'gil' | 'hop' }) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch {}
}

function lsKey(sig: string) { return `${ROUTE_KEY_PREFIX}${sig}` }

function evictLru() {
  try {
    const keys: Array<[string, number]> = []  // key, mtime-like (use insertion order proxy)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (k.startsWith(ROUTE_KEY_PREFIX)) {
        // localStorage doesn't track mtime; we encode `_mtime` inside the value
        try {
          const v = JSON.parse(localStorage.getItem(k)!)
          keys.push([k, v._mtime ?? 0])
        } catch { localStorage.removeItem(k) }
      }
    }
    if (keys.length <= ROUTE_LRU_LIMIT) return
    keys.sort((a, b) => a[1] - b[1])
    const toRemove = keys.length - ROUTE_LRU_LIMIT
    for (let i = 0; i < toRemove; i++) localStorage.removeItem(keys[i][0])
  } catch {}
}

function loadSession(sig: string): { excluded: Set<number>; checked: Set<number>; collapsedGroups: Set<number> } {
  try {
    const raw = localStorage.getItem(lsKey(sig))
    if (!raw) return { excluded: new Set(), checked: new Set(), collapsedGroups: new Set() }
    const v = JSON.parse(raw)
    return {
      excluded: new Set(v.excluded ?? []),
      checked: new Set(v.checked ?? []),
      collapsedGroups: new Set(v.collapsedGroups ?? []),
    }
  } catch { return { excluded: new Set(), checked: new Set(), collapsedGroups: new Set() } }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null
function scheduleWrite(sig: string, session: typeof routeViewSession.value) {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    try {
      localStorage.setItem(lsKey(sig), JSON.stringify({
        excluded: [...session.excluded],
        checked: [...session.checked],
        collapsedGroups: [...session.collapsedGroups],
        _mtime: Date.now(),
      }))
      evictLru()
    } catch {}
    writeTimer = null
  }, 500)
}
```

- [ ] **Step 3: Watch `targetSig` → load/reset session**

```ts
import { watch } from 'vue'

watch(targetSig, (next) => {
  routeViewSession.value = loadSession(next)
}, { immediate: true })

watch(routeViewSession, (next) => {
  if (targetSig.value) scheduleWrite(targetSig.value, next)
}, { deep: true })

watch(routeViewPrefs, (next) => writePrefsToLs(next), { deep: true })
```

- [ ] **Step 4: 寫測試 (LRU evict + debounce)**

```ts
it('debounce: 5 mutations within 500ms = 1 localStorage write', async () => {
  vi.useFakeTimers()
  const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
  const store = useBomStore()
  store.addTarget({ itemId: 100, recipeId: 1, name: 'A', icon: '', quantity: 1 })
  setItemSpy.mockClear()
  for (let i = 0; i < 5; i++) {
    store.routeViewSession.checked.add(i + 100)
    store.routeViewSession = { ...store.routeViewSession }  // trigger reactivity
  }
  vi.advanceTimersByTime(600)
  expect(setItemSpy.mock.calls.filter(([k]) => String(k).startsWith('bom-route::'))).toHaveLength(1)
})

it('LRU: writing 9 different target sigs leaves 8 keys', () => {
  const store = useBomStore()
  for (let i = 1; i <= 9; i++) {
    store.clearTargets()
    store.addTarget({ itemId: 100 + i, recipeId: 1, name: 'A', icon: '', quantity: 1 })
    store.routeViewSession.checked.add(999)
    store.routeViewSession = { ...store.routeViewSession }
    vi.advanceTimersByTime(600)
  }
  let count = 0
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i)!.startsWith('bom-route::')) count++
  }
  expect(count).toBeLessThanOrEqual(8)
})
```

- [ ] **Step 5: 加 actions（fetchItemLocationsForRoute、setOptimizeBy、toggleChecked、toggleExcluded、toggleGroupCollapsed）**

```ts
async function fetchItemLocationsForRoute(itemIds: number[]) {
  const fresh = await fetchItemLocationsBatch(itemIds)
  const merged = new Map(itemLocations.value)
  for (const [id, info] of fresh) merged.set(id, info)
  itemLocations.value = merged
}

function setOptimizeBy(mode: 'gil' | 'hop') {
  if (routeViewPrefs.value.optimizeBy === mode) return
  routeViewPrefs.value = { optimizeBy: mode }
}

function toggleChecked(itemId: number) {
  const next = new Set(routeViewSession.value.checked)
  if (next.has(itemId)) next.delete(itemId); else next.add(itemId)
  routeViewSession.value = { ...routeViewSession.value, checked: next }
}

function toggleExcluded(itemId: number) {
  const next = new Set(routeViewSession.value.excluded)
  if (next.has(itemId)) next.delete(itemId); else next.add(itemId)
  routeViewSession.value = { ...routeViewSession.value, excluded: next }
}

function toggleGroupCollapsed(zoneId: number) {
  const next = new Set(routeViewSession.value.collapsedGroups)
  if (next.has(zoneId)) next.delete(zoneId); else next.add(zoneId)
  routeViewSession.value = { ...routeViewSession.value, collapsedGroups: next }
}
```

- [ ] **Step 6: Export 新東西**

在 store return 加：`itemLocations, routeViewPrefs, routeViewSession, targetSig, fetchItemLocationsForRoute, setOptimizeBy, toggleChecked, toggleExcluded, toggleGroupCollapsed`

- [ ] **Step 7: Run all bom store tests — pass**

`pnpm test src/__tests__/stores/`

- [ ] **Step 8: Commit**

```bash
git add src/stores/bom.ts src/__tests__/stores/bom-route-session.test.ts
git commit -m "feat(bom-store): itemLocations + routeView state with LRU 8 + debounce 500ms"
```

---

## Task 8: `BomAcquisitionDetail.vue` 元件

**Spec sections to read:** §3（marker 視覺語彙）, §5.1（展開區結構）, §5.4（無 — 此元件不含 editorial）

**Depends on:** T1（pixelToPercent）, T5（ItemLocations）, T6（useNpcName, useZoneName）

**Files:**
- Create: `src/components/bom/BomAcquisitionDetail.vue`
- Create: `src/__tests__/components/bom/BomAcquisitionDetail.test.ts`

**Props**：
```ts
defineProps<{
  itemId: number
  mode: 'npc' | 'gather'
}>()
```

**功能要點**：
- onMounted 觸發 `bomStore.fetchItemLocationsForRoute([itemId])`（若 cache 已有就立刻 ready）
- 從 `bomStore.itemLocations.get(itemId)` 拿 sources
- npc 依 `price ASC`、gather 依 `level ASC` 排序，第 0 列為 primary（toast-gold ring）
- zone chip 切底圖（多 zone 時）
- 小地圖：`<img loading="lazy" :src="mapAssetUrl">` + absolute marker（`pixelToPercent` 算 left/top）
- 「⎘ /tp」按鈕 = `navigator.clipboard.writeText(\`/tp ${aetheryteName}\`)`
- 載入中 → `<el-skeleton>`；fetch 失敗 → 顯示重試 chip
- `<768px` → 整個地圖區塊 `display: none`，改顯示 `[🗺️ 地圖]` 按鈕觸發 `<ZoneMapSheet>`

**色彩規則**（強烈）：
- ❌ 不用 strawberry / matcha
- ✅ marker 全 cocoa（`var(--app-craft)`）；NPC = filled circle，gather = outlined circle
- ✅ primary 加 toast-gold 2px ring
- ✅ aetheryte ✦ 用 cocoa（不用藍莓）

- [ ] **Step 1: scaffold**

Create file with `<script setup lang="ts">` + template + scoped style。引入 `useBomStore`、`useNpcName`、`useZoneName`、`pixelToPercent`、`buildMapAssetUrl`、`getZoneMetaSync`。

- [ ] **Step 2: source list 渲染（純資料，無地圖）**

template:
```vue
<div class="bad-sources">
  <div v-for="(src, i) in sortedSources" :key="i"
       class="bad-source" :class="{ 'is-primary': i === 0 }">
    <span class="bad-source__icon" :data-mode="mode">{{ mode === 'npc' ? '⛟' : '⛏' }}</span>
    <div class="bad-source__name">
      <template v-if="mode === 'npc'">{{ npcName(src.npcId) }}</template>
      <template v-else>Lv{{ src.level }} 採{{ gatherTypeLabel(src.type) }}點</template>
    </div>
    <div class="bad-source__loc">
      {{ zoneName(src.zoneId) }} · X:{{ src.x.toFixed(1) }} Y:{{ src.y.toFixed(1) }}
    </div>
    <span class="bad-source__aether" v-if="aetherytes(src.zoneId)?.[0]">
      📍 {{ aetherytes(src.zoneId)[0].name }} {{ aetherytes(src.zoneId)[0].tpCostBase }}G
    </span>
    <button class="bad-source__tp" @click="copyTp(src.zoneId)">⎘ /tp</button>
  </div>
</div>
```

- [ ] **Step 3: 小地圖 + zone chip + marker（aspect-ratio）**

```vue
<div class="bad-map" v-if="!isPhone">
  <div class="bad-map__chips" v-if="zoneIds.length > 1">
    <button v-for="zid in zoneIds" :key="zid"
            class="bad-map__chip" :class="{ active: activeZoneId === zid }"
            @click="activeZoneId = zid">{{ zoneName(zid) }}</button>
  </div>
  <div class="bad-map__canvas" :style="{ aspectRatio: '16/11' }">
    <img v-if="mapUrl" :src="mapUrl" loading="lazy" alt="" @error="mapLoadFailed = true" />
    <div v-for="(src, i) in sourcesInActiveZone" :key="i"
         class="bad-marker" :class="[mode, { 'is-primary': i === 0 }]"
         :style="markerPos(src)" />
  </div>
</div>
<button v-else class="bad-map-btn" @click="$emit('open-map-sheet', activeZoneId)">🗺️ 地圖</button>
```

scoped CSS — marker 用 cocoa，filled vs outlined：
```css
.bad-marker {
  position: absolute; width: 18px; height: 18px;
  border-radius: 50%; transform: translate(-50%, -50%);
  background: var(--app-craft); border: 2px solid var(--app-cream-surface);
  box-shadow: 0 2px 5px oklch(0.28 0.04 55 / 0.3);
}
.bad-marker.gather {
  background: var(--app-cream-surface); border-color: var(--app-craft);
}
.bad-marker.is-primary {
  outline: 2px solid var(--app-toast-gold); outline-offset: 2px;
}
```

- [ ] **Step 4: emit `open-map-sheet`（給 phone 用）**

`defineEmits<{ 'open-map-sheet': [zoneId: number] }>()`

- [ ] **Step 5: smoke test**

```ts
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import BomAcquisitionDetail from '@/components/bom/BomAcquisitionDetail.vue'
import { useBomStore } from '@/stores/bom'

beforeEach(() => setActivePinia(createPinia()))

it('renders npc sources sorted by price ASC, primary first', () => {
  const store = useBomStore()
  store.itemLocations.set(5057, {
    npcVendors: [
      { npcId: 1, zoneId: 146, x: 25, y: 31, price: 240 },
      { npcId: 2, zoneId: 153, x: 30, y: 31, price: 215 },  // cheaper
    ],
    gatherNodes: [],
  })
  const w = mount(BomAcquisitionDetail, { props: { itemId: 5057, mode: 'npc' } })
  const sources = w.findAll('.bad-source')
  expect(sources).toHaveLength(2)
  expect(sources[0].classes()).toContain('is-primary')
  expect(sources[0].text()).toContain('215')
})

it('hides in-flow map below 768px', async () => {
  // mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }) })
  const store = useBomStore()
  store.itemLocations.set(1, { npcVendors: [{ npcId: 1, zoneId: 146, x: 0, y: 0 }], gatherNodes: [] })
  const w = mount(BomAcquisitionDetail, { props: { itemId: 1, mode: 'npc' } })
  expect(w.find('.bad-map').exists()).toBe(false)
  expect(w.find('.bad-map-btn').exists()).toBe(true)
})
```

- [ ] **Step 6: Run + commit**

```bash
git add src/components/bom/BomAcquisitionDetail.vue src/__tests__/components/bom/BomAcquisitionDetail.test.ts
git commit -m "feat(bom): BomAcquisitionDetail with cocoa-only markers and aspect-ratio minimap"
```

---

## Task 9: `ZoneMapSheet.vue` — phone bottom sheet

**Spec sections to read:** §5.3（phone 行為）, §5.1（小地圖隱藏邏輯）

**Depends on:** T1, T6

**Files:**
- Create: `src/components/bom/ZoneMapSheet.vue`

**Props**：
```ts
defineProps<{
  modelValue: boolean         // open/close (v-model)
  zoneId: number | null
  highlightCoords?: { x: number; y: number } | null
}>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
```

**結構**：
- `<el-drawer direction="btt" size="80%">` 作為 bottom sheet 載體（已用於 BomView.vue 的 targets drawer）
- 內容：zone 名 header + 全屏地圖（aspect-ratio 16/11） + 中央高亮 marker
- 下拉手勢自然 close（el-drawer 內建）

- [ ] **Step 1: scaffold**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useZoneName } from '@/composables/useZoneName'
import { getZoneMetaSync } from '@/services/zone-meta'
import { buildMapAssetUrl, pixelToPercent, convertToPixel } from '@/utils/map-coords'

const props = defineProps<{
  modelValue: boolean
  zoneId: number | null
  highlightCoords?: { x: number; y: number } | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const zoneName = useZoneName(() => props.zoneId ?? 0)
const meta = computed(() => props.zoneId ? getZoneMetaSync(props.zoneId) : null)
const mapUrl = computed(() => meta.value ? buildMapAssetUrl(meta.value.mapAssetUrl) : '')

const markerPos = computed(() => {
  if (!props.highlightCoords || !meta.value) return null
  const px = convertToPixel({
    rawX: props.highlightCoords.x, rawY: props.highlightCoords.y,
    offsetX: 0, offsetY: 0, sizeFactor: meta.value.sizeFactor,
  })
  return pixelToPercent(px.px, px.py)
})
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="(v) => emit('update:modelValue', v)"
    direction="btt"
    size="80%"
    :with-header="false"
    append-to-body
  >
    <div class="zms">
      <div class="zms__head">{{ zoneName }}</div>
      <div class="zms__canvas">
        <img v-if="mapUrl" :src="mapUrl" loading="lazy" alt="" />
        <div v-if="markerPos" class="zms__marker" :style="markerPos" />
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.zms { display: flex; flex-direction: column; height: 100%; padding: 12px; }
.zms__head { font-family: 'Noto Serif TC', serif; font-weight: 600; font-size: 17px; margin-bottom: 8px; }
.zms__canvas { position: relative; aspect-ratio: 16/11; width: 100%; max-height: 100%; background: var(--app-cream-emphasis); border-radius: 8px; overflow: hidden; }
.zms__canvas img { width: 100%; height: 100%; object-fit: contain; }
.zms__marker {
  position: absolute; width: 26px; height: 26px; border-radius: 50%;
  background: var(--app-craft); border: 3px solid var(--app-cream-surface);
  outline: 3px solid var(--app-toast-gold);
  transform: translate(-50%, -50%);
}
</style>
```

- [ ] **Step 2: Smoke test (mount, props 變動 marker 位置變)** — single it block

- [ ] **Step 3: Commit**

```bash
git add src/components/bom/ZoneMapSheet.vue
git commit -m "feat(bom): ZoneMapSheet bottom sheet for phone-only map view"
```

---

## Task 10: `RoutePlannerEyebrow.vue` + `RoutePlannerToolbar.vue`

**Spec sections to read:** §5.3（toolbar mockup + 進度條 cocoa 規則）, §5.4（eyebrow 文字）

**Depends on:** T7

**Files:**
- Create: `src/components/bom/RoutePlannerEyebrow.vue`
- Create: `src/components/bom/RoutePlannerToolbar.vue`

### 10.A `RoutePlannerEyebrow.vue`

```vue
<template>
  <div class="rpe">
    <span class="rpe__label">VIII</span>
    <em class="rpe__quote">今天的烤盤 · today's bake</em>
  </div>
</template>

<style scoped>
.rpe { display: flex; align-items: baseline; gap: 12px; padding: 4px 0 12px; }
.rpe__label {
  font-family: 'Fira Code', monospace; font-size: 11px;
  letter-spacing: 0.25em; color: var(--app-toast-gold); text-transform: uppercase;
}
.rpe__quote {
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic; font-size: 14px; color: var(--app-text-muted);
}
</style>
```

### 10.B `RoutePlannerToolbar.vue`

Props：
```ts
defineProps<{
  optimizeBy: 'gil' | 'hop'
  progress: { done: number; total: number }
}>()
defineEmits<{
  'update:optimizeBy': [value: 'gil' | 'hop']
  'reset': []
  're-sort': []
}>()
```

template：
```vue
<div class="rpt">
  <span class="rpt__label">最佳化</span>
  <el-segmented :model-value="optimizeBy"
    @update:model-value="(v) => emit('update:optimizeBy', v as 'gil' | 'hop')"
    :options="[
      { label: '最少傳送費', value: 'gil' },
      { label: '最少跳點',   value: 'hop' },
    ]" />
  <el-progress :percentage="pct" :show-text="false" :stroke-width="6" class="rpt__bar" />
  <span class="rpt__count">{{ progress.done }} / {{ progress.total }}</span>
  <button class="rpt__btn" @click="emit('re-sort')">🔄 重新排序</button>
  <button class="rpt__btn" @click="emit('reset')">🗑️ 重設</button>
</div>
```

scoped CSS — **el-progress 強制 cocoa**（覆寫 element-plus default）：
```css
.rpt__bar :deep(.el-progress-bar__inner) {
  background-color: var(--app-craft) !important;
  background-image: none !important;  /* 禁漸層 */
}
.rpt { display: flex; gap: 12px; align-items: center; padding: 10px 12px;
  background: var(--app-cream-emphasis); border: 1px solid var(--app-border);
  border-radius: 10px; flex-wrap: wrap; font-size: 12.5px;
}
.rpt__bar { flex: 1; min-width: 120px; }
.rpt__count { font-family: 'Fira Code', monospace; font-size: 11.5px; color: var(--app-text-muted); }
.rpt__btn { padding: 4px 10px; border: 1px solid var(--app-border); border-radius: 6px;
  background: var(--app-cream-surface); color: var(--app-text); font-size: 11.5px; cursor: pointer; }
```

- [ ] Step 1-3: 兩元件分別 scaffold + 寫一個 mount smoke test
- [ ] Step 4: Commit

```bash
git add src/components/bom/RoutePlannerEyebrow.vue src/components/bom/RoutePlannerToolbar.vue \
        src/__tests__/components/bom/RoutePlannerToolbar.test.ts
git commit -m "feat(bom): RoutePlannerEyebrow (Cormorant italic) + RoutePlannerToolbar (cocoa progress)"
```

---

## Task 11: `RoutePlannerGroupCard.vue`

**Spec sections to read:** §3（marker 視覺語彙）, §5.3（card 結構 + hero 規則）

**Depends on:** T1, T6, T9（emit open-map-sheet）

**Files:**
- Create: `src/components/bom/RoutePlannerGroupCard.vue`
- Create: `src/__tests__/components/bom/RoutePlannerGroupCard.test.ts`

**Props**：
```ts
defineProps<{
  group: Group  // 從 route-planner.ts import
}>()
defineEmits<{
  'toggle-checked': [itemId: number]
  'open-map-sheet': [zoneId: number, coords: { x: number; y: number }]
}>()
```

**結構要點**：
- header：zone name + aetheryte chip + count + total gil + collapse chevron
- 摺疊狀態走 `bomStore.routeViewSession.collapsedGroups.has(zoneId)`
- body：map（≥768px）+ checklist
- marker：cocoa filled circle (npc) / cocoa outlined (gather)，編號 1..N，hover toast-gold ring
- list row：checkbox + 編號 (`mw-num`) + icon + name + meta + price
- checked row → strikethrough + cream-emphasis 背景（**不用綠**）
- hero variant（`group.isHero === true`）：cream-emphasis 背景、map +40px、grid-column: span 2

template 大致如 spec §5.3 mockup。

- [ ] Step 1-5: scaffold + smoke tests for each variant + hero detection + click events
- [ ] Step 6: Commit

```bash
git add src/components/bom/RoutePlannerGroupCard.vue src/__tests__/components/bom/RoutePlannerGroupCard.test.ts
git commit -m "feat(bom): RoutePlannerGroupCard with hero variant and cocoa-only markers"
```

---

## Task 12: `BomRoutePlanner.vue` — orchestrator

**Spec sections to read:** §5.3, §5.4, §6.1

**Depends on:** T2（aetherytes.json fetch）, T3（sortRoute）, T7（store）, T10, T11

**Files:**
- Create: `src/components/bom/BomRoutePlanner.vue`
- Create: `src/__tests__/components/bom/BomRoutePlanner.test.ts`

**責任**：
- onMounted：`await fetch('/data/aetherytes.json')` 並 parse 成 `Map<zoneId, AetheryteInfo[]>`（lazy）
- 拼出 `RouteInput`：從 `bomStore.flatMaterials`（filter mode in {npc, gather}）+ `bomStore.itemLocations.get(itemId)` 拼 sources
- `computed routeOutput = sortRoute({ rows, aetherytes, optimizeBy: routeViewPrefs.optimizeBy, excluded: routeViewSession.excluded })`
- 三種視圖切換：
  1. `routeOutput.groups.length === 0` → §5.4 empty state Cormorant italic
  2. 否則 → 正常 grid 佈局
  3. progress = 100% → 加 toast-gold ring + ElMessage（Cormorant italic toast）

**完成 toast 範例**：

```ts
import { ElMessage } from 'element-plus'

watch(() => progress.done === progress.total && progress.total > 0, (done) => {
  if (done) {
    ElMessage({
      message: `<em style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:18px">烤盤已清空 · 收工</em>`,
      type: 'success',
      dangerouslyUseHTMLString: true,
      duration: 3000,
    })
  }
})
```

**Empty state**（無 npc/gather row）：
```vue
<div v-if="rows.length === 0" class="brp-empty">
  <em>今天不用出門，材料都齊了</em>
  <div class="brp-empty__rule" />
</div>
```

scoped css：
```css
.brp-empty {
  text-align: center; padding: 80px 24px; color: var(--app-text-muted);
  font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 22px;
}
.brp-empty__rule {
  width: 56px; height: 1px; background: var(--app-toast-gold);
  margin: 16px auto 0;
}
```

**Grid container**：
```css
.brp-grid {
  display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(440px, 1fr));
}
@media (min-width: 1700px) { .brp-grid { grid-template-columns: repeat(auto-fit, minmax(480px, 1fr)); } }
```

Hero card 透過 `:class` 加 `brp-grid__cell--hero { grid-column: span 2; }`。

- [ ] Step 1-7: 各種 case test
- [ ] Step 8: Commit

```bash
git add src/components/bom/BomRoutePlanner.vue src/__tests__/components/bom/BomRoutePlanner.test.ts
git commit -m "feat(bom): BomRoutePlanner orchestrator with auto-fit grid and Cormorant editorial moments"
```

---

## Task 13: 把 `BomAcquisitionDetail` 接進 `BomDecisionRow.vue`

**Spec sections to read:** §5.1, §6.1, §6.4（既有結構不動）

**Depends on:** T8

**Files:**
- Modify: `src/components/bom/BomDecisionRow.vue` — 在現有展開區條件渲染加 npc/gather 分支

**現狀**：`BomDecisionRow.vue` 在 mode='craft' 時靠 `BomCraftTreeNode` 展開（透過 `isRowToggleable` + `isExpanded` 判斷）。但目前展開區由 **parent**（`BomDecisionTable`）渲染、`BomDecisionRow` 只負責 row 本身。

→ **驗證假設先**：讀 `src/components/bom/BomDecisionTable.vue` 看展開區實際在哪 render；若是 parent 處理，T13 改 `BomDecisionTable`、不改 `BomDecisionRow`。

- [ ] Step 1: 讀 BomDecisionTable 確認展開區 owner

```bash
grep -n "BomCraftTreeNode" src/components/bom/BomDecisionTable.vue src/components/bom/BomDecisionRow.vue
```

- [ ] Step 2: 在展開區 owner 處加 mode 分支

```vue
<template v-if="isRowExpanded(row.itemId)">
  <BomCraftTreeNode v-if="getEffectiveMode(row.itemId) === 'craft'" :parent="getNode(row.itemId)" />
  <BomAcquisitionDetail v-else-if="getEffectiveMode(row.itemId) === 'npc' || getEffectiveMode(row.itemId) === 'gather'"
                        :item-id="row.itemId"
                        :mode="getEffectiveMode(row.itemId) as 'npc' | 'gather'"
                        @open-map-sheet="onOpenMapSheet" />
</template>
```

- [ ] Step 3: 同時讓 npc/gather row 變成 toggleable（修改 `isRowToggleable` 邏輯）— 限制：只有當 itemLocations 已 cached 或將要 fetch 時才可展開

讀 `BomDecisionRow.vue:88-91` `isRowToggleable` 改：

```ts
const isRowToggleable = computed(() => {
  if (props.immutable) return false
  const m = mode.value
  if (m === 'craft') return props.isCraftable
  return m === 'npc' || m === 'gather'  // 新增：npc/gather 也可展開
})
```

- [ ] Step 4: 展開時觸發 itemLocations fetch

加到 `BomDecisionTable.vue` 的展開 watcher 或在 `BomAcquisitionDetail.vue` 的 onMounted（已在 T8 step 1 提及）。

- [ ] Step 5: 既有 BomDecisionRow 測試 run pass + 加一個新測試「npc mode 也可展開」

- [ ] Step 6: Commit

```bash
git add src/components/bom/BomDecisionRow.vue src/components/bom/BomDecisionTable.vue
git commit -m "feat(bom): wire BomAcquisitionDetail into row expansion for npc/gather mode"
```

---

## Task 14: `BomView.vue` — 接 tab + load aetherytes + mount BomRoutePlanner

**Spec sections to read:** §5.2, §6.1, §6.3 (mode in BomView)

**Depends on:** T12, T13

**Files:**
- Modify: `src/views/BomView.vue`

- [ ] Step 1: 加 `bomViewTab` ref + sessionStorage

```ts
const VIEW_TAB_KEY = 'bom-view-tab'
const bomViewTab = ref<'detail' | 'route'>(
  (sessionStorage.getItem(VIEW_TAB_KEY) as 'detail' | 'route') || 'detail'
)
watch(bomViewTab, (v) => sessionStorage.setItem(VIEW_TAB_KEY, v))
```

- [ ] Step 2: 計算 `routeBadgeText`（未勾完的 npc/gather 行數）

```ts
const routeBadgeText = computed(() => {
  const npcGatherRows = bomStore.flatMaterials.filter(m => {
    const mode = bomStore.getEffectiveMode(m.itemId)
    return (mode === 'npc' || mode === 'gather') && !bomStore.routeViewSession.excluded.has(m.itemId)
  })
  const remaining = npcGatherRows.filter(m => !bomStore.routeViewSession.checked.has(m.itemId)).length
  return remaining > 0 ? `(${remaining})` : ''
})
```

- [ ] Step 3: 加 `<el-segmented>` between BomTotalsBar and BomDecisionTable

```vue
<el-segmented v-model="bomViewTab" :options="tabOptions" :disabled="!calculated" class="b-view-tab" />

<BomDecisionTable v-if="bomViewTab === 'detail'" v-bind="..." />
<BomRoutePlanner v-else-if="bomViewTab === 'route'" />
```

`tabOptions` computed：
```ts
const tabOptions = computed(() => [
  { label: '📋 材料明細', value: 'detail' },
  { label: `🗺️ 採買路線 ${routeBadgeText.value}`, value: 'route' },
])
```

- [ ] Step 4: 切到 route tab 時 trigger zone-meta + item-locations fetch

```ts
watch(bomViewTab, async (v) => {
  if (v !== 'route') return
  const npcGatherIds = bomStore.flatMaterials
    .filter(m => ['npc', 'gather'].includes(bomStore.getEffectiveMode(m.itemId)))
    .map(m => m.itemId)
  await bomStore.fetchItemLocationsForRoute(npcGatherIds)
  // collect zoneIds + npcIds
  const zoneIds = new Set<number>()
  const npcIds = new Set<number>()
  for (const id of npcGatherIds) {
    const loc = bomStore.itemLocations.get(id)
    loc?.npcVendors.forEach(v => { zoneIds.add(v.zoneId); npcIds.add(v.npcId) })
    loc?.gatherNodes.forEach(n => zoneIds.add(n.zoneId))
  }
  if (zoneIds.size) await fetchZoneMetaBulk([...zoneIds])
  if (npcIds.size) await fetchNpcNameBulk([...npcIds])
})
```

- [ ] Step 5: Manual smoke — 啟動 dev server，手動驗 tab 切換 + route tab 載入 + 切回 detail tab 不丟資料

- [ ] Step 6: Commit

```bash
git add src/views/BomView.vue
git commit -m "feat(bom): wire route tab into BomView with lazy aetherytes/zone-meta load"
```

---

## Task 15: Integration smoke (Chrome DevTools MCP)

**Spec sections to read:** §9.3

**Depends on:** T14

**Files:** none new — uses `e2e-execute` skill via Chrome DevTools MCP

### 流程腳本

1. `pnpm dev` 起 server（背景）
2. Chrome DevTools 開 `http://localhost:5173/bom`
3. 加 1-2 個目標（搜尋「葛利達尼亞餐桌」之類含 npc 材料的）
4. 「計算材料需求」
5. **Detail tab 驗證**：
   - 把某個 npc row 展開 → `BomAcquisitionDetail` 應出現
   - 看到 cocoa marker（不是紅或綠）
   - 「⎘ /tp」按下能複製到剪貼簿
6. **切到 Route tab**：
   - 驗 toolbar `<el-segmented>` gil/hop 出現
   - 驗 progress bar 是 cocoa（不是 gold）
   - 驗 zone groups 顯示
   - 看到 hero card 跨 col + cream-emphasis
   - 驗 marker 編號 + cocoa-only 配色
7. **互動驗證**：
   - 勾一個 row → progress 變動
   - reload 頁面 → 勾選保留
   - 切 gil ↔ hop → marker 重新編號
   - 摺疊一個 zone group → reload → 摺疊保留
8. **Viewport 驗證**：在 1800/1400/900/375 四檔測 layout。375px 確認地圖隱藏 + 「🗺️ 地圖」按鈕出現。
9. **完成 toast**：勾完所有 row → 看到 Cormorant italic「烤盤已清空 · 收工」

每步截圖存 `.tmp/screenshots/route-planner-smoke-N.png`

- [ ] **Step 1-9**：依序執行上述
- [ ] **Step 10**：若有 bug，回對應 task 修；補測；commit
- [ ] **Step 11**: Commit screenshots 索引（optional，screenshots 在 .gitignore）

```bash
git commit --allow-empty -m "test(bom): integration smoke pass for route planner — see .tmp/screenshots/"
```

---

## Task 16: Brand QA — toast-gold ≤10% pixel measurement

**Spec sections to read:** §3, DESIGN.md「Sunlight Spotlight Rule」

**Depends on:** T14

**Files:** none new — analytical only

- [ ] **Step 1**：在 1800px 與 375px 兩檔 viewport 各截一張「採買路線」tab 滿載狀態截圖
- [ ] **Step 2**：用 Python（PIL）或 ImageMagick 算 toast-gold 像素佔比

```bash
python3 -c "
from PIL import Image
import sys
img = Image.open('.tmp/screenshots/route-planner-1800.png').convert('RGB')
target = (200, 148, 56)  # toast-gold approx oklch(0.65 0.18 65) → rgb
total, gold = 0, 0
for px in img.getdata():
    total += 1
    # within ±20 of each channel
    if all(abs(px[i] - target[i]) <= 30 for i in range(3)):
        gold += 1
print(f'toast-gold: {gold/total*100:.2f}%')
"
```

- [ ] **Step 3**：Expected `<10%`。若超標，回 T10/T11 微調（gold ring 改細、改虛線等）
- [ ] **Step 4**：把測量結果寫入 commit message

```bash
git commit --allow-empty -m "test(bom): brand QA — toast-gold 1800px=X.XX%, 375px=Y.YY% (both <10%)"
```

---

## Self-Review (run after writing complete plan)

完成 16 task 後，**spec 對 plan** 的覆蓋率核對：

| Spec § | Plan task | Note |
|---|---|---|
| §1 Feature Summary | T8, T12 | 兩塊功能各對應元件 |
| §2 Primary User Action | T15 | 整合測試覆蓋 |
| §3 Design Direction (color/marker) | T8, T11, T16 | marker 在 T8/T11；T16 量化驗證 |
| §4 Scope | 全 plan | — |
| §5.1 BomAcquisitionDetail | T8 | aspect-ratio map + bottom sheet |
| §5.2 Tab inline el-segmented | T14 | |
| §5.3 Layout A 4-tier viewport | T11, T12, T15 | T15 跑四檔 |
| §5.3 Hero card | T3 (markHero) + T11 (variant) | |
| §5.4 Editorial moments | T10 (eyebrow), T12 (toast + empty) | |
| §6.1 元件樹 | T8-T12 全建 | |
| §6.2 item-locations | T5 | |
| §6.2 zone-meta | T4 | |
| §6.2 route-planner | T3 | |
| §6.2 useZoneName/useNpcName | T6 | |
| §6.2 aetherytes.json | T2 | |
| §6.2 buildMapAssetUrl | T1 | |
| §6.3 Store routeViewPrefs/Session | T7 | |
| §6.3 targetSig + LRU + debounce | T7 | |
| §6.3 Reactivity boundary（checked 不觸發 sortRoute） | T3 (sortRoute 不收 checked) + T12 (computed input) | |
| §6.4 既有結構不動 | T8/T13 (verification step) | |
| §7.1 sortRoute pseudocode | T3 | |
| §7.2 convertToPixel reuse | T1 | |
| §8 Edge cases (14 條) | 散在各 task；critical 列： |
| - garlandtools timeout | T8（重試 chip）+ T5（PERMISSIVE fallback） |
| - aetherytes.json 缺 zone | T3 (`tpCost = 0` + null aetheryte) + T11 (UI ?G) |
| - xivapi map fail | T8 (`<img onerror>`) |
| - phone bottom sheet | T9 + T8 emit |
| - 全部勾完 toast | T12 |
| §9 Tests | T1-T7 unit + T8-T12 component + T15 integration + T16 brand QA |
| §10 OOS | 不需 task — 不做即正確 |
| §11 References | spec 內 — plan 不需重複 |

**Type 一致性核對**（subagent 跨 task 不重複定義）：
- `RouteRow`, `ChosenSource`, `Group`, `RouteInput`, `RouteOutput`, `AetheryteInfo` → 在 T3 export，T7/T11/T12 import
- `ItemLocations` → 在 T5 export，T7/T8/T11 import
- `ZoneMeta`, `Locale` → 在 T4 export，T6/T8 import
- `RouteMode = 'npc' | 'gather'` → T3 export
- `'gil' | 'hop'` → 字串字面，多處用（spec stable）

**Placeholder 掃描**：
- 「Add validation」「TBD」「TODO」 → 全文 grep 結果為 0
- 「implement later」 → 0
- T2 提「TODO 在 issue」 — 是 _外部_ task tracker，不算 plan placeholder

---

## Execution Handoff

Plan 寫完並存到 `docs/superpowers/plans/2026-05-06-bom-acquisition-locations-and-route-planner.md`。兩種執行選項：

**1. Subagent-Driven（推薦）** — 主 agent 為每個 task 派一個 fresh subagent + 兩階段 review，主 context 保持乾淨；尤其適合此 plan 的 16 個獨立 task。

**2. Inline Execution** — 在當前 session 內執行，搭配 checkpoint review；主 context 會逐步累積。

哪個？

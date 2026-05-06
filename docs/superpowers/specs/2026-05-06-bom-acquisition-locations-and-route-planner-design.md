# BOM 採購地點 + 採買路線規劃 — Design Brief

**Status**: Brief confirmed, ready for `/superpowers:writing-plans`
**Date**: 2026-05-06
**Surface**: `src/views/BomView.vue` + `src/components/bom/*` + 新增 `src/services/{item-locations,route-planner}.ts`
**Register**: product

---

## 1. Feature Summary

兩個合而為一的 BOM 增強：

1. **展開區補齊「去哪買 / 去哪採」**：BOM Decision Row 的 mode 切到 `npc` 或 `gather` 時，展開該列除了已有的成本資訊，再多顯示**採購來源清單**（NPC 名 / 採集節點 + 區域 + 座標 + 最近以太之光 + 傳送費 + 小地圖預覽）。Craft mode 維持現有 `BomCraftTreeNode` 不動。
2. **採買路線規劃 tab**：在 `BomDecisionTable` 上方新增 tab strip（「材料明細 / 採買路線」），切到路線 tab 時把 BOM 中所有 `npc/gather` 模式的列重組為**區域分組 + 含地圖 + 可勾選 checklist**，幫使用者把跑商/採集行程整理成「按 zone 走」的最短花費路線。

兩者共用一套 `ItemLocations` 資料模型，避免重複向 garlandtools 取資料。

## 2. Primary User Action

- 場景 A：使用者瀏覽 BOM 時看到某材料是 NPC 買，展開該列就知道「跑哪個城、哪個 NPC、最近以太多少 G」
- 場景 B：使用者已經在 BOM 把所有材料的取得方式選定，切到「採買路線」tab → 看到分區的 checklist，今天能跑就一個 zone 一個 zone 打勾，跑到一半中斷再開回來繼續

## 3. Design Direction

- **Color strategy**：延續 BOM 主軸 cocoa（Jam-Jar Rule，crafting zone）。**嚴格守 Jam-Jar Rule**——不借 strawberry（市場專屬）、不借 matcha（採集計時器專屬）。所有 marker 統一以 cocoa 為主色，用「形狀 + alpha + icon」區分 npc/gather/done，色差最多到 cocoa 與 cocoa-dim 兩階。toast-gold 嚴守 Sunlight Spotlight Rule（≤10%）：只用於 active state ring、focus、與「全部完成」toast，不進進度條漸層、不進 marker。
- **Marker 視覺語彙**：
  - NPC marker = cocoa filled circle + 內嵌 `⛟`，2px cream-surface 描邊
  - Gather marker = cocoa outlined circle + 內嵌 `⛏`，內填 cream-surface
  - Done = ink-muted（灰）filled + checkmark；strikethrough 對應 list row
  - Hover/selected = 加 toast-gold 2px ring（合法 Spotlight 用途）
  - Aetheryte ✦ = cocoa（不用藍莓避免新增第三色）
- **Scene sentence**：玩家把 BOM 整理完畢，發現有 12 樣要自己跑——他不想開三個瀏覽器分頁查 NPC 在哪，更不想在遊戲裡開地圖一個一個點。打開「採買路線」tab，看到「東拉諲西亞 4 件 · 拉諲西亞低地 3 件…」，按完傳送就邊跑邊勾。
- **Anchor refs**：
  - **FFXIV Teamcraft · Gathering optimizer**：每 zone 一張地圖 + 編號 marker + 對應 checklist
  - **Apple Reminders · Lists**：tick-as-you-go，勾掉的列 strikethrough + 變灰
  - **Notion · Inline expand**：BOM Decision Row 展開區同位顯示「去哪買」資訊

## 4. Scope

- Fidelity: production-ready
- Breadth:
  - 新增 6 個元件：`BomAcquisitionDetail` · `BomRoutePlanner` · `RoutePlannerToolbar` · `RoutePlannerEyebrow` · `RoutePlannerGroupCard` · `ZoneMapSheet`（phone only）
  - 新增 3 個服務：`item-locations.ts` · `zone-meta.ts` · `route-planner.ts`
  - 新增 2 個 composable：`useZoneName` · `useNpcName`
  - 新增 1 份靜態資料：`public/data/aetherytes.json`
  - **不重構** `src/services/item-acquisition.ts`（保持輕薄，acquisitionAvailability 仍給 BOM 主表 chip 用）
  - Tab 切換用 inline `<el-segmented>`，**不**包獨立元件
- Interactivity: shipped-quality，含 localStorage 持久化 + reactive store 整合
- Time intent: 迭代到可以打 tag 上線；MVP 不含路線真實 TSP 最佳化（greedy heuristic）、不含地圖 SVG marker 動畫

## 5. Layout Strategy

### 5.1 BOM Decision Row 展開區（mode = npc / gather）

新元件 `BomAcquisitionDetail` 掛在現有展開區位置，與 `BomCraftTreeNode` 互斥（craft mode 走 tree node、其他 mode 走 acquisition detail）。

```
┌─────────────────────────────────────────────────────────┐
│ 採購來源（依價格排序，主來源強調）                        │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ⛟ Bloodshore Merchant     東拉諲西亞 X:30.2 Y:31.5  │ │ ← primary
│ │   📍 葛利達尼亞 213G       [⎘ /tp]                  │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ⛟ Sahagin Trader          拉諲西亞低地 X:21 Y:23    │ │
│ │   📍 莫拉比 213G           [⎘ /tp]                  │ │
│ └─────────────────────────────────────────────────────┘ │
│ [東拉諲西亞] [拉諲西亞低地]   ← zone chip 切底圖         │
│                                                         │
│ ┌─[ 小地圖 ]──────────┐                                  │
│ │ ●主來源              │  底圖：xivapi Map asset         │
│ │ ◯替代來源            │  marker：CSS absolute           │
│ └─────────────────────┘                                  │
└─────────────────────────────────────────────────────────┘
```

小地圖容器使用 `aspect-ratio: 16/11; max-width: 320px; width: 100%`，在不同 row 寬度下彈性收縮（不固定 320×216 px），手機 viewport 自然縮為螢幕寬度。`<768px` viewport 下，§5.1 展開區的小地圖**直接隱藏**（與 §5.3 一致），改提供 row 上方一個 `🗺️ 地圖` 按鈕觸發 bottom sheet — 整個 BOM 內地圖在 phone 都走 sheet，不在 in-flow。

排序：NPC 依 `itemPrice ASC`、Gather 依 `nodeLevel ASC`。「⎘ /tp」MVP = 複製 `/tp <aetheryte 名>` 到剪貼簿。

### 5.2 Tab 切換（inline，**不**獨立元件）

放在 `BomTotalsBar` 下方、`BomDecisionTable` 上方，直接用 Element Plus `<el-segmented>`（已用於 `BatchSettings`）：

```vue
<el-segmented v-model="bomViewTab" :options="[
  { label: '📋 材料明細', value: 'detail' },
  { label: `🗺️ 採買路線 ${routeBadgeText}`, value: 'route' },
]" :disabled="!calculated" />
```

- `bomViewTab` = `BomView` 內 ref + sessionStorage（見 §6.3）
- `routeBadgeText` = `count > 0 ? \`(${count})\` : ''`，count = 未勾完 npc/gather 行數
- 行動裝置（`<768px`）：`<el-segmented>` block-level 即可，不再做特例樣式

### 5.3 採買路線 tab —「Layout A · 2-欄 zone card 網格」

每張 zone card 內含 map + list；用 `auto-fit minmax(440px, 1fr)`，**四檔 viewport** 區分桌機 / 平板 / 手機：

| Viewport | 欄數 | 卡內排列 | Map 處理 |
|---|---|---|---|
| `≥1700px` | 3 欄 (~480px) | map 240px × list 240px 並排 | 卡內常駐 |
| `1100–1700px` | 2 欄 (~720px) | map 240px × list 480px 並排 | 卡內常駐 |
| `768–1100px`（tablet） | 1 欄 full | map 280px × list rest 並排 | 卡內常駐 |
| `<768px`（phone） | 1 欄 full | **list-only**，地圖隱藏 | 每張 card header 加 `🗺️ 地圖` 按鈕 → bottom sheet 全屏地圖 |

**Hero card 規則（破 identical-grid 節奏）**：sortRoute 輸出後，「件數最多 _或_ 預估花最大 gil」的那張 zone card 標記為 hero — **跨 2 欄**（在 2/3-col viewport 下）、背景換 `cream-emphasis`、map 高度 +40px、list 字級 +1px。視覺上明顯重於同伴卡，引導使用者「先去這裡」。`<768px` 不套（單欄已自然主從）。

每張 card 結構（非 hero）：

```
┌──────────────────────────────────────────────────┐
│ 🌍 東拉諲西亞 · 📍 葛利達尼亞 213G · 4 件 · 2,430G ▾│
├──────────────┬───────────────────────────────────┤
│              │ ☐ 1 ⛟ 紅羽絨×24   Bloodshore      │
│   [ MAP ]    │ ☐ 2 ⛏ 山楂葉×8    Lv38 採栽       │
│  ✦aether     │ ☑ 3 ⛏ 楓木×16    Lv40 採栽       │
│  ●1 ●2 ●3 ●4 │ ☐ 4 ⛟ 毛皮緞×6   Forest Vendor    │
└──────────────┴───────────────────────────────────┘
```

Toolbar（route planner 內共用）：

```
最佳化目標 [◉最少傳送費 ○最少跳點]   ████░░ 7/12   [🔄重新排序] [🗑️重設]
```

進度條 fill 用 cocoa 純色（`var(--app-craft)`），**不**用 toast-gold 或漸層；toast-gold 只出現在 100% 達成時的 ring 與「全部完成」toast，守 Sunlight Spotlight Rule。

**互動**：marker ↔ list row hover 雙向 highlight（hover 時對方加 toast-gold 2px ring）；marker 編號 = 該 zone 內 list 的順序。Group header 可點摺疊，預設前 2 組展開、其餘摺起。

### 5.4 Editorial Moments（Toast Workshop personality）

工具感為主，但保留 3 個 Cormorant Garamond italic 編輯時刻，避免完全 utilitarian：

| 時刻 | 文字 | typography |
|---|---|---|
| Tab 切到「採買路線」時頂部 eyebrow | *今天的烤盤 · today's bake* | Cormorant italic, 14px, ink-muted |
| 全部勾完的成功 toast | *烤盤已清空 · 收工* | Cormorant italic, 18px, toast-gold |
| Empty state（BOM 沒任何 npc/gather row） | *今天不用出門，材料都齊了* | Cormorant italic, 22px, ink-muted, 下方加 1px gold underline 56px |

不在 list row、checkbox、按鈕、tooltip 裡用 Cormorant（Italic-Is-Sacred Rule）。

## 6. Architecture

### 6.1 元件樹

```
BomView
├─ <el-segmented> (inline)                     "材料明細 / 採買路線"
├─ BomDecisionTable                            (tab=detail 時顯示)
│  └─ BomDecisionRow (existing)
│     ├─ BomCraftTreeNode (existing)           ← craft mode 展開區
│     └─ <NEW> BomAcquisitionDetail            ← npc/gather mode 展開區
├─ <NEW> BomRoutePlanner                       (tab=route 時顯示)
│  ├─ <NEW> RoutePlannerEyebrow                Cormorant italic「今天的烤盤」(§5.4)
│  ├─ <NEW> RoutePlannerToolbar                gil/hop el-segmented + el-progress + actions
│  └─ <NEW> RoutePlannerGroupCard ×N           每張 = 一個 zone（hero variant 跨 2 col）
│     ├─ 內嵌 map（xivapi asset + CSS marker，<img loading="lazy">；phone 隱藏）
│     └─ checklist rows（item-centric）
└─ <NEW> ZoneMapSheet (only on phone, teleport-to-body)  全屏 bottom sheet
```

### 6.2 資料服務

**保留** `src/services/item-acquisition.ts` **不重構**。`acquisitionAvailability: Map<itemId, ItemAcquisition>` 仍是 BOM 主表 chip 的輕資料來源（5 fields），不被肥大化。

**新增** `src/services/item-locations.ts`，**獨立、按需 fetch**：

```ts
interface ItemLocations {
  npcVendors: Array<{ npcId: number; zoneId: number; x: number; y: number; price?: number }>
  gatherNodes: Array<{ nodeId: number; type: 'MIN'|'BTN'|'FSH'; level: number; zoneId: number; x: number; y: number }>
}
```

- 觸發點：(a) BOM Decision Row 展開且 `mode ∈ {npc, gather}`；(b) Route tab 第一次切換
- 不在「計算材料需求」CTA 路徑上，不拖慢 BOM 主流程
- 單一 garlandtools fetch（與現有 `fetchItemAcquisition` 共用同一 endpoint）→ 解析 `nodes` / `vendors` 拿 ID + 座標
- **重要**：locations 只存 ID（zoneId / npcId / nodeId），**不存名稱**。名稱透過下文的 reactive composable 解析（避免「locale 切換 → 重新 fetch xivapi」的浪費，模式對齊 `useItemName`）
- Cache：`Map<itemId, ItemLocations>`，**LRU 上限 500 條**避免長 session 累積；inflight dedupe 沿用 `item-acquisition.ts` 的 `inflight` Map 模式
- Batch fetch：concurrency=6

**新增** `src/services/zone-meta.ts` — **全域批次** xivapi metadata，不per-item：

```ts
// 一次性整批解析，避免 garland.ts 那種「每個 zone 1 個 Map sheet search」的 N+1
export async function fetchZoneMetaBulk(zoneIds: number[]): Promise<Map<number, ZoneMeta>>
export async function fetchNpcNameBulk(npcIds: number[]): Promise<Map<number, string>>

interface ZoneMeta {
  zoneNameByLocale: Map<Locale, string>  // PlaceName + s2t for zh-TW
  mapAssetUrl: string                    // 抽 helper buildMapAssetUrl(mapId)
  sizeFactor: number
}
```

- xivapi PlaceName / Map sheet **支援 ids in 單次 query** via `Sheet/PlaceName?rows=146,147,148&fields=Name`，把 garland.ts 現有的 `Promise.all(per-zone Map search)` 改為一次帶完整 ID list 的 query
- Map asset URL 從 `src/api/garland.ts:124-126` 抽 helper `buildMapAssetUrl(mapId: string): string`，本服務與 `src/api/garland.ts` 共用
- 結果 cache 在模組層（生命週期 = page session），不需 LRU（zone/NPC ID 是有限集合）

**新增** `src/services/route-planner.ts` — 純函式，`sortRoute(input) → RouteOutput`，演算法 §7.1

**新增** `public/data/aetherytes.json` — 手寫 + 從 xivapi Aetheryte sheet 半自動產生：

```json
{
  "schema": 1,
  "zones": {
    "146": {
      "zoneName": "拉諲西亞低地",
      "aetherytes": [
        { "name": "莫拉比造船廠", "x": 28.7, "y": 33.1, "tpCostBase": 213 }
      ]
    }
  }
}
```

`tpCostBase` 為平均估值（不模擬角色等級折扣），約 ~150 zones / ~250 aetherytes，<20KB。route planner 第一次切到 tab 時 `await fetch('/data/aetherytes.json')`（不要 ESM `import`，避免進初始 bundle）。

**新增** `src/composables/useZoneName.ts` / `useNpcName.ts` — 完全照 `src/composables/useItemName.ts:1-14` 範本：locale store watcher + computed + 讀模組層 cache，回傳 `ComputedRef<string>`。locale 切換時零 fetch、reactive 重渲染。

**重用清單**：
- `src/utils/map-coords.ts` 的 `convertToPixel({ rawX, rawY, offsetX, offsetY, sizeFactor })` ← §7.2 座標換算直接用，不重寫
- `src/composables/useItemName.ts` ← `useZoneName` / `useNpcName` 模板
- `src/stores/theme.ts:30-39` 的 try/catch localStorage 寫入模式 ← `routeView` 持久化照抄
- Element Plus `<el-segmented>`（已用於 `BatchSettings`）← §5.2 tab 切換不另起包裝元件
- Element Plus `<el-progress>`（已用於 `BatchProgress.vue`）← toolbar progress bar
- `src/services/item-acquisition.ts:91-106` 的 worker-pool batch 模式 ← `item-locations.ts` 比照

### 6.3 Store 改動 (`src/stores/bom.ts`)

新增（`acquisitionAvailability` 維持現狀，**不**取代）：

```ts
itemLocations: ref<Map<number, ItemLocations>>(new Map())  // 來自 item-locations.ts，LRU 500

// 拆兩塊：prefs（使用者偏好，無關當下 BOM）vs session（這份 BOM 的暫存）
routeViewPrefs: ref<{
  optimizeBy: 'gil' | 'hop'
}>                                                          // localStorage key: bom-route-prefs

routeViewSession: ref<{
  excluded: Set<number>                                     // user-unchecked itemIds
  checked: Set<number>                                      // 完成度（item-centric）
  collapsedGroups: Set<number>                              // 摺疊的 zoneIds
}>                                                          // localStorage key: bom-route::<targetSig>
```

`mode: 'detail' | 'route'` 不放 store，由 `BomView` 持有 `ref` + `sessionStorage`（key `bom-view-tab`），與 BOM target 無關，不會因為改 target qty 被重置。

**localStorage 持久化**：
- `routeViewPrefs` → key `bom-route-prefs`，目前只有 `optimizeBy`，照 `src/stores/theme.ts:30-39` try/catch 寫入
- `routeViewSession` → key `bom-route::<targetSig>`
- `targetSig` = canonical CSV：`targets.slice().sort((a,b) => a.itemId - b.itemId).map(t => \`${t.itemId}:${t.quantity}\`).join(',')`，**不用 sha1**（避免引入 crypto 依賴；CSV 短且穩定）
- `targetSig` 由 `computed` 算出；`watch(targetSig, (next, prev) => { if (next !== prev) loadOrResetSession(next) })` 處理 target 變動 → session 自動重置/載回對應 key 的歷史
- LRU 上限 8 個 `bom-route::*` key，超過時 evict 最舊
- 寫入 debounce 500ms（checkbox 連點不會 hammer localStorage）

**Reactivity 觸發邊界**（避免 over-rendering）：
- `sortRoute()` 結果是 `computed`，inputs = `(itemLocations.value, routeViewPrefs.optimizeBy, routeViewSession.excluded, aetherytes)`
- **`checked` 不是 sortRoute 的 input**：勾選只影響 row 的 `.checked` class（strikethrough），不會觸發重排或 re-group
- `collapsedGroups` 不是 sortRoute 的 input：純 UI 摺疊狀態

### 6.4 既有結構不動

- `bom-calculator.ts`、`MaterialNode`、`FlatMaterial`、`fetchPrices` 全保留
- `BomDecisionRow` segment 控制不動
- `BomTotalsBar` 不動
- `BomCraftTreeNode` 不動（仍是 craft mode 展開區）

## 7. Algorithm

### 7.1 `sortRoute()` — greedy heuristic

明確標註為 **non-optimal heuristic**，對 BOM 規模（5–25 zones、30–80 rows）已堪用。輸入輸出型別：

```ts
interface RouteInput {
  rows: Array<{ itemId: number; mode: 'npc'|'gather'; qty: number;
                sources: Array<{ zoneId: number; x: number; y: number;
                                 vendorName?: string; nodeLevel?: number;
                                 itemPrice?: number }> }>
  aetherytes: Map<number, AetheryteInfo[]>  // zoneId → aetherytes
  optimizeBy: 'gil' | 'hop'
  excluded: Set<number>
}

interface RouteOutput {
  groups: Array<Group>           // Group 由 component 內 derive count/totalGil
  totalTpCost: number
  totalHops: number              // = groups.length
}

interface Group {
  zoneId: number                   // 同時是 PlaceName.Id（給 useZoneName 解析）
  aetheryte: AetheryteInfo | null  // null 代表 zone 不在 aetherytes.json
  tpCost: number                   // 0 if aetheryte === null（UI 顯示 ?G）
  rows: Array<{ itemId: number; source: ChosenSource; orderInZone: number }>
  isHero?: boolean                 // §5.3 hero card 規則：件數最多 or 預估 gil 最大
}
```

**步驟**：

1. **過濾**：移除 `excluded` 與水晶（`itemId < 20`）

2. **Pass 1 — 每列挑 primary source（按 gil 規則）**：
   ```
   for each row r:
     r.primarySource = argmin over r.sources of:
       (s.itemPrice ?? 0) * r.qty + tpCostOf(s.zoneId, aetherytes)
     tie-break: gather→nodeLevel ASC, npc→itemPrice ASC, then vendorName 字典序
   ```

3. **Pass 2 — 僅當 `optimizeBy === 'hop'` 才執行**：嘗試把 row 從冷門 zone 移到已存在的熱門 zone：
   ```
   improved = true
   while improved:
     improved = false
     zoneCounts = countBy(rows, r => r.primarySource.zoneId)  // Map<zoneId, count>
     for each row r in rows (sorted by alternativesCount DESC):
       currentZone = r.primarySource.zoneId
       if zoneCounts.get(currentZone) > 1: continue           // 沒移走也不會少 zone
       for each alt source in r.sources where alt.zoneId !== currentZone:
         if zoneCounts.get(alt.zoneId) >= 1:                  // 移到已訪 zone 才算改善
           # 接受條件：總 hops 嚴格減少（離開的 zone 變空），gil 增量在 30% 以內
           gilDelta = costOf(alt) - costOf(r.primarySource)
           if gilDelta / costOf(r.primarySource) <= 0.30:
             r.primarySource = alt
             zoneCounts.set(currentZone, zoneCounts.get(currentZone) - 1)
             zoneCounts.set(alt.zoneId, zoneCounts.get(alt.zoneId) + 1)
             improved = true
             break  # 換下一個 row
   ```
   30% gil cap 避免 hop-min 為了少跑一個區擠出 10 倍 gil 的怪結果。

4. **挑 zone 的 aetheryte**：對 zone 內所有 stops 算 centroid `(avgX, avgY)`，取距離 centroid 最近的 aetheryte（簡單歐式距離；zone 不在 `aetherytes.json` → `aetheryte = null`、`tpCost = 0`、UI 顯示 `?G`）

5. **Zone 內排序**：依距離 aetheryte 升冪，綁定 `orderInZone = 1..N`

6. **Zone 之間排序**：`tpCost ASC`，`null` aetheryte 的 zone 排最後

7. **標記 hero card**（§5.3）：在 `groups` 上挑一張設 `isHero = true` — 規則 `argmax(group.rows.length, sum(row.itemPrice * qty))`；少於 2 group 不標 hero（單組沒有對比意義）

8. 回傳 `RouteOutput`

### 7.2 座標換算（map pixel）

**直接 `import { convertToPixel } from '@/utils/map-coords'`**（已存在的 helper，已用於 garland.ts 流程）。

`route-planner.ts` 不重新實作公式；如需從像素再換成 CSS percentage（marker 定位），加薄 wrapper：

```ts
import { convertToPixel } from '@/utils/map-coords'
export function pixelToPercent(px: number, py: number, mapPx = 2048) {
  return { left: `${(px / mapPx) * 100}%`, top: `${(py / mapPx) * 100}%` }
}
```

## 8. Edge Cases

| 情境 | 行為 |
|---|---|
| garlandtools 整個 timeout | row 在 BOM 主表保留；route tab 顯示「採購地點查詢失敗」+ 重試按鈕 |
| garlandtools 回應有但 `nodes`/`vendors` 全空 | 該 row 在 route tab 灰底「查無位置資料」、不可勾選、自動 set excluded |
| zone 在 `aetherytes.json` 找不到 | tpCost 顯示 `?G`，warning chip「未知傳送費」；該 zone 排在最後 |
| xivapi Map asset 載入失敗 | 純色 fallback 背景，marker 仍照畫；`<img onerror>` |
| 同 zone 內兩個 source 座標完全相同 | marker 疊在同位，z-index 低編號在上；hover 兩列都 highlight 上層 marker |
| 物品同時可 npc + gather | route 只看 row 的 mode；混搭由使用者在 BOM 主表決定，不在 route 內二度選擇 |
| target 是 non-craftable + npc mode（v2.10 已上線功能） | 跟一般 npc row 等價處理 |
| 水晶 `itemId < 20` | 永遠不進 route；但仍在 §5.1 展開區顯示來源 |
| BOM target 變更 | targetSig 變、新 key 從零開始；舊 key 留到 LRU 滿 |
| optimizeBy 切換 | 重跑 `sortRoute`；marker 編號重排；勾選不重置 |
| `checked` Set 變動（勾選） | **不**重跑 `sortRoute`、**不** re-group；只更新該 row 的 `.checked` class |
| locale 切換 | NPC/zone 名透過 `useZoneName`/`useNpcName` reactive 重渲染（讀模組層 cache，**不**重新 fetch xivapi）；map asset URL 不變 |
| 第一次進 route tab | `await fetch('/data/aetherytes.json')` + 觸發任何尚未 fetch 的 `itemLocations`；顯示 skeleton 直到完成 |
| 全部 npc/gather row 都被勾完 | progress bar 100% + toast-gold ring；彈 toast：*烤盤已清空 · 收工*（Cormorant italic, §5.4） |
| BOM 沒任何 npc/gather row（全 craft/market） | route tab 仍可切，內容顯示 §5.4 empty state「今天不用出門」；tab badge 不顯示數字 |
| Phone (`<768px`) 點 row 上的 `🗺️ 地圖` 按鈕 | 開 `ZoneMapSheet` bottom sheet，全屏顯示該 zone 地圖 + 該 row 的單一 marker 高亮；下拉關閉 |
| 全部勾完後使用者再加新 target | targetSig 變、新 sig 的 session 從零；UI 不主動跳回 detail tab，使用者自己選擇 |

## 9. Testing Strategy

### 9.1 Unit tests（vitest）

- `route-planner.ts`
  - `pickPrimarySource()` — 8 案 cover gil/hop tie-break
  - `groupAndOrder()` — 0/1/20 列 stress
  - `pickNearestAetheryte()` — centroid + euclidean
  - `sortRoute()` end-to-end 5 fixtures（簡單 / 同 zone 多項 / 多 zone / unknown aetheryte / empty）
  - `markHero()` — 0/1/2/N groups 各驗一案
- `item-locations.ts`
  - `parseGarlandLocations()` — vendors/nodes 各 6-8 fixture
  - LRU 上限 500 entries（驗逐出最舊）
  - inflight dedupe（同 itemId 並行請求只發一次）
- `zone-meta.ts`
  - `fetchZoneMetaBulk()` 對 30 zoneIds 應發 1 個 PlaceName + 1 個 Map query，不是 30 個
- `bom store`
  - `targetSig` canonical CSV stable（target 順序不影響）
  - LRU 上限 8 個 `bom-route::*` key
  - `routeViewSession` 在 sig 變更時自動 reset/load
  - localStorage 寫入 debounce（連點 10 次只寫 1 次）

### 9.2 Component tests（vitest + @testing-library/vue）

- `BomView` tab 切換（inline `<el-segmented>`）：disabled 在沒 calculate 前；切換寫 sessionStorage
- `BomRoutePlanner`：
  - 空狀態（沒 npc/gather row）→ §5.4 Empty state Cormorant italic
  - toolbar 切 gil/hop → marker 編號重排（含 hero card 重新標）
  - row checkbox → store 更新 + progress bar 變動，**不**觸發 sortRoute re-run
  - hover row → 對應 marker 加 toast-gold ring class（雙向）
  - 摺疊 zone group → body 隱藏，狀態存 `routeViewSession.collapsedGroups`
  - hero card variant：跨 col + cream-emphasis 背景驗證
- `BomAcquisitionDetail`：
  - npc mode 展示主來源 + 替代列
  - zone chip 切換更新 map 底圖
  - garlandtools 失敗 → 顯示重試 chip
  - aspect-ratio map 在 200/320/480 三個容器寬度都不溢出
- `ZoneMapSheet`（phone only）：
  - `<768px` viewport 才掛載
  - 下拉手勢關閉

### 9.3 Integration（Chrome DevTools MCP via `e2e-execute`）

- 完整流程：加目標 → 計算 → 切 route tab → 切 gil/hop → 勾若干列 → reload → 勾選保留 → 改 target qty → 勾選清空
- 四檔 viewport 都跑一次：`1800px`（3 欄）/ `1400px`（2 欄）/ `900px`（tablet 1 欄、map 卡內）/ `375px`（phone 1 欄、地圖只在 sheet）
- 視覺對比：`.tmp/compare/route-planner/{before,after}/`
- Brand QA：toast-gold 在每張 viewport 截圖實測 ≤10% 像素佔比；marker 確認無 strawberry/matcha 色相滲入

### 9.4 手動驗收

- 用真實 BOM 跑 5 種代表案例（小型 / 中型 / 含跨區 / 含異常 source / 全 gather）
- garlandtools 真資料對照 spec mockup

## 10. Out of Scope（明確不做）

- 真正的 TSP 最佳化（NP-hard，BOM 規模不值得；greedy 已堪用）
- ToD 限定節點時段對齊（使用者自己看遊戲時間）
- 採集職業（BTN/MIN/FSH）切換提醒
- 水陸路 / 未解鎖以太之光的可達性檢查（假設使用者全攻略完）
- 角色等級對應的傳送費折扣（用平均估值）
- 跨 zone 的「順路採集」最佳化（只看單 zone 內 aetheryte 距離）
- 與 FFXIV plugin 的 deeplink 傳送（MVP 只複製 `/tp` 文字）
- 真正的 minimap interactive marker（hover label / click popover），MVP 僅 hover 連動 list

## 11. References

- Brand 規範：`PRODUCT.md` · `DESIGN.md`（特別是 Jam-Jar Rule、Sunlight Spotlight Rule、Italic-Is-Sacred Rule、Flat-Until-Touched Rule）
- 現有 BOM cockpit spec: `docs/superpowers/specs/2026-05-05-bom-decision-cockpit-design.md`
- 現有 garlandtools + xivapi 整合: `src/api/garland.ts:104-134`
- 已存在的座標換算 helper: `src/utils/map-coords.ts:1-10`
- locale-reactive 名稱解析範本: `src/composables/useItemName.ts:1-14`
- localStorage try/catch 寫入範本: `src/stores/theme.ts:30-39`
- `<el-segmented>` 既有用法: `src/components/batch/BatchSettings.vue`
- v2.10 non-craftable target 功能 commit: `31c6d4a`
- Mockups（gitignored，保存於 `.superpowers/brainstorm/` 開發機）：
  - v3: `bom-acquisition-mockups-v3-wide-layouts.html`（Layout A 確認）— 注意：此 mockup 早於 brand audit，色彩借用 strawberry/matcha 已被 §3 修正案否決，**僅作版面結構參考**

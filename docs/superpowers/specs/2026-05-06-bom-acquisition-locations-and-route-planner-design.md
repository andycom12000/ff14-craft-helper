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

- **Color strategy**：延續 BOM 主軸 cocoa（Jam-Jar Rule，crafting zone）。新增配色：NPC = 草莓醬紅、採集 = 抹茶綠、以太之光標 = 藍莓、已完成 = 可可灰。地圖底圖以 game asset 原色為主，marker 浮在上方提供高對比。
- **Scene sentence**：玩家把 BOM 整理完畢，發現有 12 樣要自己跑——他不想開三個瀏覽器分頁查 NPC 在哪，更不想在遊戲裡開地圖一個一個點。打開「採買路線」tab，看到「東拉諲西亞 4 件 · 拉諲西亞低地 3 件…」，按完傳送就邊跑邊勾。
- **Anchor refs**：
  - **FFXIV Teamcraft · Gathering optimizer**：每 zone 一張地圖 + 編號 marker + 對應 checklist
  - **Apple Reminders · Lists**：tick-as-you-go，勾掉的列 strikethrough + 變灰
  - **Notion · Inline expand**：BOM Decision Row 展開區同位顯示「去哪買」資訊

## 4. Scope

- Fidelity: production-ready
- Breadth: 新增 4 個元件（`BomViewTabs` `BomAcquisitionDetail` `BomRoutePlanner` `RoutePlannerGroupCard`）+ 1 個服務（`route-planner.ts`）+ 1 個資料服務擴充（`item-locations.ts` / 重構 `item-acquisition.ts`）+ 1 份新靜態資料（`public/data/aetherytes.json`）
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
│ ┌─[ 小地圖 320×216 ]──┐                                  │
│ │ ●主來源              │  底圖：xivapi Map asset         │
│ │ ◯替代來源            │  marker：CSS absolute           │
│ └─────────────────────┘                                  │
└─────────────────────────────────────────────────────────┘
```

排序：NPC 依 `itemPrice ASC`、Gather 依 `nodeLevel ASC`。「⎘ /tp」MVP = 複製 `/tp <aetheryte 名>` 到剪貼簿。

### 5.2 Tab Strip（`BomViewTabs`）

放在 `BomTotalsBar` 下方、`BomDecisionTable` 上方：

```
[ 📋 材料明細 ]  [ 🗺️ 採買路線 (12) ]
```

- 「採買路線」徽章 = 未勾完的 npc/gather 行數
- BOM 還沒 calculate 前 disabled
- 行動裝置（≤900px）：tab 等寬置頂

### 5.3 採買路線 tab —「Layout A · 2-欄 zone card 網格」

每張 zone card 內含 map + list；用 `auto-fit minmax(440px, 1fr)`：

| Viewport | 欄數 | 卡寬 | Map | List |
|---|---|---|---|---|
| `≥1700px` | 3 欄 | ~480px | 240×280 | 240px wide |
| `1100–1700px` | 2 欄 | ~720px | 240×280 | 480px wide |
| `<1100px` | 1 欄 | full | full × 240 (橫) | full wide |

每張 card 結構：

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

**互動**：marker ↔ list row hover 雙向 highlight；marker 編號 = 該 zone 內 list 的順序。Group header 可點摺疊，預設前 2 組展開、其餘摺起。

## 6. Architecture

### 6.1 元件樹

```
BomView
└─ BomDecisionTable
   ├─ <NEW> BomViewTabs              "材料明細 / 採買路線"
   ├─ BomDecisionRow (existing)
   │  ├─ BomCraftTreeNode (existing) ← craft mode 展開區
   │  └─ <NEW> BomAcquisitionDetail   ← npc/gather mode 展開區
   └─ <NEW> BomRoutePlanner           ← tab=route 切到這裡
      ├─ <NEW> RoutePlannerToolbar    gil/hop toggle、progress、actions
      └─ <NEW> RoutePlannerGroupCard ×N  每張 = 一個 zone
         ├─ 內嵌 map（xivapi asset + CSS marker）
         └─ checklist rows（item-centric）
```

### 6.2 資料服務

**重構**：將現有 `src/services/item-acquisition.ts` rename + 擴充為 `src/services/item-detail.ts`，單一 garlandtools fetch 同時回傳兩塊：

```ts
interface ItemDetail {
  acquisition: ItemAcquisition  // 現有：canMarket/canGather/canNpc/npcPrice
  locations: ItemLocations      // 新增
}

interface ItemLocations {
  npcVendors: Vendor[]   // { npcId, npcName(zh-TW), zoneId, zoneName(zh-TW), x, y, price }
  gatherNodes: Node[]    // { nodeId, type:'MIN'|'BTN'|'FSH', level, zoneId, zoneName, x, y }
}
```

- garlandtools 取 ID + 座標 + price
- xivapi 補：zone 名（PlaceName + s2t）、map asset（Map sheet 的 `Id` + `SizeFactor`）、NPC 名（ENpcResident + s2t）— 沿用 `src/api/garland.ts:104-134` 已驗證的模式
- Cache：`Map<itemId, ItemDetail>`，inflight dedupe 維持
- Batch fetch：concurrency=6，與目前 `fetchItemAcquisitionBatch` 一致

**新增** `src/services/route-planner.ts`：純函式，`sortRoute(input) → RouteOutput`，演算法見 §7.1。

**新增** `public/data/aetherytes.json`：手寫 + 從 xivapi Aetheryte sheet 半自動產生：

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

`tpCostBase` 為平均估值（不模擬角色等級折扣），約 ~150 zones / ~250 aetherytes，<20KB。route planner 第一次切到 tab 時 lazy import。

### 6.3 Store 改動 (`src/stores/bom.ts`)

新增：

```ts
itemDetails: ref<Map<number, ItemDetail>>(new Map())  // 取代現有 acquisitionAvailability

routeView: ref<{
  mode: 'detail' | 'route'              // tab state
  optimizeBy: 'gil' | 'hop'             // route opt target
  excluded: Set<number>                 // user-unchecked itemIds
  checked: Set<number>                  // 完成度（item-centric）
  collapsedGroups: Set<number>          // 摺疊的 zoneIds
}>
```

**localStorage 持久化**：
- key = `bom-route::<targetSig>`
- `targetSig = sha1(JSON.stringify(targets.map(t=>[t.itemId,t.quantity]).sort()))`（固定排序避免順序影響簽名）
- target list 改變 → 簽名變 → 舊 key 自然失效；LRU 上限 8 個 key
- `mode` 與 `optimizeBy` **不**綁簽名（使用者偏好），單獨存 `bom-route-prefs`

### 6.4 既有結構不動

- `bom-calculator.ts`、`MaterialNode`、`FlatMaterial`、`fetchPrices` 全保留
- `BomDecisionRow` segment 控制不動
- `BomTotalsBar` 不動
- `BomCraftTreeNode` 不動（仍是 craft mode 展開區）

## 7. Algorithm

### 7.1 `sortRoute()` — greedy heuristic

明確標註為 **non-optimal heuristic**，對 BOM 規模（5–25 zones、30–80 rows）已堪用。

**步驟**：

1. **過濾**：移除 `excluded` 與水晶（`itemId < 20`）
2. **每列挑 primary source**：
   - `optimizeBy === 'gil'`：`(itemPrice * qty) + tpCostToZone` 最低
   - `optimizeBy === 'hop'`：兩階段 — Pass 1 按 gil 規則挑出初值，Pass 2 對「有替代 zone 的 row」嘗試移到「已存在的 popular zone」直到不再改善
   - tie-break：gather 依 `nodeLevel ASC`、npc 依 `itemPrice ASC`、再依 `vendorName` 字母序
3. **挑 zone 的 aetheryte**：對 zone 內所有 stops 算 centroid，取距離最近的 aetheryte
4. **Zone 內排序**：依距離 aetheryte 升冪（簡單歐式距離），編號 1..N
5. **Zone 之間排序**：`tpCost ASC`（兩種 mode 都一樣，差別只在第 2 步的 source 選擇）
6. 回傳 `{ groups, totalTpCost, totalHops }`

### 7.2 座標換算（map pixel）

xivapi `SizeFactor` → 倍率 = `200 / SizeFactor`；遊戲座標 `(c)` → 圖上歸一化座標 `(c - 1) * 倍率 / 41 + 1`。CSS percentage = 直接 `(normalized / 42) * 100%`。沿用業界通用公式，`route-planner.ts` 內提供 helper。

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
| locale 切換 | NPC/zone 名 reactive 重渲染（透過 `useItemName` 同款 composable）；map asset URL 不變 |
| 全部勾完 | progress bar 變綠 + toast「全部完成」；提供「重設勾選」/「回 BOM 主表」 |

## 9. Testing Strategy

### 9.1 Unit tests（vitest）

- `route-planner.ts`
  - `pickPrimarySource()` — 8 案 cover gil/hop tie-break
  - `groupAndOrder()` — 0/1/20 列 stress
  - `pickNearestAetheryte()` — centroid + euclidean
  - `sortRoute()` end-to-end 5 fixtures（簡單 / 同 zone 多項 / 多 zone / unknown aetheryte / empty）
- `item-detail.ts`（重構後）
  - `parseGarlandPartials()` — vendors/nodes 各 6-8 fixture
  - 拒絕 `tradeable=0` 進 npc 列表
- `bom store`
  - localStorage signature stable（target 順序不影響）
  - LRU 上限 8 key
  - excluded/checked 在 sig 變更時自動清空

### 9.2 Component tests（vitest + @testing-library/vue）

- `BomViewTabs`：tab disabled 在沒計算前
- `BomRoutePlanner`：
  - 空狀態（沒 npc/gather row）→ 「BOM 中沒有需要外出的材料」
  - toolbar 切 gil/hop → emit + marker 編號重排
  - row checkbox → store 更新 + progress bar 變動
  - hover row → 對應 marker 加 `.hover` class
  - 摺疊 zone group → body 隱藏
- `BomAcquisitionDetail`：
  - npc mode 展示主來源 + 替代列
  - zone chip 切換更新 map 底圖
  - garlandtools 失敗 → 顯示重試 chip

### 9.3 Integration（Chrome DevTools MCP via `e2e-execute`）

- 完整流程：加目標 → 計算 → 切 route tab → 切 gil/hop → 勾若干列 → reload → 勾選保留 → 改 target qty → 勾選清空
- 在 1280px / 1700px / 900px 三檔 viewport 驗證 Layout A 的 1/2/3 欄切換
- 視覺對比：`.tmp/compare/route-planner/{before,after}/`

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

- 現有 BOM cockpit spec: `docs/superpowers/specs/2026-05-05-bom-decision-cockpit-design.md`
- 現有 garlandtools + xivapi 整合: `src/api/garland.ts:104-134`
- v2.10 non-craftable target 功能 commit: `31c6d4a`
- Mockups（保存於 `.superpowers/brainstorm/`）：
  - v2: `bom-acquisition-mockups-v2.html`（採用 v3 後棄）
  - v3: `bom-acquisition-mockups-v3-wide-layouts.html`（Layout A 確認）

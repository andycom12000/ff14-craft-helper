# BOM 完成品預設取得方式（Purchase Mode Toggle）

**Status**: Draft → review
**Branch**: `feat/bom-purchase-mode-toggle`
**Date**: 2026-05-10
**Next**: hand off to `writing-plans` after user approves

---

## 1. Background

BOM 頁目前對「完成品（BOM target）」的取得方式有強制鎖定：

- `BomDecisionTable.vue` 把 craftable target row 的 `:immutable` 設為 `row.isCraftable`，所以只要該 target 有 recipe，就**只能自製**，無法切到 market / NPC。
- 不可製作的 target（NPC 賣 / 採集 / 文杯）才能在 market / npc / gather 之間切。

這設計假定「會做就一定要做」。實務上玩家經常想偷懶直購成品，尤其是同 DC 其他伺服器有低價 listing 時。本案讓使用者透過 BOM Settings 全域切「自製 / 直購」、並在直購模式自動暴露同 DC 跨伺服器最低價。

跨服查價基礎建設**已存在**，不需新建：

- `useCrossWorldPricing` composable（`src/composables/useCrossWorldPricing.ts`）
- `getMarketDataByDC` + `aggregateByWorld`（`src/api/universalis.ts`）
- `CrossWorldPriceDetail` 元件、`settings.crossServer` toggle

本案是把這些既有能力連到 target row 的取得決策，並補足 receipt / cockpit 的呈現。

## 2. Goals

1. 允許使用者在 **BOM Settings** 切「完成品預設：自製 / 直購」全域選項，預設 `craft`，存於 BOM store + localStorage（沿用 `routeViewPrefs` 的模式）。
2. 解除 craftable target row 的 immutable 鎖；row 與材料 row 的取得方式切換對等。
3. 預設 `market` 且 `settings.crossServer === true` 時：自動為每個 craftable target 抓同 DC 跨伺服器最低價，row 與 receipt 同步反映。
4. Receipt 在跨服模式下並陳「本服總價 / 跨服最佳 / 可節省」，cockpit bar 顯示節省金額副標。
5. 所有新元件視覺與既有 `rawMaterialDefault` segmented control / `BomMarketDetail` / `CrossWorldPriceDetail` 對齊；遵守 Toast Workshop 的 jam-jar wayfinding（cocoa = craft、strawberry = market）。

## 3. Non-Goals

- **不**改變非 craftable target 行為（NPC / 採集 / 文杯類）。它們維持現有 market/npc/gather 切換。
- **不**改材料 row 的計價邏輯。本案只動 target row 與 receipt。
- **不**強制改變 `settings.crossServer`；該 flag 仍由使用者自主管理。直購模式下若 `crossServer === false`，退化為「直購（本服）」，receipt 一欄。
- **不**新增「自動取最低成本」全域策略。完成品預設只兩個值：`craft` 或 `market`。
- **不**自動跨 DC 比價。本案只查同 DC（與 `getMarketDataByDC` 一致；跨 DC 物理上無法跨服購買，無實用價值）。

## 4. Architecture

### 4.1 Store changes（`src/stores/bom.ts`）

新增 type 與 state：

```ts
export type TargetDefaultMode = 'craft' | 'market'

export interface CrossWorldBest {
  worldName: string
  minPrice: number      // NQ minPrice from cheapest world in DC
  fetchedAt: number
}

const targetDefaultMode = ref<TargetDefaultMode>(readTargetDefaultFromLs() ?? 'craft')
const crossWorldBestPriceMap = ref<Map<number, CrossWorldBest>>(new Map())
const crossWorldFetchStatus = ref<Map<number, PriceFetchStatus>>(new Map())
const fetchingCrossWorldIds = ref<Set<number>>(new Set())
```

LocalStorage：擴充既有 `bom-route-prefs` key，加 `targetDefaultMode` 欄位。`readPrefsFromLs` / `writePrefsToLs` 同步擴充，向後相容（讀不到 fallback `'craft'`）。

新增 actions：

- `setTargetDefaultMode(mode: TargetDefaultMode)`
  - 寫 LS
  - 呼叫 `applyTargetDefault()`
  - 若新 mode === `'market'` 且 `settings.crossServer`，呼叫 `fetchCrossWorldBestForTargets()`
- `applyTargetDefault()` — 對 `targets` 中 `recipeId !== null` 且 `!userTouchedModes.has(itemId)` 的項目：
  - mode === `'market'` → `setAcquisitionMode(itemId, 'market', false)`（fromUser=false 不入 userTouched）
  - mode === `'craft'` → 確保 tree node 的 `collapsed = false`、清掉 `acquisitionMode.get(itemId)`（若曾被自動設為 market）
- `fetchCrossWorldBestForTargets()` — 並行對每個 craftable target：
  1. 已 cached（map 有 entry）跳過
  2. `getMarketDataByDC(settings.dataCenter, itemId)` → `aggregateByWorld(listings)`
  3. 取 `minPriceNQ > 0` 的最低值寫進 `crossWorldBestPriceMap`（**含 home server**；若 home 就是最低，pill 顯本服、savings 自然 = 0）
  4. 若全 DC 都無 NQ listing → 不寫 entry，`crossWorldFetchStatus.set('ok')`，UI 顯「跨服無掛單」
  5. 失敗 → `crossWorldFetchStatus.set('failed')`，UI 顯重試
- `retryCrossWorldFetch(itemId)` — 清掉 status 後重跑 fetch（單筆）

新增 computed：

- `effectiveGrandTotalBreakdown: { home: number, crossWorldBest: number, savings: number }`
  - 對非 target row：與既有 `effectiveGrandTotal` 同邏輯
  - 對 craftable target row：
    - mode === `'market'` ∧ `crossServer` ∧ `crossWorldBestPriceMap.has(itemId)` → `home += homePrice × amount`、`crossWorldBest += bestPrice × amount`
    - 其他情況 → `home` 與 `crossWorldBest` 同值（即無跨服優勢）
  - `savings = max(0, home - crossWorldBest)`

整合點：

- `applyOptimalDefaults` 在現有流程末段呼叫 `applyTargetDefault()`，順序：先補空缺 → 再依全域偏好覆寫未 touched 的 target row。
- `calculate()` 結束時若 `targetDefaultMode === 'market' && settings.crossServer`，await `fetchCrossWorldBestForTargets()`。
- Watch `settings.crossServer` 變化：開啟時若當前 mode === `'market'` → trigger fetch；關閉時清 `crossWorldBestPriceMap`（receipt 退回單欄、不留半新半舊資料）。

### 4.2 Mode switching contract

| 觸發 | 行為 |
|---|---|
| User 切 BOM Settings 「完成品預設」 | `setTargetDefaultMode` flip 所有 *未 touched* 的 craftable target |
| User 在某 target row 手動切（craft → market） | `setAcquisitionMode(_, 'market', fromUser=true)` 進入 `userTouchedModes`，全域變更不再影響該 row |
| User clearTargets | 清 `userTouchedModes`、`crossWorldBestPriceMap`、`crossWorldFetchStatus` |
| User 改 dataCenter | `crossWorldBestPriceMap.clear()`，若 mode === `'market'` re-trigger fetch |

## 5. UI / UX

### 5.1 Visual language

採 Restrained + jam-jar wayfinding。Cocoa（自製）/ strawberry-jam（直購）作為 hue 線索；toast-gold 仍然是 active CTA、不替換成功能色。

### 5.2 BomSettingsCard — 新 row（desktop + mobile）

新增「完成品預設」row，視覺與 `rawMaterialDefault` 對等（`el-radio-group` desktop / `el-segmented` mobile）：

- Label：`完成品預設`
- Options：`自製` / `直購`
- Hint 隨 mode 與 `settings.crossServer` 三態切換：
  - `craft`：「完成品預設自己做，材料逐筆比價」
  - `market` + `crossServer`：「完成品預設買成品，自動找同 DC 最便宜的伺服器」
  - `market` + `!crossServer`：「完成品預設買成品，目前用本服價（[啟用跨服採購]）」 — `[啟用跨服採購]` 為 inline button，click → `settings.crossServer = true`，立即觸發 fetch、文案 reactive 更新

Mobile cell：icon `🥖`（toast emoji 與 PRODUCT.md 烘焙語意呼應；不違反「不傾斜」規則）。Title「完成品預設」、sub 隨 mode 變化（同 desktop）。

### 5.3 BomDecisionTable — target group hint

`BomDecisionTable.vue:155` 的 `__hint` 文案改為 mode-aware（craft 文案保留現狀；market 模式換成「直購：自動挑同 DC 最便宜的伺服器」或「直購：使用本服市場價」）。

`BomDecisionTable.vue:174` 把 `:immutable="row.isCraftable"` 改為 `:immutable="false"`。craftable target 與材料 row 的 segmented chip 行為對等。

### 5.4 BomDecisionRow — target row 在 market mode

當 row 是 target、`mode === 'market'`：

- **物品名稱右側** inline server pill：`worldName`（沿用 `CrossWorldPriceDetail.isHome` 樣式 — home server 粗體 + 「你」mini-tag；跨服用 strawberry-jam `oklch(0.58 0.20 15)` 文字 + transparent 底 + 1px strawberry-tinted 邊框）
- **單價欄** = `crossWorldBestPriceMap.get(itemId)?.minPrice ?? marketPrice`（cross-world 為主、退回本服）
- **小計欄** = 單價 × amount，typography 維持 Fira Code
- 點開 row → 既有 `BomMarketDetail` 展開（`CrossWorldPriceDetail` 表格已會把最低 row highlight）

States：

- Fetch 中：單價欄 1.5em width skeleton（避免 layout shift）
- Fetch failed：單價欄顯「跨服查價失敗 ↻」chip（cocoa 邊框、無填、click → `retryCrossWorldFetch`）
- 跨服無掛單：server pill 不渲染；單價走本服；小計欄末加 `inline` 註「跨服無掛單」（11.5px、`--app-text-muted`）
- Home server 即最低：server pill 顯本服名 + 「你」tag；receipt savings = 0、不顯示「可節省」欄

「已自訂」flag 視覺 → 留給實作階段定（候選：toast-gold-glow 圓點 vs Fira Code「(自訂)」副標）。

### 5.5 BomTotalsReceipt — 新 segment

`targetDefaultMode === 'market' && crossServer === true && crossWorldBestPriceMap.size > 0` 時，receipt 多一段（既有「分隔虛線 + 縮排副欄」pattern）：

```
本服總價                xxx,xxx g
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
跨服最佳總價            yyy,yyy g     ← strawberry-jam
可節省                  zz,zzz g      ← --app-success
```

Hover「跨服最佳」→ tooltip：「由 N 個目標跨服比價得到，最低 server: A, B, C…」。

`craft` mode 或 `crossServer` off 時 receipt 不變。

### 5.6 BomTotalsBar (cockpit) — 副標

主數字仍是「跨服最佳總價」（即實際要花的錢）。`savings > 0` 時加副標「省 zz,zzz g（vs 本服 xxx,xxx g）」、用 `--app-success`。Mobile 寬度不夠時的折疊規則：留給實作階段。

### 5.7 i18n

所有新文案先寫 zh-TW；en/ja 留 TODO comment（與專案既有作法一致）。

## 6. Data Flow

```
User 切 BomSettingsCard 「完成品預設」 → 直購
  └─ setTargetDefaultMode('market')
      ├─ writePrefsToLs({ ..., targetDefaultMode: 'market' })
      ├─ applyTargetDefault()
      │    └─ for each craftable target (untouched):
      │         setAcquisitionMode(itemId, 'market', fromUser=false)
      │           └─ node.collapsed = true; recalcFlat()
      └─ if (settings.crossServer) fetchCrossWorldBestForTargets()
           └─ Promise.allSettled(targets.filter(craftable).map(t =>
                getMarketDataByDC(dc, t.itemId)
                  .then(md => aggregateByWorld(md.listings))
                  .then(rows => pickCheapestNonHome(rows))
                  .then(best => crossWorldBestPriceMap.set(itemId, best))
                  .catch(() => crossWorldFetchStatus.set(itemId, 'failed'))
              ))

Re-render:
  - BomDecisionRow (target, market) → server pill + cross-world unit price
  - BomTotalsReceipt → 三欄（home / cross-world best / savings）
  - BomTotalsBar → main + 副標 savings
```

## 7. Edge Cases

| Case | 行為 |
|---|---|
| Target list 空 | Settings toggle 仍可切；無 fetch；receipt 無 cross-world 段 |
| 全部 target 都不可 craftable | Settings toggle 不顯示？*Decision*: 仍顯示但 disabled、附 hint「目前清單無可製作的完成品」。保持 surface 一致比動態藏更好。 |
| Target 的某 row 已被 user 手動切到 market 後又切到 craft，再切回全域「直購」 | userTouchedModes 已含此 row → 全域不影響。Row 維持 craft，不被反 flip。 |
| Universalis 整個 DC 無 listing | `crossWorldBestPriceMap` 不 set entry；row 顯「跨服無掛單」、單價退回本服 |
| Universalis API 429 / timeout | `crossWorldFetchStatus.set('failed')`；row 顯重試 chip；receipt「跨服最佳」欄回退 = 本服 + tooltip 註 N 筆失敗 |
| User 切 dataCenter 中途 | `crossWorldBestPriceMap.clear()`、若 market mode 重 trigger fetch |
| User clearTargets 後重新 import | `crossWorldBestPriceMap.clear()`，applyTargetDefault 在新 calculate 結束後跑一次 |
| 同 DC 最低就在 home server | `crossWorldBestPriceMap` 寫入 `worldName = home`、`minPrice = homePrice`。row 顯本服 pill「你」tag、savings = 0、receipt 「可節省」欄不顯 |

## 8. Testing

- Unit (`bom.test.ts`)：
  - `setTargetDefaultMode('market')` 對 craftable target 自動 collapse；userTouched row 不被影響
  - `effectiveGrandTotalBreakdown` 三欄計算正確（home / cross / savings）
  - LocalStorage 讀寫向後相容（舊格式 fallback `'craft'`）
- Unit (`bom-calculator.test.ts`)：不必新增（本案不動 calculator）
- Component (`BomDecisionRow.test.ts`)：target row in market mode 顯 server pill；fetch failed 顯重試；no listings 顯 fallback 註
- Component (`BomDecisionTable.test.ts`)：craftable target 不再 immutable；group hint 隨 mode 變
- Mock：Universalis API 用 vitest fetch mock；`crossWorldBestPriceMap` 用 store seed

## 9. Rollout / Risk

- **No migration required**：新 LS 欄位向後相容，舊使用者預設 `'craft'`（與現行行為一致）。
- **Performance**：直購模式新增的 fetch 數 = craftable target 數（典型 1–10 筆）。`getMarketDataByDC` 一次回該 DC 全 listings（payload 約 50–200KB），與 `BomMarketDetail` 既有用法相同 — 無新瓶頸。
- **回退路徑**：feature 全部 gated 在 `targetDefaultMode === 'market'` 上；若上線後出問題，使用者切回「自製」即恢復現狀，無需 rollback build。

## 10. Open Implementation Questions（留給 plan/implementation 階段）

1. 「已自訂」flag 的精確視覺（圓點 vs 副標）
2. Cockpit bar 在 mobile 寬度下副標的折疊文案
3. `BomTotalsReceipt` 的「跨服最佳」hover tooltip 內 server 名稱列表的最大顯示數（5? 10? 全顯?）
4. 退化路徑（`crossServer === false` 下的直購）UI 是否要加上「啟用跨服可看到節省金額」的視覺 cue 在 receipt（不只 settings hint）

## 11. References

- Brand spec：`docs/superpowers/specs/2026-04-26-toast-workshop-rebrand-design.md`
- Design system：`DESIGN.md`（Jam-Jar Rule、Sunlight-Not-Spotlight Rule）
- 既有 BOM tree decision：`docs/superpowers/specs/2026-04-18-self-craft-decision-design.md`
- Universalis API：`src/api/universalis.ts`、`src/composables/useCrossWorldPricing.ts`

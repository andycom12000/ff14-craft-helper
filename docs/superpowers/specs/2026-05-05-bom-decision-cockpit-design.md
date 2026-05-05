# BOM Decision Cockpit + Teamcraft Import — Design Brief

**Status**: Brief confirmed, ready for `/impeccable craft` or `/e2e-execute`
**Date**: 2026-05-05
**Surface**: `src/views/BomView.vue` + components in `src/components/bom/`
**Register**: product

---

## 1. Feature Summary

BOM 購物清單頁 redesign。把版面中心從「樹 + 總覽 tabs」改為**單一素材取得決策表**為 hero：使用者逐筆決定每樣素材怎麼取得（市場買 / 自製子配方 / 自採 / NPC），總成本與「相對全市買的估省比例」即時更新。目標清單退居 sticky 左 rail，子配方溯源以 row drill-down 取代獨立 tab。同時整合 Teamcraft import / export，使其相容 ReMakePlace、MakePlace 等外部工具。長期目標是讓視覺語言對齊 Simulator cockpit，方便日後與 Batch 整併。

## 2. Primary User Action

對每筆素材選擇取得來源 → 看總成本即時更新。進入清單可以從搜尋、或從 Teamcraft URL 匯入。

## 3. Design Direction

- **Color strategy**: Restrained，主色 cocoa（Jam-Jar Rule，BOM 屬 crafting zone）。取得方式僅用 icon + label + 中性 chip 區分，**不**借用 strawberry/matcha 色避免破例。Total cost 數字保留 toast-gold。
- **Scene sentence**: 週末晚上玩家攤開家具或裝備清單，桌邊一杯熱可可，筆電開著市場頁，他想決定「這 12 樣哪些自製、哪些直接買、哪些去採。」→ 強迫 light + cocoa，沉穩可長時間閱讀。
- **Anchor refs**:
  - **Linear · Project planning**：左 sticky rail + 中央可編輯 list
  - **Notion · Database with row drill-down**：點 row 在原位展開
  - **Toggl Track · Budget table**：右上總計 + 估省比例的 running total

## 4. Scope

- Fidelity: production-ready
- Breadth: BomView 整頁 + 4 個 BOM 子元件全部重寫
- Interactivity: shipped-quality，含真實 store 整合
- Time intent: 迭代到可以打 tag 上線

## 5. Layout Strategy

**Cockpit 雙欄為主，responsive 切點：**

| Viewport | Layout |
|---|---|
| `≥1440` | 2-col：左 rail（≈300–360 px）= 目標清單 + 設定卡 + 計算 CTA（sticky）；右主區 = 素材決策表 |
| `900–1440` | 2-col 但左 rail 縮成 280 px |
| `<900` | 單欄：目標收成 chip 摘要 + 抽屜，決策表在主區 |
| `≥1920` | 主區拓寬，max-width 1700 → 2100（仿 BatchView） |

主區頂端永遠有 sticky **總計列**：`總價 ${gil} · 估省 ${%} · [重新查價] · [→ 轉到批量計算]`。

### 左 rail 結構

```
┌────────────────────┐
│ 目標清單 (8)       │
│ × 代梳   1         │
│ × 柜    1         │
│ × 桌    1         │
│ ┌─────┬─────────┐ │
│ │ ⌕搜尋│ ⤓匯入   │ │ 並排雙 CTA
│ └─────┴─────────┘ │
│ ─────────────────  │
│ ⚙ 設定卡            │ 仿 BatchSettings:
│  · 跨伺服器        │ - cross-server toggle
│  · 遞迴查價        │ - recursive pricing depth
│  · 例外策略        │ - exception strategy
│ ─────────────────  │
│ ▶ 計算材料需求     │ sticky bottom
└────────────────────┘
```

### 主區結構（決策表）

```
┌───────────────────────────────────────────────────┐
│ 總價 4.2M ゾル · 估省 38% [重新查價] [→ 批量]      │ sticky
├───────────────────────────────────────────────────┤
│ 素材        需量   取得      單價   小計          │
│ 雷石 LV80   ×10   市▾        320   3,200          │
│ 鐵礦        ×36   自製▾      210   7,560          │
│  └ ▼ 子配方拆解（drill-down inline）              │
│      鐵砂 ×72  市     8     576                   │
│      風結晶 ×18  市  18     324                   │
│ 黃薤豆      ×12   自採      free   —              │
│ 高品質默莤  ×4    NPC       200    800            │
└───────────────────────────────────────────────────┘
```

## 6. Key States

| State | What user sees |
|---|---|
| Empty (no targets) | 左 rail hero「建立購物清單」+ 主區 empty pointer 指回左欄 |
| Targets added, not calculated | 主區提示「按計算後素材會出現在這」 |
| Calculating | 總計列轉 spinner + skeleton rows |
| Calculated · default | 全部素材預設 = 「市場買」+ 估價填入 |
| Row drill-down | 點 craftable row 展開子配方節點 + 估「自製成本 vs 市買成本」對比 + 切換建議 |
| Price fetch failed (per row) | row 顯示「查價失敗 重試」，總計列 warn |
| Mobile | targets 頂部 chip 摘要 + 抽屜編輯，drill-down → bottom sheet |
| Import dialog · empty | 輸入框 + 範例 + 支援來源說明 |
| Import dialog · parsing | 解析中 → 預覽列表（icon + 名稱 + 數量），標示歧義/缺項 |
| Import dialog · ambiguous | 對 `recipeId=null` 且多配方的 row 顯示 inline segmented chooser |
| Import dialog · partial fail | 找不到的 itemId 標紅，可選「跳過繼續」/「取消」 |
| Import success | 合併進 targets（預設合併同 itemId 數量相加，chip 切換 取代/合併），dialog 關閉，**停在「已匯入」**讓使用者按計算 |

## 7. Interaction Model

### 主流程
1. 左 rail 加目標 → 開搜尋抽屜（沿用 RecipeSearchSidebar）或匯入 dialog
2. 計算 CTA sticky 在 rail 底部；計算結束自動 scroll 到主區頂端總計列
3. 每筆素材有「取得來源」segmented chip（市/製/採/NPC）— 切換即時影響總計
4. 「自製」row 點開展子配方樹（取代現有 Tab tree）
5. 「重新查價」= 現有 handleRefreshPrices
6. Cross-world price 詳情仍透過 row 展開（沿用 CrossWorldPriceDetail）
7. 「→ 批量」鈕將目前 BOM targets 注入 batchStore 後跳到 /batch

### Import flow
1. 點「⤓ 匯入」開 dialog
2. 貼上輸入 → debounce 200 ms 自動偵測：
   - `https://ffxivteamcraft.com/import/...` → 抽 base64 解碼
   - 純 base64 → 直接解碼
   - 純 `itemId,recipeId,qty;...` → 直接解析
3. 解析失敗 → 紅色錯誤 + 範例
4. 解析成功 → 顯示「將匯入 N 筆」+ 預覽（含縮圖、名稱、數量、配方歧義 chip）
5. 「合併到清單 / 取代清單」二選一（預設合併）
6. 確認 → 寫入 bomStore.targets、dialog 關閉、停在「已匯入」狀態

### Export flow
1. 總計列右上角「分享 ▾」menu，內含「複製 Teamcraft 連結」
2. 點擊產生 `https://ffxivteamcraft.com/import/<base64>` 寫入剪貼簿，toast 確認

## 8. Content Requirements

### 主區
- **總計列**: `總價 NN,NNN ゾル · 估省 38%（vs 全部市買） [重新查價] [→ 批量計算]`
- **取得來源 chip 文案**: 市場 / 自製 / 自採 / NPC（4 字內）
- **空狀態**: 「建立你的購物清單 — 想做什麼就加進來，我會把總材料、市價、最佳採購算給你。」（沿用）
- **Drill-down 標題**: 「自製成本拆解」/「市場 vs 自製對比」

### Import dialog
- **標題**: 「從 Teamcraft 匯入」
- **副標**: 「貼上 Teamcraft 列表連結 — 從 ReMakePlace、MakePlace 或任何 Teamcraft 列表都能直接匯入。」
- **placeholder**: `https://ffxivteamcraft.com/import/...`
- **歧義文案**: 「{品名} 有 {N} 個配方，請選擇」
- **找不到**: 「{品名} (ID {id}) 不在資料庫，可能是新版物品。」
- **合併/取代**: 「合併到現有清單」/「取代現有清單」

### 動態範圍
- 8+ 目標、30–60 種素材、tree 3–5 層、價格刷新延遲 1–3 秒
- Import URL 約 ~8 KB ≈ 200+ 筆，不另設上限

## 9. Recommended References

- `reference/spatial-design.md` — cockpit + sticky rail
- `reference/interaction-design.md` — row drill-down、segmented control、import dialog
- `reference/audit.md` — 完成後跑 a11y / responsive sweep
- DESIGN.md「The Flat-Until-Touched Rule」「Jam-Jar Rule」「No-Gray Rule」要明確守住

## 10. Implementation Notes

### Components 重整方案（Q10.3 = 照需求重寫）

| 現有 | 新位置 |
|---|---|
| `BomTargetList.vue` | 留下，但只承載左 rail 的目標清單；header 雙 CTA、清除等 |
| `BomCraftTree.vue` | **拆解**。樹的遞迴渲染抽成 `BomCraftTreeNode.vue`，被 row drill-down 使用 |
| `BomSummary.vue` | **重寫為** `BomDecisionTable.vue`（決策表 hero） |
| `BomMaterialRow.vue` | 重寫為決策表的 row 元件，支援 segmented 取得來源 + drill-down |
| 新增 | `BomImportDialog.vue` — Teamcraft URL 匯入 |
| 新增 | `BomTotalsBar.vue` — sticky 總計列 |
| 新增 | `BomSettingsCard.vue` — 仿 BatchSettings（Q10.4） |
| 新增 | `services/teamcraft-import.ts` — parser + resolver |

### Store 變更

`stores/bom.ts` 新增：
- `acquisitionMode: Map<itemId, 'market' | 'craft' | 'gather' | 'npc'>`
- `expandedRows: Set<itemId>`（drill-down 狀態）
- 計算屬性 `effectiveGrandTotal`、`marketBaselineTotal`、`savingPercent`（baseline = 全部市買，Q10.2）

### Teamcraft import spec

**Parser** (`parseTeamcraftImport(input: string)`):
- 接受 URL / base64 / raw `itemId,recipeId,qty;...`
- 輸出 `{ entries: { itemId, recipeId: number | null, qty }[], warnings: string[] }`
- 拒絕含尾隨分號的 raw（同 Teamcraft 規格）

**Resolver**:
- 對每筆 itemId 查 XIVAPI 取 recipe(s) + 圖示 + 名稱 + amountResult
- `recipeId === null` 且 recipes.length === 1 → 自動套用
- `recipeId === null` 且 recipes.length > 1 → UI inline 選擇
- itemId 不存在 → 標 `unknown`、可跳過

**Export** (`buildTeamcraftImportUrl(targets)`):
- 產 `itemId,recipeId,qty;...`、base64、組 URL
- 不含尾隨分號

### Acquisition source vocabulary

```
market  · 市場  · 圖示 ⌖ · chip neutral
craft   · 自製  · 圖示 ⚒ · chip cocoa-tinted (這個是crafting zone的本色)
gather  · 自採  · 圖示 ⛏ · chip neutral
npc     · NPC  · 圖示 ⛟ · chip neutral
```

只有 craft chip 借用 cocoa（因為它本來就是這頁的色），其他三個維持中性。

## 11. Confirmed Decisions (from discovery)

| # | 問題 | 決定 |
|---|---|---|
| Q1 | 與 Batch 整併路徑 | 預留入口（總計列「→ 批量計算」按鈕） |
| Q2 | 估省基準 | 以「全部市場買」為 baseline |
| Q3 | 保留現有元件還是重寫 | 照需求重寫（見 §10 components 表） |
| Q4 | 目標 rail 設定面板 | 新增 BomSettingsCard，仿 BatchSettings |
| Q5 | 匯入後是否自動計算 | 不自動，停在「已匯入」由使用者觸發 |
| Q6 | 是否做匯出 | 一期同時做（Teamcraft 分享連結） |
| Q7 | 匯入入口位置 | 並排（左 rail「⌕搜尋」與「⤓匯入」並排） |

## 12. Out of Scope

- 與 Batch 真正整併（這次只做入口）
- 採集路徑規劃地圖（自採 row 只標示，不規劃路徑）
- 其他遊戲的 list 格式（只支援 Teamcraft 系）
- Teamcraft 的 callback URL feature（我們是匯入端，不需要）

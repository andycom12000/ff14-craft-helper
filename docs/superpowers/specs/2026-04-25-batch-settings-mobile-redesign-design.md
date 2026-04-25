# 批量製作 - 計算設定手機版重設計

**Date:** 2026-04-25
**Scope:** `src/components/batch/BatchSettings.vue`（手機版）
**Status:** 設計確認

## 目標

批量製作頁的「計算設定」區塊在手機版上：

- 風格與其他頁面（SettingsView、SimulatorView）不一致
- 元件靠水平 flex-wrap 排列，wrap 後 switch / radio / select / divider 互相擠壓
- 食物、藥水兩行格式不對齊（HQ/NQ 切換的有無讓兩行寬度不同）

重設計目標是讓計算設定在手機版：

1. 視覺風格與 SimulatorView（accordion）、GearsetView（cell）一致
2. 把使用頻率高的設定直接露出，少用的收進可展開區
3. 食物、藥水排版完全對齊

桌面版不在此次調整範圍。

## 設計

### 整體結構（由上而下）

1. **模式 chip**（沿用既有 `ModeChip`，pill toggle 樣式）
2. **遞迴查價** cell — γ 風雙行 cell
3. **跨服採購** cell — γ 風雙行 cell
4. **例外策略** cell — γ 風雙行 cell + 內嵌 segmented control
5. **進階設定** accordion（仿 SimulatorView 的 `.m-setup-row` 樣式）

### 露出區（cell 樣式）

每個 cell 採用「icon + 雙行文字 + 右側控件」的結構，仿 GearsetView 但改為雙行（標題 + 副說明）。

| Cell | Icon | 標題 | 副說明 | 右側控件 |
|---|---|---|---|---|
| 遞迴查價 | 🔄 | 遞迴查價 | 把素材的素材也納入採購 | switch |
| 跨服採購 | 🌐 | 跨服採購 | Mana 全跨服比價（動態顯示 DC 名稱） | switch |
| 例外策略 | ⚠️ | 例外策略 | 等級不足/無法雙滿時 | segmented [跳過 \| 購買] |

副說明文字維持 11px、`color-mix` 後的 secondary text；icon 30×30、`background: var(--app-fill-light)`、圓角 8px。每個 cell `padding: 13px 0`、`border-bottom: 1px solid var(--app-border)`，最後一個 cell 不畫底邊線。

#### 跨服採購副說明動態邏輯

- 開啟時：`{settings.dataCenter} 全跨服比價`
- 關閉時：`Mana 全跨服比價`（用使用者的 DC 當預設例子）
  - 如果這太實作密集，副說明可固定為「跨資料中心比價，找最便宜的伺服器」

### 進階設定 accordion（仿模擬器）

露出區下方放一個 button row（仿 `SimulatorView.vue` 的 `.m-setup-row`），不使用任何 `el-card` 或虛線框。

- 收合時 button row 顯示：`進階設定 · 遞迴 N 次 · 食藥 已設定/未設定`
  - 摘要文字使用 `color: var(--app-text-muted)`，數值與「已設定」用 `<b>` 加深
  - 食藥摘要：兩者都未選時 → "未設定"（muted）；只選食物 → 食物名；只選藥水 → 藥水名；都選 → 兩者都列或顯示「已設定」
- 右側 chevron：`▾`，展開時旋轉 180°、顏色變 `var(--app-craft)`
- button row `border-bottom: 1px solid var(--app-border)`，與 cell 視覺對齊

展開後 `m-setup-body` 內含兩個 sub-group，中間 `border-top: 1px dashed var(--app-border)` 分隔：

#### Sub-group 1 — 遞迴設定

- 小標題 h4 `m-setup-group-title`：「遞迴設定」
- 一個 form-row：
  - label：遞迴次數
  - control：`el-input-number` 或自訂 stepper（−/3/+），右對齊
  - 範圍：1–10（沿用既有 `maxRecursionDepth` 的範圍）

#### Sub-group 2 — 食藥

- 小標題 h4 `m-setup-group-title`：「食藥」
- 三個 form-row：

| Label | 控件 |
|---|---|
| 自動評估食藥 | switch |
| 食物 | select（width 150px，超長省略）+ HQ/NQ segmented |
| 藥水 | select（width 150px，超長省略）+ HQ/NQ segmented |

食物、藥水 row 結構**完全對齊**：select 等寬、HQ/NQ segmented 同尺寸。

未選擇食/藥時：HQ/NQ segmented 顯示為 disabled 灰階（保留視覺位置但不可互動）。

### 桌面版（>640px）

桌面版不變，沿用現有 `el-card`-wrapped 的水平 settings-row。媒體查詢分界使用既有的 `@media (max-width: 640px)`。

## 受影響檔案

- `src/components/batch/BatchSettings.vue`（**主要改動**）
  - 加入 mobile-only template 分支（用 `useIsMobile()` composable，仿 GearsetView）
  - 桌面版分支保留現有實作
  - 新增 cell、setup accordion、form-row、HQ/NQ disabled 狀態的 scoped CSS
- 不動 store、不動 props/events，純 UI 重構

## 關於進階設定的展開狀態

- 預設收合（與模擬器初期品質/食藥行為一致）
- 展開狀態以 component-local `ref` 保存，不持久化（與模擬器同邏輯）

## 不在此次範圍

- 桌面版的計算設定區塊
- 設定頁、模擬器頁的視覺調整
- 食藥資料來源（`COMMON_FOODS` / `COMMON_MEDICINES`）的擴充
- 計算邏輯改動（store actions、optimizer 參數）

## 待 implementation plan 處理

- 桌面版 1440px+ 的 sticky prepare-side 與新 mobile 分支共存的 CSS overlap 檢查
- 既有 `BatchView.vue` 中為 BatchSettings 設計的 mobile flatten CSS（`.batch-section :deep(.el-card)` 等）是否需要清理（新版可能不再用 `el-card` wrapper）

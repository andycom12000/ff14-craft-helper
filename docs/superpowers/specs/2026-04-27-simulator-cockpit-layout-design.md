# 製作模擬 — Cockpit Layout 重設計

**Date:** 2026-04-27
**Scope:** Desktop layout of `SimulatorView.vue`（不動 mobile branch）
**Status:** Approved direction（方案 B），待 live preview 驗收後落地

## 問題

現有 desktop layout：

```
標題 → 模擬佇列 → 配方/裝備資訊 → StatusBar+Buffs（全寬）
→ Tabs(模擬/初期品質/食藥)
   └ 模擬 tab
     └ 1:1 左右切分：
       左：技能序列 + 技能面板 + 求解器/推薦
       右：遊戲巨集（sticky）
```

**痛點**

1. **手動模式視線跨度過大**：點 SkillPanel（左下）→ 看 StatusBar（最頂全寬）→ 看 ActionList（左中）。每次點一個技能都要垂直掃 80% 畫面。
2. **右側 50% 寬被 MacroExport 獨占**，但巨集只在「最後複製」時才用，平常閒置。
3. **寬螢幕沒被吃滿**：關鍵互動全擠在左半，右半留給最少互動的元件。
4. **序列被擠在左欄**，長序列要在窄欄內捲動，跟 SkillPanel 又共用左欄垂直空間。

## 設計方向（方案 B：三欄駕駛艙）

把模擬 tab 內容從「兩欄」改為「三欄駕駛艙」，每欄承擔一個明確職責，讓視線只在水平短距離內移動：

```
┌────────────────────────────────────────────────────┐
│  [模擬佇列]  [配方/裝備資訊 + 加入購物清單]            │ ← 上半段保持原樣
├────────────────────────────────────────────────────┤
│  Tabs: 模擬 / 初期品質 / 食藥                        │
│  ┌──────────────────────────────────────────────┐ │
│  │ Mode 切換 + (手動) 條件/控制                    │ │
│  ├──────────┬──────────────────────┬─────────────┤ │
│  │ 序列欄    │ 操作欄                │ 巨集欄       │ │
│  │ ~22%     │ ~52%                  │ ~26%        │ │
│  │          │                       │             │ │
│  │ Action   │ ⚓ STATUS HUD         │ Macro       │ │
│  │ List     │   進展/品質/耐久/CP   │ Export      │ │
│  │ (直立    │   + Buffs             │ (sticky)    │ │
│  │  滾動)   │ (sticky 黏在欄頂)     │             │ │
│  │          │ ─────────────────     │             │ │
│  │          │ SkillPanel /          │             │ │
│  │          │ Solver+Recommendation │             │ │
│  └──────────┴──────────────────────┴─────────────┘ │
└────────────────────────────────────────────────────┘
```

### 三欄職責

| 欄 | 寬度 | 內容 | sticky? |
|---|---|---|---|
| **序列欄** | ~22% | ActionList（直立排列，每列一格 icon + tooltip） | 整欄 sticky，內部捲動 |
| **操作欄** | ~52% | Status HUD（pinned 在欄頂）→ SkillPanel 或 Solver+Recommendation | HUD sticky 在欄頂 |
| **巨集欄** | ~26% | MacroExport（成果展示） | 整欄 sticky |

### 資訊保留（無刪減）

- 模擬佇列、配方/裝備資訊、初期品質 tab、食藥 tab、StatusBar、BuffDisplay、ActionList、SkillPanel、SolverPanel、CraftRecommendation、MacroExport — 全部維持。
- StatusBar+BuffDisplay 從「全寬卡片在 tabs 之外」搬進「模擬 tab 操作欄頂端」。
- 初期品質 / 食藥 tab 不動。

### 視線動線比較

**手動模式**（點技能流程）

| 步驟 | 舊 layout | 新 layout |
|---|---|---|
| 看狀態 | 視線跨 ~80% 垂直 | 視線跨 ~10% 垂直（同欄頂） |
| 點技能 | 點 SkillPanel | 點 SkillPanel |
| 確認序列 | 視線跨 ~30% 垂直到左中 | 餘光左移到序列欄 |

**自動模式**（求解→看結果→拷貝巨集）

| 步驟 | 舊 layout | 新 layout |
|---|---|---|
| 點求解 | 中欄 SolverPanel | 中欄 SolverPanel |
| 看推薦 | 中欄 Recommendation | 中欄 Recommendation |
| 看序列 | 中欄上方 ActionList | 餘光左看序列欄 |
| 拷貝巨集 | 視線跨到右側 MacroExport | 餘光右看巨集欄 |

## 實作策略

### Phase 1 — Live Preview

新增獨立預覽路由，**不動現有 SimulatorView**：

- 新檔：`src/views/SimulatorCockpitPreview.vue`
  - 複製 `SimulatorView.vue` 的 `<script setup>` 段（共用 store、composables、handlers 不重寫）
  - 改寫 desktop template 區段（`v-if="!isMobile"` 分支）為三欄結構
  - mobile branch 直接 import 原本的，或維持原樣（preview 只專注 desktop）
- 新路由：`/sim-cockpit-preview` → `SimulatorCockpitPreview.vue`
- 不在 sidebar 顯示 — 只能用直接 URL 進入（preview 不污染主導航）

### Phase 2 — 落地（preview 驗收後）

- 將 `SimulatorView.vue` 的 desktop template 替換為 cockpit layout
- 移除 `SimulatorCockpitPreview.vue` 與其路由
- mobile 分支不變

### Responsive 退場

| 視窗寬 | 行為 |
|---|---|
| ≥ 1280px | 三欄（22% / 52% / 26%） |
| 900px–1280px | 退回兩欄：合併「序列 + 巨集」到右欄（堆疊） |
| < 900px | 維持現有 mobile branch（不變） |

### CSS 結構

新增 scoped 樣式：

```css
.cockpit-layout {
  display: grid;
  grid-template-columns: minmax(220px, 22%) 1fr minmax(260px, 26%);
  gap: 16px;
  align-items: flex-start;
}
.cockpit-col {
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.cockpit-col--sequence,
.cockpit-col--macro {
  overflow-y: auto;
}
.cockpit-col--ops {
  /* 主操作欄不整欄 sticky；HUD 自己 sticky 在欄頂 */
  position: static;
  max-height: none;
}
.cockpit-hud {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--app-surface);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--app-border);
  margin-bottom: 12px;
}
@media (max-width: 1280px) {
  .cockpit-layout {
    grid-template-columns: 1fr minmax(280px, 36%);
  }
  .cockpit-col--sequence { /* 與 macro 合併到右側欄堆疊 */ }
}
```

## 不在這次 scope

- 行動版（`is-mobile` 分支）：完全不動。
- 上半段（佇列卡片、配方資訊）：完全不動。
- ActionList / SkillPanel / SolverPanel 內部結構：完全不動（只改外層容器寬度）。
- 初期品質 / 食藥 tab：完全不動。
- 顏色、token、字級：沿用現有 design system（吐司金/可可/草莓醬...）。

## 驗收標準

1. `/sim-cockpit-preview` 進入後三欄正確顯示，視窗寬度變化能正確切換成兩欄/單欄。
2. 自動模式：點求解 → 看推薦 → 拷貝巨集，全部不需要垂直捲動主畫面。
3. 手動模式：點 SkillPanel 後，StatusBar 在當前視野內可見（無需向上捲）。
4. 序列欄能容納 30+ 步技能，內部捲動不影響其他欄。
5. 既有功能完全保留：佇列切換、加入購物清單、初期品質、食藥、HQ apply、self-craft 全部正常。

## 風險

- **CSS grid + sticky 在 Element Plus 卡片內可能異常**：Element Plus `.el-card__body` 預設 `overflow: hidden`，sticky 會被截。對應方案：preview 階段先用原生 div 取代必要的 card，或對 `.el-card__body` 局部覆寫。
- **視窗 1280px 以下退場**：要確認既有使用者環境（13" 筆電通常 1366×768），1280px 斷點剛好覆蓋。

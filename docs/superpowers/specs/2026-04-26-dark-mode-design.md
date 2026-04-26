---
title: 吐司工坊 Dark Mode
date: 2026-04-26
status: approved
---

# 吐司工坊 Dark Mode · Design Spec

## Goal

為「吐司工坊」追加 dark mode，覆蓋 light theme 之外的使用情境（深夜長時間操作、OLED 省電、視覺疲勞）。

## Why

Rebrand spec 把 `prefers-color-scheme` 標記為「未來 issue」。light theme 的差異化策略已穩定（差異對象 tnze 是冷藍 dark），現在補 dark 不會稀釋品牌定位，前提是：dark 必須走出**不同的 physical scene**，不能只是 light 反相。

## Physical scene

> **凌晨 2 點，FFXIV 玩家剛打完 raid 開始規劃明早的 macro，房間只剩螢幕和一盞檯燈。**

不是「黑色版」，是「打烊後寧靜版」。整體偏中性暖灰，但 sidebar（每次都會經過的入口）保留 light theme 的暖棕，作為品牌記號的延續。

## Color tokens · B 方案 final

### Base（`[data-theme="dark"]`，作用於整個 document）

| Token | Value | 角色 |
|---|---|---|
| `--app-bg` | `oklch(0.18 0.008 60)` | body 背景 |
| `--app-sidebar` | `oklch(0.15 0.006 60)` | sidebar bg（會在 sidebar 區段被局部 override） |
| `--app-surface` | `oklch(0.22 0.008 60)` | 卡片底 |
| `--app-surface-2` | `oklch(0.25 0.012 60)` | 強調區（hero / banner） |
| `--app-surface-hi` | `oklch(0.28 0.010 60)` | table head |
| `--app-border` | `oklch(0.30 0.010 60)` | 邊框 |
| `--app-border-soft` | `oklch(0.25 0.008 60)` | 軟邊 |
| `--app-text` | `oklch(0.94 0.010 80)` | 正文 |
| `--app-text-muted` | `oklch(0.66 0.010 70)` | 次要文字 |
| `--app-text-faint` | `oklch(0.48 0.008 65)` | 淡文字 |
| `--app-accent` | `oklch(0.74 0.15 68)` | 吐司金（Primary） |
| `--app-accent-light` | `oklch(0.82 0.12 72)` | hover |
| `--app-accent-glow` | `oklch(0.74 0.15 68 / 0.16)` | active glow |
| `--app-accent-soft` | `oklch(0.74 0.15 68 / 0.08)` | tint |
| `--app-craft` | `oklch(0.70 0.04 60)` | 製作 |
| `--app-market` | `oklch(0.70 0.05 20)` | 市場 |
| `--app-gather` | `oklch(0.70 0.04 130)` | 採集 |
| `--app-highlight` | `oklch(0.70 0.05 240)` | 提示 |
| `--quote-flavor` | `oklch(0.74 0.02 70)` | 引言 |
| `--paper-noise` | `none` | 紙感（dark 預設關閉） |

> 注意：dark 的 craft / market / gather / highlight chroma 收得比 light 低（0.04-0.05 vs light 的 0.13-0.20），避免 dark 上飽和色刺眼。

### 局部 overrides（scope 在特定元素內）

```css
/* sidebar 套用 light theme（A）的暖棕 tokens —— 品牌記號延續 */
[data-theme="dark"] .app-sidebar {
  --app-sidebar:      oklch(0.17 0.020 60);
  --app-border-soft:  oklch(0.28 0.020 65);
  --app-text:         oklch(0.92 0.020 80);
  --app-text-muted:   oklch(0.68 0.020 70);
  --app-text-faint:   oklch(0.50 0.015 65);
  --app-accent:       oklch(0.72 0.14 70);
  --app-accent-glow:  oklch(0.72 0.14 70 / 0.18);
  --app-accent-soft:  oklch(0.72 0.14 70 / 0.10);
}

/* hero 用暖棕 surface 提升層次 */
[data-theme="dark"] .dashboard-hero {
  background: oklch(0.24 0.025 70);
}

/* recipe card 用冷灰漸層，與 hero 形成冷暖對比 */
[data-theme="dark"] .batch-recipe-card,
[data-theme="dark"] .recipe-card {
  background: linear-gradient(135deg, oklch(0.24 0.012 60) 0%, oklch(0.20 0.008 60) 100%);
}

/* main-pane 比 body 略亮，跟 sidebar 形成微階梯 */
[data-theme="dark"] .app-main {
  background: oklch(0.19 0.012 62);
}

/* BOM table 價格仍用吐司金（dark 下對比較好） */
[data-theme="dark"] .bom-price {
  color: var(--app-accent);
}
```

確切 selector 名稱以實際 App.vue / DashboardView.vue / 其他元件為準；上方僅為示意。

## User control

- Settings 提供三段切換：**Auto / Light / Dark**
- 預設 Auto（跟系統 `prefers-color-scheme`）
- 寫入 `localStorage`，跨 session 保留
- `<html>` 上以 `data-theme` 屬性套用（`auto` 模式時根據 system 即時補上 `light` 或 `dark` 實值）

## Element Plus override

Light theme 的 EP override 已建立於 `:root`，需要鏡像一份到 `[data-theme="dark"]`：

- `--el-bg-color*` → 對映 `--app-surface*`
- `--el-fill-color-*` → dark 專用階梯（lightness 0.22-0.32）
- `--el-text-color-*` → dark 專用階梯
- `--el-border-color-*` → 對映 `--app-border*`
- `--el-color-primary-light-N` → 從 dark 吐司金推
- 語意色（success / warning / danger / info）→ dark 對應值

工作量預估與當初 light 同等量級。

## Phased PR Plan

所有 sub-PR base = `feat/dark-mode`，head = `feat/dark-*` sub-branch。整體驗收完才合併到 `main`。

| PR | head branch | 內容 | 風險 |
|---|---|---|---|
| 1 | `feat/dark-tokens` | App.vue tokens 加 `[data-theme="dark"]` 區塊 + 局部 overrides | 中（會看見視覺斷層） |
| 2 | `feat/dark-element-plus` | Element Plus 全套 override for dark | 高（EP 覆蓋面廣） |
| 3 | `feat/dark-toggle` | Theme store + Settings Auto/Light/Dark UI + localStorage + prefers-color-scheme listener | 中 |
| 4 | `feat/dark-page-overrides` | 個別頁面色票（BomView muted、ChangelogView parchment、SimulatorView banner）的 dark 對應 | 中 |
| 5 | `feat/dark-polish` | 全頁巡檢、empty state、onboarding、mobile 修補 | 低 |

每 PR 結束在瀏覽器驗收 + sign-off 才合併。

## Risks

- **EP override 工作量**：跟 light 當初一樣，需要重寫所有 token 對映；CTA / switch / fill 等都要驗證。
- **既有 scoped overrides**：BomView / ChangelogView / SimulatorView banner 都有自己的 page-scoped 色票，dark 下需要單獨設計（不能直接 invert）。
- **Dashboard hero gradient**：Light 用暖色徑向漸層，dark 改用 `--app-surface` 暖棕 flat，需要確認 hero 內元素對比仍夠。
- **Sidebar 的 selector 命名**：實作 sidebar 局部 override 時需要與既有 `.app-sidebar` class 對齊，避免 selector miss。

## References

- 設計參考：`public/dark-preview.html`（B tab 為最終方案）
- Brand 上下文：`PRODUCT.md`
- Light theme rebrand spec：`docs/superpowers/specs/2026-04-26-toast-workshop-rebrand-design.md`

# Dashboard 寬螢幕版面 — Design Brief

**日期**：2026-04-27
**範圍**：`src/views/DashboardView.vue` 桌面 layout（≥ 1100px）
**Probe 來源**：`tmp/dashboard-probes/probe-b-launcher.html`（最終版本 `?v=eqcols`）

---

## 1. Problem

目前 `DashboardView.vue` 的版面是垂直堆疊的多 section 結構，在 1440 / 2560 等寬螢幕上會：

- 內容置中於約 960px，左右兩側留下大片空白
- Hero 卡（批量製作）、Workflow list、Tools row、Status row 各自一行，缺乏 parallel 結構，無法善用寬度
- 多個 same-size card 並列（Workflow card / Tool card / Status card）落入 impeccable 的 *identical card grid* 反模式

寬 viewport 的價值在於「能同時看到更多平行內容」，不是「同樣內容置中加邊距」。這個版面要重塑成編輯式 grid，並在窄螢幕優雅降階。

## 2. Direction

定為 Probe B「Toast Launcher」。三大特徵：

1. **Toast slice hero**：批量製作（主打功能）以果凍質感的奶油底 + 細吐司邊框（border-top 3px `#B47351`，左右 1.5px 漸層淡出至 80%）視覺化「吐司切片」的品牌隱喻。
2. **Pulse rail**：右欄收納當下狀態（進行中批量、追蹤計時器），無 nested card boundaries，直接以 typography + 細 progress bar 呈現。
3. **Editorial 3-col tier-2 tools**：製作模擬 / 購物清單 / 採集計時器作為次要功能，以 hairline divider 分隔的等寬三欄呈現，每欄附「當下狀態」（最近結果 / 省最多 / 下一個倒數），透過內容差異化避開 identical card grid。

## 3. Information Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│ Greeting                                          ⌘K        │  greeting
├─────────────────────────────┬───────────────────────────────┤
│                             │                               │
│  TIER 1                     │  TIER 1.5                     │
│  Hero — 批量製作             │  Pulse rail                   │
│  (toast slice)              │  - 進行中 · 批量 progress bar  │
│                             │  - 追蹤中 · timer chips       │
│                             │                               │
├─────────────────────────────┴───────────────────────────────┤
│  ─── 次要工具 ─────────────────────────────────────────────  │
│                                                             │
│  TIER 2                                                     │
│  製作模擬 (feature)  │  購物清單     │  採集計時器           │
│  最近: 完美 16 步    │  省最多: 320 萬 │  下一個: 02:14       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  TIER 3                                                     │
│  配裝 6/8  [chip][chip]...[chip]              管理 →         │
└─────────────────────────────────────────────────────────────┘
```

| Tier | 內容 | 視覺權重 |
|------|------|---------|
| 1 | Hero (批量製作) + Pulse rail | 最重，佔上半屏 |
| 2 | 製作模擬 / 購物清單 / 採集計時器 | 編輯式中等權重，hairline 分隔 |
| 3 | 配裝 chips footer | 最輕，扁平化 inline |

## 4. Layout Spec

### Grid

```css
main {
  padding: 36px 72px 80px;
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(380px, 0.85fr);
  column-gap: 56px;
  row-gap: 64px;
  max-width: 2400px;
}
```

- `1.7fr / 0.85fr` 兩欄非對稱，hero 為主、pulse 為輔
- `max-width: 2400px` 防止超寬螢幕（≥3000px）時內容過寬影響閱讀
- `row-gap: 64px` 讓 tier 1 → tier 2 → tier 3 之間有明顯節律

### Spacing rhythm（避免單調）

- 內容內：14px（label → value）
- 區塊內：24px（section → next sub-block）
- 區塊間：36px（pulse 內各 section 間距）
- 大段間：64px（tier 1 → tier 2 → tier 3 row-gap）

### Breakpoints

```css
@media (max-width: 1500px) {
  main { padding: 32px 48px 64px; column-gap: 40px; }
  .hero-title { font-size: 60px; letter-spacing: 2px; }
  .hero-card { padding: 44px 40px 44px; }
}
@media (max-width: 1100px) {
  main { grid-template-columns: 1fr; row-gap: 48px; }
  .hero-card, .pulse { grid-column: 1; }
}
```

- ≥ 1500px：完整三欄 tools + 兩欄 hero/pulse
- 1100–1500px：縮小 hero 字級、padding 收窄，欄位結構不變
- < 1100px：降回單欄堆疊（hero → pulse → tools → gear）
- 行動版 (`isMobile === true`) 仍走 `DashboardView.vue` 原有的 `.is-mobile` 路徑，本 brief 不改動

## 5. Component Specs

### 5.1 Hero — Toast Slice

```css
.hero-card {
  position: relative;
  padding: 56px 52px 56px;
  background:
    radial-gradient(ellipse 70% 32% at 50% 0%, oklch(0.97 0.04 82 / 0.42) 0%, transparent 75%),
    var(--app-surface);
  border: 1px solid rgb(180 115 81 / 0.35);
  border-radius: 18px;
  overflow: hidden;
}

/* Toast crust：頂 3px + 兩側 1.5px，依 border-radius 自然彎角 */
.hero-card::before {
  content: ""; position: absolute; inset: 0;
  border: solid #B47351;
  border-width: 3px 1.5px 0 1.5px;
  border-radius: 18px;
  -webkit-mask: linear-gradient(to bottom,
    black 0% 6%, rgba(0,0,0,0.55) 28%, rgba(0,0,0,0.18) 55%, transparent 80%);
          mask: linear-gradient(to bottom,
    black 0% 6%, rgba(0,0,0,0.55) 28%, rgba(0,0,0,0.18) 55%, transparent 80%);
}

/* Paper noise 收尾 */
.hero-card::after {
  content: ""; position: absolute; inset: 0;
  background-image: var(--paper-noise); background-size: var(--paper-noise-size);
  opacity: 0.45; pointer-events: none;
}
```

**內容結構**

```
─ 主打功能（eyebrow, 12px, accent gold, 0.16em letter-spacing）
📋 批量製作（76px Noto Serif TC 900）
"一次給我清單，剩下交給工坊。"（22px Cormorant Garamond italic）

· 展開素材樹 → 採購清單一次給    · 跨服比價，找最省的那條路
· 自製 vs 直購算給你看            · 製作 todo + 一鍵複製巨集

[開始規劃 →]  5 分鐘搞定一爐 100 件
```

### 5.2 Pulse Rail

無 nested card；直接攤在背景上。兩個 section 用 36px gap 分隔。

**Section A — 進行中 · 批量**

```
進行中 · 批量                                繼續 →
5 個配方                              60% · 剩 12 件
████████████████░░░░░░░░░░░░░░░░░░░░ (8px bar)
下一步 採購 12 件 · 約 2,400 萬 gil
```

**Section B — 追蹤中 · 2 個素材**

```
追蹤中 · 2 個素材                          看全部 →
[🌿 雲杉原木 02:14]  [⛏ 玄鐵礦 14:30]   ← pill chips, green
```

### 5.3 Tier-2 Tools — Editorial 3-col

```css
.tools-section {
  grid-column: 1 / -1;
  padding-top: 28px;
  border-top: 1px solid var(--app-border);
}
.tools-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: auto auto;
  row-gap: 14px;
}
.tool-col {
  display: grid;
  grid-template-rows: subgrid;  /* 對齊三欄的 head bottom & state top */
  grid-row: span 2;
  padding: 4px 36px;
  border-left: 1px solid var(--app-border);  /* hairline 分隔 */
}
.tool-col:first-child { border-left: 0; padding-left: 0; }
.tool-col:last-child { padding-right: 0; }
```

**重點**：
- `grid-template-rows: subgrid` 確保三欄的虛線（state 上邊）對齊在同一條 y
- 等寬（`repeat(3, 1fr)`）確保視覺欄距一致
- `製作模擬` 是 feature col：icon 52px / title 22px serif（其他 40px / 18px serif）— 透過 typography 強調，不靠欄寬

**內容差異化**（避開 identical card grid）

| Col | head 重點 | state |
|-----|----------|-------|
| 製作模擬 | feature 大圖示 + serif 大字 | 最近：**完美 16 步** · 毛料外套 · 14ms |
| 購物清單 | 標準 | 省最多：第 3 服務器 · 省 **320 萬 gil** |
| 採集計時器 | 標準 | 下一個：雲杉原木 *02:14*（mono green） |

### 5.4 Footer Zone — Gear Quick-glance

```css
.footer-zone {
  padding-top: 22px;
  border-top: 1px dashed var(--app-border);
}
.gear-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 11px;
  background: oklch(0.94 0.025 80);
  border-radius: 999px;
  font-size: 12px;
}
.gear-chip.unset {
  opacity: 0.55;
  background: transparent;
  border: 1px dashed var(--app-border);
}
```

```
配裝 6 / 8   [🪓木工 100][⚒️鍛造 100]...[🍳烹調 100]              管理 →
```

## 6. Design Tokens

沿用既有 token，新增 brand crust 色：

| Token | Value | 用途 |
|-------|-------|------|
| `--app-surface` | (existing cream) | hero / chip 背景 |
| `--app-accent` | (existing toast gold) | CTA / 強調色 |
| `--app-border` | (existing) | 分隔線 |
| **新：** `--toast-crust` | `#B47351` | hero crust border + edge |

Pulse rail 計時器配色沿用既有 `oklch(0.62 0.17 135 / 0.10)` 綠系，與 sidebar 採集計時器導覽一致。

## 7. Mapping to Implementation

| Spec section | DashboardView.vue 現有對應 | 改動方向 |
|-------------|---------------------------|---------|
| Greeting | `.welcome` block | 保留，加 `display: flex` 讓 quote 與 ⌘K 兩端對齊 |
| Hero | `.batch-hero` button | 換樣式：去除原 gold gradient，套用 toast-slice CSS（border-top crust + side mask + paper noise） |
| Pulse / 進行中 | `.status-row > .status-card[batch]` | 拆出 batch card 作為 pulse section A，加 progress bar |
| Pulse / 追蹤中 | timer-related status card | 重塑為 chip strip（pill green） |
| Tier-2 tools | `.workflow-list` | 改為 3-col subgrid `.tools-row`，引入 state line |
| Footer gear | （目前無對應 section） | 新增；資料來自 `gearsetsStore` |

實作分兩階段：
1. **Layout reshape**：先在 `DashboardView.vue` 桌面樣式內塞進 grid + 三 tier；保留現有 props/store 綁定
2. **Toast hero polish**：抽出 `<BatchHero>` component（包 crust pseudo-elements），方便日後復用

## 8. Open Questions

- [ ] Pulse rail 在沒有「進行中批量」時要顯示什麼？建議：用 dashed empty state「沒有進行中的批次 · 開始一個 →」
- [ ] 採集計時器的「下一個倒數」資料應 reuse `timerStore.nextTrigger`，需確認該 selector 已存在
- [ ] Onboarding 未完成時 (`showOnboarding === true`) 走 `WelcomeSetup`，本 brief 不影響該分支

## 9. Verification

最終 mockup（probe-b 最後一版）已在以下解析度截圖驗證：
- 2560 × 1440：完整三欄 + 兩欄 hero/pulse，gear chips 一行收尾
- 1280 × 900：仍維持平行結構，hero title 縮至 60px 不破版
- 900 × 800：gear chips 4×2 wrap，整體不破版（hero/pulse 在此 viewport 開始重疊，下方 1100px breakpoint 會降階）

> Probes：
> - `tmp/dashboard-probes/probe-b-launcher.html`
> - `tmp/dashboard-probes/probe-b-eqcols-2560.jpeg`
> - `tmp/dashboard-probes/probe-b-tier2-1280.jpeg`

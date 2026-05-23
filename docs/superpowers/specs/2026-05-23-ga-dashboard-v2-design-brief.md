# GA Admin Dashboard v2 — Claude Design 設計委託 Brief

**日期**：2026-05-23
**用途**：交給 Claude Design (Anthropic Labs web product) 設計 10 張新圖的視覺；產出 mockup 後再 handoff 回 Claude Code 實作。
**前置 spec**：
- [2026-04-28 GA Dashboard & Tracking](2026-04-28-ga-dashboard-and-tracking-design.md)
- [2026-05-17 GA Tracking Expansion](2026-05-17-ga-tracking-expansion-design.md)
- [2026-05-19 GA Market & Recipe Funnel](2026-05-19-ga-market-recipe-funnel-design.md)
- [2026-05-20 GA Admin Dashboard MVP](2026-05-20-ga-admin-dashboard-design.md)

---

## 0. TL;DR for Claude Design

我是 `吐司工坊 / FF14 Craft Helper` 的 owner。專案有個 owner-only 的 `/admin/ga` 後台儀表板（dark warm editorial 風格，靈感來自雜誌排版）。MVP（v1）已上線，但近期擴充的 13 個 GA4 custom dimensions + 多個新事件**完全沒被視覺化**，dashboard 還停在舊資料層。

請設計 **10 張新 chart** 的視覺，按既有設計系統延伸（dark warm OKLCH、editorial typography mix、jam-jar 語意配色）。產出 HTML+CSS+D3 v7 mockup（或 React component），最後打 handoff bundle 給 Claude Code 我來實作成 Vue 3 SFC。

**重要約束**：
- viewport 只看 ≥1440px（per memory `project_ga_dashboard_viewport_only_wide`），mobile/tablet 不是優先項
- 不能用 Element Plus / 任何 UI library（dashboard 跟主 app theme 解耦）
- 必須沿用既有 `tokens.css` 色票與字體配對 — 不另起 design system
- 視覺強度向既有 hero + ledger 看齊（editorial、不浮誇、留白慷慨）

---

## 1. 產品與受眾脈絡

**吐司工坊 / FF14 Craft Helper** 是給 FFXIV（線上遊戲）製作職人的工具站，提供配方 solver、批量最佳化、BOM 採購清單、原料市場價查詢等。主品牌「吐司工坊」走烘焙意象，視覺基調是 light theme 奶油白為主。

但 `/admin/ga` 是**完全分流**的後台頁，**只有 owner（我）會看**，所以視覺鎖 dark warm editorial（用 Cormorant Garamond italic 當 eyebrow、Noto Serif TC 當 display／lede、Fira Code 當 monospace 數字）— 跟主站 light theme 是兩個世界。

**使用情境**：每週 push deploy 之後、看完 changelog 之後、想知道「上週工坊數據怎樣」時打開。停留 5 分鐘，三個 window（7d/14d/28d）來回切。資料 daily cron 自動 refresh，從 `/data/ga-snapshot.json` 拉。

**unique 性質**：
- 我**不需要對外解釋這份儀表板** — 不用堆「kpi card 山牆」式 corporate dashboard
- 我**自己懂所有事件名稱與業務含義** — chart 可以放專業密度，不必每張都配兒童級註解
- 我**要的是 editorial 美感** — 翻開像翻一本季刊，不是打開 Looker Studio

---

## 2. 既有 Design System（必須沿用）

### 2.1 Tokens（已落地於 `src/components/ga-dashboard/tokens.css`）

```css
.ga-dashboard {
  /* surfaces — warm brown, NEVER blue/gray */
  --bg:          oklch(0.18 0.018 62);
  --bg-deep:     oklch(0.14 0.014 60);
  --surface:     oklch(0.225 0.018 62);
  --surface-2:   oklch(0.26  0.022 62);
  --surface-3:   oklch(0.30  0.025 64);
  --border:      oklch(0.42 0.035 60 / 0.36);
  --border-soft: oklch(0.42 0.035 60 / 0.18);

  /* ink */
  --ink:         oklch(0.94 0.022 82);
  --ink-mid:     oklch(0.80 0.022 75);
  --ink-muted:   oklch(0.66 0.024 68);
  --ink-faint:   oklch(0.52 0.028 62);

  /* brand */
  --gold:        oklch(0.78 0.15 72);      /* signature accent */
  --gold-glow:   oklch(0.78 0.15 72 / 0.16);
  --crust:       oklch(0.66 0.11 50);

  /* jam-jar semantic */
  --cocoa:       oklch(0.66 0.14 40);      /* craft / 製作職人 */
  --cocoa-dark:  oklch(0.50 0.13 40);
  --strawberry:  oklch(0.70 0.18 15);      /* market / 市場 */
  --matcha:      oklch(0.72 0.15 138);     /* gather / 採集 */
  --blueberry:   oklch(0.66 0.16 248);     /* company / 公司 */

  /* state */
  --success:     oklch(0.70 0.16 145);
  --warning:     oklch(0.74 0.16 60);
  --danger:      oklch(0.68 0.20 22);

  background:
    radial-gradient(1200px 700px at 20% -10%, oklch(0.26 0.04 60 / 0.55), transparent 60%),
    radial-gradient(900px 600px at 95% 8%, oklch(0.24 0.05 40 / 0.40), transparent 65%),
    var(--bg);
}
```

### 2.2 Family → Color map

| Family | Color | 對應業務 |
|---|---|---|
| `core` | `--gold` | 首頁、總覽類 |
| `craft` | `--cocoa` | solver / batch / bom / gearset |
| `gather` | `--matcha` | 採集計時器 |
| `company` | `--blueberry` | 公司製作 |
| `meta` | `--ink-muted` | 設定、changelog 等 |
| `market` | `--strawberry` | 市場價、Universalis |
| `error` | `--danger` | 失敗、例外 |

**設計原則**：每張 chart 沿用這套色系，不引入新色相。Tier 1/2 status 用 success/warning/danger。

### 2.3 Typography

| 用途 | 字體 | 範例 |
|---|---|---|
| Eyebrow / monospace 數字 | `'Fira Code', monospace` | `LAST 7 DAYS` / `1,234` |
| Display heading | `'Noto Serif TC', serif` 700 | `Last 7 Days, drawn out in lines.` |
| Italic accent within display | `'Cormorant Garamond', serif` italic 500 | `drawn out in lines.` |
| Body / lede | `'Noto Serif TC', serif` 17px | 中文敘事體 |
| Sans body fallback | `'Noto Sans TC', system-ui` | 一般 UI label |

**配對禁忌**：不用 Inter / Roboto / system sans 當主要視覺字體（會掉進 generic dashboard 陷阱）。Fira Code 只用在數字、eyebrow tag、metric label，**不用來寫敘事**。

### 2.4 Hero pattern（已落地、必須沿用）

```
ʟᴀꜱᴛ {N} ᴅᴀʏꜱ · ᴀɴᴀʟʏᴛɪᴄꜱ        ← Fira Code 11px, --gold, letter-spacing 0.30em
                                       (前綴 32px 金色橫線)

Last 7 Days, drawn out in lines.       ← Noto Serif TC 72px / Cormorant italic 為斜體子句
                                       (display 70%/30% 切分)

—————————                              ← 92px 金線 + ink border 接續
                                       (hero-rule)

這段視窗工坊裡走進 1,234 位活躍...      ← Noto Serif TC 17px lede
                                       (figure 數字用 Fira Code 內嵌)

WINDOW 2026-05-16 → 2026-05-23 ·       ← Fira Code 11px, --ink-faint, uppercase
PROPERTY 527587379 · GENERATED 2026-05-23
```

### 2.5 Ledger pattern（已落地、必須沿用）

頁面 hero 之後是 `LedgerGlance`：5 條水平 ledger row，三欄 grid（180px label / 1fr body / auto spark）。Label 用 Fira Code uppercase，body 用 Noto Serif TC，spark（右側狀態值）用 Fira Code 上色。

不用任何 card/box/shadow 包，**全部靠 border-bottom 細線分隔**。這是視覺基調的關鍵 — **不用 card 山牆，靠 typography + 細線 + 留白做層級**。

### 2.6 Section head pattern

```
ɪ.  Q1 — Where attention landed           pages · channels · per-page health
                                                                       ← aside (italic)
————————————————————————————————          ← hairline
```

- Roman numeral (i. ii. iii. iv. v.) + Fira Code title + italic aside
- 不用「板塊標題 + 圖示」這種 SaaS dashboard 套路

### 2.7 Sub-head pattern

```
—  Pages by view share                    ← 18px 金線 + Noto Serif TC 600 16px
```

每個 chart 上方一條 sub-head，靠左 18px 金色短線開頭。

### 2.8 Interaction conventions

- D3 enter/update/exit transitions 300ms ease-out-quart
- Hover 顯示 tooltip（自管，浮層 surface-2 背景 + border + ink）
- 切 window 時 fade 整片 content 200ms → re-bind data → transition charts
- 無動畫炫技、無 scroll-triggered；hover + transition 為主

---

## 3. 既有頁面結構（不要顛覆）

```
┌──────────────────────────────────────────────────────────────────────┐
│  HeroBand                                                             │
│  ┌── Stale badge（若 generated > 36h 前）                              │
│  WindowSelector  [⟨ 7d ⟩  14d   28d]                                  │
│  LedgerGlance — Active / Solver / Batch / BOM / Infra                 │
│                                                                       │
│  ɪ. Q1 — Where attention landed                                       │
│    — Pages by view share          ← PagesTreemap                     │
│    — How they arrived             ← ChannelsBar                      │
│    — Per-page health vs median    ← PagesTable                       │
│                                                                       │
│  ɪɪ. Q2 — Where the flow leaks                                        │
│    — Funnels — solver & batch     ← SolverBatchFunnels               │
│    — Simulator: visit → macro     ← SimulatorFunnel                  │
│    — Page-level drop rates        ← Q4FunnelDrops                    │
│    — Top failure reasons          ← FailuresBar                      │
│    — Web vitals                   ← WebVitalsStack                   │
│                                                                       │
│  ɪɪɪ. Q3 — Who brings the weight                                      │
│    — The flip — users vs sessions ← FlipBands                        │
│    — What returnees do            ← ReturningEventsBar               │
│    — Pages — all vs returning     ← PagesCompareBar                  │
└──────────────────────────────────────────────────────────────────────┘
max-width 1720px · padding 80px clamp(48px, 5vw, 96px) 120px
```

**任務**：在這個骨架上**新增 2 個 section**（ɪᴠ + ᴠ）、並補進 1 個既有但 dead-import 的元件（MarketRegionStack）。**不重排既有 Q1/Q2/Q3**。

---

## 4. 既有 11 chart 元件清單（你會看到的程式碼）

位置：`src/components/ga-dashboard/charts/`

| 元件 | 用途 | 視覺型式 |
|---|---|---|
| `PagesTreemap.vue` | 流量集中度 | D3 treemap，family color，hover 細節 |
| `ChannelsBar.vue` | 進站來源 | 水平 bar，sessions 排序 |
| `PagesTable.vue` | 每頁健康度 | tabular，engagement/bounce vs 中位數 |
| `SolverBatchFunnels.vue` | 兩條真實梯形漏斗 | trapezoid funnel，tone 上色 |
| `SimulatorFunnel.vue` | visit → macro | 大數字並列 + globalContext 列 |
| `Q4FunnelDrops.vue` | drop rate bar | 水平 bar 比例條，flag tinting |
| `FailuresBar.vue` | 失敗原因排行 | 水平 bar，danger 主色 |
| `WebVitalsStack.vue` | INP/LCP/CLS 等 | stacked bar good/ni/poor |
| `FlipBands.vue` | new vs returning | 兩條 stacked bar，hero 對照 |
| `ReturningEventsBar.vue` | 回訪在做什麼 | 水平 bar by event count |
| `PagesCompareBar.vue` | all vs returning 對照 | 雙色 grouped bar |
| **`MarketRegionStack.vue`** | **已寫但 dashboard 沒掛** | **stacked bar by region** |

設計新圖時請**沿用既有 chart 視覺密度** — bar / treemap / trapezoid 為主；偶有 small-multiples；**避免 pie、3D、過度動畫**。

---

## 5. 還沒被使用的 GA4 Custom Dimensions（待視覺化）

GA4 property `527587379` 已註冊以下 dim，事件也都在送，但 snapshot pipeline 沒拉、dashboard 沒畫：

### Event-scoped (13)

| Param | Display | 載於 event | 範例值 |
|---|---|---|---|
| `recipe_id` | Recipe ID | `recipe_select` | `5462` |
| `rlv` | Recipe Level | `recipe_select`, `solver_start` | `710` |
| `craft_kind` | Craft Kind | `recipe_select`, `solver_start` | `normal` \| `expert` \| `quick` \| `custom_delivery` \| `company` |
| `is_expert` | Is Expert Recipe | 同上 | `true` \| `false` |
| `is_collectable` | Is Collectable Recipe | 同上 | `true` \| `false` |
| `source` | Recipe Open Source | `recipe_select` | `search` \| `queue` \| `batch_target` \| `bom_drilldown` \| `company_craft` \| `deep_link` |
| `step` | Milestone Step | `first_session_milestone` | `viewed_recipe` \| `ran_solver` \| `saw_macro` \| `used_batch` |
| `type` | Misuse Type | `page_misuse_hint` | `single_recipe_in_batch` \| `large_queue_in_simulator` \| `bom_without_quantity` |
| `kind` | Locale Miss Kind | `recipe_name_locale_miss` | `recipe` \| `item` |
| `item_id` | Locale Miss Item ID | `recipe_name_locale_miss` | `38843` |
| `api` | API | `api_failure` | `xivapi` \| `universalis` |
| `endpoint` | API Endpoint | `api_failure` | `/v2/zh/Recipe/...` |
| `status` | API Status | `api_failure` | `404` \| `500` \| `0`（network） |

### User-scoped (1)

| Property | 值 |
|---|---|
| `market_region` | `cht`（zh-TW/TW 繁中服）\| `intl`（其他全部含 CN 簡中／NA/EU/JP/...）\| `unset` |

### 額外的新事件（已實作但 snapshot 未拉）

`first_session_milestone`, `page_misuse_hint`, `recipe_name_locale_miss`, `api_failure`, `region_resolution`, `share_link_inbound`, `wasm_load_ms`, `worker_pool_init_ms`, `time_to_first_action`, `search_no_result`, `simulator_entry_source`, `bom_target_add`, `recipe_open_source`

---

## 6. 10 張新圖規格

每張圖：**用途 / 解什麼問題 / 資料 shape（含 sample）/ 視覺指引 / 建議放哪段 / family 主色**。

### Tier 1（snapshot 一上就要畫）

---

#### Chart #1 — **Region Split Ledger**（升級版 LedgerGlance）

- **用途**：把現有 `LedgerGlance` 5 條 ledger row 各自切成「cht / intl / unset」三欄並列，看 market region 在 active / solver / batch / bom / infra 五個指標的差異
- **解什麼**：spec §1 點名的「BOM → Batch 9.7% 之謎」— 繁中服 vs 國際服轉換率可能差很多
- **資料 shape**：

  ```ts
  // 新欄位（疊在現有 glance object 上，每個 metric 拆 byRegion）
  glance.byRegion: {
    cht:   { activeUsers, solverStarts, solverCompletePct, batchStarts, batchCompletePct,
             bomCalcs, bomHandoffPct, ... },
    intl:  { ... },
    unset: { ... },
  }
  ```

  Sample：
  ```json
  {
    "cht":   { "activeUsers": 612, "solverCompletePct": 0.974, "batchCompletePct": 0.881, "bomHandoffPct": 0.122 },
    "intl":  { "activeUsers": 380, "solverCompletePct": 0.965, "batchCompletePct": 0.812, "bomHandoffPct": 0.038 },
    "unset": { "activeUsers": 363, "solverCompletePct": 0.892, "batchCompletePct": 0.402, "bomHandoffPct": 0.000 }
  }
  ```

- **視覺指引**：保持 ledger 五列骨架，每列右側 spark 區從「單一 %」改成「三 % 並排 + sparkline-bar 視覺化差距」。`unset` 用 `--ink-faint`，`cht` 用 `--gold`，`intl` 用 `--strawberry`
- **位置**：取代既有 LedgerGlance，或上下並列（看視覺權衡）
- **Family 主色**：依 metric 對應 family（solver/batch/bom = cocoa，active = gold）
- **替換 dead-import `MarketRegionStack`**：把 MarketRegionStack 簡化成這個 Region Split Ledger 的衍生，或保留為「按事件分組」的細部 stacked bar 放在 §IV

---

#### Chart #2 — **Onboarding Milestone Funnel**

- **用途**：四階里程碑漏斗 — `viewed_recipe` → `ran_solver` → `saw_macro` → `used_batch`
- **解什麼**：spec 點名的「新用戶 70% 不回頭，斷在哪一步」
- **資料 shape**：

  ```ts
  onboardingFunnel: Array<{
    step: 'viewed_recipe' | 'ran_solver' | 'saw_macro' | 'used_batch'
    users: number          // 達成的 unique users
    eventCount: number     // event count
    dropFromPrev: number   // 跟上一階比的 drop %（首階 = 0）
  }>
  ```

  Sample：
  ```json
  [
    { "step": "viewed_recipe", "users": 1052, "eventCount": 3204, "dropFromPrev": 0 },
    { "step": "ran_solver",    "users":  624, "eventCount": 1880, "dropFromPrev": 0.407 },
    { "step": "saw_macro",     "users":  588, "eventCount": 1715, "dropFromPrev": 0.058 },
    { "step": "used_batch",    "users":  189, "eventCount":  402, "dropFromPrev": 0.679 }
  ]
  ```

- **視覺指引**：四階 trapezoid funnel（梯形），跟 `SolverBatchFunnels` 同視覺語言但**橫向**。每階下方 italic small caps 顯示 drop %。最大 drop（這裡 67.9% used_batch）用 `--strawberry` 標出
- **位置**：新 section ɪᴠ「Q4 — Where new users stall」第 1 張
- **Family 主色**：`--cocoa`（craft）

---

#### Chart #3 — **Top Recipes — Looked vs Solved vs Stocked**

- **用途**：top 20 recipe_id 的三色 stacked bar，欄位是 `recipe_select` / `solver_start` / `bom_target_add` 三種接觸次數
- **解什麼**：「常被看」vs「真的算」vs「真的進 BOM 採購」的落差 — 揭露哪些配方是 noise，哪些是 power user 真在做
- **資料 shape**：

  ```ts
  topRecipes: Array<{
    recipeId: number
    recipeName?: string   // optional — 若 snapshot 端有 join，可顯示中文名
    selectCount: number
    solverCount: number
    bomTargetCount: number
  }>
  ```

  Sample（節錄前 5）：
  ```json
  [
    { "recipeId": 5462, "recipeName": "Rinascita Wand", "selectCount": 142, "solverCount": 98, "bomTargetCount": 23 },
    { "recipeId": 5311, "recipeName": "Claro Walnut Lumber", "selectCount": 88, "solverCount": 4, "bomTargetCount": 67 },
    { "recipeId": 5470, "recipeName": "Ultimate Steel Ingot", "selectCount": 76, "solverCount": 71, "bomTargetCount": 8 },
    { "recipeId": 5210, "recipeName": "Indagator's Hat", "selectCount": 62, "solverCount": 0, "bomTargetCount": 4 },
    { "recipeId": 5089, "recipeName": "Ascension Body", "selectCount": 41, "solverCount": 38, "bomTargetCount": 31 }
  ]
  ```

- **視覺指引**：水平 stacked bar；3 色 segment：select = `--ink-mid` (薄)、solver = `--cocoa`、bom_target = `--strawberry`。每列右側顯示 recipeId monospace + 中文名（若有）。Hover 顯示 3 個數字明細 + 比例。**揭示有趣 pattern**：solverCount = 0 但 selectCount 很高 = 只看不算的 noise；solverCount 高 selectCount 不高 = 真的目標
- **位置**：新 section ɪᴠ 第 2 張
- **Family 主色**：`--cocoa` 為底

---

#### Chart #4 — **Recipe Taxonomy Matrix**

- **用途**：用 RLV 直方圖 + (is_expert × is_collectable) 2×2 matrix 兩個小 multiples，看配方難度分佈與 expert/collectable 配方的 solver complete rate / macro copy rate
- **解什麼**：spec §1 點名「expert / collectable / 高 rlv 配方的消化率」可能異常低
- **資料 shape**：

  ```ts
  taxonomy: {
    rlvHistogram: Array<{
      bucket: '< 600' | '600-700' | '700-800' | '800+',
      events: number,        // solver_start 數
    }>
    matrix: Array<{
      isExpert: boolean
      isCollectable: boolean
      starts: number
      completes: number
      macroCopies: number
      completeRate: number
      macroCopyRate: number  // copies / completes
    }>
    craftKindBreakdown: Array<{
      kind: string  // 'normal' | 'expert' | 'quick' | 'custom_delivery' | 'company'
      starts: number
      completeRate: number
    }>
  }
  ```

  Sample：
  ```json
  {
    "rlvHistogram": [
      { "bucket": "< 600", "events": 88 },
      { "bucket": "600-700", "events": 412 },
      { "bucket": "700-800", "events": 901 },
      { "bucket": "800+", "events": 1284 }
    ],
    "matrix": [
      { "isExpert": false, "isCollectable": false, "starts": 2104, "completes": 2043, "macroCopies": 622, "completeRate": 0.971, "macroCopyRate": 0.304 },
      { "isExpert": false, "isCollectable": true,  "starts":  244, "completes":  237, "macroCopies":  41, "completeRate": 0.971, "macroCopyRate": 0.173 },
      { "isExpert": true,  "isCollectable": false, "starts":  287, "completes":  198, "macroCopies":  62, "completeRate": 0.690, "macroCopyRate": 0.313 },
      { "isExpert": true,  "isCollectable": true,  "starts":   50, "completes":   29, "macroCopies":   6, "completeRate": 0.580, "macroCopyRate": 0.207 }
    ],
    "craftKindBreakdown": [
      { "kind": "normal",  "starts": 2104, "completeRate": 0.971 },
      { "kind": "expert",  "starts":  287, "completeRate": 0.690 },
      { "kind": "quick",   "starts":  155, "completeRate": 0.987 },
      { "kind": "custom_delivery", "starts": 89, "completeRate": 0.876 },
      { "kind": "company", "starts":  43, "completeRate": 0.953 }
    ]
  }
  ```

- **視覺指引**：3 個 small multiples 横排
  1. RLV histogram（vertical bars，gold）
  2. 2×2 matrix grid，每格背景 alpha 反映 starts、前景兩條 mini bar（complete / macro_copy rate）
  3. craft_kind 水平 bar，complete rate 並列
- **位置**：新 section ɪᴠ 第 3 張
- **Family 主色**：`--cocoa`

---

### Tier 2（snapshot 上後 2 週才有意義，先把版位設計出來）

---

#### Chart #5 — **Misuse Hint Tally**

- **用途**：3 種 misuse type 的觸發頻率 + 受影響 user 數
- **解什麼**：餵未來 in-app 引導 banner 的優先序
- **資料 shape**：

  ```ts
  misuseSignals: Array<{
    type: 'single_recipe_in_batch' | 'large_queue_in_simulator' | 'bom_without_quantity'
    eventCount: number
    affectedUsers: number
  }>
  ```

  Sample：
  ```json
  [
    { "type": "single_recipe_in_batch", "eventCount": 87, "affectedUsers": 64 },
    { "type": "large_queue_in_simulator", "eventCount": 32, "affectedUsers": 28 },
    { "type": "bom_without_quantity", "eventCount": 12, "affectedUsers": 11 }
  ]
  ```

- **視覺指引**：3 行 ledger 風格 row，每行附一段 italic 解說（「single recipe in batch = 用大砲打蚊子」），右側兩個 metric 並列。**密度低 = 用文字補敘述**
- **位置**：新 section ᴠ「Q5 — Friction & long-tail」第 1 張
- **Family 主色**：`--warning`

---

#### Chart #6 — **Recipe Entry Source**

- **用途**：`recipe_select.source` 分佈 — search / queue / batch_target / bom_drilldown / company_craft / deep_link / unknown
- **解什麼**：揭露真實入口路徑，可能完全推翻 sidebar 排序直覺
- **資料 shape**：

  ```ts
  recipeEntrySource: Array<{
    source: string  // search | queue | batch_target | bom_drilldown | company_craft | deep_link | unknown
    eventCount: number
    uniqueUsers: number
  }>
  ```

  Sample：
  ```json
  [
    { "source": "search",         "eventCount": 1842, "uniqueUsers": 612 },
    { "source": "queue",          "eventCount":  503, "uniqueUsers": 188 },
    { "source": "batch_target",   "eventCount":  281, "uniqueUsers":  96 },
    { "source": "bom_drilldown",  "eventCount":  148, "uniqueUsers":  72 },
    { "source": "deep_link",      "eventCount":  102, "uniqueUsers":  85 },
    { "source": "company_craft",  "eventCount":   48, "uniqueUsers":  21 },
    { "source": "unknown",        "eventCount":    7, "uniqueUsers":   6 }
  ]
  ```

- **視覺指引**：donut chart 或水平 stacked single-bar（百分比 fill）+ 旁邊 ledger 列各 source 明細。**unknown > 0 用 `--danger` 上色當警告 — spec 規定應該為 0**
- **位置**：新 section ᴠ 第 2 張
- **Family 主色**：`--ink-mid` 為底，high-traffic source 用 `--gold`

---

#### Chart #7 — **API Failure Heatmap**

- **用途**：`api_failure` 事件按 api × status 切片，補強現有 `FailuresBar`（只看 reason）
- **解什麼**：定位是 XIVAPI vs Universalis、哪個 HTTP status code 最常壞
- **資料 shape**：

  ```ts
  apiFailures: {
    matrix: Array<{
      api: 'xivapi' | 'universalis'
      status: number  // 404 / 500 / 0 / ...
      count: number
    }>
    topEndpoints: Array<{
      api: string
      endpoint: string  // truncated to 50 chars
      status: number
      count: number
    }>
  }
  ```

  Sample：
  ```json
  {
    "matrix": [
      { "api": "universalis", "status": 404, "count": 142 },
      { "api": "universalis", "status": 500, "count":  38 },
      { "api": "universalis", "status":   0, "count":  87 },
      { "api": "xivapi",      "status": 404, "count":  21 },
      { "api": "xivapi",      "status":   0, "count":  12 }
    ],
    "topEndpoints": [
      { "api": "universalis", "endpoint": "/Aether/38843",     "status": 404, "count": 88 },
      { "api": "universalis", "endpoint": "/Aether/5462",      "status": 404, "count": 54 },
      { "api": "xivapi",      "endpoint": "/v2/zh/Recipe/...", "status":   0, "count": 12 }
    ]
  }
  ```

- **視覺指引**：2×N matrix（api × status），cell 用 alpha 0.1–0.9 of `--danger` 表示量級 + 中央顯示數字；下方 top endpoints 列表（monospace endpoint + status badge + count）
- **位置**：新 section ᴠ 第 3 張，**或**取代既有 `FailuresBar` 的下方擴充
- **Family 主色**：`--danger`

---

#### Chart #8 — **Locale Miss Top Items**

- **用途**：`recipe_name_locale_miss` 按 item_id 排行，top 30
- **解什麼**：給吐司工坊資料補完優先序清單（哪些 item 缺中文名）
- **資料 shape**：

  ```ts
  localeMissTop: Array<{
    kind: 'recipe' | 'item'
    itemId: number
    itemName?: string  // EN fallback, if snapshot 端能 join
    occurrences: number
    affectedUsers: number
  }>
  ```

  Sample：
  ```json
  [
    { "kind": "item", "itemId": 38843, "itemName": "Claro Walnut Lumber", "occurrences": 188, "affectedUsers": 144 },
    { "kind": "item", "itemId": 39102, "itemName": "Phantom Slab", "occurrences": 121, "affectedUsers": 92 },
    { "kind": "recipe", "itemId": 5462, "itemName": "Rinascita Wand", "occurrences": 88, "affectedUsers": 71 }
  ]
  ```

- **視覺指引**：tabular 列表，rank 用 Cormorant italic 小號數字、itemName 用 Noto Serif TC、occurrences bar 內嵌（橫向比例條 + 數字 overlay）
- **位置**：新 section ᴠ 第 4 張
- **Family 主色**：`--matcha`（資料品質類 → 中性）

---

#### Chart #9 — **Solver Perf Trend (WASM load + worker init)**

- **用途**：`wasm_load_ms` + `worker_pool_init_ms` 的 p50 / p95
- **解什麼**：production WASM 載入時間（補 BenchPanel 在 dev only 的盲點）；跨 release 找 regression
- **資料 shape**：

  ```ts
  perfTrend: {
    wasmLoadMs:       { p50: number, p95: number, samples: number }
    workerPoolInitMs: { p50: number, p95: number, samples: number }
    coldStartShare:   number  // 0-1, 冷啟動佔比
  }
  ```

  Sample：
  ```json
  {
    "wasmLoadMs":       { "p50": 612, "p95": 1840, "samples": 884 },
    "workerPoolInitMs": { "p50": 188, "p95":  520, "samples": 884 },
    "coldStartShare":   0.42
  }
  ```

- **視覺指引**：兩條水平 bar (p50 / p95)，用 success / warning / danger 色帶背景（依速度區間：<500 good, 500-1500 ni, >1500 poor），跟 `WebVitalsStack` 視覺一致
- **位置**：新 section ᴠ 第 5 張，**或**併入 Q2 Web Vitals 下方
- **Family 主色**：`--cocoa`

---

#### Chart #10 — **Time to First Action × First Event**

- **用途**：session 第一個非自動事件中位時間 + 哪個事件最常當「第一個」
- **解什麼**：landing → 真正開始用工具的延遲落點，引導著陸頁優化
- **資料 shape**：

  ```ts
  timeToFirstAction: {
    durationMs: { p50: number, p75: number, p95: number, samples: number }
    firstEventDistribution: Array<{
      eventName: string  // 'recipe_select' | 'batch_optimization_start' | ...
      count: number
      medianMs: number  // 該事件當第一個時的中位延遲
    }>
  }
  ```

  Sample：
  ```json
  {
    "durationMs": { "p50": 8420, "p75": 22100, "p95": 184000, "samples": 712 },
    "firstEventDistribution": [
      { "eventName": "recipe_select", "count": 281, "medianMs": 6200 },
      { "eventName": "batch_add_recipe", "count": 142, "medianMs": 12400 },
      { "eventName": "theme_change", "count":  88, "medianMs": 3100 },
      { "eventName": "settings_change", "count": 62, "medianMs": 9800 }
    ]
  }
  ```

- **視覺指引**：上半三個 percentile horizontal bar（p50/p75/p95），下半 first event 水平 bar（按 count 排序），每列附 medianMs 小字。**揭示 pattern**：theme_change 當第一個事件 = user 進來先玩主題切換 = 視覺驚豔造成
- **位置**：新 section ᴠ 第 6 張
- **Family 主色**：`--gold`

---

## 7. Snapshot Schema 增量（給 Claude Code 實作參考）

新增到 `src/types/ga-snapshot.ts` 的 `MetricsBundle`：

```ts
interface MetricsBundle {
  // ... 既有欄位（pages, channels, solverFunnel, batchFunnel, ...）

  // === v2 新增 ===
  byRegion?: {
    cht: RegionGlance
    intl: RegionGlance
    unset: RegionGlance
  }
  onboardingFunnel?: OnboardingStep[]
  topRecipes?: TopRecipeRow[]
  taxonomy?: {
    rlvHistogram: RlvBucket[]
    matrix: TaxonomyCell[]
    craftKindBreakdown: CraftKindRow[]
  }
  misuseSignals?: MisuseRow[]
  recipeEntrySource?: SourceRow[]
  apiFailures?: { matrix: ApiFailureCell[], topEndpoints: ApiFailureEndpoint[] }
  localeMissTop?: LocaleMissRow[]
  perfTrend?: {
    wasmLoadMs: PercentileBucket
    workerPoolInitMs: PercentileBucket
    coldStartShare: number
  }
  timeToFirstAction?: {
    durationMs: { p50: number, p75: number, p95: number, samples: number }
    firstEventDistribution: FirstEventRow[]
  }
}
```

全部 optional — schemaVersion 1 → 1（additive，不 bump）。沒資料時 chart 元件渲染「資料累積中」placeholder。

---

## 8. 期待的設計交付（Claude Design output）

理想 handoff bundle 包含：

1. **Single-page HTML+CSS+D3 v7 mockup**（自含 sample data，可直接開 browser 看），呈現全部 10 張新圖在頁面上的最終視覺
2. **每張圖獨立元件**（HTML or React），方便我 port 成 Vue 3 SFC
3. **任何新加的 CSS token**（理想是不加，全沿用 tokens.css）
4. **Layout 決策說明**：新 section ɪᴠ + ᴠ 各擺哪幾張、為何
5. **互動細節**：hover state、transition、tooltip 行為（用 CSS / D3 範例）

**不需要**：
- 全新 design system（沿用既有）
- mobile/tablet RWD（viewport ≥1440 only）
- a11y aria 標註（之後 Vue port 時補）
- 動畫 storyboard

---

## 9. 不要做的事（Out of scope）

- 改 hero / ledger / window selector / section head pattern（這些是 signature，不動）
- 引入新色相（jam-jar palette 內挑）
- 引入新字體（4 種已夠用）
- 加 sidebar / topbar 導航（dashboard 是 bare layout）
- 對外 sharing / export 功能（owner only）
- light theme 變體（永遠 dark）
- A/B 比較 mode、custom date range（v3 才做）

---

## 10. 你會被問到的問題（先答）

| Q | A |
|---|---|
| 為什麼不用 card grid？ | 視覺基調是 editorial 雜誌排版，靠 typography hierarchy + 細線分隔，**不用 card 山牆**。看現有 hero/ledger/section head |
| 為什麼字型不用 Inter？ | 主站避免 generic SaaS aesthetic 是設計刻意決定。Noto Serif TC + Cormorant Garamond italic + Fira Code 是 signature combo |
| 為什麼 unset region 不剔除？ | 它代表「還沒走完 server 設定的新訪客」— 是 onboarding 流失的 leading indicator |
| 為什麼放 10 張不是更少？ | owner-only dashboard、density 是 feature 不是 bug。但若視覺上某段過擠，可建議拆 v3 |
| 為什麼不做動畫炫技？ | 雜誌印刷感、靜態為主。300ms transition 換 window 已夠 |

---

## 11. 參考檔案路徑（Claude Design 若連 repo 可直讀）

- `src/components/ga-dashboard/tokens.css` — 色票與 base style
- `src/components/ga-dashboard/palette.ts` — TS 色色票（D3 用）
- `src/components/ga-dashboard/pieces/HeroBand.vue` — hero pattern 範本
- `src/components/ga-dashboard/pieces/LedgerGlance.vue` — ledger pattern 範本
- `src/components/ga-dashboard/pieces/SectionHead.vue` — section head pattern
- `src/components/ga-dashboard/charts/PagesTreemap.vue` — D3 chart 範本
- `src/components/ga-dashboard/charts/SolverBatchFunnels.vue` — trapezoid funnel 範本
- `src/components/ga-dashboard/charts/WebVitalsStack.vue` — stacked bar 範本
- `src/types/ga-snapshot.ts` — 既有資料 schema
- `src/views/admin/GaDashboardView.vue` — 頁面 layout 結構

---

## 12. Handoff back to Claude Code

設計完成後請打包：

1. 上述 HTML mockup（或 React/Vue 元件）
2. 每張圖建議的 Vue 3 SFC 對應名（例如 `RegionSplitLedger.vue`, `OnboardingMilestoneFunnel.vue`, `TopRecipesStackBar.vue`, ...）
3. 上述 schema 增量（TS interface 草稿）
4. Layout patch 對 `GaDashboardView.vue`（新增的兩個 `<section class="q">` 與 sub-head 結構）

我會在 Claude Code 內接手：寫 `scripts/dev/ga-analyze.mjs` 的 `buildBundle()` query、實作 10 個 Vue chart、補單元測試、走 PR + tag flow。

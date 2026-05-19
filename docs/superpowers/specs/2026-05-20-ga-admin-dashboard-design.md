# GA Admin Dashboard 站內常態頁設計

**日期**：2026-05-20
**狀態**：Design — 待 plan 拆解
**範疇**：把 `.tmp/ga/report.html` 一次性 ad-hoc viz，常態化為 Vue app 內的 `/admin/ga` 路由，由 daily cron 推 snapshot，視覺風格鎖暗色 editorial。
**前置作業**：[2026-05-17 GA Tracking Expansion](2026-05-17-ga-tracking-expansion-design.md)、[2026-05-19 GA Market & Recipe Funnel](2026-05-19-ga-market-recipe-funnel-design.md)。

---

## 目標

- 我可以隨時開 `/admin/ga` 看本週工坊數據——不用本機跑 script、不用本機開 HTML
- 三個 windows（7d / 14d / 28d）一鍵切換
- 視覺風格延續 ad-hoc HTML 的 dark warm editorial（treemap + scatter + 真實梯形 funnels + cocoa/strawberry 語意色）
- 同 PR 修掉 `analytics.ts:send()` 的 page_location 缺漏，讓未來 page-sliced funnel 可行
- 預留 history snapshot 結構，讓 v2 直接加 compare mode 不用再倒一次資料

## 非目標（v2 才做）

- **Page filter**——需要 tracking fix 上線後累積 ≥1 週資料，v2 才有意義
- **Compare mode**（本週 vs 上週 side-by-side）——需要 ≥2 期 snapshot，v2 才有資料
- **Custom date range**——需要 cron 每天跑 + 客戶端組 range，v2 才做
- **Drill-down to raw events**——使用情境模糊，先不做
- **Auth**——owner-only by path obscurity，不設 key

## 使用情境

每週 push deploy 之後、看了 changelog 之後、想知道「上週的流量怎樣」時——打開 `/admin/ga`，三個 window 來回切，看 11 張圖。資料每天凌晨自動 refresh，停留時間 5 分鐘。手機平板也能看。

## 架構總覽

```
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Action (.github/workflows/ga-snapshot.yml)              │
│  schedule: 04:00 UTC daily (12:00 台北)                          │
│  1. checkout main                                                │
│  2. node scripts/dev/ga-analyze.mjs --snapshot                  │
│     → 同一支腳本支援 multi-window snapshot 輸出 JSON              │
│  3. git add data/ga-snapshot.json data/history/YYYY-MM-DD.json  │
│  4. git commit -m "chore(data): GA snapshot YYYY-MM-DD"          │
│  5. git push (觸發既有 Pages deploy workflow)                    │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│  data/                                                           │
│  ├── ga-snapshot.json     ← 7d/14d/28d packed, 約 80KB           │
│  └── history/                                                    │
│      ├── 2026-05-20.json  ← 不可變、每天一份                     │
│      ├── 2026-05-21.json                                         │
│      └── ...                                                     │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│  Vue app · /admin/ga (path-obscurity)                            │
│  ├── GaDashboardView.vue                                         │
│  │   ├── window selector (7d / 14d / 28d segmented)              │
│  │   └── 11 chart components (移植自 .tmp/ga/report.html)        │
│  ├── useGaSnapshot()  ← composable, fetch /data/ga-snapshot.json │
│  └── theme override: 強制 dark editorial（與 app theme 解耦）     │
└─────────────────────────────────────────────────────────────────┘
```

## 技術選型

- **D3 v7 from npm**（不再 CDN）——`pnpm add d3 @types/d3`
- **Vue 3 SFC + `<script setup lang="ts">`**——既有 stack
- **Pinia 不需要**——dashboard 是純檢視、no global state，用 `useGaSnapshot()` composable 即可
- **無 Element Plus 元件**——按 [Q5 設計決議]，dashboard layout 與主 app 解耦，不繞 ElContainer / ElTable，純 Vue + D3 + 自管 CSS
- **既有 dark mode store 不耦合**——dashboard 自帶 `<div class="ga-dashboard-dark">` scope，不讀 `themeStore`

---

## 1. Routing & 整合

### `src/router/index.ts` 新增

```ts
{
  path: '/admin/ga',
  name: 'admin-ga',
  component: () => import('@/views/admin/GaDashboardView.vue'),
  meta: {
    layout: 'bare',          // 跳過既有 sidebar / appbar
    title: 'GA Analytics',
    private: true,            // 標記用，不做實際 gate
  },
}
```

### `App.vue` / `AppLayout.vue` layout 切換

既有 default layout 包了 sidebar + app bar。檢查 `route.meta.layout === 'bare'` 時直接 render `<RouterView/>`，不套 chrome。

### Sidebar 不加入口

由路徑 obscurity 保護；只有知道 `/admin/ga` 的人才會到。不出現在主導航、不進 sitemap.xml、`<title>` 不含「GA」字眼以防被搜尋。

---

## 2. Data pipeline

### `scripts/dev/ga-analyze.mjs` 重構

既有腳本只跑單一 window、輸出 markdown + csv。要擴成：

- 新增 `--snapshot` flag：跑 7d / 14d / 28d 三次、各自 query 完整 metric 組、整理成 JSON
- 新增 `--out <path>`：JSON 輸出路徑（預設 `data/ga-snapshot.json`）
- 新增 `--history <dir>`：同步寫入 history 目錄
- 保留既有 `node scripts/dev/ga-analyze.mjs`（無 flag）行為，仍走 markdown + csv

### Cron workflow `.github/workflows/ga-snapshot.yml`

```yaml
name: GA daily snapshot
on:
  schedule:
    - cron: '0 4 * * *'   # 04:00 UTC = 12:00 Asia/Taipei
  workflow_dispatch: {}

jobs:
  snapshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24' }
      - run: npm ci
      - name: Write SA cred
        env:
          GA_SA_JSON: ${{ secrets.GA_SA_JSON }}
        run: |
          mkdir -p $HOME/.ff14-craft-helper
          echo "$GA_SA_JSON" > $HOME/.ff14-craft-helper/ga-sa.json
      - name: Run analyze
        env:
          GA_PROPERTY_ID: ${{ secrets.GA_PROPERTY_ID }}
        run: node scripts/dev/ga-analyze.mjs --snapshot \
            --out data/ga-snapshot.json \
            --history data/history
      - name: Commit + push
        run: |
          git config user.name "ga-snapshot-bot"
          git config user.email "ga-snapshot-bot@users.noreply.github.com"
          git add data/ga-snapshot.json data/history/
          git diff --cached --quiet && exit 0
          git commit -m "chore(data): GA snapshot $(date -u +%Y-%m-%d)"
          git push
```

### GitHub repository secrets 要新增

- `GA_SA_JSON`：完整 service-account JSON 內容（base64 不需要，直接貼）
- `GA_PROPERTY_ID`：`527587379`

### 既有 Pages deploy 自動連動

主 repo 的 GH Pages workflow（`.github/workflows/*.yml` 應已存在）會被 main push 觸發；cron 自動 push 等於自動 deploy。memory `feedback_no_deploy.md` 已標記此例外。

---

## 3. Snapshot JSON 結構

### `data/ga-snapshot.json` 形狀

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-20T04:01:23Z",
  "propertyId": "527587379",
  "windows": {
    "7d":  { /* MetricsBundle */ },
    "14d": { /* MetricsBundle */ },
    "28d": { /* MetricsBundle */ }
  }
}
```

`schemaVersion` bump 規則：metric 欄位刪除或重命名 → `+1`；純新增 optional 欄位 → 不 bump。Client 載入時若 `schemaVersion > 已知值`，hero 顯示「snapshot schema 較新，請更新 client」警示但仍嘗試渲染。

### `MetricsBundle` 對應每個 window，鏡像目前 11 張圖的資料需求

```ts
interface MetricsBundle {
  window: { days: number, startDate: string, endDate: string }
  glance: {
    activeUsers: { total: number, new: number, returning: number, returningPct: number }
    solver: { starts: number, completes: number, fails: number, completePct: number }
    batch:  { starts: number, completes: number, fails: number, cancelled: number, completePct: number }
    bom:    { calculates: number, sentToBatch: number, handoffPct: number }
    infra:  { sabUnavailable: number, wasmLoadFailed: number }
  }
  pages: Array<{
    path: string, title: string, family: 'core'|'craft'|'gather'|'company'|'meta'|'market',
    views: number, users: number, sessions: number,
    engagement: number, bounce: number, avgSession: number,
  }>
  channels: Array<{ channel: string, source: string, sessions: number, users: number, engagement: number }>
  solverFunnel: Array<{ step: string, count: number, tone: 'neutral'|'success'|'danger'|'warn' }>
  batchFunnel:  Array<{ step: string, count: number, tone: 'neutral'|'success'|'danger'|'warn' }>
  simulatorFunnel: {
    entry: { label: string, count: number, users: number }
    macroCopy: { label: string, count: number, users: number }
    globalContext: Array<{ label: string, count: number }>
  }
  failures: Array<{ event: 'solver'|'batch'|'wasm', reason: string, count: number }>
  vitals: Array<{ metric: 'INP'|'TTFB'|'CLS'|'FCP'|'LCP', good: number, ni: number, poor: number }>
  flip: {
    users:    { new: number, returning: number, other: number }
    sessions: { new: number, returning: number, other: number }
  }
  returningEvents: Array<{ event: string, family: string, count: number, users: number }>
  returningPages:  Array<{ path: string, returningViews: number, returningUsers: number, engagement: number }>
  q4Funnels: Array<{ name: string, label: string, from: number, to: number, note: string, flag: 'ok'|'warn'|'danger'|'noise' }>
  marketRegion: Array<{ event: string, notset: number, unset: number, cht?: number, intl?: number }>
}
```

### `data/history/YYYY-MM-DD.json` 形狀

完全等同 `ga-snapshot.json`，差別只在檔名帶日期、永不覆寫。MVP 不讀取 history（檔在不用）；v2 compare mode 才使用。

### 大小估算

每個 MetricsBundle 約 8–10 KB（minified）→ 三個 window 加 metadata 約 30 KB → 加 gzip 約 8 KB。可接受。

---

## 4. Tracking fix（同 PR）

### `src/utils/analytics.ts` patch

```ts
function send(eventName: string, params?: GtagParams) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', eventName, {
    page_location: `${window.location.origin}${window.location.pathname}${window.location.hash}`,
    ...params,
  })
}
```

### 驗證計畫

PR 上線後當天驗證：在 dev tools Network 面板觀察 `collect?...` 請求；`solver_start` 應該帶上 `dl=...#/simulator` 而不是 base path。

### 影響範圍

只影響 future events。歷史資料無法回填（GA 不允許 backfill 自訂 dim）。v2 page filter 上線時間 = tracking fix deploy 日期 + 7 天。

---

## 5. Vue 元件結構

```
src/views/admin/
├── GaDashboardView.vue              ← 頁面容器、window selector、layout
└── ga-dashboard/
    ├── composables/
    │   ├── useGaSnapshot.ts         ← fetch + cache /data/ga-snapshot.json
    │   ├── useD3Resize.ts           ← ResizeObserver wrapper
    │   └── useTooltip.ts            ← shared tooltip layer
    ├── charts/
    │   ├── PagesTreemap.vue
    │   ├── ChannelsBar.vue
    │   ├── SolverBatchFunnels.vue
    │   ├── SimulatorFunnel.vue
    │   ├── FailuresBar.vue
    │   ├── WebVitalsStack.vue
    │   ├── EngagementScatter.vue
    │   ├── FlipBands.vue
    │   ├── ReturningEventsBar.vue
    │   ├── PagesCompareBar.vue
    │   ├── Q4FunnelDrops.vue
    │   └── MarketRegionStack.vue
    ├── pieces/
    │   ├── HeroBand.vue              ← editorial hero（eyebrow + display + lede）
    │   ├── LedgerGlance.vue          ← at-a-glance ledger rows
    │   ├── WindowSelector.vue        ← 7d/14d/28d 三檔切換
    │   └── SectionHead.vue           ← roman numeral + title + aside
    └── tokens.css                    ← scoped OKLCH tokens（warm-dark）
```

每個 chart 元件接 `props: { data: ChartData }`，自己 ResizeObserver、自己畫、自己 cleanup。

### Window selector 行為

```ts
const window = ref<'7d' | '14d' | '28d'>('7d')
const snapshot = useGaSnapshot()
const bundle = computed(() => snapshot.value?.windows[window.value])
```

切換時所有 chart 拿到新的 `data` prop 後重繪。D3 enter/update/exit pattern 處理 transition（300ms ease-out-quart）。

---

## 6. 視覺設計（移植 .tmp/ga/report.html 既有 style）

完全沿用：
- 色票（warm-dark OKLCH，no neon）
- Hero pattern（Cormorant italic eyebrow + Noto Serif TC display + gold chalk-rule + body-serif lede）
- Ledger glance（不用 hero-metric template）
- 11 張 D3 charts 配色 + interactions

調整：
- `<script src="https://d3js.org/d3.v7.min.js">` → 改用 `import * as d3 from 'd3'`
- Inline `<style>` → 切到 `tokens.css` + 各 component scoped style
- `DATA` object → `useGaSnapshot()` 回傳

### Window selector UI

```
┌─────────────────────────────────────┐
│  ⟨ 7d ⟩  14d   28d                  │  ← active 用 gold underline + ink
└─────────────────────────────────────┘
   Cormorant italic 14px · uppercase Fira Code 11px
```

位置：hero 下、ledger 上。切換動作會 fade 整片 content (200ms) 再 transition charts。

### 「Stale snapshot」提示

`generatedAt` 距今 >36 小時時，hero 右上角顯示橙色 badge：
```
SNAPSHOT 38h OLD · CRON MAY HAVE FAILED
```

---

## 7. 既有 ad-hoc HTML 的處置

`.tmp/ga/report.html` 與 `scripts/dev/simulator-funnel.mjs` 都是 scratch。Dashboard ship 之後留著當參考 1-2 週，再清掉（已 gitignore，不需動）。

---

## 8. Out of scope（v2 再做）

| 功能 | Blocker | 預計時程 |
|---|---|---|
| Page filter | 等 tracking fix 累積 7 天資料 | 2026-05-27 之後 |
| Compare mode | 等 history snapshot 累積 2+ 期 | 2026-05-22 後（cron 跑兩天） |
| Custom date range | 需 cron 跑更多 window + client query 組合 | TBD |
| Drill-down to raw events | 使用情境模糊、需要 raw event API 抽樣 | TBD |
| Sidebar 入口、auth gate | 受眾擴大才需要 | 不在路線圖 |

## 9. Risks & mitigations

| 風險 | 說明 | 對策 |
|---|---|---|
| **Cron 失敗** | GA quota / SA cred expired / API outage | UI 顯示 stale badge；workflow on-failure 通知 |
| **路徑 obscurity 失守** | 有人爬到 `/admin/ga` 或 raw `/data/ga-snapshot.json` | 接受——資料非高敏。v2 接 auth gate 前不再加 hardening |
| **Snapshot 結構漂移** | 新增 metric 時 schema 變動，舊 history snapshot 不相容 | History 寫入時帶 `schemaVersion` 欄位；client 對 mismatch 顯示降級訊息 |
| **Cron 衝突 user push** | Cron commit 時剛好有 user push | Workflow 失敗就重試一次；連續失敗有 stale badge 兜底 |
| **Bundle 變大** | 11 張 chart + D3 加入 main bundle | 用 `defineAsyncComponent` 動態載入 chart 元件，dashboard 進入時才 load D3 chunk |

## 10. Decision log

所有開放問題已於 2026-05-20 訪談收齊：

- ✅ 受眾：owner-only，路徑 obscurity
- ✅ 新鮮度：daily cron auto-commit + auto-deploy（memory `feedback_no_deploy.md` 例外條款）
- ✅ Hosting：production site `/admin/ga`
- ✅ 互動 MVP：window selector only
- ✅ 互動 v2：page filter + compare
- ✅ 整合：同 Vue app、鎖暗色、不進 sidebar
- ✅ Tracking fix 時序：同 PR
- ✅ Snapshot 結構：單檔 + history archive 從 day 1
- ✅ 視覺風格：完全移植 .tmp/ga/report.html

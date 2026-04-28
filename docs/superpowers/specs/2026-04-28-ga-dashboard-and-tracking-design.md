# GA4 Dashboard & 追蹤缺口補丁

**日期**：2026-04-28
**狀態**：Design
**範疇**：在 GA4 內建探索（Explorations）+ Reports Library 上建一組「吐司工坊」儀表板，並補齊回答四大目標所需的事件追蹤。

## 目標

回答四個問題：

1. **誰在用、用多少** — 使用者規模與健康度
2. **哪些功能被用 / 沒被用** — 功能熱度與漏斗轉換
3. **效能與穩定度** — 解算耗時、API 成功率、錯誤率、Web Vitals
4. **玩家行為洞察** — 等級/裝備區段分佈、批量製作規模長尾

## 非目標

- 不做即時告警（GA4 native 不擅長，每週檢查為主）
- 不做 macro 匯出追蹤（用戶判定低優先）
- 不做 settings/gearset save/recipe simulate open 等次要互動的追蹤
- 不自建 dashboard 站（GA4 native 即可）
- 不做 A/B 測試框架（超出範疇）

## 使用情境

- 每週/發版後打開 GA4 → 「吐司工坊」collection → 由上而下掃 4 個 section
- 看到異常時點進對應的探索（Exploration）做 drill-down

## Dashboard 結構

GA4「Reports Library」建一個 collection 名為 **吐司工坊**，下分 4 個 topic（GA4 所謂 sub-section）。複雜的切片與漏斗以「探索」呈現，並在 Reports 內附超連結。

```
吐司工坊 (Collection)
├── A. 使用者規模      (Reports)
├── B. 功能使用        (Reports + 2 個漏斗探索)
├── C. 效能與穩定      (1 個 Free-form 探索)
└── D. 玩家洞察        (1 個 Free-form 探索)
```

### Section A — 使用者規模

幾乎全用 GA4 內建維度與指標。

| 圖表 | 類型 | 來源 |
|---|---|---|
| Active users 28 天折線 | Line | 內建 `activeUsers` |
| 新訪客 vs 回訪比例 | Donut | 內建 `newUsers / activeUsers` |
| 裝置類別 | Bar | 內建 `deviceCategory` |
| 語言（zh-TW / en / ja...） | Table | 內建 `language` |
| 地區（國家 / 城市） | Map + Table | 內建 `country / city` |
| 流量來源（source / medium / referrer） | Table | 內建 `sessionSource / sessionMedium` |
| Avg engagement time | Scorecard | 內建 `userEngagementDuration` |

### Section B — 功能使用

**KPI 卡片區（Reports）**

- Solver 完成次數（事件 `solver_complete` count）
- Batch 最佳化完成次數（事件 `batch_optimization_complete` count）
- 搜尋次數 vs 無結果率（`search_query` count；無結果 = `result_count == 0` 的 segment）

**漏斗 1 — Solver 轉換（Funnel exploration）**

```
page_view → recipe_select → solver_start → solver_complete
```

**漏斗 2 — Batch 轉換（Funnel exploration）**

```
BatchView page_view (page_path = "/batch")
  → batch_add_recipe
  → batch_optimization_start
  → batch_optimization_complete
```

**頁面熱度表（Reports）**

- Top routes by `views` / `engagement rate` / `exits`
- 用來找沒人用的頁面

**搜尋洞察（Free-form 探索）**

- 熱門搜尋字 top 30（`search_query.query`）
- 無結果 top 30（filter `result_count == 0`）
- 分 source（recipe / item）切

### Section C — 效能與穩定

單一 Free-form 探索，多個 visualization。

| 圖表 | 類型 | 來源 |
|---|---|---|
| Solver 耗時 P50 / P75 / P95 | Scorecard ×3 | `solver_complete.duration_ms` |
| Solver 耗時直方圖 | Histogram (bucket: <1s / 1–3 / 3–10 / 10–30 / 30+s) | 同上 |
| Batch 耗時 P50 / P75 / P95 | Scorecard ×3 | `batch_optimization_complete.duration_ms` |
| Solver / Batch 失敗率 | Scorecard | `*_failed` ÷ `*_start` |
| Top exception descriptions | Table | `exception.description` |
| Web Vitals P75（LCP / CLS / INP / FCP / TTFB） | Scorecard ×5 | `web_vitals.value`（依 metric 切） |
| WASM 載入失敗次數 | Scorecard | `wasm_load_failed` count |
| SAB 不可用 fallback 次數 | Scorecard | `sab_unavailable` count |
| Universalis 成功率 | Scorecard | `universalis_fetch.ok == true` ÷ all |
| Universalis 平均耗時 | Scorecard | `universalis_fetch.duration_ms` |
| Universalis 各伺服器使用分佈 | Bar | `universalis_fetch.server` |

### Section D — 玩家洞察

單一 Free-form 探索。聚焦兩個主題。

**等級 / 裝備分佈**

| 圖表 | 類型 | 來源 |
|---|---|---|
| Crafter level 分佈 | Histogram | `solver_start.crafter_level` |
| Recipe level 分佈 | Histogram | `solver_start.recipe_level` |
| Crafter × Recipe level 熱圖 | Pivot heatmap | 兩者交叉 |
| 裝備區段（gear_bucket）分佈 | Bar | `solver_start.gear_bucket` |

**批量規模長尾**

| 圖表 | 類型 | 來源 |
|---|---|---|
| Batch target_count 分佈 | Histogram (1 / 2–3 / 4–9 / 10–19 / 20+) | `batch_optimization_start.target_count` |
| Batch total_quantity 分佈 | Histogram (log-style: 1–10 / 10–50 / 50–200 / 200+) | `batch_optimization_start.total_quantity` |
| Cross-server 使用率 | Donut | `batch_optimization_start.cross_server` |
| Calc mode（macro vs quick-buy） | Donut | `batch_optimization_start.calc_mode` |

## 追蹤事件補丁

全部沿用 `src/utils/analytics.ts` 既有的 `trackEvent` helper。

### 新增事件

#### `search_query`

- params：
  - `query` (string) — 使用者輸入
  - `result_count` (number) — 結果筆數
  - `source` (`'recipe' | 'item'`) — 哪個搜尋元件觸發
- 觸發點：搜尋輸入框，於使用者停止輸入 500ms 後 send 一次（debounce），避免每按一鍵就送
- 不另設 `search_no_result` 事件 — GA4 用 filter `result_count == 0` 即可衍生

#### `web_vitals`

- 依賴：新增 npm 套件 `web-vitals`
- params：
  - `metric` (`'LCP' | 'CLS' | 'INP' | 'FCP' | 'TTFB'`)
  - `value` (number) — metric 原始值
  - `rating` (`'good' | 'needs-improvement' | 'poor'`)
- 觸發點：`src/main.ts` 啟動後註冊 `onLCP / onCLS / onINP / onFCP / onTTFB`，callback 內呼叫 `trackEvent('web_vitals', { metric, value: m.value, rating: m.rating })`

#### `wasm_load_failed`

- params：
  - `reason` (string)
  - `fallback_used` (boolean) — 是否退回單執行緒解算
- 觸發點：`src/solver/worker.ts` WASM init 的 catch 區塊

#### `sab_unavailable`

- 無 params
- 觸發點：app boot 偵測 `typeof crossOriginIsolated === 'boolean' && crossOriginIsolated === false` 時送一次 per session
- 用途：當 GitHub Pages headers 設定壞掉時，C section 的 scorecard 會立刻冒出非零數字當作告警

#### `universalis_fetch`

- params：
  - `server` (string) — 查詢的 world / DC 名稱
  - `item_count` (number) — 一次查幾個物品
  - `duration_ms` (number)
  - `ok` (boolean) — HTTP 2xx 為 true
  - `status` (number) — HTTP status code（timeout / abort 設 0）
- 觸發點：`src/api/universalis.ts` 的 `fetchUniversalis()`，在 try/catch/finally 內 instrument
- 注意：`server` 從呼叫者 path 抽取（既有 path 結構含 server 名稱）

### 改動現有事件

#### `solver_start` 新增欄位

- 新增 `gear_bucket` (`'entry' | 'mid' | 'bis'`)
- 計算邏輯放 `src/utils/gear-bucket.ts`：

```
ratio = (craftsmanship / approxBis[level].craftsmanship
       + control / approxBis[level].control) / 2
gear_bucket = ratio >= 0.95 ? 'bis'
            : ratio >= 0.70 ? 'mid'
            : 'entry'
```

`approxBis` lookup table 草案（以等級 cap 對應該擴張片段的近似 BiS 平均；數值刻意保守取整、不追求精確 BiS，僅用於分桶）：

| Level cap | approx Craftsmanship | approx Control |
|---|---|---|
| 50 | 410 | 410 |
| 60 | 760 | 760 |
| 70 | 1750 | 1700 |
| 80 | 2700 | 2600 |
| 90 | 4070 | 3900 |
| 100 | 5400 | 5200 |

非 cap 等級（如 lv55、lv87）用「向下取最近 cap」對應。實際數字會在實作時與 [Teamcraft](https://ffxivteamcraft.com/) 或 BiS 整理表交叉比對微調。發版兩週後再依實際分佈是否合理回頭 calibrate。

### 不做（明確排除）

- ❌ `macro_export`（用戶判定低優先）
- ❌ `settings_change` / `gearset_save` / `recipe_simulate_open`（沒對應到四大目標）

## GA4 後台設定

### Custom dimensions（event-scoped）

`job`、`calc_mode`、`hq_target`、`gear_bucket`、`metric`、`rating`、`source`、`query`、`server`、`ok`、`reason`、`fallback_used`

### Custom metrics

| 名稱 | 單位 |
|---|---|
| `duration_ms` | milliseconds |
| `action_count` | standard |
| `steps` | standard |
| `target_count` | standard |
| `total_quantity` | standard |
| `todo_count` | standard |
| `queue_size` | standard |
| `value` | standard（CLS 不轉換，直接記原值） |
| `result_count` | standard |
| `item_count` | standard |
| `crafter_level` | standard |
| `recipe_level` | standard |

> GA4 上限 50 dim / 50 metric，目前 12 + 12 = 24，安全。

### Conversions / Key events

把以下事件標記為 key event 以便在報表內看轉換漏斗：

- `solver_complete`
- `batch_optimization_complete`

## 風險與注意

- **PII**：`search_query.query` 為 FF14 配方/物品名，不含個資
- **取樣**：免費版 GA4 在事件 >10M/月才取樣，個人專案不會碰到
- **高 cardinality**：`query`、`recipe_id` 屬高基數欄位。GA4 會把超出 500 unique values/天的併入 `(other)`，看 top values 仍可用
- **`sab_unavailable` 永遠應該為 0**：headers 正常時 `crossOriginIsolated` 為 true。保留事件做為 headers 設定壞掉時的 canary
- **`web_vitals` 事件量級**：每次 page navigation 會送 5 個事件，若 PV 量大可考慮只送 LCP/CLS/INP（Core Vitals）。目前 PV 量級下不需要

## 開放議題

- **gear_bucket 的 lookup table 數值** — 需在實作階段對照當期 BiS 整理確認
- **「裝備區段」是否要區分 specialist 與否** — 暫不分；若日後玩家洞察需要再 patch

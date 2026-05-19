# GA 追蹤擴充：市場區隔、配方分類、頁面導流漏斗

**日期**：2026-05-19
**狀態**：Design
**範疇**：補上 market_region 切片、recipe 種類維度、page funnel 與誤用頁面訊號、效能與 user property 擴充。
**前置**：延續 `2026-05-17-ga-tracking-expansion-design.md`（plan 尚未完成執行，本 spec 上線時序在其後）。

---

## 1. 動機

`2026-05-17` GA Data API 28 天分析揭露的核心盲點，目前只解決一半：

| 既有問題 | 上一份 spec 是否覆蓋 | 本 spec 補什麼 |
|---|---|---|
| BOM → Batch 9.7% 轉換之謎 | 加了 BOM 結果消化事件 | **依 region 切片**（繁中服 vs 國際服可能行為完全不同） |
| Solver `complete` 是否被消化 | 加了 `solver_macro_copy` | **依 recipe 種類切片**（expert / collectable / 高 rlv 配方的消化率） |
| 新用戶 70% 不回頭 | 加了 `first_session_milestone` | 加 page funnel drop / 誤用頁面訊號，定位「在哪一步斷掉」 |
| 797 sab_unavailable | 加 browser_family | 沒新增（已夠用） |

並回答兩個明確問題：
1. **不同 market region 的 use case 差異**（user 期望：繁中服 vs 國際服）
2. **Recipe 種類偏好** — 哪些頁面常處理哪些難度／類型配方，是否需要引導 user 換頁

---

## 2. Supersedes / 與既有 spec 的關係

- 不取代 `2026-04-28-ga-dashboard-and-tracking-design.md` 或 `2026-05-17-ga-tracking-expansion-design.md`
- 本 spec **依賴** `2026-05-17` plan 已完成（特別是 `recipe_select`、`solver_start`、`batch_optimization_start`、`bom_target_*`、milestone store、settings_change）
- 本 spec 上線後，下一份 `ga-analyze.mjs` report 應該擴充以使用新維度（見 §5）

---

## 3. 目前已蒐集 metric 盤點

### 3.1 自動蒐集（GA4 enhanced measurement）

| Event | 主要參數 |
|---|---|
| `page_view` | page_path, page_title, page_location |
| `session_start` | （自動） |
| `first_visit` | （自動） |
| `user_engagement` | engagement_time_msec |
| `scroll` | percent_scrolled |
| `click` | link_url（限站外連結） |

GA4 built-in metric：`activeUsers`, `sessions`, `engagementRate`, `bounceRate`, `averageSessionDuration`, `screenPageViewsPerSession`, `sessionsPerUser`, `newVsReturning`

### 3.2 自訂事件（既有 + 2026-05-17 即將上線）

| Event | 參數 | 來源 |
|---|---|---|
| `recipe_select` | recipe_id, job, level | 既有 |
| `solver_start` | crafter_level, recipe_level, hq_target, gear_bucket | 既有 |
| `solver_complete` | – | 既有 |
| `solver_failed` | reason | 既有 |
| `solver_rerun` | run_index | 2026-05-17 |
| `solver_input_change_after_fail` | field | 2026-05-17 |
| `solver_macro_copy` | macro_index, total_macros, action_count, wait_time, include_echo | 2026-05-17 |
| `wasm_load_failed` | reason | 既有 |
| `sab_unavailable` | browser_family, is_in_app_webview, ua_short | 2026-05-17 |
| `batch_add_recipe` | – | 既有 |
| `queue_add_recipe` | – | 既有 |
| `batch_optimization_start` | target_count, total_quantity, calc_mode, cross_server | 既有 |
| `batch_optimization_complete` | – | 既有 |
| `batch_optimization_cancelled` | – | 既有 |
| `batch_optimization_failed` | reason | 既有 |
| `bom_calculate` | – | 既有 |
| `bom_send_to_batch` | – | 既有 |
| `bom_acquisition_mode_set` | – | 既有 |
| `bom_target_default_set` | – | 既有 |
| `bom_route_optimize_set` | – | 既有 |
| `bom_breakdown_expand` | item_id | 2026-05-17 |
| `bom_item_check` | item_id, checked | 2026-05-17 |
| `bom_copy_list` | format, target_count | 2026-05-17 |
| `aetheryte_tp_copy` | source | 2026-05-17 |
| `gearset_sheet_open` | – | 既有 |
| `gearset_apply_all` | – | 既有 |
| `workshop_project_phase_completed` | – | 既有 |
| `theme_change` | – | 既有 |
| `settings_change` | key, prev, value（涵蓋 language / region / data_center / server / price_display_mode / cross_server / recursive_pricing / max_recursion_depth / exception_strategy / raw_material_default） | 2026-05-17 |
| `first_session_milestone` | step（viewed_recipe / ran_solver / saw_macro / used_batch） | 2026-05-17 |
| `universalis_fetch` | – | 既有 |
| `web_vitals` | metric, rating, value | 既有 |
| `exception` | description, fatal | GA4 自動 |

### 3.3 既有 user_property

無顯式註冊。所有切片仰賴 event-scoped param。

---

## 4. 本 spec 新增項目（已過 user filter）

### 4.1 Market region 維度（取代「locale」概念）

**背景**：UI 只有 zh-TW，沒有 i18n 切換訊號可分析。但 user 同時服務「繁中服」與「國際服」玩家，**market region 才是真實的分群維度**。

#### 4.1.1 `market_region` user_property

- 推斷自 `settings.region`（Universalis API 的 region 字串）
- 規範值：`'cht' | 'intl' | 'unset'`
  - `'cht'`：region 字串為 `'zh-TW'` 或 `'TW'`（繁中服）
  - `'intl'`：其他所有有效值（Japan / North-America / Europe / Oceania / Korea / `'CN'`（簡中／國服）等）
  - `'unset'`：region 為空字串，user 還沒走完 server 設定流程
- **重要**：`'CN'` 是簡中（國服），歸類為 `'intl'`，不要誤判為繁中
- 註冊時機：
  1. App boot：讀 settings.region → 推斷 → `gtag('set', 'user_properties', { market_region })`
  2. `setRegion` 變動時：重算 + re-set
- **不同步到 GA4 event scope**：透過 user_property 全 event 自動可切片，不需在每個 event 加參數

#### 4.1.2 `region_resolution` event（單次）

- 觸發：首次完成 server 設定（`region` 從 `''` → 非空）
- 參數：`from_default: boolean`（true = 接受預設、false = 主動改）、`market_region`
- 用途：分析 onboarding 中 region 設定的決斷時間 + 預設 stickiness

#### 4.1.3 `recipe_name_locale_miss` event

- 範疇縮窄為「資料層 fallback」：當前 locale 是 zh-TW，但 XIVAPI 回來的 item／recipe 缺中文名，被迫顯示英文
- 觸發點：recipe / item 名稱 resolve 時偵測 fallback
- 參數：`kind: 'recipe' | 'item'`, `item_id: number`, `expected_locale: 'zh'`
- 抑制：per-session per-id 一次（用 Set；session-scoped）
- 用途：i18n 資料覆蓋率指標，告訴吐司工坊哪些 item 名稱該補

---

### 4.2 Recipe 種類維度

擴充 `recipe_select`、`solver_start`、`batch_optimization_start`、新增 `bom_target_add`。

#### 4.2.1 共用 recipe 分類 dim

定義 `RecipeTaxonomy`：

```ts
interface RecipeTaxonomy {
  rlv: number              // 既有 solver_start 有；補進 recipe_select
  stars: number            // 0–4
  is_expert: boolean
  requires_specialist: boolean
  is_collectable: boolean
  craft_kind: 'normal' | 'quick' | 'custom_delivery' | 'company' | 'expert'
  category: 'gear' | 'consumable' | 'housing' | 'material' | 'misc'
  expected_action_count_bucket: 'short' | 'medium' | 'long' | 'unknown'
    // 短/中/長：< 15 / 15–25 / > 25 actions；solver 完成後回填或留 'unknown'
}
```

**Source of truth**：XIVAPI Recipe schema 的 `Stars` / `IsExpert` / `Recipe.SecretRecipeBook` / `ItemResult.IsCollectable` / `CraftType` 等欄位（具體欄位名稱在 §6 open questions 確認）。

#### 4.2.2 擴充事件 schema

| Event | 新增參數 |
|---|---|
| `recipe_select` | 全部 `RecipeTaxonomy` 欄位 |
| `solver_start` | `stars`, `is_expert`, `is_collectable`, `craft_kind`（rlv / specialist 既有或可推） |
| `bom_target_add` | recipe_id, full taxonomy, source（見 §4.3.1 source enum） |
| `batch_optimization_start` | aggregate：`targets_rlv_min`, `targets_rlv_max`, `targets_stars_max`, `has_expert_in_batch`, `has_collectable_in_batch`, `unique_jobs_in_batch` |

#### 4.2.3 `bom_target_add` 新事件

- 觸發：使用者把 recipe／item 加入 BOM target list
- 參數：recipe_id, item_id, quantity, source（見 §4.3.1 source enum）, full RecipeTaxonomy
- 與既有 `bom_calculate` 區隔：前者是「準備清單」、後者是「按下計算」
- Hook point：`src/stores/bom.ts` 加 target 的 mutator

---

### 4.3 Page funnel / 誤用頁面訊號

#### 4.3.1 `recipe_open_source` 參數補進 `recipe_select`

- 既有 `recipe_select` 加 `source` 參數，enum：
  - `'search'` — RecipeSearch 元件選取
  - `'queue'` — Simulator queue 點擊
  - `'batch_target'` — Batch 既有 target 點擊
  - `'bom_drilldown'` — BOM row 點開回頭看配方
  - `'company_craft'` — CompanyCraft phase 點擊
  - `'deep_link'` — URL hash 直達
  - `'changelog'` — Changelog 內連結（如果有）
  - `'unknown'` — fallback
- 實作：呼叫 `setRecipe` 的所有 call site 都帶 source；未帶者預設 `'unknown'`（spec：完成本任務後 grep 確認 0 個 unknown）

#### 4.3.2 `simulator_entry_source` 事件

- 觸發：Simulator route 進入時觸發（router beforeEnter / onMounted）
- 參數：`source: 'recipe_auto' | 'manual_nav' | 'queue_jump' | 'share_url' | 'unknown'`
- 推斷：referrer route + URL hash 帶 macro／state

#### 4.3.3 `batch_target_add_method` 參數補進 `batch_add_recipe`

- 既有事件加 `method`：`'search' | 'paste_teamcraft' | 'queue_import' | 'favorite' | 'cross_page_send'`

#### 4.3.4 `page_funnel_drop` 衍生 metric（非新事件，GA Explorations 端拼）

- 不送新事件，靠以下既有事件在 Explorations 拼漏斗：
  - `recipe_select` → 60s 內無 `solver_start` → drop @ recipe
  - `batch_add_recipe` → 5min 內無 `batch_optimization_start` → drop @ batch_prep
  - `bom_calculate` → 5min 內無 (`bom_item_check` | `bom_copy_list` | `bom_send_to_batch` | `aetheryte_tp_copy`) → drop @ bom_post_calc
  - `solver_complete` → 2min 內無 `solver_macro_copy` → drop @ macro_unused
- 不額外實作；本 spec 把這些 funnel 寫入下一份 `ga-analyze.mjs` 報表（§5）

#### 4.3.5 誤用頁面三訊號

| 訊號 | 觸發點 | 參數 |
|---|---|---|
| `page_misuse_hint`（type: `single_recipe_in_batch`） | `batch_optimization_start` 時 `target_count === 1 && total_quantity <= 3` | type, target_count, total_quantity |
| `page_misuse_hint`（type: `large_queue_in_simulator`） | Simulator queue length transitions to ≥5 | type, queue_length |
| `page_misuse_hint`（type: `bom_without_quantity`） | `bom_calculate` 時 `targets.every(t => t.quantity === 1) && targets.length === 1` | type, target_count |

- 抑制：per-session per-type 一次
- 用途：直接餵未來的 in-app 引導 banner（不在本 spec 範圍實作 banner）

#### 4.3.6 `search_no_result` 事件

- 觸發：RecipeSearch 提交後結果為 0 筆
- 參數：`query_length: number`（不傳明文 query — 隱私）、`query_lang_hint: 'cjk' | 'latin' | 'mixed'`（用簡單 regex 判斷）
- 抑制：debounce 1s（避免每次按鍵都送）

#### 4.3.7 `share_link_inbound` event

- 觸發：URL 進站時 hash 帶 recipe／batch／macro state（非空 state）
- 參數：`payload_kind: 'recipe' | 'batch' | 'macro' | 'mixed'`、`referrer_host: string`（GA4 已有，再記一次方便 segment）
- 用途：站外分享 traffic 來源（Discord / 論壇等）

---

### 4.4 效能 / 穩定性

#### 4.4.1 `wasm_load_ms` 事件

- 觸發：worker pool 首次成功載入 WASM
- 參數：`duration_ms`, `worker_count`, `is_cold_start: boolean`
- 用途：production WASM 載入時間（補 BenchPanel 在 dev only 的盲點）

#### 4.4.2 `worker_pool_init_ms` 事件

- 觸發：worker pool 初始化結束
- 參數：`duration_ms`, `worker_count`

#### 4.4.3 `api_failure` 事件（重構既有 universalis_fetch / xivapi 失敗）

- 取代 / 補強既有 `universalis_fetch` 失敗訊號（既有事件不刪，新事件並行 1 個月後 deprecate）
- 觸發：XIVAPI / Universalis 任一 endpoint 失敗
- 參數：`api: 'xivapi' | 'universalis'`, `endpoint: string`（去除 query string）, `status: number`, `retry_count: number`
- 注意：`batch_optimization_failed` 已記 reason，本事件涵蓋更細的 per-request 失敗（不只 batch flow）

#### 4.4.4 `web_vitals` 加 `page_path` 參數

- 改 `src/utils/web-vitals-tracking.ts`，每筆 web_vitals 加當下 `page_path`
- 用途：辨識哪一頁 LCP / INP 差

#### 4.4.5 `time_to_first_action` 事件

- 觸發：session 第一個非自動事件（排除 page_view / session_start / web_vitals）
- 參數：`duration_ms_since_load`, `first_event_name`
- 一次 / session（sessionStorage flag）

---

### 4.5 User properties 擴充

| user_property | 計算 | 更新時機 |
|---|---|---|
| `market_region` | 見 §4.1.1 | App boot、setRegion |
| `endgame_tier` | gearsetsStore 中所有 job 的 `max level` 對應的 patch major（90 → "6.x" Endwalker, 100 → "7.x" Dawntrail, ...）取最高者 | gearset 變動 |
| `device_class` | `navigator.userAgentData.mobile` 或 UA fallback：`'mobile' \| 'tablet' \| 'desktop'` | App boot |
| `viewport_bucket` | `'wide'`（≥1440）/ `'standard'`（1024–1439）/ `'narrow'`（<1024） | App boot + resize debounced 1s |
| `theme_mode` | `'light' \| 'dark'` | App boot + themeStore mutate |
| `pwa_standalone` | `matchMedia('(display-mode: standalone)').matches` | App boot |

實作集中：新檔 `src/utils/user-properties.ts`，export `syncUserProperties()`，由 `main.ts` 在 app mount 後 + 相關 store mutate 時呼叫。

---

## 5. 下一份 GA Report 可擴充項目（brainstorm）

下次跑 `ga-analyze.mjs` 時，可以新增的分析段落（依「ROI 對比實作成本」排序）：

### 5.1 Tier 1（本 spec 直接 enable，必做）

1. **At a glance × market_region**：每個既有 funnel（solver / batch / bom→batch）依 cht / intl 切兩列。**直接解 9.7% 之謎**。
2. **Onboarding milestone funnel**（`2026-05-17` plan enable 後即可）：landing → viewed_recipe → ran_solver → saw_macro → used_batch 各步通過率與 drop-off。
3. **Page funnel drop 表**（§4.3.4）：recipe→solver, batch_add→optimize, bom→消化, solver→macro 四個漏斗，列 drop rate + delta vs 上次 report。
4. **Top recipes 排行**（by `recipe_id` event count），分頁顯示 `recipe_select` vs `solver_start` vs `bom_target_add` — 看「常被看」vs「真的算」vs「真的買」的差距。
5. **Recipe taxonomy 切片**：`rlv_bucket` × event；`is_expert` × solver_complete_rate；`is_collectable` × macro_copy_rate。

### 5.2 Tier 2（資料累積 2 週後）

6. **誤用頁面三訊號報表**（§4.3.5）：每個 misuse type 的觸發頻率 + 受影響 user 數，餵未來引導 banner 的優先序。
7. **`recipe_open_source` 分佈圖**（§4.3.1）：揭露真實入口路徑，可能完全推翻直覺。
8. **`api_failure` × api × endpoint × region**：Universalis 404 是否集中在 intl region 的特定 DC。
9. **`recipe_name_locale_miss` Top 30**：給吐司工坊資料補完優先序清單。
10. **`search_no_result` 趨勢**：是否暴增（資料品質警訊）+ query_lang_hint 分佈。

### 5.3 Tier 3（趨勢 + 異常偵測，6 週後）

11. **Region × time-of-day heatmap**：繁中服 vs 國際服活躍時段差異 → 公告／更新時間決策。
12. **Settings adoption funnel**：cross_server / recursive_pricing / max_recursion_depth 的設定分佈，找預設值是否該改。
13. **Power user cohort**：完成全部 4 milestone 的 user 比例，他們之後是否變 returning。
14. **Web vitals × page_path × device_class**：mobile 上哪頁 LCP poor。
15. **Performance trend**：`wasm_load_ms` p50/p95 across releases — 找 perf regression。
16. **Share link 訊號**：`share_link_inbound` 數量 + referrer_host 排行 — Discord vs 論壇傳遞比重。
17. **Recipe ranking churn**：本期 vs 上期 top recipes 變動（新版本上線後熱門配方轉移）。
18. **Solver retry 教育成效**：`solver_failed` → `solver_input_change_after_fail` → 下一次 `solver_complete` 的 funnel。

### 5.4 報表結構建議

下次 `ga-analyze.mjs` 應拆成多個 region scope：

```
.tmp/ga/
  report.md              # 既有的全域概觀
  report.cht.md          # 繁中服切片（Tier 1.1）
  report.intl.md         # 國際服切片
  report.recipes.md      # Recipe taxonomy 分析（Tier 1.4 / 1.5）
  report.funnel.md       # Onboarding + page funnel drop（Tier 1.2 / 1.3）
```

每個 region scope 跑同一組 query 但加 `dimensionFilter: market_region == X`。

---

## 6. Open questions（決策前需確認）

### 已決議

1. ~~**`market_region` 的繁中判定**~~ → **Resolved 2026-05-19**：繁中字串為 `'zh-TW'` 或 `'TW'`；`'CN'` 是簡中（國服），歸 `'intl'`。實作仍需在第一次跑時 console.log 一次 `getDataCenters()` 驗證大小寫與是否還有其他變體（例如 `'zh-tw'`）。
3. ~~**`page_misuse_hint` 閾值**~~ → **Resolved 2026-05-19**：閾值可能用不到，但「先蒐集起來評估」是正解。**接受 spec 草稿閾值**：
   - `single_recipe_in_batch`：`target_count === 1 && total_quantity <= 3`
   - `large_queue_in_simulator`：queue length ≥ 5
   - `bom_without_quantity`：`targets.length === 1 && targets[0].quantity === 1`
   - 2 週後依分佈調整（不在本 spec 改）
4. ~~**`api_failure` vs `universalis_fetch`**~~ → **Resolved 2026-05-19**：並行 1 個月後 deprecate 舊事件。

### 未決議（建議值，未明確 confirm — 實作前可再確認）

2. **`recipe_name_locale_miss` 觸發點**：是否包含 item（不只 recipe）？建議：item 也送但抑制更嚴（per-session per-id）。
5. **`endgame_tier` 對應**：建議用 patch major（`"7.x"` / `"6.x"`），不細分。
6. **User property 量級**：6 個 + GA 自動 5 個 = 11，遠低於 GA4 25 上限。OK。
7. **`bom_target_add` 命名**：採 verb 命名（`add` 而非 `target_add_set`）。OK。
8. **`recipe_open_source = 'unknown'` 容忍度**：建議 deep link route enter 時主動標 `'deep_link'`，其他 call site 強制標明，`'unknown'` 視為 bug。

---

## 7. 實作占地估算

### 新檔

| 檔案 | 內容 | LOC 估 |
|---|---|---|
| `src/utils/user-properties.ts` | user_property 集中註冊 + market_region 推斷 | ~80 |
| `src/utils/recipe-taxonomy.ts` | Recipe → RecipeTaxonomy 純函式 | ~120 |
| `src/composables/useFunnelMisuseDetector.ts` | 三種誤用訊號 watch + dedupe | ~100 |
| `src/__tests__/utils/user-properties.test.ts` | region 推斷 / 各 property 計算 | ~120 |
| `src/__tests__/utils/recipe-taxonomy.test.ts` | XIVAPI fixture matrix | ~150 |

### 既有檔修改（高層）

| 檔案 | 變更 |
|---|---|
| `src/main.ts` | mount 後呼叫 `syncUserProperties()`、`time_to_first_action` 監聽 |
| `src/stores/recipe.ts` | `setRecipe(recipe, source)` 加 source 參數；補 taxonomy 到 `recipe_select` |
| `src/stores/settings.ts` | `setRegion` 觸發 user_property re-sync；首次設定送 `region_resolution` |
| `src/stores/bom.ts` | `addTarget` 觸發 `bom_target_add`；`bom_calculate` 觸發誤用訊號 |
| `src/stores/batch.ts` | `addRecipe(recipe, method)` 加 method；`optimizationStart` 觸發誤用訊號 |
| `src/stores/simulator.ts` | queue length watcher → 誤用訊號 |
| `src/stores/gearsets.ts` | mutate 後重算 `endgame_tier` |
| `src/stores/theme.ts` | toggle 後 sync `theme_mode` user_property |
| `src/services/local-data-source.ts`（或 i18n 取名處）| recipe／item 名稱回退時送 `recipe_name_locale_miss` |
| `src/components/recipe/RecipeSearch.vue` | `search_no_result` debounce 觸發 |
| `src/router/index.ts` | `simulator_entry_source`, `share_link_inbound` 觸發 |
| `src/solver/worker.ts` | `wasm_load_ms`, `worker_pool_init_ms` 觸發 |
| `src/utils/web-vitals-tracking.ts` | 加 `page_path` 參數 |
| `src/api/universalis.ts` / xivapi | 失敗時送 `api_failure` |
| `scripts/dev/ga-analyze.mjs` | §5.4 結構升級（單獨 PR 或本 spec plan 最後一步） |

---

## 8. 測試策略

延用既有 vitest pattern：

- **新 util 100% 覆蓋**：
  - `user-properties.test.ts`：market_region 推斷邏輯（含 `'unset'` fallback）、endgame_tier 計算、viewport_bucket 邊界值
  - `recipe-taxonomy.test.ts`：每種 craft_kind / category / is_expert 組合 fixture
- **新事件 trackEvent assertion**：選 high-value 點（`bom_target_add`、`page_misuse_hint × 3 types`、`recipe_name_locale_miss`、`search_no_result`）
- **不做 E2E**：trackEvent unit-level + GA Realtime 上線後驗證

---

## 9. 風險與緩解

| 風險 | 緩解 |
|---|---|
| `market_region` 在 user 還沒設 server 之前都是 `'unset'`，新訪客切片失真 | 接受。`'unset'` 在 dashboard 顯式列出，看 onboarding 完成前流失；§4.1.2 的 `region_resolution` 補另一個 angle |
| Recipe taxonomy 從 XIVAPI 取的欄位變動 | `recipe-taxonomy.ts` 集中映射 + fallback 為 `'unknown'`；XIVAPI schema 變動只改一處 |
| 誤用訊號閾值錯，引發太多 hint event | per-session per-type 抑制；spec §6 列為 open question，2 週後依分佈調整 |
| GA4 25 user_properties 限制 | 本 spec 6 個遠未滿；未來新增前盤點 |
| `recipe_name_locale_miss` 量爆掉（XIVAPI 翻譯覆蓋率本來就低） | per-session per-id dedupe + 監看上線後第一週量；若爆，加 sampling（10% 送一次） |
| `api_failure` 與既有 `universalis_fetch` 數據打架 | 並行期 dashboard 用 `api_failure` 為主，舊事件保留供回溯；spec §6 列為 open question 待 user 決定 |
| `share_link_inbound` referrer_host 含 PII（罕見但可能） | 只記 host，去 query string；GA4 default 已遵守此規範 |

---

## 10. Out of scope

- In-app 引導 banner UI（誤用訊號只送事件，banner 設計另立 spec）
- Cross-device user_property 同步
- A/B 測試框架
- 客觀「user satisfaction」評分（NPS / 問卷）
- Discord/論壇 inbound 自動歸因（只記 referrer，不做 attribution）
- `ga-analyze.mjs` 報表的視覺化（保持 markdown 表格）

---

## 11. 上線後驗證清單

打第一個 tag 後 48 小時內：

- [ ] GA4 Realtime 看到所有新事件名（`region_resolution`, `recipe_name_locale_miss`, `bom_target_add`, `page_misuse_hint`, `search_no_result`, `share_link_inbound`, `wasm_load_ms`, `worker_pool_init_ms`, `api_failure`, `time_to_first_action`, `simulator_entry_source`）
- [ ] GA4 User properties 報告看到 6 個新 property 累積值
- [ ] `recipe_select` 看到新增的 taxonomy + source 參數
- [ ] `web_vitals` 看到新加的 `page_path` 參數
- [ ] `recipe_open_source = 'unknown'` 為 0（或極低）

2 週後：

- [ ] 依 §5.1 跑一次 `ga-analyze.mjs` 並驗證 §5.1 五個 Tier 1 切片都有資料

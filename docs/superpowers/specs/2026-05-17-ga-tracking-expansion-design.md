# GA 追蹤擴充 (Tier 1-3)

**日期**：2026-05-17
**狀態**：Design
**範疇**：補齊 BOM/Solver 流程的事件缺口、新增新用戶里程碑漏斗、加入統一設定變更事件。共 12 個新事件 + augment 1 個既有事件。

## Supersedes

部分覆蓋 `docs/superpowers/specs/2026-04-28-ga-dashboard-and-tracking-design.md`：

該 spec 的 Non-goals 明文「不做 macro 匯出追蹤」「不做 settings 追蹤」。本 spec **明確反轉**這兩個決定，依據 2026-05-17 GA Data API 分析（窗口：近 28 天）：

- **BOM → Batch 動線只有 9.7% 轉換**（309 calc → 30 send_to_batch）。原因不明 — 可能 BOM 本身就是終點。需要 BOM 端事件來判定。
- **Solver `complete` 97.2% 成功**，但**有沒有人真的用結果**未追蹤。`complete` 可能是虛高指標。
- **新用戶 70% 不回頭**（1,052 new → 303 returning）。流失節點未知。
- **797 次 `sab_unavailable`** 但不知道是哪些瀏覽器。

## 非目標

- 不設計 SAB unavailable 的 fallback UI — 待另一個 spec
- 不改既有 GA Dashboard 結構（舊 dashboard 仍正確；本 spec 上線後再另外更新）
- 不追蹤 `bom_target_change`、`solver_action_view_ms`、`landed` 等 noise/重複事件
- 不跨裝置同步 onboarding milestone（per-device localStorage 是預期行為）
- 不重構 `BomTotalsBar` / `BomTotalsReceipt` 的 duplicate copy logic — 本 spec 僅打點

## 事件總表

| Tier | 事件 | 新/改 |
|---|---|---|
| 1A | `bom_breakdown_expand`, `bom_item_check`, `bom_copy_list`, `aetheryte_tp_copy` | 新 ×4 |
| 1B | `solver_macro_copy`, `solver_rerun`, `solver_input_change_after_fail` | 新 ×3 |
| 1C | `sab_unavailable` (augment with browser params) | 改 ×1 |
| 2  | `first_session_milestone` | 新 ×1 |
| 3  | `settings_change` | 新 ×1 |

---

## 1. Tier 1A — BOM 端事件（解 9.7% 之謎）

### 1.1 `bom_breakdown_expand`

- **意義**：使用者點開單一物品的「採集細節 / 拆解」面板
- **參數**：
  - `item_id`: number
  - `source`: `'decision_row' | 'route_planner'`
- **Hook point**：
  - `src/components/bom/BomDecisionRow.vue` — expand handler
  - `src/components/bom/RoutePlannerGroupCard.vue` — expand handler
- **抑制**：同 session 同 item 只送一次。實作：模組級 `Set<number>`，page reload 自動清空。不 persist 到 localStorage。

### 1.2 `bom_item_check`

- **意義**：使用者把某項物品打勾「已備齊」— **standalone 用法**的最強訊號（不送 batch，就地完成購物）
- **參數**：
  - `item_id`: number
  - `checked`: boolean
- **Hook point**：`src/stores/bom.ts` 既有的 `toggleChecked(itemId: number)`（檔尾附近）
- **抑制**：無，每次 toggle 都送

### 1.3 `bom_copy_list`

- **意義**：複製清單去外部使用 — 證實 BOM 是終點而非中繼站
- **參數**：
  - `format`: `'teamcraft' | 'markdown'`
  - `target_count`: number — `bomStore.targets.length`
- **Hook point**：
  - `src/components/bom/BomTotalsBar.vue` — `copyTeamcraftUrl`, `copyMaterialsMarkdown`
  - `src/components/bom/BomTotalsReceipt.vue` — 同上兩個函式
- **抑制**：無

### 1.4 `aetheryte_tp_copy`

- **意義**：複製 `/tp <傳送點>` 指令 — **遊戲內動作意圖**最強訊號
- **參數**：
  - `source`: `'bom_detail' | 'zone_map' | 'npc_shop'`
- **Hook point**：
  - `src/components/bom/BomAcquisitionDetail.vue` — `copyTp(aetheryteName)`
  - `src/components/bom/ZoneMapSheet.vue` — `copyTp()`
  - `src/components/batch/NpcShoppingGroup.vue` — `copyTp()`
- **不帶 aetheryteName**：地點分佈分析價值低，且接近 PII-noise
- **抑制**：無

---

## 2. Tier 1B — Solver 結果消化

### 2.1 `solver_macro_copy`

- **意義**：使用者點按巨集區塊複製到剪貼簿 — **真正的「使用結果」訊號**
- **參數**：
  - `macro_index`: number — 第幾段（0-based）
  - `total_macros`: number — 共幾段
  - `action_count`: number — 技能總數，`simStore.actions.length`
  - `wait_time`: number — user 偏好
  - `include_echo`: boolean — user 偏好
- **Hook point**：`src/components/simulator/MacroExport.vue` 既有 `copyMacro(text, index)`
- **抑制**：無

### 2.2 `solver_rerun`

- **意義**：同一份 input 連續 `solver_start` 多次（換 HQ% / 微調試解）— 試錯指標
- **參數**：
  - `run_index`: number — 這次是第幾次跑，從 2 起跳才送（第 1 次是普通 solver_start）
- **Hook point**：`src/solver/worker.ts` 既有 `solver_start` 觸發處（行 190 附近），前面加 input fingerprint 比對
- **Fingerprint 計算**：簡單字串 — `${crafter_level}|${recipe_level}|${craftsmanship}|${control}|${cp}|${hq_target}`
- **狀態**：模組級 `Map<fingerprint, count>`，per-tab session 不 persist
- **抑制**：第 1 次不送，第 2 次起每次都送（帶遞增 run_index）

### 2.3 `solver_input_change_after_fail`

- **意義**：`solver_failed` 後使用者改了什麼欄位 — 教育成效訊號（裝備不夠時是否學到）
- **參數**：
  - `field`: `'crafter_level' | 'craftsmanship' | 'control' | 'cp' | 'recipe' | 'hq_target'`
- **Hook point**：
  - `src/solver/worker.ts`：`solver_failed` 觸發處設一個模組級 `failedAt: number` timestamp
  - 各 input watcher：在改動時檢查 `Date.now() - failedAt < 60_000`，若是則送事件並清 flag
- **實作位置**：watcher 邏輯放在 `src/stores/simulator.ts`（或既有 store 中 input 變動點），引用 worker 模組的 flag 讀取函式
- **抑制**：失敗後第一次改才送，送完清 flag；60 秒後 flag 自動失效

---

## 3. Tier 1C — SAB unavailable enrichment

### 3.1 `sab_unavailable` (augment)

- **既有**：`src/main.ts:55-63`，事件無參數
- **新增參數**：
  - `browser_family`: `'chrome' | 'safari' | 'firefox' | 'edge' | 'other'`
  - `is_in_app_webview`: boolean — UA 含 `FBAN/FBAV/Line/Instagram/MicroMessenger/wv` 等視為 true
  - `ua_short`: string — `navigator.userAgent` 前 100 字
- **新檔**：`src/utils/browser-info.ts` — 純函式，~40 行 + unit test
  - Export `detectBrowserFamily(ua: string)`
  - Export `isInAppWebview(ua: string)`
  - Export `getBrowserInfo()` — combined helper
- **抑制**：沿用既有 sessionStorage 旗標 `ff14ch.sab_unavailable_sent`

---

## 4. Tier 2 — 新用戶首次行為里程碑

### 4.1 `first_session_milestone`

- **意義**：使用者首次達成關鍵節點 — 漏斗破口在哪
- **參數**：
  - `step`: `'viewed_recipe' | 'ran_solver' | 'saw_macro' | 'used_batch'`
- **里程碑定義**（依時間順序）：
  1. `viewed_recipe` — 首次 `recipe_select` 觸發（`src/stores/recipe.ts`）
  2. `ran_solver` — 首次 `solver_start` 觸發（`src/solver/worker.ts`）
  3. `saw_macro` — 首次「MacroExport 顯示出非空巨集」。具體：在 `MacroExport.vue` 觀察 `macros` 由 0 → ≥1 的瞬間（mount 時已 ≥1 也算）
  4. `used_batch` — 首次 `batch_optimization_start` 觸發（`src/views/BatchView.vue`）
- **`landed` 不追蹤**：`page_view` 自動事件已涵蓋
- **狀態 store**：`src/stores/onboarding.ts`（新檔）
  - localStorage key: `ff14ch.onboarding-milestones`
  - JSON shape: `{ viewed_recipe?: number, ran_solver?: number, saw_macro?: number, used_batch?: number }`（timestamp）
  - 對外 API：
    ```ts
    export function markMilestoneOnce(step: Milestone): void
    export function hasMilestone(step: Milestone): boolean
    ```
  - `markMilestoneOnce` 內部 idempotent：已達成的不重送
- **跨裝置**：不同步。每裝置獨立漏斗（YAGNI）
- **舊用戶處理**：本 spec 上線時所有舊用戶 milestone 為空，下次觸發即補。可接受 — 反正本來就要看「未來新用戶」

---

## 5. Tier 3 — 統一設定變更事件

### 5.1 `settings_change`

- **意義**：統一捕捉 settings 變動，未來加新設定不用改 schema
- **參數**：
  - `key`: string — 設定欄位名（snake_case）
  - `value`: string — 字串化後的新值（≤100 字）
  - `prev`: string — 字串化後的舊值（≤100 字）
- **Hook points**（已盤點）：
  - `src/stores/settings.ts` — `region`, `data_center`, `server`, `price_display_mode`, `cross_server`（若存在）等
  - `src/stores/locale.ts` — `setLocale` → `key: 'language'`
- **實作策略**：
  - 採**顯式 per-setter trackEvent**（與既有 `theme_change` / `bom_*_set` 同 pattern，便於 grep / 維護）
  - 共用 helper：`emitSettingsChange(key, prev, next)`，內部 stringify + 截 100 字 + trackEvent
  - 不用 Pinia `$subscribe` — 會送出無意義的內部 state 改動
- **舊事件保留**（不重複）：
  - `theme_change` — 不送 `settings_change`
  - `bom_acquisition_mode_set`, `bom_target_default_set`, `bom_route_optimize_set` — 不送 `settings_change`
  - 理由：既有 dashboard 已依賴；新增不替換
- **不送 init**：載入時讀 localStorage 還原不送事件；僅 user 主動改才送
- **Stringify 規則**：
  - boolean → `'true'` / `'false'`
  - number → `String(n)`
  - 物件/陣列 → `JSON.stringify` 後截斷 100 字
  - null/undefined → `''`

---

## 6. 整體實作占地

### 新檔

| 檔案 | 內容 | LOC 估 |
|---|---|---|
| `src/utils/browser-info.ts` | UA → family + in-app webview 偵測 | ~50 |
| `src/utils/browser-info.test.ts` | UA fixtures | ~80 |
| `src/stores/onboarding.ts` | milestone state + persistence | ~40 |
| `src/stores/onboarding.test.ts` | idempotent / replay | ~60 |

### 既有檔修改

| 檔案 | 變更 |
|---|---|
| `src/main.ts` | `sab_unavailable` 帶 browser_info |
| `src/stores/bom.ts` | `toggleChecked` 末尾 trackEvent |
| `src/stores/settings.ts` | 加 settings_change emit（per setter or `$subscribe`） |
| `src/stores/locale.ts` | `setLocale` 末尾 trackEvent |
| `src/stores/recipe.ts` | `recipe_select` 末尾 `markMilestoneOnce('viewed_recipe')` |
| `src/solver/worker.ts` | rerun fingerprint counter; post-fail flag; `markMilestoneOnce('ran_solver')` |
| `src/views/BatchView.vue` | `markMilestoneOnce('used_batch')` |
| `src/components/bom/BomDecisionRow.vue` | expand handler 加 trackEvent + Set 去重 |
| `src/components/bom/RoutePlannerGroupCard.vue` | 同上 |
| `src/components/bom/BomTotalsBar.vue` | copy handlers 加 trackEvent |
| `src/components/bom/BomTotalsReceipt.vue` | 同上 |
| `src/components/bom/BomAcquisitionDetail.vue` | `copyTp` 加 trackEvent |
| `src/components/bom/ZoneMapSheet.vue` | 同上 |
| `src/components/batch/NpcShoppingGroup.vue` | 同上 |
| `src/components/simulator/MacroExport.vue` | `copyMacro` 加 trackEvent + `markMilestoneOnce('saw_macro')` |
| `src/stores/simulator.ts` | input watcher → post-fail event（協作 worker 模組） |

---

## 7. 測試策略

延用既有 vitest pattern（`src/__tests__/...`）：

- **新 util / store 100% 覆蓋**：
  - `browser-info.test.ts`：Chrome / Safari / Firefox / Edge / Line / FB / Instagram / WeChat / iOS WKWebView 等 UA fixtures
  - `onboarding.test.ts`：`markMilestoneOnce` 第二次不觸發、persistence 跨 reload
- **既有檔加新 trackEvent assertion**：選 high-value 點各加一個（`bom_item_check`、`solver_macro_copy`、`first_session_milestone` from `recipe_select`）
- **不做 E2E**：trackEvent unit-level 覆蓋夠用，GA 端有實際資料 ~1 週可二次驗證

---

## 8. Dashboard 衝擊

不需立刻改 GA Dashboard（舊 dashboard 仍正確）。本 spec 上線後 ~2 週可在 GA4 Explorations 新建：

- **BOM Funnel**：`bom_calculate` → `bom_breakdown_expand` → (`bom_item_check` OR `bom_copy_list` OR `bom_send_to_batch` OR `aetheryte_tp_copy`)
- **Solver Usage Funnel**：`solver_start` → `solver_complete` → `solver_macro_copy`
- **Onboarding Funnel**：`first_session_milestone` 各 step（filter newUsers）
- **Settings Heat**：`customEvent:key` 切片 sort by count

更新 GA dashboard 不在本 spec 範圍。

---

## 9. 風險與緩解

| 風險 | 緩解 |
|---|---|
| `solver_rerun` fingerprint 邊界錯誤導致誤判 | 用最小可重現欄位（不含時間戳），同 input 必然相同 fingerprint；單元測試 cover |
| `solver_input_change_after_fail` 抖動 | 60s 窗口 + 送一次即清 flag；不會連續送 |
| `bom_breakdown_expand` 重複觸發 | session-scoped Set 去重 |
| `settings_change` value 太長被 GA truncate | 顯式截 100 字（GA4 param 上限），避免後端 silent drop |
| onboarding localStorage 壞掉 | try/catch + 失敗時 fallback 為「未達成」狀態，事件照送（最壞情況：重複事件，但 idempotent 邏輯靠 in-memory cache 仍有效） |
| `sab_unavailable` 既有 dashboard 預期無參數 | GA4 新增參數是 additive，舊報表照常運作；新參數需手動建 custom dimension 才能切片 |

---

## 10. 上線後驗證清單

打第一個 tag 後 48 小時內檢查：

- [ ] GA4 即時報告（Realtime → Events）可看到新事件名
- [ ] 各事件的 `eventCount` 量級合理（不為 0、不爆炸）
- [ ] `first_session_milestone` 每 user 同 step 最多 1 次（用 GA Explorations 驗證）
- [ ] `settings_change` 的 `customEvent:key` 切片有預期欄位
- [ ] `sab_unavailable` 的 `customEvent:browser_family` 開始累積（量會慢，給 1 週）

---

## 11. Out of Scope（明文）

- SAB unavailable fallback UI 設計
- GA Dashboard 結構更新
- `bom_target_change` / `solver_action_view_ms` / `landed` 等已 YAGNI 事件
- 跨裝置 onboarding 同步
- BOM Totals duplicate copy logic 重構
- A/B 測試框架

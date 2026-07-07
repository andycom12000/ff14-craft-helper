# Batch / Simulator 效能與等待體驗改造

**Date:** 2026-07-07
**Status:** Design — approved, ready for implementation planning
**Predecessors:**
- `docs/superpowers/specs/2026-05-12-batch-perf-next-sprints-design.md`（Sprint 0-3 已完成；Tier A1/B2/B6 為本 spec 主體）
- `docs/superpowers/specs/2026-05-12-rayon-contention-investigation-design.md`（方向 A 已落地，threads = hwc / POOL_SIZE）
- `docs/adr/0002-meld-advisor-bounded-solver-search.md`（鑲嵌建議有界搜尋，solve 次數數十次/run 的成本背景）

---

## 1. 需求與約束

使用者目標：「提升目前花費過久時間模擬的 batch / simulator 效率，並追求更佳且更豐富的模擬體驗」。需求釐清結論：

1. **全部路徑都嫌慢**——batch 全程、單件 solver 等待、鑲嵌建議等待。
2. **總完成時間優先**——吞吐（wall-clock）比感知延遲更重要，但兩者都做。
3. **體驗方向 = 先把等待體驗做好**——進度、取消、失敗說明；不加逐步重播/what-if 比較等大功能。
4. **解必須最佳**——不接受任何「用解品質換速度」的手段。因此 Tier B1（quality-threshold early stop）**明確排除**；Sprint 2 系 HQ prefilter（strict probe 已兩度失敗，見 batch-perf-next-sprints §7.5.8）不在本 spec 範圍。

## 2. 現況事實（探索結論）

- Worker pool：`POOL_SIZE = 2` 寫死（`src/solver/pool-config.ts:5`），rayon threads = `max(1, floor(hwc / POOL_SIZE))`，contention 已解（`b35bd43`，1.59-1.76× 驗證）。
- **求解結果零快取**：相同 config 跨重跑、跨 phase 全部重解。唯一例外是 meld-advisor 單次 run 內的 probe cache。
- **Phase 6 鑲嵌建議逐 job 序列**（`src/services/batch-optimizer.ts:719`），advisor 內部階梯本質序列，但 job 間獨立。
- **Buff 推薦內層 recipes 迴圈純序列**（`src/services/buff-recommender.ts:282-293`）；外層 combo cheapest-first 有「最便宜先贏」語意，不可亂序。
- **Phase 1 主求解無 per-solve deadline**：病態配方可無限占用 slot（meld advisor 曾觀測 >3min），只能整批取消。8s deadline 只存在於 meld-advisor（#151）。
- **取消成本高**：`cancelRequest` 走 terminate + respawn；單件頁 `SolverPanel` 的取消更是呼叫 `cancelSolve()` 砍掉整個 pool（`src/solver/worker.ts:407` 附近），誤殺並行中的 ride-along 工作。
- **Batch 結果一次性揭露**：`batchStore.results` 只在整條 pipeline 結束才賦值（`src/views/BatchView.vue:274` 附近），過程中只有聚合進度條。
- **進度是估計值**：單件進度由節點數飽和曲線換算（`PROGRESS_HALF_LIFE_NODES = 100_000`）；batch 進度是 phase 加權區間。
- Upstream pin `aafcbb0`（2026-05-10）；HEAD（0.28.4+，2026-06-23）落後 14 commits，含 **#353 strict quality 正確性修正**、Stellar Steady Hand / Expedience 修正、7.51 與國際版 7.15 資料。無大型 solver perf 提交。
- Open issue **#162**：鑲嵌建議計算中要有進度顯示（非只有長等待文字）。

## 3. 成功指標

| 指標 | 現況 | 目標 | 量法 |
|---|---|---|---|
| 重跑同一批次 Phase 1 | 全部重解（ds3 ≈ 22s+） | 快取全命中 ≈ 0s | BenchPanel 同 dataset 連跑兩次 |
| 多職業 meld-on 批次 Phase 6 | 逐 job 序列 | ≥ 40% 縮短 | 多職業 dataset、meldAdvice on、前後對比 |
| 首個 job 結果可見 | pipeline 全部結束 | ≈ 單件 solve 時間（3-12s） | 瀏覽器實測 |
| 單件取消 | 砍全 pool | 只取消該請求 | 單元測試 + 實測 |
| 病態配方 | 無限占用 slot | deadline 後轉 per-item 例外 | 單元測試（假 solver）|
| POOL_SIZE 實驗 | 寫死 2 | 中位數 ≥15% 改善才 ship | BenchPanel pool=2/3/4 × 3 dataset |

效能宣稱一律附 BenchPanel CSV（`.tmp/bench/`）。CLI native bench 只作相對行為對照，絕對數字不當目標（CLAUDE.md 規範）。

## 4. 期一（純前端層，3 個 PR）

### PR-1 · Solve result cache（Tier A1）

**位置**：`src/solver/worker.ts` 的 `solveCraft` 外包一層 cache 模組（新檔 `src/solver/solve-cache.ts`），覆蓋所有 caller（batch Phase 1、buff 推薦、self-craft、meld advisor probes、單件頁）。

- **Key**：完整 `SolverConfig` 依 key 排序後 JSON 序列化 + `SOLVER_CACHE_EPOCH` 常數。序列化整個 config 而非挑欄位，從結構上排除漏欄位風險。
- **`SOLVER_CACHE_EPOCH`**：字串常數（放 `pool-config.ts`），值含 upstream rev（如 `aafcbb0-1`）。WASM rebuild 時必須 bump——寫進 CLAUDE.md「WASM Build」小節的檢查清單。
- **儲存**：記憶體 Map（第一層）+ IndexedDB 持久化（第二層，LRU 上限 500 筆）。IndexedDB 讀寫失敗一律靜默降級為直接求解，不阻塞。
- **In-flight coalescing**：相同 key 的併發請求共用同一個 promise。
- **NoSolution 也快取**（同樣昂貴且確定性）；`SolveCancelledError` / deadline 超時**不**快取。
- **快取的是「當時解出的結果」**：raphael 多執行緒搜尋在不同 thread 數下可能回不同但同品質的最佳解，cache 回放其中一個合法解，不構成品質妥協。
- **BenchPanel**：跑分一律 bypass cache，另加「清除快取」鈕；`[bperf]` log 加 `cache=hit|miss` 欄。
- **simulate / simulate-detail 不快取**（毫秒級，不值得）。

**實測（2026-07-07，branch `perf/solve-result-cache`，hwc=20）**：同 config `optimizeRecipe` 第一次 1012ms → 第二次 6ms（記憶體 hit）；整頁 reload 後 77ms（IndexedDB hit，`[bperf] ... cache=hit`）；清除快取後回到 1088ms 真實重解。BenchPanel dataset-1 連跑兩次 3292ms / 3169ms（bypass 生效、全 `cache=miss`）。成功指標第 1 條「重跑 Phase 1 ≈ 0s」達成。

### PR-2 · 序列迴圈並行化

- **Phase 6**：`for (job of recipesByJob)` 改 `Promise.allSettled`（每 job 一個 `adviseMeld`，pool 自然節流）。進度 `meldJobsDone` 改各 job 完成時遞增。單一 job 失敗不拖垮其他 job（settled 語意）。
- **Buff 推薦內層**：`allCandidateRecipes` 的 simulate→solve 迴圈改並行（`Promise.all`）。外層 combo cheapest-first 序列**不動**，保住「最便宜先贏」語意。
- `isCancelled` 檢查保留在各 task 開頭；取消行為不變。

**實測（2026-07-07，branch `perf/parallelize-batch-loops`，hwc=20，dataset-3 配方 + Boundary lv100 gearset，cache bypass）**：等成本重配對（6118 + 5663，單解各 ~2.5s）串行 5056ms → 並行 2734ms（**−46%**，≥40% 判準達成；並行 wall 貼近 max=2540ms 的理論下限）。混合成本對（5827 + 6118，927ms/2482ms）串行 3409ms → 並行 2713/2529ms（−20~26%；此組理論天花板即 1−max/sum=−27%，實測貼頂）。量測法：Vite dev 模組直呼 `optimizeRecipe`×2 串行 vs `Promise.all`，warmup 後計時——與 Phase 6 per-job `adviseMeld` 並行同一機制（2-slot pool 從單槽序列改雙槽滿載）；迴圈層併發由單元測試 `maxInFlight` 斷言鎖住。

### PR-3 · 漸進式結果與等待體驗（Tier B2 + #162）

- **Per-target 即時狀態**：`runBatchOptimization` 增加 optional callback `onTargetUpdate(index, status)`，status ∈ 排隊中 / 求解中（含 %）/ 完成（含步數、HQ 與否、wasmDur）/ 失敗（含原因）。batch store 加 `liveTargets`，run 結束清空。
- **BatchProgress 升級**：單一聚合條 → 「已完成 x/N」誠實計數 + per-job 狀態列表；job 解完立刻顯示手法摘要。最終 `results` 賦值合約**不變**（風險最小化——漸進揭露是 additive UI，不重構 BatchResults）。
- **#162 鑲嵌建議進度**：`adviseMeld` 加 optional `onProgress`（階梯 rung i/N、probe 計數），單件 `MeldAdvisorCard` 與 batch 的 meld phase 都顯示。
- **單件取消修正**：`SolverPanel` 的 `handleCancel` 改走既有 per-request AbortSignal（#151 已鋪好的 plumbing），不再 `cancelSolve()` 砍全 pool。

**已實作與驗證（2026-07-07，branch `feat/progressive-batch-experience`）**：per-target 狀態 done/failed 改為各 target settle 時即時發射（分類 helper 單一來源，exceptions/recipeResults 順序不變）；quick-buy 模式不 seed 列表；`liveTargetNames` 快照防中途編輯佇列錯位。#162 的 done 狀態暫不含 wasmDur（步數 + 雙滿與否已足）。Phase 6 進度分數化（`meldJobsDone + Σ probes/probeBudget`，完成 tick 走 smoothed emit 保單調）修掉 PR-2 record 的「≤POOL_SIZE job 0/N 凍結」。一併關掉 PR-1/PR-2 review 的三個 solve-cache 取消缺陷：leader 取消時存活 follower takeover 重跑一次、lookup await 後補 signal 再檢查、follower/leader-store 路徑 actions 防禦性複製。瀏覽器實測（isolated profile、console 灌 store）：live 列表混合狀態即時更新（「已完成 1/2·完成 12 步·求解中 5%」）、成功與失敗路徑 liveTargets 均清空、meld completed 取樣單調含小數（0→0.005→1.005→1.01→2）、單件取消即時、advisor 計數器「探測 x/198」live 更新；截圖存 `.tmp/screenshots/pr3-*.png`。

## 5. 期二（solver 深化層，3 個 PR，每項 bench-gated）

### PR-4 · Upstream bump（`aafcbb0` → 0.28.4+ HEAD）

期二**最先做**——`#353` 修 strict quality「宣稱達標卻沒達標」正確性 bug（我們的 HQ 可行性 probe 與鑲嵌 double-max 判定走 strict 路徑），另含遊戲資料更新。流程照 CLAUDE.md：rebuild WASM + `npm run patch-wasm` + bump `SOLVER_CACHE_EPOCH`，`bench:solver` + BenchPanel 三 dataset 對拍（action sequence 允許微幅 churn，wall 不得退步 >5%）。

### PR-5 · interrupt_signal（Tier B6）+ Phase-1 deadline

- **Wrapper**：`raphael-wasm-wrapper` 暴露 interrupt flag（`AtomicFlag::as_ptr` → offset），solve 入口接收 flag 指標；raphael 搜尋中檢查 flag → 回 `Interrupted`。
- **JS**：worker 啟動 solve 前把 `{memory, flagPtr}` 回報主執行緒；取消 = 主執行緒 `Atomics.store` 直寫（memory 本來就是 SharedArrayBuffer）。Worker 存活、不 respawn，收到 Interrupted 後正常 post 結果並接下一個 task。
- **Fallback**：interrupt 寫入後 2 秒仍未返回 → 退回既有 terminate + respawn 路徑（保底）。
- **Phase-1 per-solve deadline**：預設 60s 常數（`DEFAULT_BATCH_SOLVE_DEADLINE_MS`），超時 → per-item「求解超時」例外（`BatchException` 新 type），UI 提供該 item 重試；不再讓一個配方拖死整批。deadline 靠 interrupt flag 實作，成本近零。

### PR-6 · POOL_SIZE 自適應（bench-gated）

- **先加實驗桿**：BenchPanel 支援 `?bench=1&pool=N` override（僅 bench route 生效，production 不吃）。
- **A/B protocol**：20 核機器跑 pool=2/3/4 × dataset-1/2/3，另抽測 meld-on 情境；記錄 wall、per-recipe wasmDur、多 WASM instance 的記憶體開銷。
- **Ship gate**：三 dataset 中位數改善 ≥15% 且無單一 dataset 退步 >5%，才 ship 自適應公式（形如 `hwc ≥ 16 → 4；hwc ≥ 12 → 3；否則 2`，threads = `floor(hwc / POOL_SIZE)` 不變式維持）。低核機器行為不變。
- **數據不過關就 close**，實測數據記回本 spec（比照 §7.5.8 前例；「零收益基礎建設不進 main」）。

## 6. 明確排除（Non-Goals）

- Tier B1 quality-threshold early stop——犧牲解最佳性，使用者已否決。
- Sprint 2 系 HQ feasibility prefilter 重啟——需先有 strict-vs-lenient A/B 數據（§7.5.8 重啟條件），本 spec 不碰。
- 逐步重播 scrubber、what-if 比較、saved rotations——體驗方向已定為「等待體驗」，這些留待未來。
- `backload_progress` / `adversarial` 預設變更——影響解的形態。
- 重構 `BatchResults` 合約——漸進揭露以 additive callback 實作。

## 7. 測試與驗證

- 每 PR 四項全跑：`npm run type-check` / lint / `npm test` / `npm run build`（workflow agent 綠燈不算數，主 session 重驗）。
- PR-1：cache key 穩定性（欄位順序無關）、epoch 失效、LRU 淘汰、coalescing、IndexedDB 失敗降級、NoSolution 快取、取消不快取。
- PR-2：既有 batch-optimizer / buff-recommender 測試守語意；新增「job 間並行、單 job 失敗隔離」測試。
- PR-3：liveTargets 狀態流轉、取消中途的清理、MeldAdvisorCard 進度渲染；瀏覽器實測（chrome-devtools MCP）走 verify-by-ui 流程。
- PR-5：假 solver 的 deadline 觸發、interrupt fallback、worker 存活重用。
- 效能驗證一律 BenchPanel CSV 前後對比，存 `.tmp/bench/`。

## 8. 風險與回退

| 風險 | 緩解 | 回退 |
|---|---|---|
| Cache key 漏欄位回舊解 | 整 config 序列化 + epoch；單元測試鎖 key 生成 | 清 IndexedDB store + 關閉 cache 層（單點 flag）|
| Epoch 忘 bump | CLAUDE.md build 檢查清單 + PR-4 實際演練 | 同上 |
| 並行化改變 buff 推薦結果 | 只並行無語意內層；外層順序不動；測試鎖行為 | revert 單一 PR |
| interrupt_signal 平台差異 | terminate + respawn fallback 常駐 | flag 關閉走舊路徑 |
| POOL_SIZE regression 重演 | bench gate（≥15% / 無 >5% 退步）；rayon 不變式 `threads × pool ≤ hwc` | 不 ship，僅留數據 |
| 漸進 UI 與最終結果不一致 | 最終 `results` 合約不變，live 狀態 run 結束即清空 | revert PR-3 UI 層 |

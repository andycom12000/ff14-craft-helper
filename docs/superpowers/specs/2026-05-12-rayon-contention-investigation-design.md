# Solver Worker Pool — Rayon Contention Investigation

**Date:** 2026-05-12
**Scope:** `src/solver/worker.ts`, `raphael-wasm-wrapper/` (Rust side)
**Goal:** 釐清 2-worker pool 在某些 dataset 上 regression 的根因，制定可行的修正方向。
**Status:** Investigation / Design — not yet implementation-ready

---

## 1. 問題陳述

`docs/superpowers/specs/2026-05-12-self-craft-validation-perf-design.md` 引入的 2-worker pool（commit `ecbeb1d`）在 batch optimization 上經實測表現極不穩定：

| Dataset | Recipes | Baseline | PR 4 (pool) | 加速比 |
| ------- | ------: | -------: | ----------: | -----: |
| 1 (lv94-99 軍需品) |       6 |  134.8 s |      65.7 s | **2.05×** |
| 2 (含 3× lv100)    |       7 |  100.1 s |      85.4 s | **1.17×** |
| 3 (混合 lv53-100)  |       8 |  113.9 s |     175.8 s | **0.65× (regression)** |

Dataset 3 上 PR 4 比 baseline 慢 62 秒（+54%）。**這違反了原 spec 的核心承諾**（pool 給 1.5–2× 加速）。

完整 benchmark 記錄與視覺化：`.tmp/scratch/perf-benchmarks.md` 與 `.tmp/scratch/benchmarks-visualization.html`

## 2. Root Cause 假設

### 2.1 主要假設：Rayon CPU 競爭

raphael-rs 的 `MacroSolver` 內部用 [rayon](https://github.com/rayon-rs/rayon) 做平行搜尋。每個 Web Worker 各自實例化一個 WASM module，每個 module 各自開一組 rayon thread pool，**預設 thread 數 = CPU core 數**（透過 `wasm-bindgen-rayon` 自動配置）。

當 2 個 Web Worker 同時跑時：
- Worker A 的 rayon: 8 個 thread（假設 8-core CPU）
- Worker B 的 rayon: 8 個 thread
- 系統共 **16 個 thread 競爭 8 個 core**
- 後果：cache thrashing、scheduling overhead、context switches → 每個 solve 變慢 1.5–3×

### 2.2 為什麼 dataset 表現差異這麼大？

Solver 搜尋空間大小受 recipe 等級、stat 餘量、quality target 影響。**heavy solves（lv100、stat 緊繃）會強烈使用 rayon 平行**，這時 contention 最嚴重。

- Dataset 1：6 recipes，多數 lv94-99，stat 寬鬆 → 個別 solve 較輕（7-19s）→ contention 中度 → 仍能 2× 加速
- Dataset 2：7 recipes，3 個 lv100 → 個別 solve 重（11-12s）→ contention 較重 → 1.17× 加速（已接近 break-even）
- Dataset 3：8 recipes，2 個 lv100 + 1 個 lv99 + 多個 lv94-97 → 多個 heavy solve **同時** 跑 → contention 主導 → 反向 regression

關鍵假設：當 **2 個 worker 同時跑都很 heavy 的 solve** 時，contention 損失超過 parallelism gain。

### 2.3 證據鏈

- **數據可重現**：3 個獨立 dataset 各跑 1 次，趨勢清楚（regression 不是 noise）
- **Wall clock 分析**：
  - Dataset 3 baseline serial total = 65.6 s
  - 完美 2× pool 應該 = 32.8 s wall
  - 實測 PR 4 wall = 92.0 s → **2.8× slower than ideal**，也是 **1.4× slower than serial baseline**
- **Per-solve timer artifact**：PR 4 所有 solve dur 都報 ~85s（microtask 從 t=0 開始計時、await 等到 pool 處理完）。這純粹是計時方式，不是真正 per-solve 時間。實際 per-solve 時間需從 worker 內部量。

## 3. 待調查項

### 3.1 Rayon thread 數的實際配置

`wasm-bindgen-rayon` 的 thread 數可透過 `initThreadPool(N)` 設定。需確認：
- 目前 wrapper 是否呼叫 `initThreadPool`，數值是多少
- 若是預設 `navigator.hardwareConcurrency`，2 個 worker 各拿全部 core 就是 contention 的直接原因
- 是否可在 wrapper 暴露 API 讓 JS 端控制每個 worker 的 thread 數

預期實作位置：`raphael-wasm-wrapper/src/lib.rs`

### 3.2 raphael-solver 的內部單核時間

需在 wasm wrapper 內側加 `performance.now()`-equivalent 計時，量到「solver 從 receive job 到 post result」的真實時間。配上目前 JS 端的「promise creation → resolution」對比，可分離出：
- 在 queue 等待時間
- 真實 worker 計算時間
- Contention 造成的減慢倍率

### 3.3 不同 CPU core 數的表現

目前測試環境是 Windows 11（8/16 cores？需確認）。低核心數機器（4 cores）上 contention 更嚴重；高核心數機器（16+ cores）可能仍正收益。需要至少在 4-core / 8-core / 16-core 三個級距測試。

## 4. 設計方向（互斥選項）

### 方向 A · 限制 rayon thread 數

在 `wasm-bindgen-rayon` 初始化時把每個 worker 的 thread 數限制為 `navigator.hardwareConcurrency / POOL_SIZE`。例：8-core CPU + pool=2 → 每個 worker 用 4 thread。

**優點**：
- 解決 contention 根因
- 保留 2× wall-clock parallelism

**缺點**：
- 改動 Rust wrapper，需重 build WASM
- 單 worker 跑 heavy solve 時也吃不到全部 core（trade-off：parallelism vs single-run speed）

**Open questions**：
- 是否能在 runtime 動態調整 thread 數，或只能 init 時定死？
- 若 navigator.hardwareConcurrency = 4，POOL_SIZE = 2，每 worker 2 thread —— solver 還會吃滿嗎？

### 方向 B · Pool size 回退到 1

放棄 worker parallelism，但保留 `Promise.all` 在 Phase 4.6（buff vs self-craft）讓「不同類型」工作重疊（network / 算術 / simulate 跟 solve 同時跑）。

**優點**：
- 改動最小（一行：`POOL_SIZE = 1`）
- 完全消除 contention
- 仍然有 Phase 4.6 內部的小幅 parallelism（網路工作 + algorithm + simulate 與 solve 並行）

**缺點**：
- 失去 Phase 1 並行（在 contention 不嚴重的 dataset 1 上 dataset 加速 2× 也沒了）
- Dataset 1 上會從 65.7s 變回約 100s

### 方向 C · 動態 pool size（最複雜）

依 recipe 預估「heavy / light」決定排程：
- 連續 light solves（lv ≤ 80）→ 用 pool=2
- 出現 heavy solve（lv 90+，stat 緊繃）→ 退回 pool=1 直到 heavy solve 完
- 或：限制「同時跑 heavy solve 的 worker 數」

**優點**：所有 dataset 都拿到正收益
**缺點**：實作複雜、需 heuristic 校準、debug 難度高

### 方向 D · 接受現況 + 提供使用者開關

UI 增加「啟用平行 solver（實驗中）」switch，預設關閉（pool=1 安全）。專家使用者可開啟 pool=2 自行承擔風險。

**優點**：零實作風險
**缺點**：把問題推給使用者；UI 增加負擔

## 5. 建議優先順序

| 優先 | 方向 | 預期收益 | 風險 | 工作量 |
| ---: | --- | --- | --- | --- |
|   1️⃣ | A · 限制 rayon thread | 高（解根因）| 中（要改 Rust）| 中-高 |
|   2️⃣ | B · Pool=1 | 退回安全值 | 低 | 極低 |
|   3️⃣ | C · 動態 pool | 最高 | 高 | 高 |
|   4️⃣ | D · 使用者開關 | 低 | 低 | 中（UI）|

**短期建議**：方向 B 作為立即補丁（避免任何使用者吃到 regression），方向 A 作為下一份 spec 的目標。

## 6. 待釐清決策

1. **是否要立刻把 pool size 改回 1？**（保 dataset 1 的 2× 收益 vs 不冒 dataset 3 regression 的風險）
2. **是否要把 PR 4 整段 merge？**（pool size + 並行 Promise.all 都在裡面）
3. **rayon thread 限制誰來實作？**（需要 Rust 經驗 + wasm-pack 環境）
4. **如何收集多機器的 benchmark 數據？**（CI runners / 使用者自願回報 / 內部測試組）

## 7. 不在此 spec 範圍

- 實際實作（限本 spec 為 investigation/design）
- 修改 raphael-rs upstream（會牽涉 maintain fork 的問題）
- WASM debug tooling（Chrome DevTools 對 WASM 的 profiling 限制大）

## 8. 參考資料

- 主 spec：`docs/superpowers/specs/2026-05-12-self-craft-validation-perf-design.md`
- 主 plan：`docs/superpowers/plans/2026-05-12-self-craft-validation-perf.md`
- Benchmark 報告：`.tmp/scratch/perf-benchmarks.md`
- 視覺化：`.tmp/scratch/benchmarks-visualization.html`
- 相關 PR 提交：
  - `ecbeb1d` feat(solver): 2-slot worker pool with FIFO queue
  - `88d76d3` fix(solver): handle worker crash via onerror listener
  - `dd0e5d0` perf(batch): parallelize Phase 1 recipe solver loop
  - `0d0ff30` perf(batch): parallelize self-craft candidate validation loop
- wasm-bindgen-rayon docs：https://github.com/RReverser/wasm-bindgen-rayon

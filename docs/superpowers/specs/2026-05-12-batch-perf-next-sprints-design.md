# Batch Performance — Next Sprints (Sprint 0–3)

**Date:** 2026-05-12
**Branch (target):** `perf/self-craft-validation` 的 follow-up（每個 sprint 各自 PR）
**Status:** Design — ready for implementation planning
**Predecessors:**
- `docs/superpowers/specs/2026-05-12-self-craft-validation-perf-design.md`（已完成）
- `docs/superpowers/specs/2026-05-12-rayon-contention-investigation-design.md`（investigation）

---

## 1. Context

PR 1–4 完工後跑 3 個 dataset 得到 2.05× / 1.17× / **0.65×（regression）** mixed result。Investigation spec 已定位 root cause 為 rayon CPU contention（每個 Web Worker 內側 `init_threads(navigator.hardwareConcurrency)` 把全部 core 都吃了）。

關鍵發現：

- **`init_threads` API 已暴露**：`raphael-wasm-wrapper/src/lib.rs:14` 已 export，`solver-worker.ts:24` 傳全 core 數。修正是 JS 端一行
- 96% 時間在 solver — 所有優化路徑只有「加快每個 solve」或「少呼叫 solver」兩條
- **HQ-unachievable 配方是金礦** — 3 個 dataset 共浪費 ~93s 跑完才回 NoSolution（Dataset 2 上佔 40.5s）
- PR 2 hand-rolled HQ prefilter 在 3 個 real dataset 上 **0 命中**（係數太寬鬆）
- Phase 1 per-recipe timer 是 microtask artifact，所有 recipe 報同一個 wall clock

## 2. Goals

| Sprint | 目標 | Exit criterion |
|---|---|---|
| **Sprint 0** | 升 raphael-rs 到 upstream HEAD，吃下 upstream 已實作的 solver 優化 | 3 dataset 重跑後解時間 ≤ Sprint pre-baseline；test suite 全綠 |
| **Sprint 1** | 解 rayon contention，dataset 3 不再 regression | Dataset 3 ≤ Sprint 0 baseline（理想 ≤ 90s）|
| **Sprint 2** | Phase 1 HQ feasibility check，砍 unachievable 配方的 solver 時間 | Dataset 2 ≤ Sprint 0/1 baseline 的 70% |
| **Sprint 3** | 真實 per-solve timer，建立觀測能力 | 報告中能看到每個 recipe 的 wasm-internal solve duration |

## 3. Non-Goals

- 修改 raphael-rs upstream 或 fork（**wrapper 內加新 config field 允許**，視 sprint 需要）
- 重寫 worker pool 架構（保留 POOL_SIZE = 2）
- UI 改造（progress bar / progressive results 留給後續 sprint）

## 4. raphael-rs API Audit

研讀 raphael-rs source 後得到幾個重要事實，整合到下面三節。

### 4.1 `MacroSolver::solve` 4 階段都用 rayon

```
FinishSolver::precompute     ← par_iter_mut
QualityUbSolver::precompute  ← par_iter_mut
StepLbSolver::precompute     ← par_iter_mut
do_solve 主搜尋              ← into_par_iter on batch
```

Sprint 1 的 thread limit 會**同時影響全部 4 階段**——好消息（contention 一次解掉），但小型 recipe 的 precompute 可能略變慢（單 thread overhead）。Sprint 3 的 per-solve timer 應能歸因到這層。

### 4.2 我們忽略的 raphael-rs API

逐項 audit pub export 後，發現 wrapper **完全沒用到** 的優化掛載點：

| API | 目前傳/設定值 | 可用途 |
|---|---|---|
| `MacroSolver` 的 `solution_callback` | `Box::new(\|_\| {})` no-op | Solver 找到每個更好解就 call 一次。串回 JS 做 quality-threshold early stop（Tier B1）|
| `MacroSolver` 的 `progress_callback` | `Box::new(\|_\| {})` no-op | 帶 `processed_nodes: usize`。取代 solver-worker.ts 假的 10%/30%/90% progress（Tier A4）|
| `MacroSolver` 的 `interrupt_signal` | `AtomicFlag::new()` 從未 set | (a) cancel-mid-solve 不用 terminate worker（B6）；(b) 配合 `solution_callback` 做 early stop（B1）|
| `MacroSolver::runtime_stats()` | 沒呼叫 | `inserted_nodes/processed_nodes` + 3 個 sub-solver stats，給 Sprint 3 timer 加 attribution |
| `SolverSettings.allow_non_max_quality_solutions` | 永遠 `true` | **設 `false` = raphael 內建 HQ feasibility check**（Sprint 2 的核心路徑，見 §7）|
| `Settings.backload_progress` | 永遠 `false` | 玩家偏好暴露 |
| `Settings.adversarial` | 永遠 `false` | True = 假設每次 Condition 最差，macro 抗 RNG |
| `AtomicFlag::as_ptr() → *mut bool` | 沒用 | JS 透過 `WebAssembly.Memory` 直寫，免 postMessage cancel |

未 pub re-export、要 PR upstream 才能用：

- `QualityUbSolver`（單獨跑 quality upper bound，0 false negative 的 HQ prefilter）
- `FinishSolver::can_finish()`（極快「能否完成 progress」check）

Tier B5 是針對這兩個的 upstream PR。

### 4.3 Upstream 已有的優化（Sprint 0 吃下）

我們 pin 在 `47c4ea7` (2026-03-15)，upstream HEAD `aafcbb0` (2026-05-10)，**15 個 commit 落後**。直接相關的：

| Commit / PR | 收益 | 對我們的影響 |
|---|---|---|
| **PR #337** Skip StepLbSolver precompute if quality unreachable | "Easy runtime improvement for max-quality-unreachable" | 直接幫到 HQ-unachievable 配方 — 可能吃下 Sprint 2 部分價值 |
| **PR #336** Bump allocator for QualityUbSolver / StepLbSolver | Adversarial -14%、整體 5-10% | 全部 dataset |
| **PR #334** Replay actions instead of storing state | 節點 40→8 bytes | 大型搜尋 cache locality |
| **PR #339** Reduce candidate state size in main loop | 高 node count 配置更明顯 | lv100 重型 solve |
| **PR #328** Fast FinishSolver path for high CP | -2% on benchmark | 全部 |
| `8d5365a` Pareto front push fast-path | 小幅 | 全部 |
| **PR #346** Fix StepLbSolver overflow panic | Impossible-craft 不再 panic | 容錯 |
| **PR #335** raphael-cli bench harness | 可重現 micro-benchmark | Sprint 1/3 第二把尺 |
| `eb8d47a` Fix MuscleMemory in QualityUbSolver | 部分 opener 結果略不同 | ⚠️ 行為差異風險 |

---

## 5. Sprint 0 — Upgrade raphael-rs

### 5.1 動機

1. **重設 baseline** — 避免後續 Sprint 1 的 contention fix 收益跟「solver 自己變快」混在一起
2. **PR #337 可能吃下 Sprint 2 部分價值** — 升完才知道 Sprint 2 還需不需要那麼激進
3. **PR #346 修了 impossible-craft panic** — batch 容錯
4. **成本最低** — 一個 cargo command + rebuild

### 5.2 改動

```bash
cd raphael-wasm-wrapper
# Cargo.toml: 把兩個 git dep 加 rev = "aafcbb0"
cargo update -p raphael-sim -p raphael-solver
RUSTUP_TOOLCHAIN=nightly wasm-pack build --target web --out-dir ../public/solver-wasm
cd ..
npm run patch-wasm
```

API 相容性已掃過：
- 新 variant `SolverException::SearchQueueCapacityExceeded` 會被 wrapper 的 `format!("{:?}", e)` 自動處理
- 其他 pub type API 不變

### 5.3 風險

- **行為差異**：`eb8d47a` MuscleMemory fix 可能讓 lv100 opener 算出略不同的 action sequence。由 §5.4 step 3 catch

### 5.4 驗證

1. `npm run test`（vitest，預期 397 tests 全綠）
2. `npm run type-check`（vue-tsc）
3. 手動測 single-recipe solve（CRP lv95 軍需品）對比 action sequence
4. 跑 3 個 batch dataset 收 [bperf] log — **這是 Sprint 0 baseline**，後續 Sprint 1-3 以此為對比基準

### 5.5 Rollback

```bash
cd raphael-wasm-wrapper && git checkout Cargo.toml Cargo.lock
# 重 build WASM 用原 commit hash
```

---

## 6. Sprint 1 — Rayon Thread Limit

### 6.1 改動

抽 POOL_SIZE 到共用模組，兩邊 import：

```ts
// src/solver/pool-config.ts (新檔)
export const POOL_SIZE = 2
```

```ts
// src/solver/solver-worker.ts
import { POOL_SIZE } from './pool-config'
const hwc = navigator.hardwareConcurrency || 4
const threadsPerWorker = Math.max(1, Math.floor(hwc / POOL_SIZE))
await pkg.init_threads(threadsPerWorker)
```

**邊界處理**：
- `hwc = 4` → 2 thread/worker（仍可行）
- `hwc ≤ 2` → 1 thread/worker（rayon 退化為 serial，需驗證 precompute 仍能跑）

### 6.2 風險

- **`wasm-bindgen-rayon::init_thread_pool` 只能呼叫一次** — runtime 調整 thread 數必須重建 worker。本 sprint 不做

### 6.3 驗證

跑 3 個 dataset 對比 Sprint 0 baseline，期待結果：

| Dataset | PR 4 (`347e412`) | Sprint 1 預測 |
|---|---:|---:|
| 1 | 65.7 s | 65–75 s（持平或微退）|
| 2 | 85.4 s | 70–80 s（救回）|
| 3 | 175.8 s | 80–110 s（不再 regression）|

若 dataset 1 退步 > 10s，代表 thread limit 太緊，考慮 `Math.ceil(hwc * 0.6)`。

---

## 7. Sprint 2 — HQ Feasibility Check

### 7.1 動機

§1 已述：HQ-unachievable 配方 3 個 dataset 共浪費 ~93s。**§4.2 已點出 raphael 自帶 `allow_non_max_quality_solutions: false` 就是 HQ feasibility check** —— 0 false negative，不需要校準。本 sprint 採此路徑。

### 7.2 改動（strict-mode probe）

- `raphael-wasm-wrapper/src/lib.rs` 的 `SolveConfig` 加 `allow_non_max_quality_solutions: bool` → rebuild WASM
- `src/solver/raphael.ts:SolverConfig` 加 `strict_quality?: boolean`（default `false`）
- `src/solver/solver-worker.ts:configToWasmSettings` 把該欄位帶到 wasm config
- `src/services/batch-optimizer.ts` Phase 1 主配方為 HQ-required 者：
  - 先用 `strict_quality: true` 跑
  - `NoSolution` → 標記 `hqOk = false`，跳過後續處理（節省時間）
  - 成功 → 直接用 strict 模式回傳的解
  - `Interrupted` → 走 fallback（理論上不會發生於本 sprint）

### 7.3 風險

- **邊界 case 變慢**：stat 恰好剛過 HQ target 的配方，strict 模式可能比 lenient 慢（因為 lenient 可以接受次好解早停，strict 必須證明能達 target）
- **緩解**：Sprint 0 升級已含 PR #337（unreachable 自動 skip StepLbSolver precompute），strict 模式應該也受益

### 7.4 驗證

1. Unit test：對 dataset 2 的 4 個 unachievable + dataset 1 的 1 個 unachievable 跑 strict mode，預期全部 `NoSolution`
2. 3 個 dataset 跑 batch，[bperf] log 比對 Phase 1 總時間
3. Achievable 配方的 action sequence 跟 Sprint 0 一致（regression test）

### 7.5 Fallback — hand-rolled prefilter shadow → enable（觸發）

**觸發背景**：§7.2 路徑 2-B 實作為 PR D，但在 user 實裝 dataset-3 跑出 **net -47% wall**（89.5s vs lenient 61.1s）—— strict 模式逼 raphael 搜「真的達 max_quality」的解空間，achievable recipe 平均慢 1.7×。8 個 recipe 只有「巧力之寶藥」這 1 個真實 unreachable 受益（-25% wasmDur）。PR D commit `be19e8a` revert，但留下 wrapper field、`strict_quality?` TS flag、`NO_SOLUTION_MESSAGE` const、`isNoSolutionError` helper 等基建供本 fallback 復用。

**目標**：把「strict probe 對哪些 recipe 有益」從「全 HQ-required 都試」改成「只對 prefilter 預測 unachievable 的試」，避免在 achievable recipe 上付 strict mode 搜尋代價。

成功定義：
- dataset-3 batch wall ≤ lenient default（user 跑 BenchPanel 驗）
- 「巧力之寶藥」型 unreachable recipe 仍享 strict probe 早退（~25% wasmDur）
- Prefilter **0 false negative**（不能漏真實 HQ-achievable，否則 BatchException 量會增）

**現況**：`src/services/feasibility-prefilter.ts:canReachHQQuality` 已存在但公式 `baseQuality × 25 × maxQualitySteps × 1.10` 太寬鬆 —— perf-benchmarks.md 3 dataset **0 命中**。本 sprint 不重設計公式拓樸，只調 multiplier × margin。

#### 7.5.1 三階段 PR 拆分

| PR | 內容 | gate |
|---|---|---|
| **α** | 補 dataset-1.json + dataset-2.json（perf-benchmarks.md 有 recipe 名單） | `npm run bench:solver --dataset=dataset-1/2` 跑得過 |
| **β** | `optimizeRecipe` 加 `[bperf-prefilter]` shadow log + BenchPanel CSV 多 3 欄 | User 跑 BenchPanel 3 dataset 收 21 筆 prediction vs actual |
| **γ** | 校準係數 + unit test 鎖 21 筆 ground truth + prefilter-gated strict probe enable | dataset-3 wall ≤ lenient default、0 false negative |

PR β 結束後 user 上傳 shadow CSV，**spec 由 controller 看數據決定 PR γ 校準方向**，PR β commit 前不要預測係數該訂多少。

#### 7.5.2 Shadow log 格式（PR β）

`src/services/batch-optimizer.ts:optimizeRecipe` 在 `await solveCraft(...)` 之後、`[bperf]` log 之前插入：

```ts
if (recipe.canHq && solverConfig.hq_target) {
  const predicted = canReachHQQuality(recipe, gearset, buffs)
  const actualReached = simResult.quality >= simResult.max_quality
  console.debug(
    `[bperf-prefilter] recipe=${recipe.name} predicted=${predicted} ` +
    `actual_reached=${actualReached} max_q=${simResult.max_quality} ` +
    `final_q=${simResult.quality} cp=${gearset.cp}`
  )
}
```

BenchPanel 在 `wasmDurByLabel` map 之後同步加 `prefilterByLabel` map 抓 `[bperf-prefilter]` log，CSV 多 3 欄：`predicted`, `actual_reached`, `final_quality_over_max`（即 `final_q / max_q` 比例）。

**False negative 定義**：`predicted === false && actualReached === true` — prefilter 預測達不到 HQ 但 solver 實際達到。**這是要消滅的目標**。

**False positive 定義**：`predicted === true && actualReached === false` — prefilter 過度樂觀，仍跑 lenient solver，浪費一次 strict probe 機會。無害。

#### 7.5.3 校準 protocol（PR γ）

User 提供 shadow CSV 後 controller：

1. 統計 21 筆 (predicted, actual_reached) 矩陣
2. 若 false negative > 0：放寬 MARGIN 或調 multiplier 直到 0 false negative
3. 若 false negative = 0 且 false positive > 0：嘗試「同步降 multiplier 與 maxQualitySteps 估算」找出能擋住 false positive 的最緊係數
4. 寫 `feasibility-prefilter.test.ts` 跑 21 筆 ground truth fixture 鎖住校準結果，未來公式漂移 CI 立刻 fail

#### 7.5.4 Enable 改動（PR γ）

`optimizeRecipe` 在 `recipe.canHq && solverConfig.hq_target` 分支：

```ts
const predicted = canReachHQQualityStrict(recipe, gearset, buffs)
let solverResult
if (!predicted) {
  try {
    solverResult = await solveCraft({ ...solverConfig, strict_quality: true }, onSolverProgress)
  } catch (err) {
    if (isNoSolutionError(err)) {
      solverResult = await solveCraft(solverConfig, onSolverProgress)
    } else { throw err }
  }
} else {
  solverResult = await solveCraft(solverConfig, onSolverProgress)
}
```

- Achievable recipe（predicted=true）：1 個 lenient solve，零 strict 損失
- Unachievable recipe（predicted=false）：strict probe → 失敗 fallback lenient

Fallback lenient 是「prefilter false negative」safety net；unit test 鎖 0 false negative 後此分支不會 fire，但保留以防未來公式漂移。

#### 7.5.5 既有 caller 隔離

`canReachHQQuality` 目前的 callers：`buff-recommender.ts`、`self-craft-candidates.ts`。它們是「always true gate」（公式太寬鬆造成）。PR γ 改公式會擴散影響面。

**保守做法**：PR γ 把新緊公式 export 為 **`canReachHQQualityStrict`**，舊 `canReachHQQuality` 保留不動。`optimizeRecipe` 用新名，其他 caller 不動。未來若要統一可開 follow-up。

#### 7.5.6 驗證

- PR α：bench:solver 跑 dataset-1 / dataset-2 拿到 wall + steps + final_quality
- PR β：跑 3 dataset 拿 21 筆 shadow CSV；確認 BenchPanel 顯示 prediction 欄位
- PR γ：
  - 397 + new unit test pass
  - dataset-3 BenchPanel wall ≤ lenient default
  - `[bperf-prefilter]` log 在 enable 後仍 emit（可後續監控公式漂移）

#### 7.5.7 Rollback

- PR α：刪 dataset JSON
- PR β：revert console.debug 加的 line（純觀測 zero behavior）
- PR γ：revert 後 `optimizeRecipe` 回到 single lenient call

---

## 8. Sprint 3 — Per-Solve Timer

### 8.1 問題

PR 4 報告 dataset 3 的 7 個 recipe 全部 dur 都 ~85.8 s——因為計時是「promise 建立到 resolve」含 queue wait。無法歸因。

### 8.2 改動

`src/solver/solver-worker.ts`：
- 收 `solve` 訊息時 `performance.now()` 記 `solveStart`
- WASM `solve()` return 後算出 `wasmDur = performance.now() - solveStart`
- Post 結果訊息加 `wasmDur` 欄位

`src/solver/worker.ts:handleRoutedResponse`、`src/services/batch-optimizer.ts` [bperf] log：透傳 `wasmDur`。

> **Phase-level attribution 留給 Tier A4**（要動 Rust 端，本 sprint 不做）

### 8.3 驗證

跑 dataset 3：
- 預期 lv100 兩個 recipe `wasmDur` > 其他輕的 2-3 倍
- 預期 contention 場景 `wasmDur` 比 baseline 各自 ~1.5-2× 慢

---

## 9. Tier A / B Follow-ups（本輪 spec 範圍外）

僅列高信心或低成本者，其餘等資料出來再加：

| # | 名稱 | 預估收益 | 工作量 | 觸發條件 |
|---|---|---:|---:|---|
| **A1** | Solve result cache（recipe + gearset + buffs hash）| 重跑場景 < 5s | 1-2 天 | Sprint 2 完成後評估 |
| **A2** | Heavy/Light solve scheduling | 全 dataset +10-20% | 2-3 天 | Sprint 1 後仍有 contention 殘留 |
| **A4** | Wire `progress_callback` + `runtime_stats` 到 JS | Sprint 3 觀測力 ×2、真實 progress bar | 1 天，動 wrapper | Sprint 3 完成後 |
| **B1** | Quality-threshold early stop（`solution_callback` + `interrupt_signal`）| 不可預估，可能 20-40% | 2-3 天，動 wrapper | Sprint 0-3 完成且 §4.2 paths 已驗證 |
| **B2** | Progressive UI | 純體驗 | 1-2 天 | 體驗反饋驅動 |

未列：B3 (thread benchmark)、B4 (HQ fast-path)、B5 (upstream PR)、B6 (cancel-without-restart)、A3 (buff solver call 精簡) —— 都是「資料不足、觸發條件未到」的 idea，等真正需要再加回。

---

## 10. Schedule

```
Week 1
  Day 1   ── Sprint 0  cargo update + rebuild + 全測試 + 3 dataset 重跑 (=新 baseline)
  Day 2   ── Sprint 1  implement + 3 dataset benchmark vs Sprint 0 baseline
  Day 3-4 ── Sprint 3  implement + 重跑 3 dataset 拿真實 wasmDur

Week 2
  Day 1   ── Sprint 2  路徑 2-B 實作 + unit test
  Day 2   ── Sprint 2  3 dataset 跑 + 驗證
  Day 3+  ── 若 §7.4 不通過，切 Fallback (§7.5)
```

---

## 11. Open Questions

1. **Sprint 0 Cargo.toml 用 `rev = "aafcbb0"` pin 到 commit** —— 建議直接這麼做，避免下次無意間又跳 master HEAD
2. **POOL_SIZE 是否要降為 1 作為 Sprint 1 保險？** —— 若 thread limit 不足，加 `POOL_SIZE = 1` patch（仍保留 Phase 4.6 內部 Promise.all 並行）
3. **Sprint 3 `wasmDur` 是否進 GA telemetry？** —— 若要做 multi-machine benchmark 收集，加 `wasm_solve_duration_ms` 到 `solver_complete` 事件
4. **Branch 策略** —— 建議 Sprint 0 獨立 PR（依賴 + WASM rebuild 風險獨立評估），Sprint 1-3 各自 PR
5. **raphael-cli dev harness（已決議：採輕量正規化，列入 exec-plan todo）**

   **位置**：`scripts/dev/bench-solver.mjs`（node 包裝、跨平台）+ `package.json` 加 `bench:solver` script + CLAUDE.md「Dev Benchmarks」小節。**不進 CI、不進 `npm test`、不做 action-sequence snapshot test**（raphael heuristic 升級會 churn）。CSV 輸出到 `.tmp/bench/solver-<timestamp>.csv`。

   **用途**：
   - (a) Sprint 0 上游 bump 前後 action 序列 diff
   - (b) Sprint 1 `--threads N` 行為對照（native 無 pool contention，是「乾淨基準」）
   - (c) Sprint 3 `wasmDur` 與 native solve time 對照

   **`47c4ea7` CLI 能力盤點**（已 audit `raphael-cli/src/commands/solve.rs`）：
   - ✅ `--custom-recipe RLVL PROG QUAL DUR` —— 直接餵 dataset 數字，免 recipe ID 映射
   - ✅ `--threads N` —— Sprint 1 rayon limit 驗證
   - ✅ `--output-variables action_ids steps final_quality duration` + `--output-field-separator ","` —— 結構化 CSV
   - ✅ Stats / level / manipulation / heart_and_soul / quick_innovation / target_quality / initial_quality 全可控
   - ⚠️ **不印 wall time** —— mjs wrapper 用 `performance.now()` 量 spawn duration 即可
   - ⚠️ **`allow_non_max_quality_solutions` hardcoded `true`**（`solve.rs:348`）—— Sprint 2 strict-mode ground truth 在 `47c4ea7` CLI **驗不到**。等 Sprint 0 升 upstream `aafcbb0` 後再看是否暴露 flag；不行就靠 wrapper 自己加 field 後的 unit test（Sprint 2 §7.4 step 1 已涵蓋），不依賴 CLI。

   **PR #335 (cli bench harness) 在 `aafcbb0`，不在 `47c4ea7`** —— Sprint 0 升完後可評估是否用 upstream 的 bench command 取代我們的 mjs wrapper；Sprint 0 之前先用自製。

   **重要**：CLI native 比 WASM 快 ~2-3×、沒 worker pool contention，**絕對數字不可當效能目標**，只比對「相對行為」（升級前後 action 序列、`--threads` 不同值的相對快慢）。

---

## 12. References

- 前一份 spec：`docs/superpowers/specs/2026-05-12-self-craft-validation-perf-design.md`
- Investigation：`docs/superpowers/specs/2026-05-12-rayon-contention-investigation-design.md`
- Benchmark：`.tmp/scratch/perf-benchmarks.md`、`.tmp/scratch/benchmarks-visualization.html`
- raphael-rs 原始碼：`~/.cargo/git/checkouts/raphael-rs-e9b0b2fe4e9f5b15/47c4ea7/`
- 相關 tag：`bench/baseline` → `6e57d02`、`bench/pr4-final` → `2c3e84f`
- Upstream raphael-rs：pin `47c4ea7` (2026-03-15)；HEAD `aafcbb0` (2026-05-10)；15 commits ahead

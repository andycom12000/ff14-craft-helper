# Self-Craft Candidate Validation — Performance Design

**Date:** 2026-05-12
**Scope:** Batch crafting pipeline (`batch-optimizer.ts`, `self-craft-candidates.ts`, `buff-recommender.ts`, `solver/worker.ts`)
**Goal:** 削減 batch optimization 整體耗時，**不影響候選正確性與使用者決策品質**。

---

## 1. 問題背景與實測

實測情境：6 個 Lv94–99 配方 + 巨集模式 + 遞迴查價 ON depth=2 + 跨服採購 ON + 食藥自動評估 ON。

| 階段 | 實測 | 佔比 |
| --- | ---: | ---: |
| Phase 1 solver loop (6 recipes, **序列**) | 71.4 s | 53% |
| Phase 4 pricing + meta | 5.7 s | 4% |
| Phase 4.5 craft vs buy | 0.04 s | 0% |
| Phase 4.6-buff | 12.0 s | 9% |
| Phase 4.6 self-craft (5 candidates, **序列**) | 45.5 s | 34% |
| Phase 5+ aggregate | 0.03 s | 0% |
| **TOTAL** | **134.8 s** | 100% |

**關鍵發現：**

1. **96% 時間都在跑 solver**。每個 solve 平均 8–12 秒。
2. Phase 4.6 self-craft 5 次 solve 中 **4 次結果被丟棄**（37 秒純浪費，全因 `hqRequired && !isDoubleMax` 被過濾）。
3. Solver 全域只有 1 個 worker、且所有 caller 都序列等候 → 無法利用多核。

## 2. 設計決策摘要

| 議題 | 決策 |
| --- | --- |
| NQ 候選驗證 | **Template macro + simulate 驗證**，失敗 fallback 完整 solver。零 false positive |
| HQ 候選驗證 | 保留 solver，但加 quality 預過濾砍掉明顯不可達 |
| 預過濾係數來源 | 從 raphael-sim 原碼推導理論上界 |
| 預過濾 stats | 套用食藥 buff 加成 |
| Safety margin | 單一常數 `MARGIN = 1.10`（保守）。若後續實測有誤殺再分桶 |
| Solver worker | 將既有 `pendingRequests` multiplexer 擴成 **2 slots**（外部 API 不變）|
| Phase 4.6-buff vs self-craft | `Promise.all` 並行 |
| Phase 1 內部 6 個 solve | **`Promise.all` 並行**，吃 pool 容量 |
| Phase 4.6 self-craft 內部 N 個 candidate | **`Promise.all` 並行**，吃 pool 容量 |
| Telemetry | 不加 |
| UI lazy render | 本 spec 不涵蓋 |

## 3. 概念模型 · 候選分流

```
candidate (passes cost threshold + level check)
  │
  ├── hqRequired = false → A1 NQ 路徑
  │     ├── 取 NQ template macro (依 recipe.level inline)
  │     ├── simulate(template) ← 走 worker, 含 RTT ~2-10ms
  │     ├── progress 達 → 接受, actions = template
  │     └── progress 未達 → fallback optimizeRecipe
  │
  └── hqRequired = true → A2 HQ 路徑
        ├── 算術上界檢查 (純 JS, sub-ms)
        ├── 未通過 → 棄用, 不跑 solver
        └── 通過 → 跑 optimizeRecipe

並行：
  · Phase 1: targets.map(t => optimizeRecipe(t)) → Promise.all
  · Phase 4.6: [evaluateBuffRecommendation, produceSelfCraftCandidates] → Promise.all
  · Phase 4.6 inner: candidates.map(c => validateCandidate(c)) → Promise.all

Worker: solver/worker.ts 既有 pendingRequests multiplexer 從 1 slot 擴成 2 slots
```

## 4. 候選資料來源（不變）

過濾條件序列保留：

1. 該 item 有對應 recipe（`findFirstRecipe`）
2. 玩家該職業等級 ≥ 配方等級
3. 子材料與本體在 Universalis 有報價
4. `craftCost < buyCost` 且 `savingsRatio ≥ 5%`

通過 1–4 的候選進入 Step 8 分支驗證（§5 / §6）。

## 5. A1 · NQ 路徑（`hqRequired=false`）

### 5.1 核心策略

Template macro + simulate 驗證。simulate 是確定性、無近似 —— 一旦 simulate 確認 progress 達標，就代表真的有可執行 macro，**false positive 不可能發生**。

### 5.2 NQ Template macro

按 `recipe.level` 三段（直接 inline 在 `self-craft-candidates.ts` 裡，不開新檔）：

```ts
function nqTemplate(level: number): string[] {
  if (level < 54) return Array(15).fill('BasicSynthesis')              // MM 未解
  if (level <= 70) return ['MuscleMemory', ...Array(10).fill('BasicSynthesis')]
  if (level <= 90) return ['MuscleMemory', ...Array(8).fill('CarefulSynthesis')]
  return ['MuscleMemory', 'Veneration', ...Array(7).fill('CarefulSynthesis')]
}
```

simulate 內部會自動處理 CP / durability 截斷，多餘 action 被忽略。

### 5.3 驗證流程

```ts
async function validateNQ(recipe, gearset, buffs):
    Promise<{ actions: string[]; hqAmounts: number[] } | null> {
  // 走既有 buff-recommender.ts:applyCombo（或將其重新 export 給更通用使用）
  // 走既有 recipeToCraftParams + craftParamsToSolverConfig
  const config = buildConfigWithBuffs(recipe, gearset, buffs)
  const template = nqTemplate(recipe.level)

  const sim = await simulateCraft(config, template)
  if (sim.progress >= sim.max_progress) {
    return { actions: template, hqAmounts: [] }
  }

  // template 失敗 → fallback 完整 solver
  try {
    const opt = await optimizeRecipe(recipe, gearset, undefined, buffs)
    if (!opt.isDoubleMax && opt.hqAmounts.length === 0) return null
    return { actions: opt.actions, hqAmounts: opt.hqAmounts }
  } catch {
    return null
  }
}
```

### 5.4 成本與命中率

- **Template 通過**：simulate 走 worker postMessage，含 RTT 約 **2–10 ms**。中階配方 + 配裝充裕，預估 70–90% 命中。
- **Fallback solver**：剩餘 10–30%，~8–10 s/候選（與現行同）。

平均 NQ 候選成本：~1.5–3 s/候選 vs 現行 ~9 s/候選。

## 6. A2 · HQ 路徑（`hqRequired=true`）

### 6.1 核心策略

純 JS 算術上界檢查砍掉明顯不可達的候選（sub-ms），通過者走完整 solver。

### 6.2 公式來源

從 raphael-sim 原碼（位於 `~/.cargo/git/checkouts/raphael-rs-*/raphael-sim/`）推導：

- `base_quality = floor(control * controlScaler / qualityDivider) * qualityModifier / 100`
- Inner Quiet stack 上限（10）× Innovation 倍率 × Great Strides 倍率 × Byregot 最終消耗 → 產出常數 `QUALITY_PEAK_MULTIPLIER`
- `AVG_QUALITY_CP_COST` 由原碼中 quality actions 的 CP cost 取代表值

兩個常數一次性導出，hardcoded 在 `services/feasibility-prefilter.ts`。

### 6.3 預過濾公式

```ts
const MARGIN = 1.10  // 單一保守係數, 偏向 false positive 而非 false negative

function canReachHQQuality(recipe, gearset, buffs): boolean {
  const enhanced = applyCombo({craftsmanship, control, cp}, comboFromBuffs(buffs))
  const baseQuality = computeBaseQuality(enhanced.control, recipe.recipeLevelTable)
  const maxQualitySteps = Math.floor(enhanced.cp / AVG_QUALITY_CP_COST)
  const maxAchievable = baseQuality * QUALITY_PEAK_MULTIPLIER * maxQualitySteps * MARGIN
  return maxAchievable >= recipe.recipeLevelTable.quality
}
```

### 6.4 False Positive 影響

預過濾通過 → solver 仍會跑 → solver 是 ground truth。誤判「可達」只是浪費一次 solve（與現行行為一致），使用者看不到。
False negative 才是真正風險（誤殺實際可達），故公式偏樂觀 + MARGIN 保險。

## 7. Phase 並行化

### 7.1 Phase 1 內部並行

`batch-optimizer.ts:178–231` 既有序列改成：
```ts
const optResults = await Promise.allSettled(
  targets.map(target => /* level check + optimizeRecipe + result push */)
)
```
進度報告（`onProgress`）改為計數器形式（completed/total），不再有固定順序。

### 7.2 Phase 4.6 兩段並行

```ts
const [buffResult, selfCraftResult] = await Promise.all([
  noBuffSelected && hasDeficit ? evaluateBuffRecommendation(...) : Promise.resolve(undefined),
  settings.recursivePricing ? produceSelfCraftCandidates(...) : Promise.resolve([]),
])
```

### 7.3 self-craft 候選並行

`self-craft-candidates.ts` Step 8 改成：
```ts
const settled = await Promise.allSettled(
  withRecipes.map(({decision, node, recipe, job}) =>
    validateCandidate({decision, node, recipe, job, ...})
  )
)
```

三層並行都靠同一個 worker pool（§8）做併發控管。

## 8. Worker Pool（`src/solver/worker.ts`）

### 8.1 現狀

既有 `worker.ts` 已經有 `pendingRequests` Map + `nextRequestId` 多工機制，但 worker 實例只有 1 個。`solveCraft` 因為要傳 progress callback，使用獨佔的 `w.onmessage` handler，所以與 simulate 不能真正多工。

### 8.2 變更

- module-level `worker: Worker | null` → `workers: WorkerSlot[]`（size = 2）
- `WorkerSlot`: `{ worker, busy, initialized }`
- `solveCraft` 不再霸佔 `onmessage`：用 `requestId` 進入既有 `pendingRequests`，progress callback 也以 `requestId` 路由
- `simulateCraft` 不變（本來就走 `requestId` 多工）
- Task queue 當所有 slot busy 時 FIFO 排隊
- `cancelSolve`: 對 busy slot 送 abort + 將 queue 中 solve task 全 reject

### 8.3 公開 API 不變

`solveCraft`, `simulateCraft`, `simulateCraftDetail`, `cancelSolve`, `waitForWasm`, `getWasmStatus`, `disposeWorker` 外型一致。

### 8.4 Slot 生命週期

兩個 worker slot 在 module load 時懶啟動，**生命週期 = session lifetime**（不在 batch 結束時 dispose）。WASM init 開銷（~200ms × 2）只攤提一次。

## 9. SelfCraftCandidate 介面

**不變動**。`actions` 與 `hqAmounts` 在所有路徑都有確定值，下游 `batch.ts` 的 `finalTodoList` computed 完全不用改。

（先前提案的 `validatedBy` 欄位砍掉 —— 沒有 telemetry、沒有 UI 用途、純死欄位。）

## 10. 預期效益

| 改動 | 本次情境（5 候選全 HQ）| 真實混合場景（3 NQ + 2 HQ）|
| --- | ---: | ---: |
| 基準 | 134.8 s | ~120 s |
| A1 · NQ template/simulate | 0 s（無 NQ）| −18~22 s |
| A2 · HQ 預過濾 | −15~30 s | −8~12 s |
| Phase 4.6 Promise.all 兩段並行 | −2~5 s | −2~5 s |
| Phase 1 內 6 個 solve 並行 (2-slot pool) | **−30~35 s** | −20~30 s |
| Self-craft N 個 candidate 並行 (2-slot pool) | **−18~22 s** | −12~18 s |
| **合計** | **−65~92 s** | **−60~87 s** |
| **新總耗時** | **45~70 s** | **35~60 s** |

關鍵：pool 本身的「直接收益」（兩段 Promise.all）只有 −2~5s；真正收益來自 **Phase 1 + self-craft 兩個原本序列迴圈改 Promise.all**，這兩個一起做才能讓 pool 投資回本。

## 11. 風險矩陣

| 風險 | 緩解 |
| --- | --- |
| NQ template 對特殊配方失效 | fallback solver 接住，無正確性影響 |
| HQ 預過濾誤殺可達候選 (false negative) | MARGIN=1.10 + 偏樂觀 multiplier；若實測誤殺再分桶 |
| Phase 1 並行後進度條順序混亂 | onProgress 用「完成數 / 總數」計數器，不再依賴固定順序 |
| `Promise.allSettled` 內某個 solve 例外被吞 | 既有 `optimizeRecipe` 對 SOLVE_CANCELLED rethrow；其他錯誤已 push 進 exceptions 桶 |
| cancelSolve 時 queue 中 task 未清 | 新增 queue reject 邏輯有 unit test |

## 12. 不在此 spec 範圍

- UI lazy render
- Solver result cache
- Unachievable recipe 的 Phase 1 提前識別
- Telemetry
- Phase 4 backfill 與 Phase 4.6 BOM price 合併（−1.8 s 收益小，另起 task）

## 13. 實作切片

順序：低風險 → 高風險，每步可獨立 PR：

1. **Feasibility prefilter + raphael-sim 推導常數**
   - 新增 `services/feasibility-prefilter.ts`：`canReachHQQuality`, 公式常數
   - 需要時用既有 `buff-recommender.ts:applyCombo`（必要時將其 re-export 出 buff-recommender 給更通用使用）
   - 純函式 + unit test

2. **Step 8 分支重寫**
   - `self-craft-candidates.ts`：Step 8 改成 hqRequired branching
   - inline NQ template + simulate logic
   - HQ 路徑前面塞 prefilter
   - 整體仍序列（並行留給 PR 4）

3. **Phase 4.6 Promise.all（兩段並行）**
   - `batch-optimizer.ts`：buff + self-craft 改 Promise.all
   - 進度報告調整
   - 收益 ~−2~5 s

4. **Worker pool + 全部 Promise.all 並行**
   - `solver/worker.ts`：擴展 `pendingRequests` 為 2-slot pool
   - `batch-optimizer.ts` Phase 1：`Promise.allSettled(targets.map(...))`
   - `self-craft-candidates.ts` Step 8：候選 `Promise.allSettled(...)`
   - 進度條改計數器
   - 收益 ~−50~60 s
   - 主要驗證點


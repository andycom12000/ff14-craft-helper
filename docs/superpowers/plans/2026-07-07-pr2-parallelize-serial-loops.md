# PR-2: Parallelize Serial Solver Loops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把兩個純序列的 solver 迴圈改為並行餵滿 worker pool——batch Phase 6 鑲嵌建議（逐 job 序列）與 buff 推薦內層（recipes 序列）——不改變任何結果語意。

**Architecture:** Phase 6 的 job 間彼此獨立 → `Promise.allSettled` per-job，單 job 失敗不再拖垮整批（原本會 throw 出去）；進度計數改「完成時遞增」。Buff 推薦**外層** combo cheapest-first 迴圈**不動**（「最便宜先贏」語意），只把**內層** recipes 的 simulate→solve 評估改 `Promise.all`，結果順序以 map 順序保留。2-slot worker pool 自然節流，無需額外併發控制。

**Tech Stack:** Vue 3 + TypeScript + Vitest（batch-optimizer.test.ts 已有 adviseMeld / evaluateBuffRecommendation 的 vi.mock 模式）。

**Spec:** `docs/superpowers/specs/2026-07-07-batch-simulator-perf-experience-design.md` §4 PR-2

## Global Constraints

- 解品質與推薦結果零變化：并行化不得改變任何輸出（buff 推薦仍是「最便宜可行 combo」、meld advice 內容不變）。
- `isCancelled` 檢查保留在各並行 task 開頭；取消行為不變。
- 成功指標（spec §3）：多職業 meld-on 批次 Phase 6 wall ≥ 40% 縮短（2-slot pool、≥2 jobs 情境）。
- 每 task 結尾跑相關測試；PR 收尾四項全跑（type-check / eslint changed files / `npm test` / build），主 session 親自驗。
- Commit 英文 conventional commits；branch `perf/parallelize-batch-loops`。
- 已知後續事項（不在本 PR）：PR-3 取消語意工作須處理 solve-cache「leader 取消連坐 follower」（PR #169 review 記錄，信心 70）。

---

### Task 1: Phase 6 鑲嵌建議 per-job 並行化

**Files:**
- Modify: `src/services/batch-optimizer.ts`（Phase 6 迴圈，約 719-752 行）
- Test: `src/__tests__/services/batch-optimizer.test.ts`（追加）

**Interfaces:**
- Consumes: `adviseMeld(recipes, gearset, materiaPrices, { initialQuality, isCancelled })`（不變）、`findBindingRecipe` / `calculateInitialQuality`（不變）。
- Produces: 行為變化僅兩點——(1) 多 job 時 `adviseMeld` 併發執行；(2) 單 job 的 `adviseMeld` reject 不再讓整個 `runBatchOptimization` throw，改為該 job 無 advice（`meldAdvicePerJob` 缺該 key）。進度 `emitMeld(meldJobsDone)` 改各 job 完成時遞增。

- [ ] **Step 1: Write the failing tests（追加到 batch-optimizer.test.ts，沿用該檔既有的 adviseMeld mock 模式）**

```ts
// PR-2: Phase 6 runs per-job advisors concurrently and isolates per-job failures.
describe('Phase 6 meld advice parallelization', () => {
  it('runs adviseMeld for multiple jobs concurrently (overlapping in-flight)', async () => {
    const { adviseMeld } = await import('@/services/meld-advisor')
    let inFlight = 0
    let maxInFlight = 0
    vi.mocked(adviseMeld).mockImplementation(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(r => setTimeout(r, 20))
      inFlight--
      return { plans: [], status: 'feasible' } as any
    })
    // 兩個不同 job 的 target（測試檔既有 helper/fixture 產生 recipe；job 分別給 'CRP' 與 'BSM'）
    const targets = [
      makeTarget({ job: 'CRP', id: 9101 }),
      makeTarget({ job: 'BSM', id: 9102 }),
    ]
    await runBatchWithMeld(targets) // 測試檔既有的 meldAdvice:true 執行 helper 包裝（見 Step 3 註記）
    expect(vi.mocked(adviseMeld)).toHaveBeenCalledTimes(2)
    expect(maxInFlight).toBe(2) // 序列版恆為 1；並行版兩個 job 同時在飛
  })

  it('one job failing adviseMeld does not kill the batch nor other jobs', async () => {
    const { adviseMeld } = await import('@/services/meld-advisor')
    vi.mocked(adviseMeld)
      .mockRejectedValueOnce(new Error('advisor exploded'))
      .mockResolvedValueOnce({ plans: [], status: 'feasible' } as any)
    const targets = [
      makeTarget({ job: 'CRP', id: 9103 }),
      makeTarget({ job: 'BSM', id: 9104 }),
    ]
    const results = await runBatchWithMeld(targets)
    // 整批完成、不 throw；只有成功的 job 有 advice
    expect(results.meldAdvicePerJob.size).toBe(1)
  })

  it('emits evaluating-meld progress as each job completes', async () => {
    const { adviseMeld } = await import('@/services/meld-advisor')
    vi.mocked(adviseMeld).mockResolvedValue({ plans: [], status: 'feasible' } as any)
    const progressEvents: Array<{ completed: number; total: number }> = []
    const targets = [
      makeTarget({ job: 'CRP', id: 9105 }),
      makeTarget({ job: 'BSM', id: 9106 }),
    ]
    await runBatchWithMeld(targets, (info) => {
      if (info.phase === 'evaluating-meld') progressEvents.push({ completed: info.completed, total: info.total })
    })
    // 至少 0/2 → 1/2 → 2/2 三筆
    expect(progressEvents.at(0)).toEqual({ completed: 0, total: 2 })
    expect(progressEvents.at(-1)).toEqual({ completed: 2, total: 2 })
  })
})
```

**實作註記**：`makeTarget` / `runBatchWithMeld` 為示意名——實作者要沿用 batch-optimizer.test.ts 既有的 target fixture 與 `runBatchOptimization` 呼叫慣例（該檔 Phase 6 測試區已有現成的「meldAdvice: true + 兩 job」組裝模式，702 行附近的 initialQuality 測試就是範本），把上述三個測試的意圖用既有 helper 寫出來；斷言內容不可弱化。

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/services/batch-optimizer.test.ts`
Expected: 第 1 個測試 FAIL（`maxInFlight` 為 1——現為序列）；第 2 個 FAIL（整批 throw 'advisor exploded'）

- [ ] **Step 3: Implement**

`batch-optimizer.ts` Phase 6 的 `for (const [job, list] of recipesByJob)` 迴圈整段改為：

```ts
    await Promise.allSettled([...recipesByJob.entries()].map(async ([job, list]) => {
      if (isCancelled()) return
      const gs = getGearset(job)
      if (!gs) return
      // Pick the binding recipe (highest difficulty, tiebreak by quality) to drive initialQuality.
      // Prefer non-isDoubleMax recipes so the binding's hqAmounts (and thus initialQuality)
      // are real — isDoubleMax recipes always have hqAmounts:[] which would zero out initialQuality
      // and cause Step 0 of adviseMeld to incorrectly think the gearset needs melds.
      const nonMaxed = list.filter(r => !r.isDoubleMax)
      const candidates = nonMaxed.length > 0 ? nonMaxed : list
      const bindingRecipe = findBindingRecipe(candidates.map(r => r.recipe))
      if (!bindingRecipe) return
      const binding = candidates.find(r => r.recipe === bindingRecipe)!
      const initialQuality = calculateInitialQuality(
        binding.recipe.recipeLevelTable.quality,
        binding.recipe.materialQualityFactor,
        binding.recipe.ingredients.map((ing, i) => ({
          amount: ing.amount,
          hqAmount: binding.hqAmounts[i] ?? 0,
          level: ing.level,
          canHq: ing.canHq,
        })),
      )
      try {
        const advice = await adviseMeld(
          list.map(r => r.recipe),
          gs,
          materiaPrices,
          { initialQuality, isCancelled },
        )
        meldAdvicePerJob.set(job, advice)
      } catch (err) {
        // Per-job isolation: one job's advisor failure must not kill the whole
        // batch (pre-PR-2 a throw here aborted the entire run at 95%+).
        console.warn(`[meld-advisor] adviseMeld failed for ${job}, skipping its advice:`, err)
      } finally {
        meldJobsDone++
        emitMeld(meldJobsDone)
      }
    }))
```

（`emitMeld(0)` 與 `materiaPrices` fetch 保持在 map 之前不動；`meldJobsDone++` 移入 `finally` 使失敗 job 也推進進度。）

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/services/batch-optimizer.test.ts`
Expected: PASS（既有 + 3 新測試）

- [ ] **Step 5: Commit**

```bash
git add src/services/batch-optimizer.ts src/__tests__/services/batch-optimizer.test.ts
git commit -m "perf(batch): parallelize Phase 6 meld advice across jobs with failure isolation"
```

---

### Task 2: Buff 推薦內層 recipes 迴圈並行化

**Files:**
- Modify: `src/services/buff-recommender.ts`（Step 4 內層迴圈，約 280-293 行）
- Test: `src/__tests__/services/buff-recommender.test.ts`（追加）

**Interfaces:**
- Consumes: `simulateWithBuffedStats` / `solveWithBuffedStats`（檔內既有 helper，不變）。
- Produces: 行為不變——`passedRecipes` 內容與順序（map 順序 = 原 push 順序）、外層 combo cheapest-first 序列、`onProgress` per-combo 節奏、取消回 `null`，全部保持。唯一差異是內層 recipes 併發評估。

- [ ] **Step 1: Write the failing test（追加到 buff-recommender.test.ts，沿用該檔既有 mock/fixture 慣例）**

```ts
// PR-2: within one combo, candidate recipes are evaluated concurrently.
it('evaluates candidate recipes concurrently within a combo', async () => {
  // 沿用檔內既有的 evaluateBuffRecommendation 測試組裝（多個 deficit recipes、單一 combo 可通過），
  // 把 simulate/solve 的底層 mock 換成可觀測併發的版本：
  let inFlight = 0
  let maxInFlight = 0
  // 對「該檔用來讓 simulate 通過/失敗的既有 mock 點」包一層：
  //   進入時 inFlight++、await setTimeout 10ms、離開時 inFlight--，紀錄 maxInFlight。
  // 組 3 個 deficit recipes 跑 evaluateBuffRecommendation。
  expect(maxInFlight).toBeGreaterThan(1) // 序列版恆為 1
})

// PR-2: result parity — same inputs produce identical recommendation as before.
it('returns the same passedRecipes set and order as the serial implementation', async () => {
  // 3 recipes：第 1、3 通過 simulate、第 2 需 solve 才通過。
  // 斷言回傳 recommendation 的 affectedRecipes 順序 === [r1, r2, r3]（原 push 順序）。
})
```

**實作註記**：兩個測試都要用 buff-recommender.test.ts 既有的 mock 面（該檔已 mock solver 層）落實，斷言不可弱化；第二個測試的重點是「順序與集合皆不變」。

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/services/buff-recommender.test.ts`
Expected: 併發測試 FAIL（maxInFlight === 1）；parity 測試應 PASS（先綠，作為並行化後的回歸保險）

- [ ] **Step 3: Implement**

`buff-recommender.ts` Step 4 內層迴圈（`const passedRecipes: RecipeOptimizeResult[] = []` 起到迴圈結束）改為：

```ts
    // Step 4: test each recipe with this combo (partial pass) — recipes are
    // independent, so evaluate them concurrently (2-slot pool throttles).
    // Map order preserves the original push order for downstream consumers.
    const evaluated = await Promise.all(allCandidateRecipes.map(async (r) => {
      if (isCancelled()) return null
      const gs = getGearset(r.recipe.job)
      if (!gs) return null
      let passes = await simulateWithBuffedStats(r.recipe, gs, combo, r.actions)
      if (!passes) {
        if (isCancelled()) return null
        passes = await solveWithBuffedStats(r.recipe, gs, combo)
      }
      return passes ? r : null
    }))
    if (isCancelled()) return null
    const passedRecipes = evaluated.filter((r): r is RecipeOptimizeResult => r !== null)
```

（外層 `for (let i = 0; i < candidates.length; i++)`、`onProgress`、Step 5 之後全部不動。）

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/services/buff-recommender.test.ts src/__tests__/services/buff-verify.test.ts`
Expected: PASS（既有 + 2 新測試；buff-verify 一併確認無回歸）

- [ ] **Step 5: Commit**

```bash
git add src/services/buff-recommender.ts src/__tests__/services/buff-recommender.test.ts
git commit -m "perf(batch): parallelize per-recipe evaluation inside buff combo loop"
```

---

### Task 3: 全量驗證 + Phase 6 效能量測 + spec 更新

- [ ] **Step 1: 四項全跑（主 session）**

```bash
npm run type-check
npx eslint src/services/batch-optimizer.ts src/services/buff-recommender.ts src/__tests__/services/
npm test
npm run build
```

Expected: 全綠。

- [ ] **Step 2: Phase 6 並行度量測（瀏覽器，dev server + chrome-devtools MCP，先過 verify-by-ui pre-flight）**

用 Vite dev 模組直呼（與 PR-1 驗證同法）量測「2 jobs 的 Phase 6 等效工作」並行 vs 序列：

1. 在 `/#/batch?bench=1` 頁 console 直呼 `adviseMeld` 兩個不同 job 的呼叫（不同 gearset/recipes，各自 wall ~數秒）：
   - 序列基準：`await a(); await b()` 記 wall。
   - 並行：`await Promise.all([a(), b()])` 記 wall。
   - 並行 wall 應顯著低於序列（理想接近 max 而非 sum；≥40% 縮短即達標）。
2. 快取干擾控制：兩次量測間呼叫 `clearSolveCache()`（`/src/solver/solve-cache.ts` 模組），且兩個 job 用不同 config 避免互相 cache hit。
3. 順手 smoke：真實 batch 頁開鑲嵌建議 toggle 跑一次 2-job 批次，確認 UI 進度 `evaluating-meld` 計數推進、結果正常。

- [ ] **Step 3: 把量測數字記回 spec §4 PR-2 段落並 commit**

```bash
git add docs/superpowers/specs/2026-07-07-batch-simulator-perf-experience-design.md
git commit -m "docs(spec): record PR-2 phase-6 parallelization measurements"
```

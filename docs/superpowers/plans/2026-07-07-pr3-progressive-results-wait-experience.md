# PR-3: Progressive Batch Results & Wait Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把批量/單件的「等待體驗」補齊——per-target 即時狀態、誠實進度計數、#162 鑲嵌建議進度、單件取消不再砍全 pool——並一併關掉 PR-1/PR-2 review 記錄的三個 solve-cache 取消語意缺陷。

**Architecture:** 服務層先加 optional callback（`onTargetUpdate`、`AdviseMeldOptions.onProgress`），零破壞既有呼叫者；store 加 `liveTargets` 由 BatchView 橋接；UI 是 additive（BatchProgress 加列表、MeldAdvisorCard loading 區加計數器），最終 `results` 一次性賦值合約**不變**。solve-cache 修三點：follower takeover（leader 被取消時未取消的 follower 自己重跑一次）、post-lookup signal 再檢查、follower/leader-store 路徑的 `actions` 防禦性複製。SolverPanel 改用 per-request `AbortSignal`（#151 已鋪好的 `bindAbort` plumbing）。

**Tech Stack:** Vue 3 + Pinia + Element Plus + Vitest（happy-dom；component 測試參考 `MeldAdvisorCard.spec.ts` 的 mount 慣例；solver 測試參考 `worker-pool.test.ts` 的 FakeWorker + `vi.resetModules()` 慣例）。

**Spec:** `docs/superpowers/specs/2026-07-07-batch-simulator-perf-experience-design.md` §4 PR-3

## Global Constraints

- 最終 `results` 賦值合約不變：`BatchView.startOptimization` 仍是結尾一次 `batchStore.results = results`；漸進揭露只走新的 `liveTargets`。
- 所有新 callback 一律 optional，未傳時行為與現行完全一致（既有測試不需要改斷言）。
- 解品質零變化：本 PR 不碰 solver 參數、不碰 cache key、不碰 meld advisor 搜尋邏輯（只加進度回報點）。
- 取消語意：使用者未取消的請求絕不能收到 `cancelled` 結果（#132/#133 的誠實性）；follower takeover 上限一次，第二次仍被取消就如實傳播。
- UI 文案繁體中文台灣用語；light theme（奶油白基調）；新 UI 不擋既有版面。
- 每 PR 四項全跑（type-check=`vue-tsc -b`、eslint changed files、`npm test`、build），主 session 重驗；測試碼避免 `.at()`（lib target 不含）與 optional 欄位直接取值。
- Commit 英文 conventional commits；branch `feat/progressive-batch-experience`。

---

### Task 1: solve-cache 取消語意三連修

**Files:**
- Modify: `src/solver/solve-cache.ts`（`followShared` 182-200 行、`cachedSolve` 211-246 行）
- Test: `src/__tests__/solver/solve-cache.test.ts`（追加 + 改 1 個既有測試）

**Interfaces:**
- Consumes: 既有 `cachedSolve(config, runSolve, signal?)`、`SolveCancelledError`（@/solver/errors）。
- Produces: 對外簽名不變。行為變化三點：(1) leader 被取消時，自己 signal 未 abort 的 follower 改為自己重跑一次（takeover，上限一次）而非連坐；(2) `await lookup(key)` 之後補 `signal?.aborted` 再檢查；(3) `followShared` 的 tagged 結果與 leader 存入快取的 entry 都做 `actions` 防禦性複製。

- [ ] **Step 1: Write the failing tests（追加到 solve-cache.test.ts 的 in-flight coalescing describe）**

```ts
it('a live follower takes over with a fresh solve when the leader is cancelled', async () => {
  // leader 被自己的 signal 取消；follower 沒有 signal → 不應連坐，
  // 而是自己重跑一次 runSolve 並拿到正常結果。
  let calls = 0
  const leaderDeferred = createDeferred<SolverResultWithTiming>()
  const runSolve = vi.fn(async () => {
    calls++
    if (calls === 1) return leaderDeferred.promise
    return makeResult(['basic_synthesis'])
  })
  const leaderCtl = new AbortController()
  const p1 = cachedSolve(config, runSolve, leaderCtl.signal)
  await flushMicrotasks()
  const p2 = cachedSolve(config, runSolve) // follower，無 signal
  await flushMicrotasks()
  leaderDeferred.reject(new SolveCancelledError())
  await expect(p1).rejects.toBeInstanceOf(SolveCancelledError)
  const r2 = await p2
  expect(r2.actions).toEqual(['basic_synthesis'])
  expect(runSolve).toHaveBeenCalledTimes(2) // takeover 真的重跑了
})

it('takeover is attempted at most once: a second cancellation propagates', async () => {
  let calls = 0
  const runSolve = vi.fn(async () => {
    calls++
    throw new SolveCancelledError() // 每次都被取消（模擬 pool teardown）
  })
  const p1 = cachedSolve(config, runSolve)
  const p2Promise = (async () => {
    await flushMicrotasks()
    return cachedSolve(config, runSolve)
  })()
  await expect(p1).rejects.toBeInstanceOf(SolveCancelledError)
  await expect(p2Promise).rejects.toBeInstanceOf(SolveCancelledError)
  expect(runSolve.mock.calls.length).toBeLessThanOrEqual(3) // 不得無限重試
})

it('a follower whose own signal aborted does NOT take over', async () => {
  const leaderDeferred = createDeferred<SolverResultWithTiming>()
  const runSolve = vi.fn(async () => leaderDeferred.promise)
  const p1 = cachedSolve(config, runSolve)
  await flushMicrotasks()
  const followerCtl = new AbortController()
  followerCtl.abort()
  const p2 = cachedSolve(config, runSolve, followerCtl.signal)
  await expect(p2).rejects.toBeInstanceOf(SolveCancelledError)
  expect(runSolve).toHaveBeenCalledTimes(1) // 沒 takeover
  leaderDeferred.resolve(makeResult(['a']))
  await p1
})

it('honors a signal that aborts during the persistence lookup await', async () => {
  // persistence.get 掛起期間 abort → cachedSolve 應 throw SolveCancelledError，
  // 不得繼續 dispatch runSolve。
  const gate = createDeferred<PersistedSolveEntry | undefined>()
  setSolveCachePersistence({ ...stubPersistence, get: () => gate.promise })
  const ctl = new AbortController()
  const runSolve = vi.fn()
  const p = cachedSolve(config, runSolve as any, ctl.signal)
  await flushMicrotasks()
  ctl.abort()
  gate.resolve(undefined)
  await expect(p).rejects.toBeInstanceOf(SolveCancelledError)
  expect(runSolve).not.toHaveBeenCalled()
})

it('follower results and the stored cache entry do not alias the leader actions array', async () => {
  const leaderDeferred = createDeferred<SolverResultWithTiming>()
  const runSolve = vi.fn(async () => leaderDeferred.promise)
  const p1 = cachedSolve(config, runSolve)
  await flushMicrotasks()
  const p2 = cachedSolve(config, runSolve)
  leaderDeferred.resolve(makeResult(['a', 'b']))
  const [r1, r2] = await Promise.all([p1, p2])
  r2.actions.push('MUTATED')      // 汙染 follower 的結果
  r1.actions.push('MUTATED_TOO')  // 汙染 leader 的結果
  const replay = await cachedSolve(config, runSolve) // 快取 hit
  expect(replay.actions).toEqual(['a', 'b']) // 快取不受汙染
})
```

**實作註記**：`createDeferred` / `makeResult` / `flushMicrotasks` / `stubPersistence` / `config` 沿用該測試檔既有 helpers（都已存在；名稱以檔內實際為準，斷言不可弱化）。既有測試 `'leader rejection propagates to followers and nothing is cached on cancel'`（~230 行）鎖住的是舊連坐行為——把它改寫為「follower（無 signal）takeover 後成功、cancel 的 leader 結果不快取」，或直接由上面第 1 個新測試取代並刪除舊斷言中「p2 也 reject」的部分（保留「不快取」斷言）。

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/solver/solve-cache.test.ts`
Expected: 新測試 1（follower 連坐 reject 而非 takeover）、4（lookup 中 abort 未攔）、5（actions aliasing）FAIL；2、3 可能先綠（作回歸保險）。

- [ ] **Step 3: Implement**

`solve-cache.ts` 三處：

(1) `followShared` 的 tagged 行改防禦性複製：

```ts
  const tagged = shared.then((r) => ({ ...r, actions: [...r.actions], cacheHit: true }))
```

(2) `cachedSolve` 的 lookup 之後補再檢查，且 follower 路徑加 takeover（`cachedSolve` 加一個內部參數防重試迴圈）：

```ts
export async function cachedSolve(
  config: SolverConfig,
  runSolve: () => Promise<SolverResultWithTiming>,
  signal?: AbortSignal,
  hasTakenOver = false,
): Promise<SolverResultWithTiming> {
  if (bypass) return runSolve()
  await ensureInit()
  if (signal?.aborted) throw new SolveCancelledError()
  const key = solveCacheKey(config)
  const hit = await lookup(key)
  if (signal?.aborted) throw new SolveCancelledError()
  ...
  const existing = inFlight.get(key)
  if (existing) {
    return followShared(existing, signal).catch((err) => {
      // Takeover: the leader was cancelled by ITS caller, but this follower is
      // still live — re-run once instead of inheriting a cancellation the user
      // never asked for (#132/#133 honesty). Bounded to one attempt so pool
      // teardown (every retry also cancelled) still propagates.
      if (err instanceof SolveCancelledError && !signal?.aborted && !hasTakenOver) {
        return cachedSolve(config, runSolve, signal, true)
      }
      throw err
    })
  }
  const shared = runSolve().then(
    (r) => {
      const { cacheHit: _cacheHit, ...persisted } = r
      store(key, {
        kind: 'result',
        result: { ...persisted, actions: [...persisted.actions] },
        lastUsedAt: Date.now(),
      })
      return r
    },
    ...
```

(3) 更新 `followShared` JSDoc：明確寫出「leader 被取消時，仍存活的 follower 由 `cachedSolve` 進行一次 takeover 重跑；第二次取消如實傳播」。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/solver/solve-cache.test.ts src/__tests__/solver/worker-pool.test.ts`
Expected: PASS（含既有 coalescing / replay 測試）

- [ ] **Step 5: Commit**

```bash
git add src/solver/solve-cache.ts src/__tests__/solver/solve-cache.test.ts
git commit -m "fix(solver): follower takeover on leader cancel + lookup abort re-check + actions copy"
```

---

### Task 2: `runBatchOptimization` 增加 `onTargetUpdate` per-target 狀態回報

**Files:**
- Modify: `src/services/batch-optimizer.ts`（簽名 + Phase 1 區塊 224-266 行）
- Modify: `src/stores/batch.types.ts`（新型別）
- Test: `src/__tests__/services/batch-optimizer.test.ts`（追加）

**Interfaces:**
- Produces（後續 task 依賴）：
```ts
// batch.types.ts
export type BatchTargetStatus =
  | { state: 'queued' }
  | { state: 'solving'; percent: number }
  | { state: 'done'; steps: number; isDoubleMax: boolean }
  | { state: 'failed'; reason: string }
```
`runBatchOptimization(..., onProgress, isCancelled, onTargetUpdate?)`——最後加 optional 參數 `onTargetUpdate?: (index: number, status: BatchTargetStatus) => void`，index 對應 `targets` 陣列。

- [ ] **Step 1: Write the failing tests**

```ts
describe('onTargetUpdate per-target status', () => {
  it('reports queued → solving → done per target with index alignment', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory', 'groundwork'], progress: 3500, quality: 7200, steps: 2 })
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)
    const updates: Array<[number, any]> = []
    await runBatchOptimization(
      [target0, target1], // 兩個 target（沿用檔內既有 target 組裝慣例）
      getGearset, defaultSettings, () => {}, () => false,
      (i, s) => updates.push([i, s]),
    )
    // 每個 index 都有 queued 起點與 done 終點
    for (const idx of [0, 1]) {
      const seq = updates.filter(([i]) => i === idx).map(([, s]) => s.state)
      expect(seq[0]).toBe('queued')
      expect(seq[seq.length - 1]).toBe('done')
    }
    const done0 = updates.filter(([i, s]) => i === 0 && s.state === 'done').map(([, s]) => s)
    expect(done0[0]).toMatchObject({ steps: 2, isDoubleMax: true })
  })

  it('reports failed with reason for exception targets and does not throw', async () => {
    vi.mocked(solveCraft).mockRejectedValue(new Error('無法達成雙滿'))
    const updates: Array<[number, any]> = []
    const res = await runBatchOptimization(
      [target0], getGearset, defaultSettings, () => {}, () => false,
      (i, s) => updates.push([i, s]),
    )
    const failed = updates.filter(([, s]) => s.state === 'failed')
    expect(failed.length).toBeGreaterThan(0)
    expect(String(failed[0][1].reason)).toContain('無法達成雙滿')
    expect(res.exceptions.length).toBe(1) // 既有 exception 行為不變
  })

  it('omitting onTargetUpdate keeps existing behaviour (no crash, same results)', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory'], progress: 3500, quality: 7200, steps: 1 })
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)
    await expect(runBatchOptimization([target0], getGearset, defaultSettings, () => {}, () => false)).resolves.toBeTruthy()
  })
})
```

**實作註記**：target fixture 沿用該檔既有慣例（`mockRecipe` + quantity 等）；`solving` 中間態依賴 `optimizeRecipe` 的 onSolverProgress——mock 的 solveCraft 不會觸發 percent 回呼時，`solving` 可能不出現在序列中，第一個測試只斷言 queued 起點/done 終點與 done payload，不斷言必有 solving（避免 mock 假象）。

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/services/batch-optimizer.test.ts`
Expected: FAIL（`onTargetUpdate` 參數不存在 → updates 空陣列）

- [ ] **Step 3: Implement**

`batch-optimizer.ts`：

1. import type `BatchTargetStatus`（加進 `@/stores/batch.types` 的既有 import）。
2. `runBatchOptimization` 簽名尾端加 `onTargetUpdate?: (index: number, status: BatchTargetStatus) => void`。
3. Phase 1 區塊：

```ts
  targets.forEach((_, i) => onTargetUpdate?.(i, { state: 'queued' }))
  await Promise.allSettled(targets.map(async (target, i) => {
    ...
    const result = await optimizeRecipe(target.recipe, gearset, (pct) => {
      recipePercents[i] = pct
      onTargetUpdate?.(i, { state: 'solving', percent: pct })
      emitAggregateProgress(target.recipe.name)
    }, buffs)
    ...成功分支（recipePercents[i] = 100 之處）加：
    onTargetUpdate?.(i, { state: 'done', steps: result.actions.length, isDoubleMax: result.isDoubleMax })
    ...exception / level-insufficient 分支（各自 recipePercents[i] = 100 之處）加：
    onTargetUpdate?.(i, { state: 'failed', reason: <該分支既有的 exception reason 字串> })
  }))
```

`steps` 用 `result.actions.length`（若該分支有更直接的 steps 欄位，以現行程式碼為準）；`reason` 沿用各分支塞進 `exceptions` 的同一字串，不另造文案。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/services/batch-optimizer.test.ts`
Expected: PASS（既有 44+ 與新 3 個）

- [ ] **Step 5: Commit**

```bash
git add src/services/batch-optimizer.ts src/stores/batch.types.ts src/__tests__/services/batch-optimizer.test.ts
git commit -m "feat(batch): per-target live status via optional onTargetUpdate callback"
```

---

### Task 3: batch store `liveTargets` + BatchView 橋接 + BatchProgress per-target 列表

**Files:**
- Modify: `src/stores/batch.ts`（state + reset 清理）
- Modify: `src/views/BatchView.vue`（`startOptimization` 橋接）
- Modify: `src/components/batch/BatchProgress.vue`（誠實 x/N + 狀態列表）
- Test: `src/__tests__/stores/batch.test.ts`（追加）、Create: `src/__tests__/components/BatchProgress.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `BatchTargetStatus` 與 `onTargetUpdate`。
- Produces: `batchStore.liveTargets: Ref<BatchTargetStatus[]>`（`startOptimization` 開跑時初始化為 queued×N；`cancel()` 不清、`resetAll()` 與新一輪開跑時重設；run 正常結束後清空為 `[]`）。

- [ ] **Step 1: Write the failing tests**

`batch.test.ts` 追加：

```ts
it('liveTargets defaults empty and resetAll clears it', () => {
  const store = useBatchStore()
  expect(store.liveTargets).toEqual([])
  store.liveTargets = [{ state: 'queued' }, { state: 'solving', percent: 40 }] as any
  store.resetAll()
  expect(store.liveTargets).toEqual([])
})
```

`BatchProgress.spec.ts`（新檔，mount 慣例參考 `MeldAdvisorCard.spec.ts`：createPinia + Element Plus stub 需求以該檔為準）：

```ts
it('renders per-target rows with status labels during solving phase', () => {
  // store 準備：targets 兩筆（名稱 A、B）、progress.phase='solving'、
  // liveTargets=[{state:'done',steps:12,isDoubleMax:true},{state:'solving',percent:55}]
  // 斷言：兩列都渲染；第一列含「完成」與名稱 A；第二列含「55%」與名稱 B；
  // 誠實計數顯示「已完成 1 / 2」。
})

it('counts failed targets into the honest completed counter', () => {
  // liveTargets=[{state:'failed',reason:'x'},{state:'queued'}] → 「已完成 1 / 2」，
  // 第一列顯示「失敗」字樣。
})

it('renders no target list when liveTargets is empty (pre-PR-3 behaviour)', () => {
  // liveTargets=[] → 不渲染列表容器（data-test="live-target-list" 不存在），
  // 原有單一進度條照常。
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/stores/batch.test.ts src/__tests__/components/BatchProgress.spec.ts`
Expected: FAIL（`liveTargets` 不存在；列表未渲染）

- [ ] **Step 3: Implement**

`batch.ts`：

```ts
import type { BatchResults, BatchTargetStatus } from './batch.types'
...
const liveTargets = ref<BatchTargetStatus[]>([])
// resetAll() 內加：liveTargets.value = []
// return 物件加 liveTargets
```

`BatchView.vue` `startOptimization`：

```ts
batchStore.liveTargets = batchStore.targets.map(() => ({ state: 'queued' as const }))
const results = await runBatchOptimization(
  ..., // 既有五個參數不動
  (index, status) => { batchStore.liveTargets[index] = status },
)
batchStore.results = results
batchStore.liveTargets = []   // run 正常結束清空（finally 不清：取消/失敗時保留最後狀態沒意義，catch 內也一併清空）
```

（catch 分支同樣 `batchStore.liveTargets = []`，維持「run 結束清空」。）

`BatchProgress.vue`：

```ts
const liveDone = computed(() =>
  batchStore.liveTargets.filter(t => t.state === 'done' || t.state === 'failed').length)

function targetLabel(t: BatchTargetStatus): string {
  switch (t.state) {
    case 'queued': return '排隊中'
    case 'solving': return `求解中 ${Math.round(t.percent)}%`
    case 'done': return t.isDoubleMax ? `完成 · ${t.steps} 步` : `完成 · ${t.steps} 步（未達雙滿）`
    case 'failed': return `失敗：${t.reason}`
  }
}
```

Template：在既有 `<el-progress>` 下方、取消鈕上方加

```html
<div v-if="batchStore.liveTargets.length > 0" class="live-target-list" data-test="live-target-list">
  <div class="live-target-counter">已完成 {{ liveDone }} / {{ batchStore.liveTargets.length }}</div>
  <div v-for="(t, i) in batchStore.liveTargets" :key="i" class="live-target-row" :data-state="t.state">
    <span class="live-target-name">{{ batchStore.targets[i]?.recipe.name ?? `#${i + 1}` }}</span>
    <span class="live-target-status">{{ targetLabel(t) }}</span>
  </div>
</div>
```

樣式：列表 `max-height: 240px; overflow-y: auto;`、row 用 flex 兩端對齊、`data-state="failed"` 的狀態字用既有 danger 色、`done` 用 success 色（沿用專案既有 CSS 變數／Element Plus 色票，貼 light theme）。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/stores/batch.test.ts src/__tests__/components/BatchProgress.spec.ts src/__tests__/components/BatchView.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/batch.ts src/views/BatchView.vue src/components/batch/BatchProgress.vue src/__tests__/stores/batch.test.ts src/__tests__/components/BatchProgress.spec.ts
git commit -m "feat(batch): live per-target status list with honest completion counter"
```

---

### Task 4: `adviseMeld` 增加 `onProgress`（#162）

**Files:**
- Modify: `src/services/meld-advisor.ts`（`AdviseMeldOptions` 255-269 行、rung 迴圈 ~1221-1264 行、`searchMinimalQualityDelta` 752-884 行）
- Test: `src/__tests__/services/meld-advisor.test.ts`（追加）

**Interfaces:**
- Produces（Task 5 依賴）：

```ts
export interface MeldAdviceProgress {
  /** 'baseline' = Step 0 / prefilter；'ladder' = craftsmanship 階梯搜尋 */
  stage: 'baseline' | 'ladder'
  /** 1-based；stage==='ladder' 才有 */
  rung?: number
  rungTotal?: number
  /** 本次 adviseMeld 累計 solver probe 數與預算上限 */
  probes: number
  probeBudget: number
}
// AdviseMeldOptions 加：onProgress?: (p: MeldAdviceProgress) => void
```

`probeBudget = 2 + ladder.length × MAX_QUALITY_PROBES`（既有註解 556-559 行的 worst-case 公式；ladder 定案後即固定）。

- [ ] **Step 1: Write the failing test**

```ts
it('reports onProgress across baseline and ladder rungs with monotonic probe counts (#162)', async () => {
  // 沿用檔內既有的可行性 fixture（會走進 ladder 至少 1 rung 的 gearset/recipe 組合，
  // 參考 #155/#159 測試的組裝），deps 用既有 fake solve/simulate。
  const events: MeldAdviceProgress[] = []
  const advice = await adviseMeld([recipe], gearset, priceMap, {
    initialQuality: 0,
    onProgress: (p) => events.push({ ...p }),
  }, fakeDeps)
  expect(events.length).toBeGreaterThan(0)
  expect(events[0].stage).toBe('baseline')
  const ladderEvents = events.filter(e => e.stage === 'ladder')
  expect(ladderEvents.length).toBeGreaterThan(0)
  expect(ladderEvents[0].rung).toBe(1)
  expect(ladderEvents[0].rungTotal).toBeGreaterThanOrEqual(1)
  // probes 單調不減、不超出 budget
  for (let k = 1; k < events.length; k++) expect(events[k].probes).toBeGreaterThanOrEqual(events[k - 1].probes)
  for (const e of events) expect(e.probes).toBeLessThanOrEqual(e.probeBudget)
  expect(advice.status).toBeTruthy() // 行為不變
})

it('omitting onProgress changes nothing (existing suite is the guard)', async () => {
  // 不需要新斷言——既有 1860 行套件全綠即證明。此測試只確認型別上 options 可省略 onProgress。
  await expect(adviseMeld([recipe], gearset, priceMap, { initialQuality: 0 }, fakeDeps)).resolves.toBeTruthy()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: 第一個 FAIL（events 空 / 型別錯誤）

- [ ] **Step 3: Implement**

`meld-advisor.ts`：

1. 匯出 `MeldAdviceProgress`，`AdviseMeldOptions` 加 `onProgress?`。
2. `adviseMeld` 內維護 `let probes = 0`，包一個 `noteProbe = () => { probes++; emitProgress() }`；`emitProgress(stageInfo)` 統一呼叫 `options.onProgress?.({...})`，任何 throw 由 `try { onProgress(...) } catch { /* progress must never break the advisor */ }` 吞掉。
3. 發射點：
   - Step 0 solve 前：`emit({ stage: 'baseline', probes, probeBudget: estimate })`——此時 ladder 尚未列舉，`probeBudget` 先用 `2 + MAX_CRAFTSMANSHIP_RUNGS × MAX_QUALITY_PROBES` 上界；ladder 定案後改用精確值（之後的事件都用精確值；測試只斷言 `probes ≤ probeBudget`，上界縮小不影響）。
   - Step 0 / prefilter 的每次 solve 後 `noteProbe()`。
   - rung 迴圈每輪開始：`emit({ stage: 'ladder', rung: i + 1, rungTotal: ladder.length, probes, probeBudget })`。
   - `searchMinimalQualityDelta` 加 optional 參數 `onProbe?: () => void`，在 `solveCount++`（785 行）旁呼叫；`adviseMeld` 傳入 `noteProbe`。
4. 不動任何搜尋決策：`onProgress` 純觀測。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: PASS（既有全部 + 新 2）

- [ ] **Step 5: Commit**

```bash
git add src/services/meld-advisor.ts src/__tests__/services/meld-advisor.test.ts
git commit -m "feat(meld-advisor): onProgress callback with rung/probe counters (#162)"
```

---

### Task 5: onProgress 消費端——MeldAdvisorCard 計數器 + batch Phase 6 平滑進度

**Files:**
- Modify: `src/composables/useMeldAdvisor.ts`（progress ref + 轉發）
- Modify: `src/components/MeldAdvisorCard.vue`（loading 區顯示）
- Modify: `src/services/batch-optimizer.ts`（Phase 6 emitMeld 分數化）
- Modify: `src/components/batch/BatchProgress.vue`（meld 計數顯示 floor）
- Test: `src/__tests__/composables/useMeldAdvisor.spec.ts`、`src/__tests__/components/MeldAdvisorCard.spec.ts`、`src/__tests__/services/batch-optimizer.test.ts`（各追加）

**Interfaces:**
- Consumes: Task 4 的 `MeldAdviceProgress` / `onProgress`。
- Produces: `useMeldAdvisor()` 回傳物多一個 `progress: ShallowRef<MeldAdviceProgress | null>`（run 開始設 null、事件更新、結束/取消設 null）。batch `onProgress` 的 `evaluating-meld` 事件 `completed` 變為「整數完成 job 數 + 進行中 job 的 probes/probeBudget 分數和」（float）；`total` 不變。

- [ ] **Step 1: Write the failing tests**

`useMeldAdvisor.spec.ts` 追加：

```ts
it('exposes live MeldAdviceProgress and clears it when the run settles', async () => {
  // mock adviseMeld：呼叫 options.onProgress 兩次（baseline → ladder rung1）後 resolve。
  // 斷言：run 期間 progress.value 依序更新（最後一筆 rung===1）；resolve 後 progress.value === null。
})

it('a superseded run cannot write progress anymore', async () => {
  // 第一個 run 的 adviseMeld 掛住並持有 onProgress；啟動第二個 run 後，
  // 手動呼叫第一個 run 的 onProgress → progress.value 不變（token guard）。
})
```

`MeldAdvisorCard.spec.ts` 追加：

```ts
it('shows rung/probe counter while loading when progress prop is provided', () => {
  // advice='loading' + progress={stage:'ladder',rung:2,rungTotal:6,probes:13,probeBudget:170}
  // → loading 區塊含「階梯 2/6」與「探測 13/170」（data-test="advisor-progress"）。
})

it('falls back to the static hint when progress is null', () => {
  // advice='loading', progress=null → 原有「計算中…」與 loading-hint 照舊，無 advisor-progress。
})
```

`batch-optimizer.test.ts` 追加：

```ts
it('evaluating-meld progress moves fractionally while jobs are still in flight', async () => {
  // adviseMeld mock：每個 job 先呼叫 options.onProgress({probes:14, probeBudget:28, ...})
  // 再掛 20ms 後 resolve。2 jobs 並行下，收集 evaluating-meld 事件，
  // 斷言存在 0 < completed < 2 的中間事件（修 PR-2 review 記錄的 0/2→2/2 凍結）。
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/composables/useMeldAdvisor.spec.ts src/__tests__/components/MeldAdvisorCard.spec.ts src/__tests__/services/batch-optimizer.test.ts`
Expected: 三處新測試 FAIL

- [ ] **Step 3: Implement**

`useMeldAdvisor.ts`：

```ts
const progress = shallowRef<MeldAdviceProgress | null>(null)
// runAdvisor 內：progress.value = null；adviseMeld options 加
//   onProgress: (p) => { if (!token.cancelled) progress.value = p }
// resolve/catch/cancel 後都設回 null。回傳物件加 progress。
```

`MeldAdvisorCard.vue`：props 加 `progress?: MeldAdviceProgress | null`（default null）。loading 區（192-211 行）在「計算中…」下方：

```html
<div v-if="progress" class="advisor-progress" data-test="advisor-progress">
  <template v-if="progress.stage === 'ladder'">階梯 {{ progress.rung }}/{{ progress.rungTotal }} · </template>探測 {{ progress.probes }}/{{ progress.probeBudget }}
</div>
```

呼叫端（單件頁使用 MeldAdvisorCard 之處，依 grep 實際位置）把 `useMeldAdvisor` 的 `progress` 綁進 prop。

`batch-optimizer.ts` Phase 6：

```ts
const jobFractions = new Array(jobEntries.length).fill(0)
const emitMeldSmooth = () => {
  const fracSum = jobFractions.reduce((s, f) => s + f, 0)
  onProgress({ completed: meldJobsDone + fracSum, total: meldJobTotal, name: '', phase: 'evaluating-meld', solverPercent: 100 })
}
// advisorLane 內 adviseMeld options 加：
//   onProgress: (p) => { jobFractions[i] = Math.min(0.99, p.probes / Math.max(1, p.probeBudget)); emitMeldSmooth() }
// job finally：jobFractions[i] = 0（完成改由 meldJobsDone 整數承載）後照舊 meldJobsDone++ 與 emitMeld。
```

`BatchProgress.vue`：`evaluating-meld` 的計數顯示改 `Math.floor(p.completed)`（percentage 計算照舊用原值，條會平滑爬升）。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/composables/useMeldAdvisor.spec.ts src/__tests__/components/MeldAdvisorCard.spec.ts src/__tests__/services/batch-optimizer.test.ts src/__tests__/components/BatchProgress.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/useMeldAdvisor.ts src/components/MeldAdvisorCard.vue src/services/batch-optimizer.ts src/components/batch/BatchProgress.vue src/__tests__/
git commit -m "feat(meld): surface advisor progress in single-craft card and batch meld phase (#162)"
```

---

### Task 6: SolverPanel 單件取消改 per-request AbortSignal

**Files:**
- Modify: `src/components/simulator/SolverPanel.vue`（`handleSolve` 136-165、`handleCancel` 167-172）
- Test: Create `src/__tests__/components/SolverPanel.spec.ts`

**Interfaces:**
- Consumes: `solveCraft(config, onProgress?, signal?)`（既有第三參數）、`SolveCancelledError`。
- Produces: `handleCancel` 不再呼叫全域 `cancelSolve()`；同時在跑的其他請求（batch、meld advisor）不受單件取消影響。

- [ ] **Step 1: Write the failing test（新檔；mock `@/solver/worker`，mount 慣例參考 MeldAdvisorCard.spec.ts + createTestingPinia／手動 pinia 設 store state，以能 render 出求解/取消按鈕為準）**

```ts
it('passes an AbortSignal to solveCraft and aborts it on cancel without calling cancelSolve', async () => {
  const deferred = createDeferred()
  let capturedSignal: AbortSignal | undefined
  vi.mocked(solveCraft).mockImplementation((_c, _p, signal) => { capturedSignal = signal; return deferred.promise as any })
  // mount SolverPanel（recipe/gearset store 塞好可求解狀態）→ 點求解
  ...
  expect(capturedSignal).toBeInstanceOf(AbortSignal)
  expect(capturedSignal!.aborted).toBe(false)
  // 點取消
  ...
  expect(capturedSignal!.aborted).toBe(true)
  expect(cancelSolve).not.toHaveBeenCalled()
  deferred.reject(new MockSolveCancelledError())
  await flushPromises()
  // 狀態顯示已取消、solverRunning 恢復 false
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/SolverPanel.spec.ts`
Expected: FAIL（`capturedSignal` undefined；`cancelSolve` 被呼叫）

- [ ] **Step 3: Implement**

`SolverPanel.vue`：

```ts
let solveController: AbortController | null = null

async function handleSolve() {
  ...
  solveController = new AbortController()
  try {
    const result = await solveCraft(config, (percent) => { progress.value = percent }, solveController.signal)
    ...
  } catch (err) {
    if (err instanceof SolveCancelledError) { /* handleCancel 已更新 UI，僅吞掉 */ }
    else { ...既有錯誤處理... }
  } finally {
    solveController = null
    ...
  }
}

function handleCancel() {
  solveController?.abort()
  status.value = 'cancelled'
  simStore.solverRunning = false
  ElMessage.info('求解已取消')
}
```

import 移除 `cancelSolve`、加 `SolveCancelledError`；`onUnmounted` 的 `disposeWorker()` 照舊（頁面卸載仍是全域清理，合理）。注意既有 catch 是否已處理 SolveCancelledError——以現行程式碼為準整併，別留下重複的取消訊息。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/SolverPanel.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/simulator/SolverPanel.vue src/__tests__/components/SolverPanel.spec.ts
git commit -m "fix(simulator): cancel single-craft solve via per-request AbortSignal instead of pool-wide cancelSolve"
```

---

### Task 7: 全量驗證 + 瀏覽器 UI 驗證 + spec 更新

- [ ] **Step 1: 四項全跑（主 session）**

```bash
npm run type-check && npx eslint <changed files> && npm test && npm run build
```

- [ ] **Step 2: 瀏覽器驗證（verify-by-ui pre-flight → chrome-devtools MCP）**

1. Batch 頁組 2+ 職業批次（BenchPanel gearset preset 不含 meld slot，鑲嵌建議驗證用 dataset 配方 + console 模組直呼替代；UI 驗證重點是 per-target 列表）：跑批次，截圖 `.tmp/screenshots/pr3-live-targets.png`——確認列表逐 target 更新、誠實計數、完成後列表消失且 results 正常揭露。
2. 單件頁：求解中按取消——確認即時取消、無「砍全 pool」副作用（開著 batch 同跑時 batch 不中斷）；截圖 `.tmp/screenshots/pr3-single-cancel.png`。
3. 單件鑲嵌建議：loading 區出現「階梯 x/N · 探測 y/M」計數（難配方可觀測）；截圖 `.tmp/screenshots/pr3-advisor-progress.png`。
4. Batch meld phase：進度條在 2-job 情境平滑爬升（不再 0/2 凍結跳 2/2）。

- [ ] **Step 3: spec §4 PR-3 段落補「已實作 + 驗證記錄」，commit**

```bash
git add docs/superpowers/specs/2026-07-07-batch-simulator-perf-experience-design.md
git commit -m "docs(spec): record PR-3 progressive results implementation notes"
```

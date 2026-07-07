# PR-1: Solve Result Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 WASM solver 加一層「完整 config 指紋」的結果快取（記憶體 + IndexedDB），讓相同求解跨重跑、跨 phase、跨頁面即時命中——不改變任何解的品質。

**Architecture:** 新模組 `src/solver/solve-cache.ts` 包住 `worker.ts` 的 `solveCraft`（所有 caller 自動受惠：batch Phase 1、buff 推薦、self-craft、meld advisor、單件頁）。key = `SOLVER_CACHE_EPOCH` + 排除 `taxonomy` 後的 canonical JSON。NoSolution 也快取；取消不快取；in-flight 同 key 共用 promise。持久層 IndexedDB，任何失敗靜默降級為純記憶體。

**Tech Stack:** Vue 3 + TypeScript + Vitest（jsdom，FakeWorker 測試慣例見 `src/__tests__/solver/worker-pool.test.ts`）。無新依賴。

**Spec:** `docs/superpowers/specs/2026-07-07-batch-simulator-perf-experience-design.md` §4 PR-1

## Global Constraints

- 解品質零妥協：快取只回放「同一 config 曾解出的結果」，不引入任何近似。
- 快取 key 用「整個 SolverConfig 序列化」（僅排除 analytics-only 的 `taxonomy`），不挑欄位。
- `SOLVER_CACHE_EPOCH` 常數放 `src/solver/pool-config.ts`，WASM rebuild 必 bump（本 PR 同步寫進 CLAUDE.md）。
- LRU 上限 `MAX_SOLVE_CACHE_ENTRIES = 500`。
- `simulate` / `simulate-detail` 不快取。
- BenchPanel 跑分一律 bypass 快取。
- 每 task 結尾跑該檔測試；PR 收尾四項全跑：`npm run type-check` / `npx eslint <changed files>` / `npm test` / `npm run build`。
- Commit message 英文、conventional commits；在 feature branch `perf/solve-result-cache` 上工作。

---

### Task 1: Cache key + epoch 常數

**Files:**
- Modify: `src/solver/pool-config.ts`
- Create: `src/solver/solve-cache.ts`
- Test: `src/__tests__/solver/solve-cache.test.ts`

**Interfaces:**
- Produces: `SOLVER_CACHE_EPOCH: string`（pool-config.ts）、`solveCacheKey(config: SolverConfig): string`（solve-cache.ts）

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/solver/solve-cache.test.ts
import { describe, it, expect } from 'vitest'
import { solveCacheKey } from '@/solver/solve-cache'
import { SOLVER_CACHE_EPOCH } from '@/solver/pool-config'
import type { SolverConfig } from '@/solver/raphael'

function baseConfig(overrides: Partial<SolverConfig> = {}): SolverConfig {
  return {
    recipe_level: 690, stars: 0, progress: 6600, quality: 12000, durability: 70,
    cp: 620, craftsmanship: 5000, control: 5000, crafter_level: 100,
    progress_divider: 130, quality_divider: 115, progress_modifier: 80, quality_modifier: 70,
    hq_target: true, initial_quality: 0,
    use_manipulation: true, use_heart_and_soul: false, use_quick_innovation: false,
    use_trained_eye: false, isExpert: false, adversarial: false,
    ...overrides,
  }
}

describe('solveCacheKey', () => {
  it('includes the epoch prefix', () => {
    expect(solveCacheKey(baseConfig()).startsWith(`${SOLVER_CACHE_EPOCH}:`)).toBe(true)
  })

  it('is stable regardless of field insertion order', () => {
    const a = baseConfig()
    // Rebuild with reversed key order — same values.
    const b = Object.fromEntries(Object.entries(a).reverse()) as unknown as SolverConfig
    expect(solveCacheKey(a)).toBe(solveCacheKey(b))
  })

  it('ignores analytics-only taxonomy', () => {
    const plain = baseConfig()
    const withTaxonomy = baseConfig({
      taxonomy: { rlv: 690, stars: 0, is_expert: false, is_collectable: false, craft_kind: 'gear' },
    })
    expect(solveCacheKey(withTaxonomy)).toBe(solveCacheKey(plain))
  })

  it('treats undefined optional fields the same as absent', () => {
    expect(solveCacheKey(baseConfig({ strict_quality: undefined }))).toBe(solveCacheKey(baseConfig()))
  })

  it('differs when any solve-affecting field differs', () => {
    expect(solveCacheKey(baseConfig({ control: 5001 }))).not.toBe(solveCacheKey(baseConfig()))
    expect(solveCacheKey(baseConfig({ strict_quality: true }))).not.toBe(solveCacheKey(baseConfig()))
    expect(solveCacheKey(baseConfig({ adversarial: true }))).not.toBe(solveCacheKey(baseConfig()))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/solver/solve-cache.test.ts`
Expected: FAIL —「Cannot find module '@/solver/solve-cache'」（以及 pool-config 沒有 `SOLVER_CACHE_EPOCH`）

- [ ] **Step 3: Implement**

`src/solver/pool-config.ts` 末尾加：

```ts
/**
 * Solve-result cache epoch. MUST be bumped on every WASM rebuild
 * (raphael upstream bump, wrapper change, flag semantics change) —
 * otherwise users replay solutions computed by the previous solver.
 * Format: '<upstream rev>-<local increment>'.
 */
export const SOLVER_CACHE_EPOCH = 'aafcbb0-1'
```

新檔 `src/solver/solve-cache.ts`：

```ts
/**
 * Solve-result cache (spec 2026-07-07 §4 PR-1, Tier A1).
 * Key = SOLVER_CACHE_EPOCH + canonical JSON of the FULL SolverConfig minus
 * `taxonomy` (analytics-only — different callers attach different taxonomy
 * for the same solve, and it never affects the solution).
 * Replays previously-computed solutions only — zero quality trade-off.
 */
import type { SolverConfig } from './raphael'
import { SOLVER_CACHE_EPOCH } from './pool-config'

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonicalize(v)]),
    )
  }
  return value
}

export function solveCacheKey(config: SolverConfig): string {
  const { taxonomy: _taxonomy, ...rest } = config
  return `${SOLVER_CACHE_EPOCH}:${JSON.stringify(canonicalize(rest))}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/solver/solve-cache.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add src/solver/pool-config.ts src/solver/solve-cache.ts src/__tests__/solver/solve-cache.test.ts
git commit -m "feat(solver): solve-cache key generation + SOLVER_CACHE_EPOCH"
```

---

### Task 2: 抽出 `SolveCancelledError` 到 `errors.ts`（解循環相依）

**Files:**
- Create: `src/solver/errors.ts`
- Modify: `src/solver/worker.ts:13-18`（移除 class 定義，改 re-export）

**Interfaces:**
- Produces: `SolveCancelledError`（`src/solver/errors.ts`）；`worker.ts` 繼續 re-export，**所有既有 import 路徑不變**（meld-advisor、batch-optimizer、測試都從 `@/solver/worker` import）。
- 動機：Task 3 的 cache 模組要辨識取消錯誤，但 `worker.ts` 將 import cache 模組——直接 import 會循環。

- [ ] **Step 1: Create `src/solver/errors.ts`**

```ts
// Extracted from worker.ts so solve-cache.ts can identify deliberate
// cancellations without importing worker.ts (which imports solve-cache —
// would be a module cycle).
export class SolveCancelledError extends Error {
  constructor(message = '求解已取消') {
    super(message)
    this.name = 'SolveCancelledError'
  }
}
```

- [ ] **Step 2: Replace the class in `worker.ts` with a re-export**

刪掉 `worker.ts` 第 13-18 行的 class 定義，改為：

```ts
export { SolveCancelledError } from './errors'
```

（`worker.ts` 內部用到 `SolveCancelledError` 的地方改成同一行 import：`import { SolveCancelledError } from './errors'`——注意 `export {...} from` 不會把名字帶進模組作用域，需要另一行 import。）

- [ ] **Step 3: Run the solver test suites to verify no regression**

Run: `npx vitest run src/__tests__/solver/`
Expected: PASS（既有 worker/worker-pool/config 測試全綠）

- [ ] **Step 4: Commit**

```bash
git add src/solver/errors.ts src/solver/worker.ts
git commit -m "refactor(solver): extract SolveCancelledError to errors.ts"
```

---

### Task 3: Cache core — lookup / store / negative / LRU / bypass / clear

**Files:**
- Modify: `src/solver/solve-cache.ts`
- Modify: `src/solver/raphael.ts:93-96`（`SolverResultWithTiming` 加 `cacheHit?: boolean`）
- Test: `src/__tests__/solver/solve-cache.test.ts`（追加）

**Interfaces:**
- Consumes: `solveCacheKey`（Task 1）、`SolveCancelledError`（Task 2）、`isNoSolutionError`（`raphael.ts` 既有）
- Produces:
  - `interface PersistedSolveEntry { kind: 'result' | 'no-solution'; result?: SolverResultWithTiming; errorMessage?: string; lastUsedAt: number }`
  - `interface SolveCachePersistence { getMeta(k: string): Promise<string | undefined>; setMeta(k: string, v: string): Promise<void>; get(k: string): Promise<PersistedSolveEntry | undefined>; set(k: string, e: PersistedSolveEntry): Promise<void>; delete(keys: string[]): Promise<void>; clear(): Promise<void>; allKeysWithLastUsed(): Promise<Array<{ key: string; lastUsedAt: number }>> }`
  - `cachedSolve(config: SolverConfig, runSolve: () => Promise<SolverResultWithTiming>, signal?: AbortSignal): Promise<SolverResultWithTiming>`
  - `setSolveCacheBypass(v: boolean): void` / `clearSolveCache(): Promise<void>` / `MAX_SOLVE_CACHE_ENTRIES = 500`
  - `setSolveCachePersistence(p: SolveCachePersistence | null): void`（測試注入；`null` = 純記憶體）

- [ ] **Step 1: Write the failing tests（追加到 solve-cache.test.ts）**

```ts
import { beforeEach, vi } from 'vitest'
import {
  cachedSolve, setSolveCacheBypass, clearSolveCache,
  setSolveCachePersistence, MAX_SOLVE_CACHE_ENTRIES,
  type PersistedSolveEntry, type SolveCachePersistence,
} from '@/solver/solve-cache'
import { SolveCancelledError } from '@/solver/errors'
import { NO_SOLUTION_MESSAGE } from '@/solver/raphael'

function makeFakePersistence() {
  const meta = new Map<string, string>()
  const entries = new Map<string, PersistedSolveEntry>()
  const p: SolveCachePersistence = {
    getMeta: async (k) => meta.get(k),
    setMeta: async (k, v) => { meta.set(k, v) },
    get: async (k) => entries.get(k),
    set: async (k, e) => { entries.set(k, e) },
    delete: async (keys) => { for (const k of keys) entries.delete(k) },
    clear: async () => { entries.clear() },
    allKeysWithLastUsed: async () =>
      [...entries.entries()].map(([key, e]) => ({ key, lastUsedAt: e.lastUsedAt })),
  }
  return { p, meta, entries }
}

const okResult = { actions: ['basicSynthesis'], progress: 100, quality: 200, steps: 1, wasmDur: 1234 }

describe('cachedSolve', () => {
  beforeEach(async () => {
    setSolveCacheBypass(false)
    setSolveCachePersistence(null)
    await clearSolveCache()
  })

  it('runs the solver on miss and replays on hit with cacheHit flag', async () => {
    const runSolve = vi.fn().mockResolvedValue({ ...okResult })
    const miss = await cachedSolve(baseConfig(), runSolve)
    expect(miss.cacheHit).toBeFalsy()
    const hit = await cachedSolve(baseConfig(), runSolve)
    expect(runSolve).toHaveBeenCalledTimes(1)
    expect(hit.cacheHit).toBe(true)
    expect(hit.actions).toEqual(['basicSynthesis'])
  })

  it('caches NoSolution rejections and replays them', async () => {
    const runSolve = vi.fn().mockRejectedValue(new Error(NO_SOLUTION_MESSAGE))
    await expect(cachedSolve(baseConfig(), runSolve)).rejects.toThrow(NO_SOLUTION_MESSAGE)
    await expect(cachedSolve(baseConfig(), runSolve)).rejects.toThrow(NO_SOLUTION_MESSAGE)
    expect(runSolve).toHaveBeenCalledTimes(1)
  })

  it('does NOT cache cancellations or unknown errors', async () => {
    const cancelled = vi.fn().mockRejectedValueOnce(new SolveCancelledError()).mockResolvedValue({ ...okResult })
    await expect(cachedSolve(baseConfig(), cancelled)).rejects.toBeInstanceOf(SolveCancelledError)
    await expect(cachedSolve(baseConfig(), cancelled)).resolves.toMatchObject({ steps: 1 })
    expect(cancelled).toHaveBeenCalledTimes(2)

    const crashed = vi.fn().mockRejectedValueOnce(new Error('worker crashed')).mockResolvedValue({ ...okResult })
    await expect(cachedSolve(baseConfig({ control: 1 }), crashed)).rejects.toThrow('worker crashed')
    await expect(cachedSolve(baseConfig({ control: 1 }), crashed)).resolves.toMatchObject({ steps: 1 })
  })

  it('bypass skips lookup AND store', async () => {
    const runSolve = vi.fn().mockResolvedValue({ ...okResult })
    setSolveCacheBypass(true)
    await cachedSolve(baseConfig(), runSolve)
    await cachedSolve(baseConfig(), runSolve)
    expect(runSolve).toHaveBeenCalledTimes(2)
    setSolveCacheBypass(false)
    await cachedSolve(baseConfig(), runSolve)
    expect(runSolve).toHaveBeenCalledTimes(3) // bypass 期間沒有寫入
  })

  it('clearSolveCache empties memory and persistence', async () => {
    const { p, entries } = makeFakePersistence()
    setSolveCachePersistence(p)
    const runSolve = vi.fn().mockResolvedValue({ ...okResult })
    await cachedSolve(baseConfig(), runSolve)
    expect(entries.size).toBe(1)
    await clearSolveCache()
    expect(entries.size).toBe(0)
    await cachedSolve(baseConfig(), runSolve)
    expect(runSolve).toHaveBeenCalledTimes(2)
  })

  it('evicts oldest-used entries past MAX_SOLVE_CACHE_ENTRIES', async () => {
    const { p, entries } = makeFakePersistence()
    setSolveCachePersistence(p)
    const runSolve = vi.fn().mockResolvedValue({ ...okResult })
    for (let i = 0; i < MAX_SOLVE_CACHE_ENTRIES + 3; i++) {
      await cachedSolve(baseConfig({ control: 1000 + i }), runSolve)
    }
    expect(entries.size).toBe(MAX_SOLVE_CACHE_ENTRIES)
    // 最早的 3 筆（control=1000..1002）被淘汰 → 再要一次會重解
    await cachedSolve(baseConfig({ control: 1000 }), runSolve)
    expect(runSolve).toHaveBeenCalledTimes(MAX_SOLVE_CACHE_ENTRIES + 4)
  })

  it('hydrates from persistence on a fresh module (memory cold)', async () => {
    const { p } = makeFakePersistence()
    const key = solveCacheKey(baseConfig())
    p.set(key, { kind: 'result', result: { ...okResult }, lastUsedAt: 1 })
    p.setMeta('epoch', SOLVER_CACHE_EPOCH)
    setSolveCachePersistence(p)
    const runSolve = vi.fn()
    const hit = await cachedSolve(baseConfig(), runSolve)
    expect(runSolve).not.toHaveBeenCalled()
    expect(hit.cacheHit).toBe(true)
  })

  it('clears persisted entries when the stored epoch differs', async () => {
    const { p, meta, entries } = makeFakePersistence()
    entries.set('stale-key', { kind: 'result', result: { ...okResult }, lastUsedAt: 1 })
    meta.set('epoch', 'old-epoch-0')
    setSolveCachePersistence(p)
    const runSolve = vi.fn().mockResolvedValue({ ...okResult })
    await cachedSolve(baseConfig(), runSolve)
    expect(entries.has('stale-key')).toBe(false)
    expect(meta.get('epoch')).toBe(SOLVER_CACHE_EPOCH)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/solver/solve-cache.test.ts`
Expected: FAIL —「cachedSolve is not exported」等

- [ ] **Step 3: Implement（追加到 solve-cache.ts）**

```ts
import { SolveCancelledError } from './errors'
import { isNoSolutionError } from './raphael'
import type { SolverResultWithTiming } from './raphael'

export const MAX_SOLVE_CACHE_ENTRIES = 500

export interface PersistedSolveEntry {
  kind: 'result' | 'no-solution'
  result?: SolverResultWithTiming
  errorMessage?: string
  lastUsedAt: number
}

export interface SolveCachePersistence {
  getMeta(k: string): Promise<string | undefined>
  setMeta(k: string, v: string): Promise<void>
  get(k: string): Promise<PersistedSolveEntry | undefined>
  set(k: string, e: PersistedSolveEntry): Promise<void>
  delete(keys: string[]): Promise<void>
  clear(): Promise<void>
  allKeysWithLastUsed(): Promise<Array<{ key: string; lastUsedAt: number }>>
}

let bypass = false
let persistence: SolveCachePersistence | null = null
let initPromise: Promise<void> | null = null
const memory = new Map<string, PersistedSolveEntry>()
/** key → lastUsedAt for ALL persisted entries (values load lazily). */
const keyIndex = new Map<string, number>()

export function setSolveCacheBypass(v: boolean): void { bypass = v }

export function setSolveCachePersistence(p: SolveCachePersistence | null): void {
  persistence = p
  initPromise = null
  memory.clear()
  keyIndex.clear()
}

export async function clearSolveCache(): Promise<void> {
  memory.clear()
  keyIndex.clear()
  await persistence?.clear().catch(() => {})
}

/** Epoch check + key-index hydration. Any persistence failure degrades to memory-only. */
async function ensureInit(): Promise<void> {
  if (!persistence) return
  initPromise ??= (async () => {
    try {
      const stored = await persistence!.getMeta('epoch')
      if (stored !== SOLVER_CACHE_EPOCH) {
        await persistence!.clear()
        await persistence!.setMeta('epoch', SOLVER_CACHE_EPOCH)
        return
      }
      for (const { key, lastUsedAt } of await persistence!.allKeysWithLastUsed()) {
        keyIndex.set(key, lastUsedAt)
      }
    } catch {
      persistence = null
    }
  })()
  await initPromise
}

async function lookup(key: string): Promise<PersistedSolveEntry | undefined> {
  const inMemory = memory.get(key)
  if (inMemory) return inMemory
  if (!keyIndex.has(key) || !persistence) return undefined
  const persisted = await persistence.get(key).catch(() => undefined)
  if (persisted) memory.set(key, persisted)
  return persisted
}

function store(key: string, entry: PersistedSolveEntry): void {
  memory.set(key, entry)
  keyIndex.set(key, entry.lastUsedAt)
  persistence?.set(key, entry).catch(() => {})
  if (keyIndex.size > MAX_SOLVE_CACHE_ENTRIES) {
    const excess = [...keyIndex.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, keyIndex.size - MAX_SOLVE_CACHE_ENTRIES)
      .map(([k]) => k)
    for (const k of excess) { keyIndex.delete(k); memory.delete(k) }
    persistence?.delete(excess).catch(() => {})
  }
}

function touch(key: string, entry: PersistedSolveEntry): void {
  entry.lastUsedAt = Date.now()
  keyIndex.set(key, entry.lastUsedAt)
  persistence?.set(key, entry).catch(() => {})
}

export async function cachedSolve(
  config: SolverConfig,
  runSolve: () => Promise<SolverResultWithTiming>,
  signal?: AbortSignal,
): Promise<SolverResultWithTiming> {
  if (bypass) return runSolve()
  await ensureInit()
  const key = solveCacheKey(config)
  const hit = await lookup(key)
  if (hit) {
    touch(key, hit)
    if (hit.kind === 'no-solution') throw new Error(hit.errorMessage)
    return { ...hit.result!, cacheHit: true }
  }
  return runSolve().then(
    (r) => {
      const { cacheHit: _cacheHit, ...persisted } = r
      store(key, { kind: 'result', result: persisted, lastUsedAt: Date.now() })
      return r
    },
    (err: unknown) => {
      if (!(err instanceof SolveCancelledError) && isNoSolutionError(err)) {
        const message = err instanceof Error ? err.message : String(err)
        store(key, { kind: 'no-solution', errorMessage: message, lastUsedAt: Date.now() })
      }
      throw err
    },
  )
}
```

`src/solver/raphael.ts` 的 `SolverResultWithTiming` 加欄位：

```ts
export interface SolverResultWithTiming extends SolverResult {
  wasmDur?: number
  runtimeStats?: SolverRuntimeStats
  /** True when this result was replayed from the solve-result cache. */
  cacheHit?: boolean
}
```

（`signal` 參數本 task 尚未使用——Task 4 的 coalescing 會用到；先放進簽名避免 Task 4 改動所有測試呼叫。eslint 對未使用參數若報錯，命名為 `signal?: AbortSignal` 並在函式 JSDoc 註明 Task 4 使用。）

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/solver/solve-cache.test.ts`
Expected: PASS（13 tests）

- [ ] **Step 5: Commit**

```bash
git add src/solver/solve-cache.ts src/solver/raphael.ts src/__tests__/solver/solve-cache.test.ts
git commit -m "feat(solver): solve-result cache core with LRU + negative caching"
```

---

### Task 4: In-flight coalescing + abort 語意

**Files:**
- Modify: `src/solver/solve-cache.ts`
- Test: `src/__tests__/solver/solve-cache.test.ts`（追加）

**Interfaces:**
- Consumes: Task 3 全部。
- Produces: `cachedSolve` 語意擴充——同 key 併發共用一次 `runSolve`；follower 自己的 signal 中止只 reject follower，不影響 leader；leader 取消時所有 follower 一併收到 `SolveCancelledError`（已知限制，罕見情境）。

- [ ] **Step 1: Write the failing tests（追加）**

```ts
describe('cachedSolve in-flight coalescing', () => {
  beforeEach(async () => {
    setSolveCacheBypass(false)
    setSolveCachePersistence(null)
    await clearSolveCache()
  })

  it('concurrent same-key calls share one runSolve', async () => {
    let release!: (r: typeof okResult) => void
    const gate = new Promise<typeof okResult>((r) => { release = r })
    const runSolve = vi.fn().mockReturnValue(gate)
    const p1 = cachedSolve(baseConfig(), runSolve)
    const p2 = cachedSolve(baseConfig(), runSolve)
    release({ ...okResult })
    const [r1, r2] = await Promise.all([p1, p2])
    expect(runSolve).toHaveBeenCalledTimes(1)
    expect(r1.cacheHit).toBeFalsy()          // leader 真的跑了 solver
    expect(r2.cacheHit).toBe(true)           // follower 沒付出 solve 成本
  })

  it("follower's own abort rejects only the follower", async () => {
    let release!: (r: typeof okResult) => void
    const gate = new Promise<typeof okResult>((r) => { release = r })
    const runSolve = vi.fn().mockReturnValue(gate)
    const follower = new AbortController()
    const p1 = cachedSolve(baseConfig(), runSolve)
    const p2 = cachedSolve(baseConfig(), runSolve, follower.signal)
    follower.abort()
    await expect(p2).rejects.toBeInstanceOf(SolveCancelledError)
    release({ ...okResult })
    await expect(p1).resolves.toMatchObject({ steps: 1 })
  })

  it('does not coalesce across different keys', async () => {
    const runSolve = vi.fn().mockResolvedValue({ ...okResult })
    await Promise.all([
      cachedSolve(baseConfig(), runSolve),
      cachedSolve(baseConfig({ cp: 1 }), runSolve),
    ])
    expect(runSolve).toHaveBeenCalledTimes(2)
  })

  it('leader rejection propagates to followers and nothing is cached on cancel', async () => {
    let rejectGate!: (e: Error) => void
    const gate = new Promise<never>((_, rej) => { rejectGate = rej })
    const runSolve = vi.fn().mockReturnValueOnce(gate).mockResolvedValue({ ...okResult })
    const p1 = cachedSolve(baseConfig(), runSolve)
    const p2 = cachedSolve(baseConfig(), runSolve)
    rejectGate(new SolveCancelledError())
    await expect(p1).rejects.toBeInstanceOf(SolveCancelledError)
    await expect(p2).rejects.toBeInstanceOf(SolveCancelledError)
    await expect(cachedSolve(baseConfig(), runSolve)).resolves.toMatchObject({ steps: 1 })
    expect(runSolve).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/solver/solve-cache.test.ts`
Expected: FAIL — coalescing 尚未實作（`runSolve` 被叫 2 次）

- [ ] **Step 3: Implement**

`solve-cache.ts` 加 module state 與 helper，並改寫 `cachedSolve` 的 miss 路徑：

```ts
const inFlight = new Map<string, Promise<SolverResultWithTiming>>()

/** Follower path: share the leader's promise; the follower's own AbortSignal
 *  rejects just this follower (the leader keeps running). */
function followShared(
  shared: Promise<SolverResultWithTiming>,
  signal?: AbortSignal,
): Promise<SolverResultWithTiming> {
  const tagged = shared.then((r) => ({ ...r, cacheHit: true }))
  if (!signal) return tagged
  if (signal.aborted) return Promise.reject(new SolveCancelledError())
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new SolveCancelledError())
    signal.addEventListener('abort', onAbort, { once: true })
    tagged.then(
      (r) => { signal.removeEventListener('abort', onAbort); resolve(r) },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e) },
    )
  })
}
```

`cachedSolve` 的 miss 段落改為：

```ts
  const existing = inFlight.get(key)
  if (existing) return followShared(existing, signal)

  const shared = runSolve().then(
    (r) => {
      const { cacheHit: _cacheHit, ...persisted } = r
      store(key, { kind: 'result', result: persisted, lastUsedAt: Date.now() })
      return r
    },
    (err: unknown) => {
      if (!(err instanceof SolveCancelledError) && isNoSolutionError(err)) {
        const message = err instanceof Error ? err.message : String(err)
        store(key, { kind: 'no-solution', errorMessage: message, lastUsedAt: Date.now() })
      }
      throw err
    },
  ).finally(() => { inFlight.delete(key) })
  inFlight.set(key, shared)
  return shared
```

（leader 的 `signal` 由 caller 傳進 `runSolve` 內部的 `bindAbort` 處理——cache 層不重複綁。）

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/solver/solve-cache.test.ts`
Expected: PASS（17 tests）

- [ ] **Step 5: Commit**

```bash
git add src/solver/solve-cache.ts src/__tests__/solver/solve-cache.test.ts
git commit -m "feat(solver): in-flight coalescing with follower abort semantics"
```

---

### Task 5: IndexedDB persistence adapter

**Files:**
- Modify: `src/solver/solve-cache.ts`
- Test: `src/__tests__/solver/solve-cache.test.ts`（追加）

**Interfaces:**
- Consumes: `SolveCachePersistence`（Task 3）。
- Produces: module 內部 `createIdbPersistence(): SolveCachePersistence | null`（`typeof indexedDB === 'undefined'` 回 `null`）；`cachedSolve` 首次呼叫時 lazy 選定 default persistence。jsdom 測試環境沒有 indexedDB → 自動走純記憶體，**既有測試不需要 IDB mock**。

- [ ] **Step 1: Write the failing test（追加）**

```ts
describe('default persistence selection', () => {
  it('falls back to memory-only when indexedDB is unavailable (jsdom)', async () => {
    // jsdom 沒有 indexedDB — 用「未注入 persistence」的預設路徑跑一次即可證明不炸。
    setSolveCachePersistence(undefined as unknown as null) // 觸發重新選擇 default
    const runSolve = vi.fn().mockResolvedValue({ ...okResult })
    await expect(cachedSolve(baseConfig({ cp: 777 }), runSolve)).resolves.toMatchObject({ steps: 1 })
    const hit = await cachedSolve(baseConfig({ cp: 777 }), runSolve)
    expect(hit.cacheHit).toBe(true)
  })
})
```

實作時把 `setSolveCachePersistence` 的參數型別改為 `SolveCachePersistence | null | undefined`：`undefined` = 「回到 default 選擇」、`null` = 「強制純記憶體」。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/solver/solve-cache.test.ts`
Expected: FAIL（default 選擇邏輯還不存在——`undefined` 被當成 `null` 直接通過的話，改斷言方式前先確認：本測試主要鎖「default 路徑不炸」，若直接通過則跳到 Step 3 實作 IDB adapter 後重跑）

- [ ] **Step 3: Implement**

`solve-cache.ts`：

```ts
let persistenceChosen = false

function createIdbPersistence(): SolveCachePersistence | null {
  if (typeof indexedDB === 'undefined') return null
  let dbPromise: Promise<IDBDatabase> | null = null
  const getDb = (): Promise<IDBDatabase> => {
    dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open('ff14ch-solve-cache', 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries')
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
    })
    return dbPromise
  }
  const tx = async <T>(
    store: 'entries' | 'meta',
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await getDb()
    return new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(store, mode).objectStore(store))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'))
    })
  }
  return {
    getMeta: (k) => tx('meta', 'readonly', (s) => s.get(k) as IDBRequest<string | undefined>),
    setMeta: async (k, v) => { await tx('meta', 'readwrite', (s) => s.put(v, k)) },
    get: (k) => tx('entries', 'readonly', (s) => s.get(k) as IDBRequest<PersistedSolveEntry | undefined>),
    set: async (k, e) => { await tx('entries', 'readwrite', (s) => s.put(e, k)) },
    delete: async (keys) => { for (const k of keys) await tx('entries', 'readwrite', (s) => s.delete(k)) },
    clear: async () => { await tx('entries', 'readwrite', (s) => s.clear()) },
    allKeysWithLastUsed: async () => {
      const [keys, values] = await Promise.all([
        tx<IDBValidKey[]>('entries', 'readonly', (s) => s.getAllKeys()),
        tx<PersistedSolveEntry[]>('entries', 'readonly', (s) => s.getAll()),
      ])
      return keys.map((k, i) => ({ key: String(k), lastUsedAt: values[i]?.lastUsedAt ?? 0 }))
    },
  }
}
```

`setSolveCachePersistence` 與 `ensureInit` 的選擇邏輯：

```ts
export function setSolveCachePersistence(p: SolveCachePersistence | null | undefined): void {
  persistence = p ?? null
  persistenceChosen = p !== undefined   // undefined = 回到 default（下次 ensureInit 重選）
  initPromise = null
  memory.clear()
  keyIndex.clear()
}
```

`ensureInit()` 開頭加：

```ts
  if (!persistenceChosen) {
    persistence = createIdbPersistence()
    persistenceChosen = true
  }
```

（並把 `ensureInit` 內兩處 `persistence!` 前的 guard 從 `if (!persistence) return` 移到 default 選擇之後。）

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/solver/solve-cache.test.ts`
Expected: PASS（18 tests）

- [ ] **Step 5: Commit**

```bash
git add src/solver/solve-cache.ts src/__tests__/solver/solve-cache.test.ts
git commit -m "feat(solver): IndexedDB persistence for solve cache with epoch invalidation"
```

---

### Task 6: `worker.ts` 整合 — `solveCraft` 走快取、analytics 集中到 wrapper

**Files:**
- Modify: `src/solver/worker.ts:274-322`
- Test: `src/__tests__/solver/worker-pool.test.ts`（追加 + 可能修正既有 await 節奏）
- 檢查: `src/__tests__/solver/worker.test.ts`（analytics 斷言）

**Interfaces:**
- Consumes: `cachedSolve`（Task 3/4）。
- Produces: `solveCraft(config, onProgress?, signal?)` 簽名**不變**、回傳多帶 `cacheHit`。analytics 事件語意：`solver_start` / `solver_rerun` 每次呼叫照發（含 cache hit）；`solver_complete` 加 `cache_hit: boolean` 參數；`solver_failed` 含快取重播的 NoSolution 照發。cache hit 時 `onProgress(100)` 發一次。
- GA 註記：`cache_hit` 是新 event param，未在 GA 註冊前報表不會顯示值（見 memory reference_ga_custom_dims）——不阻擋本 PR。

- [ ] **Step 1: Write the failing test（追加到 worker-pool.test.ts）**

```ts
// PR-1: identical config solved twice must dispatch to the worker only once —
// the second call replays from the solve cache with cacheHit=true.
it('replays identical config from cache without a second dispatch', async () => {
  const { solveCraft, waitForWasm } = await import('@/solver/worker')
  const { clearSolveCache, setSolveCachePersistence } = await import('@/solver/solve-cache')
  setSolveCachePersistence(null)
  await clearSolveCache()
  await waitForWasm()

  const config = { progress: 100, crafter_level: 90 } as any
  const p1 = solveCraft(config)
  await vi.waitFor(() => {
    expect(FakeWorker.instances.flatMap(w => w.postedMessages.filter(m => m.type === 'solve'))).toHaveLength(1)
  })
  const solveMsg = FakeWorker.instances.flatMap(w => w.postedMessages.filter(m => m.type === 'solve'))[0]
  FakeWorker.instances.find(w => w.postedMessages.includes(solveMsg))!
    .fireMessage({ type: 'result', requestId: solveMsg.requestId, result: { ...stubResult, actions: ['x'] }, wasmDur: 42 })
  const r1 = await p1
  expect(r1.cacheHit).toBeFalsy()

  const r2 = await solveCraft(config)
  expect(r2.cacheHit).toBe(true)
  expect(r2.actions).toEqual(['x'])
  const dispatched = FakeWorker.instances.flatMap(w => w.postedMessages.filter(m => m.type === 'solve'))
  expect(dispatched).toHaveLength(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/solver/worker-pool.test.ts`
Expected: 新測試 FAIL（第二次呼叫 dispatch 了第二個 solve）

- [ ] **Step 3: Implement**

`worker.ts`：import 加 `import { cachedSolve } from './solve-cache'`。把現有 `solveCraft`（274-322 行）拆成：

```ts
/** Raw pool dispatch — no analytics, no cache. Wrapped by solveCraft. */
function solveCraftUncached(
  config: SolverConfig,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<SolverResultWithTiming> {
  const requestId = nextRequestId++
  return new Promise<SolverResultWithTiming>((resolve, reject) => {
    pendingRequests.set(requestId, { onProgress, resolve, reject })
    dispatchOrQueue('solve', { config: { ...config } }, requestId)
    bindAbort(requestId, signal)
  })
}

export function solveCraft(
  config: SolverConfig,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<SolverResultWithTiming> {
  const startedAt = performance.now()
  const fp = solverInputFingerprint(config)
  const runIndex = (solverRerunCounts.get(fp) ?? 0) + 1
  solverRerunCounts.set(fp, runIndex)

  trackEvent('solver_start', {
    crafter_level: config.crafter_level, recipe_level: config.recipe_level,
    hq_target: config.hq_target,
    gear_bucket: classifyGearBucket(config.crafter_level, config.craftsmanship, config.control),
    ...(config.taxonomy ?? {}),
  })
  if (runIndex >= 2) trackEvent('solver_rerun', { run_index: runIndex })

  return cachedSolve(config, () => solveCraftUncached(config, onProgress, signal), signal).then(
    (r) => {
      if (r.cacheHit) onProgress?.(100)
      trackEvent('solver_complete', {
        duration_ms: Math.round(performance.now() - startedAt),
        action_count: r.actions.length, steps: r.steps,
        wasm_duration_ms: r.wasmDur !== undefined ? Math.round(r.wasmDur) : undefined,
        cache_hit: r.cacheHit === true,
        ...(config.taxonomy ?? {}),
      })
      return r
    },
    (err: Error) => {
      if (!(err instanceof SolveCancelledError)) {
        trackEvent('solver_failed', { reason: err.message })
        trackError(`solver_failed: ${err.message}`)
        noteSolverFailed()
      }
      throw err
    },
  )
}
```

（原本塞在 `pendingRequests` resolve/reject wrapper 裡的 analytics 全部移除——現在 uncached 版是乾淨的 dispatch。）

- [ ] **Step 4: Run the full solver suites; repair await-timing fallout**

Run: `npx vitest run src/__tests__/solver/`

`solveCraft` 現在是 async 包裝（cache lookup 需要 microtask），既有測試裡「呼叫後等一個 microtask 就斷言 dispatch」的節奏可能不夠。修法規則（保持測試意圖不變）：

1. `await new Promise<void>(resolve => queueMicrotask(() => resolve()))` → 改 `await vi.waitFor(() => { expect(<原本的 dispatch 斷言>) })`，或 `await new Promise<void>(r => setTimeout(r, 0))`。
2. 同一測試內用相同 config 呼叫兩次 `solveCraft` 並期待兩次 dispatch 的（例如 rerun 計數測試）：在兩次呼叫之間插入
   ```ts
   const { clearSolveCache } = await import('@/solver/solve-cache')
   await clearSolveCache()
   ```
   （rerun 計數在 wrapper、cache 之前，語意不受 cache 影響；清快取只是恢復 dispatch 行為。）
3. `worker.test.ts` 對 `solver_complete` payload 的斷言若用 `toEqual` 全比對，補上 `cache_hit: false`。

Expected: PASS（全部 solver 測試綠）

- [ ] **Step 5: Commit**

```bash
git add src/solver/worker.ts src/__tests__/solver/
git commit -m "feat(solver): route solveCraft through solve-result cache"
```

---

### Task 7: `[bperf]` cache 欄位 + BenchPanel bypass 與清除鈕

**Files:**
- Modify: `src/services/batch-optimizer.ts:57-65`
- Modify: `src/components/batch/BenchPanel.vue`

**Interfaces:**
- Consumes: `SolverResultWithTiming.cacheHit`（Task 3）、`setSolveCacheBypass` / `clearSolveCache`（Task 3）。
- Produces: `[bperf]` log 尾端新增 ` cache=hit|miss`（BenchPanel 既有 regex 用 `wasmDur=` 錨點截取、不受尾端追加影響）；BenchPanel 跑分期間 bypass 快取、新增「清除快取」按鈕。

- [ ] **Step 1: batch-optimizer `[bperf]` log 加 cache 欄**

`batch-optimizer.ts` 62-64 行的 `console.debug` 改為：

```ts
    console.debug(
      `[bperf] solve ${recipe.name} wasmDur=${solverResult.wasmDur.toFixed(0)}ms steps=${solverResult.actions.length}${statsTail} cache=${solverResult.cacheHit ? 'hit' : 'miss'}`
    )
```

注意：cache hit 時 `wasmDur` 是「原次求解」的耗時，`cache=hit` 就是讀者判讀依據。

- [ ] **Step 2: BenchPanel — bypass + 清除鈕**

`BenchPanel.vue` `<script setup>` import 區加：

```ts
import { setSolveCacheBypass, clearSolveCache } from '@/solver/solve-cache'
```

`runDataset` 的 `try` 開頭（`const url = ...` 之前）加 `setSolveCacheBypass(true)`；`finally` 區塊（`console.debug = origDebug` 旁）加 `setSolveCacheBypass(false)`。

`<script setup>` 加：

```ts
const cacheCleared = ref(false)
async function onClearCache() {
  await clearSolveCache()
  cacheCleared.value = true
  setTimeout(() => { cacheCleared.value = false }, 2000)
}
```

Template 第二個 `.controls` div（Run 按鈕那排）尾端加：

```html
      <button :disabled="running" @click="onClearCache">清除快取</button>
      <span v-if="cacheCleared">已清除</span>
```

- [ ] **Step 3: Run full test suite to verify no regression**

Run: `npm test`
Expected: PASS（既有 batch-optimizer 測試不斷言 [bperf] 字串格式則全綠；若有 snapshot/字串斷言，同步更新為含 ` cache=` 尾巴）

- [ ] **Step 4: Commit**

```bash
git add src/services/batch-optimizer.ts src/components/batch/BenchPanel.vue
git commit -m "feat(bench): cache-aware bperf log + BenchPanel cache bypass and clear"
```

---

### Task 8: CLAUDE.md epoch 檢查清單

**Files:**
- Modify: `CLAUDE.md`（「WASM Build」小節）

- [ ] **Step 1: 在 CLAUDE.md「WASM Build」小節的建置指令 bullet 之後加一條**

```markdown
- **Rebuild 後必須 bump `SOLVER_CACHE_EPOCH`**（`src/solver/pool-config.ts`）：solve-result cache 以此常數區分 solver 版本，忘記 bump 會讓使用者拿到舊 WASM 算出的快取解。格式 `<upstream rev>-<local increment>`。
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: SOLVER_CACHE_EPOCH bump reminder in WASM build checklist"
```

---

### Task 9: 全量驗證 + 瀏覽器實測

- [ ] **Step 1: 四項全跑**

```bash
npm run type-check
npx eslint src/solver/ src/services/batch-optimizer.ts src/components/batch/BenchPanel.vue
npm test
npm run build
```

Expected: 全綠（測試數 ≥ 既有 920 + 本 PR 新增 ~19）

- [ ] **Step 2: 瀏覽器實測（真實快取效果）**

1. `npm run dev`，開批量製作頁，加 2-3 個配方，跑一次完整計算 → DevTools console 應看到 `[bperf] ... cache=miss`。
2. 不改任何設定重跑一次 → `cache=hit`，Phase 1（solving 段）近乎瞬時。
3. 開 `/#/batch?bench=1`，跑 dataset-1 兩次 → 兩次 wall 應相近（bypass 生效，不受快取汙染）。
4. 按「清除快取」→ 回批量頁重跑 → 回到 `cache=miss`。
5. 重新整理頁面後重跑同批 → `cache=hit`（IndexedDB 持久化生效）。

- [ ] **Step 3: 更新 spec 狀態**

spec `2026-07-07-batch-simulator-perf-experience-design.md` 的 §4 PR-1 段落補一行實測結果（第二次跑的 Phase 1 wall），佐證成功指標第 1 條。

- [ ] **Step 4: Commit（若有 spec 更新）**

```bash
git add docs/superpowers/specs/2026-07-07-batch-simulator-perf-experience-design.md
git commit -m "docs(spec): record PR-1 cache verification numbers"
```

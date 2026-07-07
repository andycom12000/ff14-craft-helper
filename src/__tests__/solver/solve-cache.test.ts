import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  solveCacheKey,
  cachedSolve, setSolveCacheBypass, clearSolveCache,
  setSolveCachePersistence, MAX_SOLVE_CACHE_ENTRIES,
  type PersistedSolveEntry, type SolveCachePersistence,
} from '@/solver/solve-cache'
import { SOLVER_CACHE_EPOCH } from '@/solver/pool-config'
import { SolveCancelledError } from '@/solver/errors'
import { NO_SOLUTION_MESSAGE } from '@/solver/raphael'
import type { SolverConfig, SolverResultWithTiming } from '@/solver/raphael'

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

function makeResult(actions: string[]): SolverResultWithTiming {
  return { ...okResult, actions }
}

/** Exposes resolve/reject for a promise created outside a Promise executor —
 *  same "gate" pattern the sibling coalescing tests use inline, generalised
 *  for tests that need to release it from a nested scope. */
function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** Drains the microtask queue via a macrotask boundary (real timers — this
 *  file never enables fake timers) so a leader can register itself in
 *  `inFlight` before a follower call is made, without racing on tick count. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

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

  it('respects an already-aborted signal on a cache hit (does not return the cached result)', async () => {
    const runSolve = vi.fn().mockResolvedValue({ ...okResult })
    await cachedSolve(baseConfig(), runSolve) // populate the cache
    const aborted = new AbortController()
    aborted.abort()
    await expect(cachedSolve(baseConfig(), runSolve, aborted.signal))
      .rejects.toBeInstanceOf(SolveCancelledError)
    expect(runSolve).toHaveBeenCalledTimes(1) // still just the original miss
  })

  it('defensively copies actions on a cache hit so mutating the result cannot poison the cache', async () => {
    const runSolve = vi.fn().mockResolvedValue({ ...okResult })
    await cachedSolve(baseConfig(), runSolve) // miss
    const hit1 = await cachedSolve(baseConfig(), runSolve)
    hit1.actions.push('mutated')
    const hit2 = await cachedSolve(baseConfig(), runSolve)
    expect(hit2.actions).toEqual(['basicSynthesis'])
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

describe('cachedSolve in-flight coalescing', () => {
  const config = baseConfig()

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

  it('a cancelled leader triggers a live follower takeover instead of propagating the cancel', async () => {
    // Leader's own run is cancelled (e.g. its caller aborted, or pool
    // teardown) — the follower never asked for that and has no signal of its
    // own, so it must take over with a fresh run rather than inherit the
    // leader's cancellation.
    let rejectGate!: (e: Error) => void
    const gate = new Promise<never>((_, rej) => { rejectGate = rej })
    const runSolve = vi.fn().mockReturnValueOnce(gate).mockResolvedValue({ ...okResult })
    const p1 = cachedSolve(baseConfig(), runSolve)
    const p2 = cachedSolve(baseConfig(), runSolve)
    rejectGate(new SolveCancelledError())
    await expect(p1).rejects.toBeInstanceOf(SolveCancelledError) // leader's own cancellation still surfaces to its own caller
    await expect(p2).resolves.toMatchObject({ steps: 1 }) // follower takes over instead of inheriting the cancel
    expect(runSolve).toHaveBeenCalledTimes(2) // leader's cancelled attempt + the takeover re-run

    // The cancelled leader run itself was never cached — only the takeover's
    // fresh success was, so a subsequent call replays that instead of
    // re-dispatching a third time.
    await expect(cachedSolve(baseConfig(), runSolve)).resolves.toMatchObject({ steps: 1 })
    expect(runSolve).toHaveBeenCalledTimes(2)
  })

  it('a live follower takes over with a fresh solve when the leader is cancelled', async () => {
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
    const runSolve = vi.fn(async () => {
      throw new SolveCancelledError() // every attempt cancelled (simulates pool teardown)
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
    const { p, meta, entries } = makeFakePersistence()
    const key = solveCacheKey(config)
    meta.set('epoch', SOLVER_CACHE_EPOCH) // skip the clear-on-epoch-mismatch path
    entries.set(key, { kind: 'result', result: makeResult(['cached']), lastUsedAt: 1 }) // hydrates keyIndex so lookup() actually awaits persistence.get
    const gate = createDeferred<PersistedSolveEntry | undefined>()
    p.get = () => gate.promise
    setSolveCachePersistence(p)
    const ctl = new AbortController()
    const runSolve = vi.fn()
    const result = cachedSolve(config, runSolve as any, ctl.signal)
    await flushMicrotasks()
    ctl.abort()
    gate.resolve(undefined)
    await expect(result).rejects.toBeInstanceOf(SolveCancelledError)
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

  it('an already-aborted follower does not cause an unhandled rejection when the leader later rejects', async () => {
    const unhandled: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => { unhandled.push(reason) }
    process.on('unhandledRejection', onUnhandledRejection)
    try {
      let rejectGate!: (e: Error) => void
      const gate = new Promise<never>((_, rej) => { rejectGate = rej })
      const runSolve = vi.fn().mockReturnValueOnce(gate).mockResolvedValue({ ...okResult })
      const p1 = cachedSolve(baseConfig(), runSolve)

      const aborted = new AbortController()
      aborted.abort()
      const p2 = cachedSolve(baseConfig(), runSolve, aborted.signal)
      await expect(p2).rejects.toBeInstanceOf(SolveCancelledError)

      rejectGate(new Error('leader crashed'))
      await expect(p1).rejects.toThrow('leader crashed')

      // Give any unhandledrejection a chance to surface.
      await new Promise((r) => setTimeout(r, 0))
      await Promise.resolve()

      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })
})

describe('default persistence selection', () => {
  it('falls back to memory-only when indexedDB is unavailable (jsdom)', async () => {
    // jsdom 沒有 indexedDB — 用「未注入 persistence」的預設路徑跑一次即可證明不炸。
    setSolveCachePersistence(undefined) // 觸發重新選擇 default
    const runSolve = vi.fn().mockResolvedValue({ ...okResult })
    await expect(cachedSolve(baseConfig({ cp: 777 }), runSolve)).resolves.toMatchObject({ steps: 1 })
    const hit = await cachedSolve(baseConfig({ cp: 777 }), runSolve)
    expect(hit.cacheHit).toBe(true)
  })
})

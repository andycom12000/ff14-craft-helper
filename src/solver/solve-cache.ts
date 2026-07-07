/**
 * Solve-result cache (spec 2026-07-07 §4 PR-1, Tier A1).
 * Key = SOLVER_CACHE_EPOCH + canonical JSON of the FULL SolverConfig minus
 * `taxonomy` (analytics-only — different callers attach different taxonomy
 * for the same solve, and it never affects the solution).
 * Replays previously-computed solutions only — zero quality trade-off.
 */
import { SolveCancelledError } from './errors'
import { isNoSolutionError } from './raphael'
import type { SolverConfig, SolverResultWithTiming } from './raphael'
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

/**
 * Looks up a cached solve result, replaying it on hit; otherwise runs
 * `runSolve` and stores the outcome (success or NoSolution) for next time.
 * Concurrent calls for the same key share a single in-flight `runSolve`
 * (the leader); followers get a tagged copy of the leader's result and may
 * abort independently via their own `signal` without affecting the leader.
 * @param signal Aborts only this caller when following an in-flight solve;
 * the leader's own cancellation is handled by `runSolve` internally.
 */
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
}

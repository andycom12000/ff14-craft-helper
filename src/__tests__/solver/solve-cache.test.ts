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

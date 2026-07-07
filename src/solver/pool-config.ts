// src/solver/pool-config.ts
// Shared between worker.ts (main thread pool size) and
// solver-worker.ts (per-worker rayon thread cap).
// POOL_SIZE is hwc-derived (derivePoolSize); deriveRayonThreads keeps the rayon
// invariant threads*pool ≤ hwc so workers never oversubscribe cores.

/**
 * Adaptive worker-pool size from CPU logical-core count.
 *
 * Bench-gated on an i7-12700 (20 logical cores, clean env, min-of-5 total wall,
 * per-cell spread 3–8%), Boundary lv100 gearset, dataset-1/2/3:
 *   pool 2→3: total wall −23.5% / −16.8% / −18.0% (median −18%), zero regression.
 *   pool 3→4: median only −1.4% (inside noise) AND dataset-1 regressed +2.4%,
 *             at the cost of a 4th WASM instance — not a measurable win.
 * Cap at 3: it captures the whole clear win; 4 doesn't earn its extra instance.
 * Below 12 cores stays at 2 (behaviour unchanged). Full data + A/B protocol:
 * docs/superpowers/specs/2026-07-07-batch-simulator-perf-experience-design.md §5 PR-6.
 */
export function derivePoolSize(hwc: number): number {
  if (hwc >= 12) return 3
  return 2
}

// Resolved once at module load. hwc is identical on the main thread (worker.ts)
// and inside every solver Web Worker (solver-worker.ts), so both contexts
// compute the same POOL_SIZE and the rayon invariant holds in each.
export const POOL_SIZE = derivePoolSize(
  (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4,
)

/**
 * Derive per-worker rayon thread count from CPU concurrency.
 * Centralised so the low-hwc clamp and any future 4-core fallback heuristic
 * live next to POOL_SIZE rather than scattered across worker init code.
 */
export function deriveRayonThreads(hwc: number): number {
  return Math.max(1, Math.floor(hwc / POOL_SIZE))
}

/**
 * Solve-result cache epoch. MUST be bumped on every WASM rebuild
 * (raphael upstream bump, wrapper change, flag semantics change) —
 * otherwise users replay solutions computed by the previous solver.
 * Format: '<upstream rev>-<local increment>'.
 */
export const SOLVER_CACHE_EPOCH = '70e068e-1'

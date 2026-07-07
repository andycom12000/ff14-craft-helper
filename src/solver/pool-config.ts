// src/solver/pool-config.ts
// Shared between worker.ts (main thread pool size) and
// solver-worker.ts (per-worker rayon thread cap).
// Keep these in sync — Sprint 1 derives rayon threads via deriveRayonThreads.
export const POOL_SIZE = 2

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
export const SOLVER_CACHE_EPOCH = 'aafcbb0-1'

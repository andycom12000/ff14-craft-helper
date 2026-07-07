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

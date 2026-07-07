// Extracted from worker.ts so solve-cache.ts can identify deliberate
// cancellations without importing worker.ts (which imports solve-cache —
// would be a module cycle).
export class SolveCancelledError extends Error {
  constructor(message = '求解已取消') {
    super(message)
    this.name = 'SolveCancelledError'
  }
}

// A solve that exceeded its per-solve deadline (batch Phase-1). Distinct from
// SolveCancelledError so the batch pipeline can surface "求解超時" as its own
// exception type (retry-eligible) instead of a generic failure or a user
// cancellation. The deadline aborts via the same AbortSignal path, so the
// underlying rejection is SolveCancelledError — withSolveDeadline re-labels it
// to this ONLY when its own timer fired (not an outer cancel).
export class SolveTimeoutError extends Error {
  constructor(message = '求解超時') {
    super(message)
    this.name = 'SolveTimeoutError'
  }
}

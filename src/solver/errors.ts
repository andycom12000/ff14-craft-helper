// Extracted from worker.ts so solve-cache.ts can identify deliberate
// cancellations without importing worker.ts (which imports solve-cache —
// would be a module cycle).
export class SolveCancelledError extends Error {
  constructor(message = '求解已取消') {
    super(message)
    this.name = 'SolveCancelledError'
  }
}

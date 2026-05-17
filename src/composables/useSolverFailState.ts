// Tracks the timestamp of the most recent solver failure so that
// `useSolverInputAudit` can detect "user edited input within 60s of failing".
// Module-private state — only the helpers below are public.

let failedAt: number | null = null

export function noteSolverFailed(): void {
  failedAt = Date.now()
}

export function consumeRecentFailure(windowMs: number): boolean {
  if (failedAt === null) return false
  const recent = Date.now() - failedAt <= windowMs
  failedAt = null
  return recent
}

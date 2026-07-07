import { describe, it, expect, vi } from 'vitest'
import { withSolveDeadline, DEFAULT_BATCH_SOLVE_DEADLINE_MS } from '@/services/batch-optimizer'
import { SolveTimeoutError, SolveCancelledError } from '@/solver/errors'

describe('withSolveDeadline', () => {
  it('exposes a 60s default deadline constant', () => {
    expect(DEFAULT_BATCH_SOLVE_DEADLINE_MS).toBe(60_000)
  })

  it('rejects SolveTimeoutError when the run overruns the deadline', async () => {
    vi.useFakeTimers()
    // run models a solve that only settles when its AbortSignal fires — exactly
    // how solveCraft behaves (abort → cancelRequest → SolveCancelledError).
    const run = (signal: AbortSignal) =>
      new Promise<number>((_res, rej) => {
        signal.addEventListener('abort', () => rej(new SolveCancelledError()), { once: true })
      })
    const p = withSolveDeadline(run, 1_000)
    const assertion = expect(p).rejects.toBeInstanceOf(SolveTimeoutError)
    await vi.advanceTimersByTimeAsync(1_001)
    await assertion
    vi.useRealTimers()
  })

  it('returns the run value when it finishes before the deadline', async () => {
    const r = await withSolveDeadline(async () => 42, 60_000)
    expect(r).toBe(42)
  })

  it('propagates a non-timeout rejection unchanged (not re-labeled as timeout)', async () => {
    const boom = new Error('solver exploded')
    await expect(withSolveDeadline(async () => { throw boom }, 60_000)).rejects.toBe(boom)
  })

  it('propagates SolveCancelledError unchanged when the timer did NOT fire (outer cancel)', async () => {
    // Simulates a whole-batch cancel (cancelSolve terminates the pool) landing
    // before the deadline: rejection is SolveCancelledError, timer never fired,
    // so it must stay a cancellation — never a timeout.
    const cancel = new SolveCancelledError()
    await expect(withSolveDeadline(async () => { throw cancel }, 60_000)).rejects.toBe(cancel)
  })
})

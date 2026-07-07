// src/__tests__/solver/worker-pool.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// #132: assert that deliberate cancellations are NOT counted as solver failures.
// Mock the fail-state + analytics sinks so we can observe what the reject wrapper
// records. Re-evaluated per test via resetModules() in beforeEach.
vi.mock('@/composables/useSolverFailState', () => ({ noteSolverFailed: vi.fn() }))
vi.mock('@/utils/analytics', () => ({ trackEvent: vi.fn(), trackError: vi.fn() }))

// Auto-ready FakeWorker: fires `{ type: 'ready' }` on construction so
// waitForWasm() resolves immediately. Use `NeverReadyWorker` for tests that
// need to observe mid-pool-init behaviour (e.g. cancel before ready).
class FakeWorker {
  static instances: FakeWorker[] = []
  static handlers = new WeakMap<FakeWorker, Set<(e: MessageEvent) => void>>()
  postedMessages: any[] = []
  constructor() {
    FakeWorker.instances.push(this)
    FakeWorker.handlers.set(this, new Set())
    queueMicrotask(() => this.fireMessage({ type: 'ready' }))
  }
  addEventListener(_: string, cb: (e: MessageEvent) => void) {
    FakeWorker.handlers.get(this)!.add(cb)
  }
  terminated = false
  postMessage(data: any) { this.postedMessages.push(data) }
  terminate() { this.terminated = true }
  set onmessage(_cb: any) {}
  fireMessage(data: any) {
    for (const cb of FakeWorker.handlers.get(this)!) cb({ data } as MessageEvent)
  }
}

// Same shape as FakeWorker but never fires `ready` — keeps `wasmStatus`
// pinned at `'loading'` so waitForWasm() pushes a waiter and parks.
class NeverReadyWorker {
  static instances: NeverReadyWorker[] = []
  static handlers = new WeakMap<NeverReadyWorker, Set<(e: MessageEvent) => void>>()
  postedMessages: any[] = []
  constructor() {
    NeverReadyWorker.instances.push(this)
    NeverReadyWorker.handlers.set(this, new Set())
  }
  addEventListener(_: string, cb: (e: MessageEvent) => void) {
    NeverReadyWorker.handlers.get(this)!.add(cb)
  }
  postMessage(data: any) { this.postedMessages.push(data) }
  terminate() {}
  set onmessage(_cb: any) {}
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.resetModules()
  // The fail-state/analytics mocks persist across module resets; clear their
  // call history so per-test assertions (#132) start from a clean slate.
  vi.clearAllMocks()
})
afterEach(() => { vi.unstubAllGlobals() })

const stubResult = { actions: [], progress: 0, quality: 0, steps: 0 }

describe('solver worker pool', () => {
  it('spawns two workers; concurrent solves dispatch to different slots', async () => {
    const { solveCraft, waitForWasm } = await import('@/solver/worker')
    await waitForWasm()
    const p1 = solveCraft({ progress: 100 } as any)
    const p2 = solveCraft({ progress: 200 } as any)
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    expect(FakeWorker.instances).toHaveLength(2)
    const slot0Solves = FakeWorker.instances[0].postedMessages.filter(m => m.type === 'solve')
    const slot1Solves = FakeWorker.instances[1].postedMessages.filter(m => m.type === 'solve')
    expect(slot0Solves).toHaveLength(1)
    expect(slot1Solves).toHaveLength(1)

    FakeWorker.instances[0].fireMessage({ type: 'result', requestId: slot0Solves[0].requestId, result: { ...stubResult, actions: ['a'] } })
    FakeWorker.instances[1].fireMessage({ type: 'result', requestId: slot1Solves[0].requestId, result: { ...stubResult, actions: ['b'] } })
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1.actions).toEqual(['a'])
    expect(r2.actions).toEqual(['b'])
  })

  it('queues third solve when both slots busy; drains on completion', async () => {
    const { solveCraft, waitForWasm } = await import('@/solver/worker')
    await waitForWasm()
    const p1 = solveCraft({ progress: 100 } as any)
    const p2 = solveCraft({ progress: 200 } as any)
    const p3 = solveCraft({ progress: 300 } as any)
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    const dispatched = FakeWorker.instances.flatMap(w => w.postedMessages.filter(m => m.type === 'solve'))
    expect(dispatched).toHaveLength(2)

    FakeWorker.instances[0].fireMessage({ type: 'result', requestId: dispatched[0].requestId, result: stubResult })
    await p1
    const after = FakeWorker.instances.flatMap(w => w.postedMessages.filter(m => m.type === 'solve'))
    expect(after).toHaveLength(3)

    FakeWorker.instances[1].fireMessage({ type: 'result', requestId: after[1].requestId, result: stubResult })
    FakeWorker.instances[0].fireMessage({ type: 'result', requestId: after[2].requestId, result: stubResult })
    await Promise.all([p2, p3])
  })

  // #132: per-request abort. Aborting ONE request must terminate only the slot
  // running it (freeing the pool slot) and leave any other in-flight request
  // alone — unlike cancelSolve which nukes the whole pool.
  it('cancelRequest rejects only the targeted request and terminates its slot', async () => {
    const { solveCraft, cancelRequest, waitForWasm, SolveCancelledError } = await import('@/solver/worker')
    await waitForWasm()
    const p1 = solveCraft({ progress: 100 } as any).catch(e => e)
    const p2 = solveCraft({ progress: 200 } as any).catch(e => e)
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    // slot0 ran p1, slot1 ran p2 (dispatch order)
    const slot0Solve = FakeWorker.instances[0].postedMessages.find(m => m.type === 'solve')
    const slot1Solve = FakeWorker.instances[1].postedMessages.find(m => m.type === 'solve')

    cancelRequest(slot0Solve.requestId)

    const r1 = await p1
    expect(r1).toBeInstanceOf(SolveCancelledError)
    // The worker running p1 was terminated and a replacement spawned.
    expect(FakeWorker.instances[0].terminated).toBe(true)
    expect(FakeWorker.instances).toHaveLength(3) // 2 original + 1 replacement

    // p2 is untouched — resolve it normally.
    FakeWorker.instances[1].fireMessage({
      type: 'result', requestId: slot1Solve.requestId, result: { ...stubResult, actions: ['b'] },
    })
    const r2 = await p2
    expect(r2).not.toBeInstanceOf(Error)
    expect(r2.actions).toEqual(['b'])
  })

  it('cancelRequest frees the slot: a later solve runs on the respawned worker', async () => {
    const { solveCraft, cancelRequest, waitForWasm } = await import('@/solver/worker')
    await waitForWasm()
    const p1 = solveCraft({ progress: 100 } as any).catch(e => e)
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    const slot0Solve = FakeWorker.instances[0].postedMessages.find(m => m.type === 'solve')

    cancelRequest(slot0Solve.requestId)
    await p1
    // Replacement worker (index 2) auto-fires 'ready' on construction.
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    // A new solve must dispatch (not hang in the queue) — the freed slot is live.
    const p3 = solveCraft({ progress: 300 } as any)
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    const dispatched = FakeWorker.instances.flatMap(w => w.postedMessages.filter(m => m.type === 'solve'))
    // p1 (cancelled) + p3 = 2 solve messages total dispatched across live workers.
    expect(dispatched.length).toBe(2)
    const p3Solve = dispatched.find(m => m.requestId !== slot0Solve.requestId)!
    // resolve p3 to settle the promise
    const owner = FakeWorker.instances.find(w => w.postedMessages.some(m => m.requestId === p3Solve.requestId))!
    owner.fireMessage({ type: 'result', requestId: p3Solve.requestId, result: stubResult })
    await expect(p3).resolves.toBeDefined()
  })

  // #132: a cancel is not a failure. cancelRequest rejects with
  // SolveCancelledError, which must NOT fire solver_failed / noteSolverFailed —
  // otherwise routine advisor supersedes/timeouts would inflate failure
  // analytics and mis-arm the input-change-after-fail audit.
  it('cancelRequest does not record a solver failure', async () => {
    const { solveCraft, cancelRequest, waitForWasm } = await import('@/solver/worker')
    const { noteSolverFailed } = await import('@/composables/useSolverFailState')
    const { trackEvent } = await import('@/utils/analytics')
    await waitForWasm()
    const p1 = solveCraft({ progress: 100 } as any).catch(() => { /* expected cancel */ })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    const slot0Solve = FakeWorker.instances[0].postedMessages.find(m => m.type === 'solve')

    cancelRequest(slot0Solve.requestId)
    await p1

    expect(vi.mocked(noteSolverFailed)).not.toHaveBeenCalled()
    expect(vi.mocked(trackEvent)).not.toHaveBeenCalledWith('solver_failed', expect.anything())
  })

  it('a genuine solve error still records a solver failure', async () => {
    const { solveCraft, waitForWasm } = await import('@/solver/worker')
    const { noteSolverFailed } = await import('@/composables/useSolverFailState')
    await waitForWasm()
    const p1 = solveCraft({ progress: 100 } as any).catch(() => { /* expected error */ })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    const slot0Solve = FakeWorker.instances[0].postedMessages.find(m => m.type === 'solve')

    FakeWorker.instances[0].fireMessage({ type: 'error', requestId: slot0Solve.requestId, error: 'boom' })
    await p1

    expect(vi.mocked(noteSolverFailed)).toHaveBeenCalledTimes(1)
  })

  it('cancelRequest is a no-op for an unknown / already-settled request', async () => {
    const { solveCraft, cancelRequest, waitForWasm } = await import('@/solver/worker')
    await waitForWasm()
    const p1 = solveCraft({ progress: 100 } as any)
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    const slot0Solve = FakeWorker.instances[0].postedMessages.find(m => m.type === 'solve')
    FakeWorker.instances[0].fireMessage({ type: 'result', requestId: slot0Solve.requestId, result: stubResult })
    await p1
    // request already settled → cancelRequest must not terminate anything.
    cancelRequest(slot0Solve.requestId)
    expect(FakeWorker.instances[0].terminated).toBe(false)
    expect(FakeWorker.instances).toHaveLength(2)
  })

  // #132: AbortSignal threaded into solveCraft aborts via cancelRequest.
  it('an AbortSignal passed to solveCraft aborts that request', async () => {
    const { solveCraft, waitForWasm, SolveCancelledError } = await import('@/solver/worker')
    await waitForWasm()
    const controller = new AbortController()
    const p1 = solveCraft({ progress: 100 } as any, undefined, controller.signal).catch(e => e)
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    controller.abort()
    const r1 = await p1
    expect(r1).toBeInstanceOf(SolveCancelledError)
    expect(FakeWorker.instances[0].terminated).toBe(true)
  })

  // PR-1: identical config solved twice must dispatch to the worker only once —
  // the second call replays from the solve cache with cacheHit=true.
  it('replays identical config from cache without a second dispatch', async () => {
    const { solveCraft, waitForWasm } = await import('@/solver/worker')
    const { clearSolveCache, setSolveCachePersistence } = await import('@/solver/solve-cache')
    setSolveCachePersistence(null)
    await clearSolveCache()
    await waitForWasm()

    const config = { progress: 100, crafter_level: 90 } as any
    const p1 = solveCraft(config)
    await vi.waitFor(() => {
      expect(FakeWorker.instances.flatMap(w => w.postedMessages.filter(m => m.type === 'solve'))).toHaveLength(1)
    })
    const solveMsg = FakeWorker.instances.flatMap(w => w.postedMessages.filter(m => m.type === 'solve'))[0]
    FakeWorker.instances.find(w => w.postedMessages.includes(solveMsg))!
      .fireMessage({ type: 'result', requestId: solveMsg.requestId, result: { ...stubResult, actions: ['x'] }, wasmDur: 42 })
    const r1 = await p1
    expect(r1.cacheHit).toBeFalsy()

    const r2 = await solveCraft(config)
    expect(r2.cacheHit).toBe(true)
    expect(r2.actions).toEqual(['x'])
    const dispatched = FakeWorker.instances.flatMap(w => w.postedMessages.filter(m => m.type === 'solve'))
    expect(dispatched).toHaveLength(1)
  })

  it('cancelSolve rejects in-flight and queued solves', async () => {
    const { solveCraft, cancelSolve, waitForWasm } = await import('@/solver/worker')
    await waitForWasm()
    const p1 = solveCraft({ progress: 100 } as any).catch(e => e.message)
    const p2 = solveCraft({ progress: 200 } as any).catch(e => e.message)
    const p3 = solveCraft({ progress: 300 } as any).catch(e => e.message)
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    cancelSolve()
    const results = await Promise.all([p1, p2, p3])
    expect(results.every(r => r === '求解已取消')).toBe(true)
  })
})

describe('solver worker pool · cancel mid-init', () => {
  beforeEach(() => {
    NeverReadyWorker.instances = []
    vi.stubGlobal('Worker', NeverReadyWorker)
    vi.resetModules()
  })

  // Regression: GitHub Issue #66. Before the fix, cancelSolve() bailed early
  // when pendingRequests / taskQueue were empty and never drained
  // wasmReadyWaiters / wasmErrorWaiters — so any waitForWasm() awaiter that
  // queued before the pool emitted 'ready' would hang forever, sticking the
  // UI on the "preparing solver" spinner.
  it('cancelSolve rejects pending waitForWasm awaiters with SolveCancelledError', async () => {
    const { waitForWasm, cancelSolve, SolveCancelledError } = await import('@/solver/worker')
    // First call to waitForWasm bootstraps the pool (which will never fire 'ready')
    // and parks a waiter.
    const p1 = waitForWasm()
    const p2 = waitForWasm()
    // Concurrent awaiters all park; without the fix they hang forever.
    cancelSolve()
    await expect(p1).rejects.toBeInstanceOf(SolveCancelledError)
    await expect(p2).rejects.toBeInstanceOf(SolveCancelledError)
  })

  it('cancelSolve is still a no-op when nothing is pending and no awaiters parked', async () => {
    const { cancelSolve } = await import('@/solver/worker')
    // No waitForWasm() / solveCraft() calls — pool is not even constructed.
    cancelSolve()
    expect(NeverReadyWorker.instances).toHaveLength(0)
  })
})

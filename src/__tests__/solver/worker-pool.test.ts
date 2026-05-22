// src/__tests__/solver/worker-pool.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
  postMessage(data: any) { this.postedMessages.push(data) }
  terminate() {}
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

  it('cancelSolve rejects in-flight and queued solves', async () => {
    const { solveCraft, cancelSolve, SOLVE_CANCELLED, waitForWasm } = await import('@/solver/worker')
    await waitForWasm()
    const p1 = solveCraft({ progress: 100 } as any).catch(e => e.message)
    const p2 = solveCraft({ progress: 200 } as any).catch(e => e.message)
    const p3 = solveCraft({ progress: 300 } as any).catch(e => e.message)
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))

    cancelSolve()
    const results = await Promise.all([p1, p2, p3])
    expect(results.every(r => r === SOLVE_CANCELLED)).toBe(true)
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

// src/__tests__/solver/worker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/analytics', () => ({
  trackEvent: vi.fn(),
  trackError: vi.fn(),
}))

vi.mock('@/composables/useSolverFailState', () => ({
  noteSolverFailed: vi.fn(),
}))

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

import { trackEvent } from '@/utils/analytics'

describe('solveCraft taxonomy payload', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
    vi.resetModules()
    vi.mocked(trackEvent).mockClear()
  })

  it('emits solver_start with taxonomy fields when provided', async () => {
    const { solveCraft, waitForWasm } = await import('@/solver/worker')
    await waitForWasm()

    // Fire-and-forget — we don't care about the result, only the start event
    solveCraft({
      crafter_level: 100, recipe_level: 640,
      craftsmanship: 4000, control: 4000, cp: 600,
      hq_target: 80,
      taxonomy: { stars: 2, is_expert: false, is_collectable: false, craft_kind: 'normal' },
    } as any).catch(() => { /* expected — fake worker never resolves */ })

    expect(vi.mocked(trackEvent)).toHaveBeenCalledWith('solver_start', expect.objectContaining({
      stars: 2, is_expert: false, is_collectable: false, craft_kind: 'normal',
    }))
  })

  it('emits solver_start without taxonomy when not provided (internal callers)', async () => {
    const { solveCraft, waitForWasm } = await import('@/solver/worker')
    await waitForWasm()

    solveCraft({
      crafter_level: 100, recipe_level: 640,
      craftsmanship: 4000, control: 4000, cp: 600,
      hq_target: 80,
    } as any).catch(() => {})

    const calls = vi.mocked(trackEvent).mock.calls.filter(c => c[0] === 'solver_start')
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[calls.length - 1][1]).not.toHaveProperty('stars')
  })
})

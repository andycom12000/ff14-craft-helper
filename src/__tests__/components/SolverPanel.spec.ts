import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import SolverPanel from '@/components/simulator/SolverPanel.vue'
import { useRecipeStore, type Recipe } from '@/stores/recipe'
import { useSimulatorStore } from '@/stores/simulator'
import type { CraftParams } from '@/engine/simulator'

// #167/#168 follow-up: single-craft cancel must abort only its own in-flight
// request via AbortSignal, never the pool-wide cancelSolve() (that would kill
// unrelated batch/meld-advisor requests sharing the worker pool).

const { MockSolveCancelledError } = vi.hoisted(() => {
  class MockSolveCancelledError extends Error {
    constructor(message = '求解已取消') {
      super(message)
      this.name = 'SolveCancelledError'
    }
  }
  return { MockSolveCancelledError }
})

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/solver/worker', () => ({
  solveCraft: vi.fn(),
  cancelSolve: vi.fn(),
  disposeWorker: vi.fn(),
  waitForWasm: vi.fn().mockResolvedValue(undefined),
  getWasmStatus: vi.fn().mockReturnValue({ status: 'ready' }),
  SolveCancelledError: MockSolveCancelledError,
}))

import { solveCraft, cancelSolve } from '@/solver/worker'

function createDeferred<T = unknown>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const mockRecipe: Recipe = {
  id: 1, itemId: 100, name: 'Test', icon: '', job: 'CRP',
  level: 90, stars: 0, canHq: true, materialQualityFactor: 75, amountResult: 1,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
    durability: 80, suggestedCraftsmanship: 0,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 80,
  },
}

const craftParams: CraftParams = {
  craftsmanship: 4000,
  control: 3800,
  cp: 600,
  recipeLevelTable: {
    classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200, durability: 80,
    progressDivider: 130, qualityDivider: 115, progressModifier: 90, qualityModifier: 80,
  },
  crafterLevel: 100,
  initialQuality: 0,
  canHq: true,
  isExpert: false,
}

/**
 * SolverPanel renders `el-*` tags without the Element Plus plugin installed
 * in this test environment, so they come through as literal custom elements
 * (same convention as MeldAdvisorCard.spec.ts / BatchView.spec.ts) — select
 * on the class the SFC assigns, not on tag/role.
 */
async function clickSolve(w: ReturnType<typeof mount>) {
  const btn = w.find('.solver-cta')
  if (!btn.exists()) throw new Error('solve CTA not found')
  await btn.trigger('click')
}

async function clickCancel(w: ReturnType<typeof mount>) {
  const btn = w.find('.solver-cancel')
  if (!btn.exists()) throw new Error('cancel button not found')
  await btn.trigger('click')
}

describe('SolverPanel — per-request cancel (AbortSignal, not pool-wide cancelSolve)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const recipeStore = useRecipeStore()
    recipeStore.currentRecipe = mockRecipe
  })

  it('passes an AbortSignal to solveCraft and aborts it on cancel without calling cancelSolve', async () => {
    const deferred = createDeferred<{ actions: string[] }>()
    let capturedSignal: AbortSignal | undefined
    vi.mocked(solveCraft).mockImplementation((_config, _onProgress, signal) => {
      capturedSignal = signal
      return deferred.promise as ReturnType<typeof solveCraft>
    })

    const w = mount(SolverPanel, { props: { craftParams } })
    await flushPromises() // resolve onMounted's wasm-status check

    await clickSolve(w)

    expect(solveCraft).toHaveBeenCalledTimes(1)
    expect(capturedSignal).toBeInstanceOf(AbortSignal)
    expect(capturedSignal!.aborted).toBe(false)

    const simStore = useSimulatorStore()
    expect(simStore.solverRunning).toBe(true)

    await clickCancel(w)

    expect(capturedSignal!.aborted).toBe(true)
    expect(cancelSolve).not.toHaveBeenCalled()

    // Cancel flips UI state immediately, even before the in-flight promise settles.
    expect(simStore.solverRunning).toBe(false)

    deferred.reject(new MockSolveCancelledError())
    await flushPromises()

    // UI state still reads "cancelled" — the settled SolveCancelledError must
    // not flip it to the generic error state (title/description are props on
    // an unresolved el-alert custom element, so assert via data-state + the
    // rendered attribute rather than .text()).
    expect(w.find('.solver-hub').attributes('data-state')).toBe('cancelled')
    expect(w.find('el-alert[title="求解已取消"]').exists()).toBe(true)
    expect(simStore.solverRunning).toBe(false)
    expect(cancelSolve).not.toHaveBeenCalled()
  })

  it('does not surface a duplicate/generic error message when the aborted promise rejects with SolveCancelledError', async () => {
    const deferred = createDeferred<{ actions: string[] }>()
    vi.mocked(solveCraft).mockImplementation(() => deferred.promise as ReturnType<typeof solveCraft>)

    const w = mount(SolverPanel, { props: { craftParams } })
    await flushPromises()
    await clickSolve(w)
    await clickCancel(w)

    deferred.reject(new MockSolveCancelledError())
    await flushPromises()

    // Cancelled status wins — no separate "求解失敗" error alert layered on top.
    expect(w.find('.solver-hub').attributes('data-state')).toBe('cancelled')
    expect(w.text()).not.toContain('求解失敗')
  })
})

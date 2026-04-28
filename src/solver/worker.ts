/**
 * Main-thread wrapper for the solver Web Worker.
 * Provides a Promise-based API for solving crafts.
 */

import type { SolverConfig, SolverResult, SolverResponse, SimulateResult, SimulateDetailResult } from './raphael'

export const SOLVE_CANCELLED = '求解已取消'

let worker: Worker | null = null
let currentReject: ((reason: Error) => void) | null = null
let wasmStatus: 'loading' | 'ready' | 'error' = 'loading'
let wasmErrorMessage: string | null = null
// Multiple components (SolverPanel, CraftRecommendation, …) can call
// waitForWasm() concurrently — especially right after a route remount when
// every consumer re-registers at once. A single-slot callback would overwrite
// the previous waiter and leave it hanging forever, which manifests as
// "HQ 推薦消失" after navigating away and back. Keep a queue.
const wasmReadyWaiters: Array<() => void> = []
const wasmErrorWaiters: Array<(error: string) => void> = []

// Request ID counter and pending callbacks for multiplexing
let nextRequestId = 0
const pendingRequests = new Map<number, {
  resolve: (value: any) => void
  reject: (reason: Error) => void
}>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./solver-worker.ts', import.meta.url), { type: 'module' })
    wasmStatus = 'loading'

    // Single message handler for all responses
    worker.addEventListener('message', (e: MessageEvent<SolverResponse>) => {
      const data = e.data
      if (data.type === 'ready') {
        wasmStatus = 'ready'
        const waiters = wasmReadyWaiters.splice(0)
        wasmErrorWaiters.length = 0
        for (const cb of waiters) cb()
      } else if (data.type === 'init-error') {
        wasmStatus = 'error'
        wasmErrorMessage = data.error ?? 'WASM 初始化失敗'
        const waiters = wasmErrorWaiters.splice(0)
        wasmReadyWaiters.length = 0
        for (const cb of waiters) cb(wasmErrorMessage)
      } else if (data.requestId !== undefined) {
        // Routed response for simulate/simulate-detail
        const pending = pendingRequests.get(data.requestId)
        if (!pending) return
        if (data.type === 'simulate-result' && data.simulateResult) {
          pendingRequests.delete(data.requestId)
          pending.resolve(data.simulateResult)
        } else if (data.type === 'simulate-detail-result' && data.simulateDetailResult) {
          pendingRequests.delete(data.requestId)
          pending.resolve(data.simulateDetailResult)
        } else if (data.type === 'error') {
          pendingRequests.delete(data.requestId)
          pending.reject(new Error(data.error ?? '模擬失敗'))
        }
      }
    })
  }
  return worker
}

/**
 * Wait for WASM to be ready. Returns immediately if already ready.
 */
export function waitForWasm(): Promise<void> {
  getWorker()
  if (wasmStatus === 'ready') return Promise.resolve()
  if (wasmStatus === 'error') return Promise.reject(new Error(wasmErrorMessage ?? 'WASM 初始化失敗'))

  return new Promise<void>((resolve, reject) => {
    wasmReadyWaiters.push(resolve)
    wasmErrorWaiters.push((err) => reject(new Error(err)))
  })
}

/**
 * Get the current WASM initialization status.
 */
export function getWasmStatus(): { status: 'loading' | 'ready' | 'error'; error?: string } {
  getWorker() // ensure worker is created
  return {
    status: wasmStatus,
    error: wasmErrorMessage ?? undefined,
  }
}

/**
 * Run the solver with the given configuration.
 * Returns a Promise that resolves with the solver result.
 *
 * @param config - Solver configuration derived from recipe + gearset
 * @param onProgress - Optional callback for progress updates (0-100)
 */
export function solveCraft(
  config: SolverConfig,
  onProgress?: (percent: number) => void,
): Promise<SolverResult> {
  return new Promise<SolverResult>((resolve, reject) => {
    const w = getWorker()
    currentReject = reject

    // Solve still uses onmessage (only one solve at a time)
    const prevHandler = w.onmessage
    w.onmessage = (e: MessageEvent<SolverResponse>) => {
      const data = e.data

      // Skip init messages and routed messages
      if (data.type === 'ready' || data.type === 'init-error') return
      if (data.requestId !== undefined) return

      if (data.type === 'progress' && data.progress !== undefined) {
        onProgress?.(data.progress)
      } else if (data.type === 'result' && data.result) {
        currentReject = null
        w.onmessage = prevHandler
        resolve(data.result)
      } else if (data.type === 'error') {
        currentReject = null
        w.onmessage = prevHandler
        reject(new Error(data.error ?? '求解器發生未知錯誤'))
      }
    }

    w.onerror = (err) => {
      currentReject = null
      reject(new Error(`Worker error: ${err.message}`))
    }

    // Spread config to strip Vue reactive proxy
    w.postMessage({ type: 'solve', config: { ...config } })
  })
}

/**
 * Run WASM simulation and return the final state.
 */
export function simulateCraft(
  config: SolverConfig,
  actions: string[],
  conditions?: string[],
): Promise<SimulateResult> {
  const w = getWorker()
  const requestId = nextRequestId++

  return new Promise<SimulateResult>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject })
    // Spread to strip Vue reactive proxies
    w.postMessage({
      type: 'simulate',
      config: { ...config },
      actions: [...actions],
      conditions: conditions ? [...conditions] : undefined,
      requestId,
    })
  })
}

/**
 * Run WASM simulation and return per-step detail.
 */
export function simulateCraftDetail(
  config: SolverConfig,
  actions: string[],
  conditions?: string[],
): Promise<SimulateDetailResult> {
  const w = getWorker()
  const requestId = nextRequestId++

  return new Promise<SimulateDetailResult>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject })
    // Spread to strip Vue reactive proxies
    w.postMessage({
      type: 'simulate-detail',
      config: { ...config },
      actions: [...actions],
      conditions: conditions ? [...conditions] : undefined,
      requestId,
    })
  })
}

/**
 * Cancel any in-progress solve by terminating and recreating the worker.
 * No-op when nothing is in flight, so callers that optimistically cancel
 * (e.g. batchStore.resetAll after a finished batch) don't pay an extra
 * WASM re-init on the next solve.
 */
export function cancelSolve(): void {
  if (currentReject === null && pendingRequests.size === 0) return

  if (worker) {
    worker.terminate()
    worker = null
  }
  wasmStatus = 'loading'
  wasmErrorMessage = null
  for (const [, pending] of pendingRequests) {
    pending.reject(new Error(SOLVE_CANCELLED))
  }
  pendingRequests.clear()
  if (currentReject) {
    currentReject(new Error(SOLVE_CANCELLED))
    currentReject = null
  }
}

/**
 * Clean up the worker. Call this when the component is unmounted.
 */
export function disposeWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
  }
  wasmStatus = 'loading'
  wasmErrorMessage = null
  currentReject = null
  pendingRequests.clear()
  // Drop pending waiters; the next getWorker() will spin up a fresh
  // 'ready' lifecycle and any new caller will register against that.
  wasmReadyWaiters.length = 0
  wasmErrorWaiters.length = 0
}

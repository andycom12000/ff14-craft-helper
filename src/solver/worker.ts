/**
 * Main-thread wrapper for the solver Web Worker.
 * Provides a Promise-based API for solving crafts.
 */

import type { SolverConfig, SolverResult, SolverResponse, SimulateResult, SimulateDetailResult } from './raphael'

let worker: Worker | null = null
let currentReject: ((reason: Error) => void) | null = null
let wasmStatus: 'loading' | 'ready' | 'error' = 'loading'
let wasmErrorMessage: string | null = null
let onWasmReady: (() => void) | null = null
let onWasmError: ((error: string) => void) | null = null

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
        onWasmReady?.()
        onWasmReady = null
      } else if (data.type === 'init-error') {
        wasmStatus = 'error'
        wasmErrorMessage = data.error ?? 'WASM 初始化失敗'
        onWasmError?.(wasmErrorMessage)
        onWasmError = null
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
    onWasmReady = resolve
    onWasmError = (err) => reject(new Error(err))
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
 */
export function cancelSolve(): void {
  if (worker) {
    worker.terminate()
    worker = null
  }
  wasmStatus = 'loading'
  wasmErrorMessage = null
  // Reject all pending requests
  for (const [, pending] of pendingRequests) {
    pending.reject(new Error('求解已取消'))
  }
  pendingRequests.clear()
  if (currentReject) {
    currentReject(new Error('求解已取消'))
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
}

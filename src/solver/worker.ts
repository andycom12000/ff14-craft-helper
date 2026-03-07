/**
 * Main-thread wrapper for the solver Web Worker.
 * Provides a Promise-based API for solving crafts.
 */

import type { SolverConfig, SolverResult, SolverResponse } from './raphael'

let worker: Worker | null = null
let currentReject: ((reason: Error) => void) | null = null
let wasmStatus: 'loading' | 'ready' | 'error' = 'loading'
let wasmErrorMessage: string | null = null
let onWasmReady: (() => void) | null = null
let onWasmError: ((error: string) => void) | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./solver-worker.ts', import.meta.url), { type: 'module' })
    wasmStatus = 'loading'

    // Listen for init messages
    worker.addEventListener('message', (e: MessageEvent<SolverResponse>) => {
      if (e.data.type === 'ready') {
        wasmStatus = 'ready'
        onWasmReady?.()
        onWasmReady = null
      } else if (e.data.type === 'init-error') {
        wasmStatus = 'error'
        wasmErrorMessage = e.data.error ?? 'WASM 初始化失敗'
        onWasmError?.(wasmErrorMessage)
        onWasmError = null
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

    w.onmessage = (e: MessageEvent<SolverResponse>) => {
      const data = e.data

      // Skip init messages in solve handler
      if (data.type === 'ready' || data.type === 'init-error') return

      if (data.type === 'progress' && data.progress !== undefined) {
        onProgress?.(data.progress)
      } else if (data.type === 'result' && data.result) {
        currentReject = null
        resolve(data.result)
      } else if (data.type === 'error') {
        currentReject = null
        reject(new Error(data.error ?? '求解器發生未知錯誤'))
      }
    }

    w.onerror = (err) => {
      currentReject = null
      reject(new Error(`Worker error: ${err.message}`))
    }

    w.postMessage({ type: 'solve', config })
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
}

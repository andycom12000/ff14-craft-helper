/**
 * Main-thread wrapper for the solver Web Worker.
 * Provides a Promise-based API for solving crafts.
 * Uses a 2-slot worker pool with FIFO queue for concurrent requests.
 */

import type { SolverConfig, SolverResponse, SolverResultWithTiming, SimulateResult, SimulateDetailResult } from './raphael'
import { POOL_SIZE } from './pool-config'
import { trackEvent, trackError } from '@/utils/analytics'
import { classifyGearBucket } from '@/utils/gear-bucket'
import { noteSolverFailed } from '@/composables/useSolverFailState'

export const SOLVE_CANCELLED = '求解已取消'

// Tab-session rerun counter: keyed by input fingerprint so we can flag
// "user tried the same config 2+ times in a row". Cleared on page reload.
const solverRerunCounts = new Map<string, number>()

function solverInputFingerprint(config: SolverConfig): string {
  return [
    config.crafter_level,
    config.recipe_level,
    config.craftsmanship,
    config.control,
    config.cp,
    config.hq_target,
  ].join('|')
}

interface WorkerSlot { worker: Worker; busy: boolean }

const slots: WorkerSlot[] = []
let readySlotCount = 0
const taskQueue: Array<{
  type: 'solve' | 'simulate' | 'simulate-detail'
  payload: Record<string, unknown>
  requestId: number
}> = []

// Timing for wasm_load_ms / worker_pool_init_ms telemetry
let poolInitT0: number | null = null
let wasmReadyT0: number | null = null

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
  onProgress?: (pct: number) => void
}>()

function ensurePool(): void {
  if (slots.length === POOL_SIZE) return
  if (poolInitT0 === null) poolInitT0 = performance.now()
  for (let i = slots.length; i < POOL_SIZE; i++) {
    const w = new Worker(new URL('./solver-worker.ts', import.meta.url), { type: 'module' })
    const slot: WorkerSlot = { worker: w, busy: false }
    slots.push(slot)
    wasmStatus = 'loading'
    wasmErrorMessage = null

    w.addEventListener('message', (e: MessageEvent<SolverResponse>) => {
      const data = e.data
      if (data.type === 'ready') return onSlotReady()
      if (data.type === 'init-error') return onSlotInitError(data.error ?? 'WASM 初始化失敗')
      if (data.requestId === undefined) return
      handleRoutedResponse(slot, data)
    })

    w.addEventListener('error', (e: Event) => {
      if (!(e instanceof ErrorEvent)) return
      const message = e.message || 'Solver worker crashed'
      trackError(`solver_worker_error: ${message}`)
      // Catastrophic failure: tear down pool and reject everything in flight.
      // Next call to ensurePool will rebuild from scratch.
      const slotsSnapshot = slots.slice()
      for (const s of slotsSnapshot) {
        try { s.worker.terminate() } catch { /* ignore */ }
      }
      slots.length = 0
      readySlotCount = 0
      poolInitT0 = null
      wasmReadyT0 = null
      wasmStatus = 'error'
      wasmErrorMessage = message
      for (const [, pending] of pendingRequests) pending.reject(new Error(message))
      pendingRequests.clear()
      taskQueue.length = 0
      // Drain any waitForWasm() callers so they don't hang
      const errorWaiters = wasmErrorWaiters.splice(0)
      wasmReadyWaiters.length = 0
      for (const cb of errorWaiters) cb(message)
    })
  }
}

function onSlotReady(): void {
  if (readySlotCount === 0) wasmReadyT0 = performance.now()
  readySlotCount++
  if (readySlotCount === POOL_SIZE) {
    const now = performance.now()
    const isColdStart = !sessionStorage.getItem('ff14ch.wasm_loaded_once')
    if (wasmReadyT0 !== null) {
      trackEvent('wasm_load_ms', {
        duration_ms: Math.round(now - wasmReadyT0),
        worker_count: POOL_SIZE,
        is_cold_start: isColdStart,
      })
    }
    sessionStorage.setItem('ff14ch.wasm_loaded_once', '1')
    if (poolInitT0 !== null) {
      trackEvent('worker_pool_init_ms', {
        duration_ms: Math.round(now - poolInitT0),
        worker_count: POOL_SIZE,
      })
    }
    wasmStatus = 'ready'
    const waiters = wasmReadyWaiters.splice(0)
    wasmErrorWaiters.length = 0
    for (const cb of waiters) cb()
  }
}

function onSlotInitError(message: string): void {
  wasmStatus = 'error'
  wasmErrorMessage = message
  trackEvent('wasm_load_failed', { reason: message, fallback_used: false })
  trackError(`WASM init failed: ${message}`)
  const waiters = wasmErrorWaiters.splice(0)
  wasmReadyWaiters.length = 0
  for (const cb of waiters) cb(message)
}

function handleRoutedResponse(slot: WorkerSlot, data: SolverResponse): void {
  if (data.requestId === undefined) return
  const pending = pendingRequests.get(data.requestId)
  if (data.type === 'progress' && data.progress !== undefined) {
    pending?.onProgress?.(data.progress)
    return
  }
  if (!pending) return

  let terminal = true
  if (data.type === 'result' && data.result) pending.resolve({ ...data.result, wasmDur: data.wasmDur, runtimeStats: data.runtimeStats })
  else if (data.type === 'simulate-result' && data.simulateResult) pending.resolve(data.simulateResult)
  else if (data.type === 'simulate-detail-result' && data.simulateDetailResult) pending.resolve(data.simulateDetailResult)
  else if (data.type === 'error') pending.reject(new Error(data.error ?? '求解器發生未知錯誤'))
  else terminal = false

  if (terminal) {
    pendingRequests.delete(data.requestId)
    slot.busy = false
    drainQueue()
  }
}

function drainQueue(): void {
  while (taskQueue.length > 0) {
    const idle = slots.find(s => !s.busy)
    if (!idle) return
    const task = taskQueue.shift()!
    idle.busy = true
    idle.worker.postMessage({ type: task.type, ...task.payload, requestId: task.requestId })
  }
}

function dispatchOrQueue(
  type: 'solve' | 'simulate' | 'simulate-detail',
  payload: Record<string, unknown>,
  requestId: number,
): void {
  ensurePool()
  const idle = slots.find(s => !s.busy)
  if (idle) {
    idle.busy = true
    idle.worker.postMessage({ type, ...payload, requestId })
  } else {
    taskQueue.push({ type, payload, requestId })
  }
}

/**
 * Wait for WASM to be ready. Returns immediately if already ready.
 */
export function waitForWasm(): Promise<void> {
  ensurePool()
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
  ensurePool()
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
): Promise<SolverResultWithTiming> {
  const requestId = nextRequestId++
  const startedAt = performance.now()
  const fp = solverInputFingerprint(config)
  const prevRunCount = solverRerunCounts.get(fp) ?? 0
  const runIndex = prevRunCount + 1
  solverRerunCounts.set(fp, runIndex)

  trackEvent('solver_start', {
    crafter_level: config.crafter_level, recipe_level: config.recipe_level,
    hq_target: config.hq_target,
    gear_bucket: classifyGearBucket(config.crafter_level, config.craftsmanship, config.control),
    ...(config.taxonomy ?? {}),
  })
  if (runIndex >= 2) {
    trackEvent('solver_rerun', { run_index: runIndex })
  }
  return new Promise<SolverResultWithTiming>((resolve, reject) => {
    pendingRequests.set(requestId, {
      onProgress,
      resolve: (r: SolverResultWithTiming) => {
        trackEvent('solver_complete', {
          duration_ms: Math.round(performance.now() - startedAt),
          action_count: r.actions.length, steps: r.steps,
          wasm_duration_ms: r.wasmDur !== undefined ? Math.round(r.wasmDur) : undefined,
        })
        resolve(r)
      },
      reject: (err: Error) => {
        trackEvent('solver_failed', { reason: err.message })
        trackError(`solver_failed: ${err.message}`)
        noteSolverFailed()
        reject(err)
      },
    })
    dispatchOrQueue('solve', { config: { ...config } }, requestId)
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
  const requestId = nextRequestId++
  return new Promise<SimulateResult>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject })
    dispatchOrQueue('simulate', {
      config: { ...config },
      actions: [...actions],
      conditions: conditions ? [...conditions] : undefined,
    }, requestId)
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
  const requestId = nextRequestId++
  return new Promise<SimulateDetailResult>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject })
    dispatchOrQueue('simulate-detail', {
      config: { ...config },
      actions: [...actions],
      conditions: conditions ? [...conditions] : undefined,
    }, requestId)
  })
}

/**
 * Cancel any in-progress solve by terminating and recreating the worker pool.
 * No-op when nothing is in flight or queued, so callers that optimistically cancel
 * (e.g. batchStore.resetAll after a finished batch) don't pay an extra
 * WASM re-init on the next solve.
 */
export function cancelSolve(): void {
  if (pendingRequests.size === 0 && taskQueue.length === 0) return
  for (const slot of slots) slot.worker.terminate()
  slots.length = 0
  readySlotCount = 0
  poolInitT0 = null
  wasmReadyT0 = null
  wasmStatus = 'loading'
  wasmErrorMessage = null
  for (const [, pending] of pendingRequests) pending.reject(new Error(SOLVE_CANCELLED))
  pendingRequests.clear()
  taskQueue.length = 0
}

/**
 * Clean up the worker pool. Call this when the component is unmounted.
 */
export function disposeWorker(): void {
  for (const slot of slots) slot.worker.terminate()
  slots.length = 0
  readySlotCount = 0
  poolInitT0 = null
  wasmReadyT0 = null
  wasmStatus = 'loading'
  wasmErrorMessage = null
  pendingRequests.clear()
  taskQueue.length = 0
  wasmReadyWaiters.length = 0
  wasmErrorWaiters.length = 0
}

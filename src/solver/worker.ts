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
import { SolveCancelledError } from './errors'
import { cachedSolve } from './solve-cache'

export { SolveCancelledError } from './errors'

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

// `ready` is per-slot (#132): a freshly (re)spawned worker only accepts work
// AFTER it posts `ready` — the worker rejects any solve received before WASM
// init. Dispatch therefore gates on `!busy && ready`, so a slot replaced by
// `cancelRequest` never gets a solve routed to it mid-init.
interface WorkerSlot { worker: Worker; busy: boolean; ready: boolean }

const slots: WorkerSlot[] = []
// requestId → the slot currently running it (only set once dispatched). Lets
// cancelRequest find and terminate the exact worker to free its slot (#132).
const requestSlots = new Map<number, WorkerSlot>()
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
const wasmErrorWaiters: Array<(error: Error) => void> = []

// Request ID counter and pending callbacks for multiplexing
let nextRequestId = 0
const pendingRequests = new Map<number, {
  resolve: (value: any) => void
  reject: (reason: Error) => void
  onProgress?: (pct: number) => void
}>()

/** Create one worker, wire its listeners, and push it as a fresh (not-ready)
 *  slot. Shared by the initial pool build (`ensurePool`) and the per-request
 *  replacement in `cancelRequest` (#132). */
function spawnSlot(): WorkerSlot {
  const w = new Worker(new URL('./solver-worker.ts', import.meta.url), { type: 'module' })
  const slot: WorkerSlot = { worker: w, busy: false, ready: false }
  slots.push(slot)
  wasmErrorMessage = null

  w.addEventListener('message', (e: MessageEvent<SolverResponse>) => {
    const data = e.data
    if (data.type === 'ready') return onSlotReady(slot)
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
    requestSlots.clear()
    taskQueue.length = 0
    // Drain any waitForWasm() callers so they don't hang
    const errorWaiters = wasmErrorWaiters.splice(0)
    wasmReadyWaiters.length = 0
    const workerErr = new Error(message)
    for (const cb of errorWaiters) cb(workerErr)
  })

  return slot
}

function ensurePool(): void {
  if (slots.length === POOL_SIZE) return
  if (poolInitT0 === null) poolInitT0 = performance.now()
  wasmStatus = 'loading'
  for (let i = slots.length; i < POOL_SIZE; i++) spawnSlot()
}

function onSlotReady(slot: WorkerSlot): void {
  if (slot.ready) return
  slot.ready = true
  if (readySlotCount === 0) wasmReadyT0 = performance.now()
  readySlotCount++
  if (readySlotCount === POOL_SIZE) {
    const now = performance.now()
    const isColdStart = !sessionStorage.getItem('ff14ch.wasm_loaded_once')
    // wasmReadyT0/poolInitT0 are nulled after the first full-ready emit so a
    // per-request slot respawn (#132) re-reaching POOL_SIZE doesn't re-emit
    // telemetry with a stale baseline.
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
    poolInitT0 = null
    wasmReadyT0 = null
    wasmStatus = 'ready'
    const waiters = wasmReadyWaiters.splice(0)
    wasmErrorWaiters.length = 0
    for (const cb of waiters) cb()
  }
  // A newly-ready slot may be able to pick up queued work (cold-start dispatch
  // gated on readiness, or a slot just respawned by cancelRequest).
  drainQueue()
}

function onSlotInitError(message: string): void {
  wasmStatus = 'error'
  wasmErrorMessage = message
  trackEvent('wasm_load_failed', { reason: message, fallback_used: false })
  trackError(`WASM init failed: ${message}`)
  const waiters = wasmErrorWaiters.splice(0)
  wasmReadyWaiters.length = 0
  const initErr = new Error(message)
  for (const cb of waiters) cb(initErr)
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
    requestSlots.delete(data.requestId)
    slot.busy = false
    drainQueue()
  }
}

function drainQueue(): void {
  while (taskQueue.length > 0) {
    const idle = slots.find(s => !s.busy && s.ready)
    if (!idle) return
    const task = taskQueue.shift()!
    idle.busy = true
    requestSlots.set(task.requestId, idle)
    idle.worker.postMessage({ type: task.type, ...task.payload, requestId: task.requestId })
  }
}

function dispatchOrQueue(
  type: 'solve' | 'simulate' | 'simulate-detail',
  payload: Record<string, unknown>,
  requestId: number,
): void {
  ensurePool()
  const idle = slots.find(s => !s.busy && s.ready)
  if (idle) {
    idle.busy = true
    requestSlots.set(requestId, idle)
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
    wasmErrorWaiters.push(reject)
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
/**
 * Wire an AbortSignal to a dispatched request: aborting calls `cancelRequest`,
 * which terminates the slot running it and frees the pool (#132). A late abort
 * (after the request already settled) is harmless — cancelRequest no-ops when
 * the requestId is unknown.
 */
function bindAbort(requestId: number, signal?: AbortSignal): void {
  if (!signal) return
  if (signal.aborted) {
    cancelRequest(requestId)
    return
  }
  signal.addEventListener('abort', () => cancelRequest(requestId), { once: true })
}

/** Raw pool dispatch — no analytics, no cache. Wrapped by solveCraft. */
function solveCraftUncached(
  config: SolverConfig,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<SolverResultWithTiming> {
  const requestId = nextRequestId++
  return new Promise<SolverResultWithTiming>((resolve, reject) => {
    pendingRequests.set(requestId, { onProgress, resolve, reject })
    dispatchOrQueue('solve', { config: { ...config } }, requestId)
    bindAbort(requestId, signal)
  })
}

export function solveCraft(
  config: SolverConfig,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<SolverResultWithTiming> {
  const startedAt = performance.now()
  const fp = solverInputFingerprint(config)
  const runIndex = (solverRerunCounts.get(fp) ?? 0) + 1
  solverRerunCounts.set(fp, runIndex)

  trackEvent('solver_start', {
    crafter_level: config.crafter_level, recipe_level: config.recipe_level,
    hq_target: config.hq_target,
    gear_bucket: classifyGearBucket(config.crafter_level, config.craftsmanship, config.control),
    ...(config.taxonomy ?? {}),
  })
  if (runIndex >= 2) trackEvent('solver_rerun', { run_index: runIndex })

  return cachedSolve(config, () => solveCraftUncached(config, onProgress, signal), signal).then(
    (r) => {
      if (r.cacheHit) onProgress?.(100)
      trackEvent('solver_complete', {
        duration_ms: Math.round(performance.now() - startedAt),
        action_count: r.actions.length, steps: r.steps,
        wasm_duration_ms: r.wasmDur !== undefined ? Math.round(r.wasmDur) : undefined,
        cache_hit: r.cacheHit === true,
        ...(config.taxonomy ?? {}),
      })
      return r
    },
    (err: Error) => {
      // A deliberate cancellation (supersede / deadline / unmount / cancel
      // button, #132) is not a solve failure — recording it would inflate
      // `solver_failed` and mis-arm the input-change-after-fail audit.
      if (!(err instanceof SolveCancelledError)) {
        trackEvent('solver_failed', { reason: err.message })
        trackError(`solver_failed: ${err.message}`)
        noteSolverFailed()
      }
      throw err
    },
  )
}

/**
 * Run WASM simulation and return the final state.
 */
export function simulateCraft(
  config: SolverConfig,
  actions: string[],
  conditions?: string[],
  signal?: AbortSignal,
): Promise<SimulateResult> {
  const requestId = nextRequestId++
  return new Promise<SimulateResult>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject })
    dispatchOrQueue('simulate', {
      config: { ...config },
      actions: [...actions],
      conditions: conditions ? [...conditions] : undefined,
    }, requestId)
    bindAbort(requestId, signal)
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
 * Abort ONE in-flight (or queued) request without disturbing the rest of the
 * pool (#132). For a dispatched request the worker is mid-synchronous-WASM and
 * cannot honour a cancel message, so we terminate its worker and respawn a
 * fresh slot in its place — freeing the pool slot immediately instead of
 * letting a runaway solve poison it. A queued-but-undispatched request is just
 * dropped from the queue. The request's promise rejects with
 * SolveCancelledError. No-op for an unknown/already-settled requestId.
 *
 * Unlike `cancelSolve`, this leaves any OTHER in-flight request (e.g. a
 * concurrent main-screen solve) running on its own slot.
 */
export function cancelRequest(requestId: number): void {
  const pending = pendingRequests.get(requestId)
  if (!pending) return
  pendingRequests.delete(requestId)
  const slot = requestSlots.get(requestId)
  requestSlots.delete(requestId)
  if (slot) {
    const idx = slots.indexOf(slot)
    try { slot.worker.terminate() } catch { /* ignore */ }
    if (idx >= 0) {
      slots.splice(idx, 1)
      if (slot.ready) readySlotCount = Math.max(0, readySlotCount - 1)
      // Replace it so the pool stays at POOL_SIZE; the fresh worker is gated
      // (ready:false) until it posts `ready`, then drainQueue picks it up.
      spawnSlot()
    }
  } else {
    // Not dispatched yet — drop it from the queue.
    const qi = taskQueue.findIndex(t => t.requestId === requestId)
    if (qi >= 0) taskQueue.splice(qi, 1)
  }
  pending.reject(new SolveCancelledError())
  drainQueue()
}

/**
 * Cancel any in-progress solve by terminating and recreating the worker pool.
 * No-op when nothing is in flight or queued, so callers that optimistically cancel
 * (e.g. batchStore.resetAll after a finished batch) don't pay an extra
 * WASM re-init on the next solve.
 */
export function cancelSolve(): void {
  // Nothing in flight, nothing queued, no awaiters mid-pool-init — no-op so
  // callers that optimistically cancel (e.g. batchStore.resetAll after a
  // finished batch) don't pay an extra WASM re-init on the next solve.
  if (
    pendingRequests.size === 0
    && taskQueue.length === 0
    && wasmReadyWaiters.length === 0
    && wasmErrorWaiters.length === 0
  ) return
  for (const slot of slots) slot.worker.terminate()
  slots.length = 0
  readySlotCount = 0
  poolInitT0 = null
  wasmReadyT0 = null
  wasmStatus = 'loading'
  wasmErrorMessage = null
  for (const [, pending] of pendingRequests) pending.reject(new SolveCancelledError())
  pendingRequests.clear()
  requestSlots.clear()
  taskQueue.length = 0
  // Drain any waitForWasm() callers that queued before pool init finished —
  // otherwise their promises hang forever and the UI sticks at
  // 'preparing solver'. Reject with SolveCancelledError to match the
  // pendingRequests path; callers that catch SolveCancelledError (e.g.
  // batch-optimizer) propagate cancellation up to BatchView's outer catch.
  const errorWaiters = wasmErrorWaiters.splice(0)
  wasmReadyWaiters.length = 0
  const cancelErr = new SolveCancelledError()
  for (const cb of errorWaiters) cb(cancelErr)
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
  requestSlots.clear()
  taskQueue.length = 0
  wasmReadyWaiters.length = 0
  wasmErrorWaiters.length = 0
}

/**
 * Type definitions for raphael-rs WASM module.
 * The actual WASM will be loaded dynamically when available.
 */

export interface SolverConfig {
  recipe_level: number
  stars: number
  progress: number
  quality: number
  durability: number
  cp: number
  craftsmanship: number
  control: number
  crafter_level: number
  progress_divider: number
  quality_divider: number
  progress_modifier: number
  quality_modifier: number
  hq_target: boolean
  initial_quality: number
  // Skill availability toggles
  use_manipulation: boolean
  use_heart_and_soul: boolean
  use_quick_innovation: boolean
  use_trained_eye: boolean
  /**
   * When true, instructs raphael-rs to return NoSolution if target quality is
   * unachievable (instead of best-effort sub-target solution). Used by Phase 1
   * HQ feasibility probe in batch-optimizer. Defaults to false (lenient mode).
   */
  strict_quality?: boolean
  /**
   * When set, the solver halts as soon as an intermediate solution's simulated
   * quality reaches this value (in raphael's internal scale, i.e. after the
   * caller has already subtracted initial_quality). Returns the *first
   * sufficient* solution rather than the globally-optimal one — useful for
   * batch HQ runs that don't need the step/duration tiebreak. Leave undefined
   * (or 0) for full search.
   */
  quality_threshold?: number
}

export interface SolverResult {
  actions: string[]
  progress: number
  quality: number
  steps: number
}

/**
 * Per-solve telemetry projected from `raphael_solver::MacroSolverStats`.
 * Field names mirror the Rust wrapper's `RuntimeStats` (snake_case).
 * Stable enough to log/CSV but considered diagnostic — not for product logic.
 */
export interface SolverRuntimeStats {
  search_inserted_nodes: number
  search_processed_nodes: number
  finish_states: number
  finish_values: number
  quality_ub_states_main: number
  quality_ub_states_shards: number
  quality_ub_values: number
  step_lb_states_main: number
  step_lb_states_shards: number
  step_lb_values: number
}

/**
 * Internal extension carrying timing + stats data from the worker.
 * Only consumed by batch-optimizer's [bperf] log and BenchPanel; not part of
 * the public solver contract — keep these fields off SolverResult so simulator
 * UI etc. aren't coupled.
 */
export interface SolverResultWithTiming extends SolverResult {
  wasmDur?: number
  runtimeStats?: SolverRuntimeStats
}

export type SolverStatus = 'idle' | 'solving' | 'done' | 'error' | 'cancelled'

export interface SolverMessage {
  type: 'solve'
  config: SolverConfig
}

// --- Simulation types ---

export interface WasmEffects {
  inner_quiet: number
  waste_not: number
  innovation: number
  veneration: number
  great_strides: number
  muscle_memory: number
  manipulation: number
  trained_perfection_available: boolean
  trained_perfection_active: boolean
  heart_and_soul_available: boolean
  heart_and_soul_active: boolean
  quick_innovation_available: boolean
}

export interface SimulateResult {
  progress: number
  quality: number
  durability: number
  cp: number
  max_progress: number
  max_quality: number
  max_durability: number
  max_cp: number
  effects: WasmEffects
  is_finished: boolean
  is_success: boolean
  steps_used: number
}

export interface StepDetail {
  action: string
  progress: number
  quality: number
  durability: number
  cp: number
  effects: WasmEffects
  success: boolean
  is_finished: boolean
}

export interface SimulateDetailResult {
  steps: StepDetail[]
  final_progress: number
  final_quality: number
  final_durability: number
  final_cp: number
  is_finished: boolean
  is_success: boolean
}

export interface SimulateConfig {
  max_cp: number
  max_durability: number
  max_progress: number
  max_quality: number
  base_progress: number
  base_quality: number
  job_level: number
  actions: string[]
  /**
   * Per-step condition override. `conditions[i]` applies to `actions[i]`.
   * Accepts "Normal" / "Good" / "Excellent" / "Poor" (case-insensitive).
   * Indices past the end and unknown strings silently fall back to Normal.
   */
  conditions?: string[]
}

export interface SolverResponse {
  type: 'result' | 'error' | 'progress' | 'ready' | 'init-error' | 'simulate-result' | 'simulate-detail-result'
  result?: SolverResult
  simulateResult?: SimulateResult
  simulateDetailResult?: SimulateDetailResult
  error?: string
  /** 0-100 progress percentage */
  progress?: number
  /** Request ID for multiplexed simulate calls */
  requestId?: number
  /** Wall time spent inside wasmSolve() in ms. Only set on 'result' messages. */
  wasmDur?: number
  /** Raphael runtime stats. Only set on 'result' messages. */
  runtimeStats?: SolverRuntimeStats
}

/**
 * Localised message emitted by the worker when raphael returns NoSolution.
 * Exported so callers (batch-optimizer) can detect this case without
 * pattern-matching arbitrary upstream Debug strings.
 */
export const NO_SOLUTION_MESSAGE = '找不到可行的製作方案，請確認裝備數值與配方是否正確'

export function isNoSolutionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg === NO_SOLUTION_MESSAGE || msg.includes('NoSolution')
}

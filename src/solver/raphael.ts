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
}

export interface SolverResult {
  actions: string[]
  progress: number
  quality: number
  steps: number
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
}

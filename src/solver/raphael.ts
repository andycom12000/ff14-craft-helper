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

export interface SolverResponse {
  type: 'result' | 'error' | 'progress'
  result?: SolverResult
  error?: string
  /** 0-100 progress percentage, used for future real solver integration */
  progress?: number
}

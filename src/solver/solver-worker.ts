/**
 * Web Worker script for running the raphael-rs WASM craft solver off the main thread.
 */

import type { SolverConfig, SolverResult, SolverResponse, SimulateConfig, SolverRuntimeStats } from './raphael'
import { NO_SOLUTION_MESSAGE } from './raphael'
import { deriveRayonThreads } from './pool-config'

/* ---------- WASM initialization ---------- */

// Load WASM from public/ directory to bypass Vite's module transform.
// Vite injects HMR code into src/ JS files which breaks rayon's blob sub-workers.
const base = import.meta.env.BASE_URL ?? '/ff14-craft-helper/'
const wasmJsUrl = new URL(`${base}solver-wasm/raphael_wasm_wrapper.js`, self.location.origin).href

let wasmReady = false
let wasmError: string | null = null
type WasmSolveResult = { actions: string[]; runtime_stats: SolverRuntimeStats }
let wasmSolve: ((config: unknown, progressCallback?: ((processed: number) => void) | null) => WasmSolveResult) | null = null
let wasmSimulate: ((config: unknown) => unknown) | null = null
let wasmSimulateDetail: ((config: unknown) => unknown) | null = null

async function initWasm() {
  try {
    const pkg = await import(/* @vite-ignore */ wasmJsUrl)
    await pkg.default()
    const hwc = navigator.hardwareConcurrency || 4
    await pkg.init_threads(deriveRayonThreads(hwc))
    wasmSolve = pkg.solve
    wasmSimulate = pkg.simulate
    wasmSimulateDetail = pkg.simulate_detail
    wasmReady = true
    const readyMsg: SolverResponse = { type: 'ready' }
    self.postMessage(readyMsg)
  } catch (err) {
    wasmError = err instanceof Error ? err.message : String(err)
    const errorMsg: SolverResponse = { type: 'init-error', error: wasmError }
    self.postMessage(errorMsg)
  }
}

initWasm()

/* ---------- Action name mapping: raphael-rs Debug names -> our skill IDs ---------- */

const ACTION_MAP: Record<string, string> = {
  'BasicSynthesis': 'BasicSynthesis',
  'BasicTouch': 'BasicTouch',
  'MasterMend': 'MastersMend',
  'Observe': 'Observe',
  'TricksOfTheTrade': 'TricksOfTheTrade',
  'WasteNot': 'WasteNot',
  'Veneration': 'Veneration',
  'StandardTouch': 'StandardTouch',
  'GreatStrides': 'GreatStrides',
  'Innovation': 'Innovation',
  'WasteNot2': 'WasteNotII',
  'ByregotsBlessing': 'ByregotsBlessing',
  'PreciseTouch': 'PreciseTouch',
  'MuscleMemory': 'MuscleMemory',
  'CarefulSynthesis': 'CarefulSynthesis',
  'Manipulation': 'Manipulation',
  'PrudentTouch': 'PrudentTouch',
  'AdvancedTouch': 'AdvancedTouch',
  'Reflect': 'Reflect',
  'PreparatoryTouch': 'PreparatoryTouch',
  'Groundwork': 'Groundwork',
  'DelicateSynthesis': 'DelicateSynthesis',
  'IntensiveSynthesis': 'IntensiveSynthesis',
  'TrainedEye': 'TrainedEye',
  'HeartAndSoul': 'HeartAndSoul',
  'PrudentSynthesis': 'PrudentSynthesis',
  'TrainedFinesse': 'TrainedFinesse',
  'RefinedTouch': 'RefinedTouch',
  'QuickInnovation': 'QuickInnovation',
  'ImmaculateMend': 'ImmaculateMend',
  'TrainedPerfection': 'TrainedPerfection',
  'RapidSynthesis': 'RapidSynthesis',
  'HastyTouch': 'HastyTouch',
  'DaringTouch': 'DaringTouch',
  'FinalAppraisal': 'FinalAppraisal',
}

// Reverse map: our skill IDs -> raphael-rs action names
const REVERSE_ACTION_MAP: Record<string, string> = {}
for (const [raphaelName, ourName] of Object.entries(ACTION_MAP)) {
  REVERSE_ACTION_MAP[ourName] = raphaelName
}

/* ---------- Solver config conversion ---------- */

function configToWasmSettings(config: SolverConfig) {
  // Match raphael-rs get_game_settings: modifiers only apply when crafter level <= recipe level
  let base_progress = config.craftsmanship * 10 / config.progress_divider + 2
  let base_quality = config.control * 10 / config.quality_divider + 35
  if (config.crafter_level <= config.recipe_level) {
    base_progress = base_progress * config.progress_modifier / 100
    base_quality = base_quality * config.quality_modifier / 100
  }
  base_progress = Math.floor(base_progress)
  base_quality = Math.floor(base_quality)

  // Subtract initial_quality from max_quality so solver accounts for HQ materials
  const rawMaxQuality = config.hq_target ? config.quality : 0
  const max_quality = Math.max(0, rawMaxQuality - config.initial_quality)

  return {
    max_cp: config.cp,
    max_durability: config.durability,
    max_progress: config.progress,
    max_quality,
    base_progress,
    base_quality,
    job_level: config.crafter_level,
    use_manipulation: config.use_manipulation,
    use_heart_and_soul: config.use_heart_and_soul,
    use_quick_innovation: config.use_quick_innovation,
    use_trained_eye: config.use_trained_eye,
    backload_progress: false,
    // Expert recipes hard-disable adversarial regardless of user toggle —
    // raphael-rs upstream contract (search space is unbounded otherwise).
    adversarial: config.isExpert ? false : config.adversarial,
    allow_non_max_quality_solutions: !config.strict_quality,
  }
}

/* ---------- Simulate config conversion ---------- */

function buildSimulateConfig(config: SolverConfig, actions: string[], conditions?: string[]): SimulateConfig {
  // Match raphael-rs get_game_settings: modifiers only apply when crafter level <= recipe level
  let base_progress = config.craftsmanship * 10 / config.progress_divider + 2
  let base_quality = config.control * 10 / config.quality_divider + 35
  if (config.crafter_level <= config.recipe_level) {
    base_progress = base_progress * config.progress_modifier / 100
    base_quality = base_quality * config.quality_modifier / 100
  }
  base_progress = Math.floor(base_progress)
  base_quality = Math.floor(base_quality)

  // Map our skill IDs to raphael-rs action names
  const raphaelActions = actions.map(a => REVERSE_ACTION_MAP[a] ?? a)

  return {
    max_cp: config.cp,
    max_durability: config.durability,
    max_progress: config.progress,
    max_quality: config.hq_target ? config.quality : 0,
    base_progress,
    base_quality,
    job_level: config.crafter_level,
    actions: raphaelActions,
    ...(conditions && conditions.length > 0 ? { conditions } : {}),
  }
}

/* ---------- Message handler ---------- */

self.onmessage = async (e: MessageEvent) => {
  const { type, config, actions, conditions, requestId } = e.data

  if (!wasmReady) {
    const errorResponse: SolverResponse = {
      type: 'error',
      error: wasmError ?? 'WASM 求解器尚未初始化完成',
      requestId,
    }
    self.postMessage(errorResponse)
    return
  }

  if (type === 'solve') {
    try {
      const settings = configToWasmSettings(config)

      // Initial kickoff so the UI shows movement before raphael's first batch lands.
      const kickoff: SolverResponse = { type: 'progress', progress: 5, requestId }
      self.postMessage(kickoff)

      // Translate raphael's monotonic processed-node counter into a 5–95 percent
      // band via a saturating rational curve. No upstream total exists, so the
      // half-life K is calibrated empirically: typical batch solves land in the
      // 50k–500k node range. Cap at 95 to leave headroom for the 'result' message
      // to push the UI to 100.
      const PROGRESS_HALF_LIFE_NODES = 100_000
      const onProgressFromWasm = (processed: number): void => {
        const ratio = processed / (processed + PROGRESS_HALF_LIFE_NODES)
        const pct = Math.min(95, Math.max(5, 5 + 90 * ratio))
        const progressMsg: SolverResponse = { type: 'progress', progress: pct, requestId }
        self.postMessage(progressMsg)
      }

      const solveStart = performance.now()
      const wasmResult = wasmSolve!(settings, onProgressFromWasm)
      const wasmDur = performance.now() - solveStart

      // Map raphael action names to our skill IDs
      const mappedActions = wasmResult.actions.map(name => {
        const mapped = ACTION_MAP[name]
        if (!mapped) {
          console.warn(`Unknown raphael action: ${name}`)
          return name
        }
        return mapped
      })

      const result: SolverResult = {
        actions: mappedActions,
        progress: config.progress,
        quality: config.hq_target ? config.quality : 0,
        steps: mappedActions.length,
      }

      const resultResponse: SolverResponse = {
        type: 'result',
        result,
        requestId,
        wasmDur,
        runtimeStats: wasmResult.runtime_stats,
      }
      self.postMessage(resultResponse)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const errorResponse: SolverResponse = {
        type: 'error',
        error: msg === 'NoSolution' ? NO_SOLUTION_MESSAGE : msg,
        requestId,
      }
      self.postMessage(errorResponse)
    }
  } else if (type === 'simulate') {
    try {
      const simConfig = buildSimulateConfig(config, actions, conditions)
      const result = wasmSimulate!(simConfig)
      self.postMessage({ type: 'simulate-result', simulateResult: result, requestId })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      self.postMessage({ type: 'error', error: `模擬失敗: ${msg}`, requestId })
    }
  } else if (type === 'simulate-detail') {
    try {
      const simConfig = buildSimulateConfig(config, actions, conditions)
      const result = wasmSimulateDetail!(simConfig)
      self.postMessage({ type: 'simulate-detail-result', simulateDetailResult: result, requestId })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      self.postMessage({ type: 'error', error: `模擬失敗: ${msg}`, requestId })
    }
  }
}

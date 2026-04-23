/**
 * Web Worker script for running the raphael-rs WASM craft solver off the main thread.
 */

import type { SolverConfig, SolverResult, SolverResponse, SimulateConfig } from './raphael'

/* ---------- WASM initialization ---------- */

// Load WASM from public/ directory to bypass Vite's module transform.
// Vite injects HMR code into src/ JS files which breaks rayon's blob sub-workers.
const base = import.meta.env.BASE_URL ?? '/ff14-craft-helper/'
const wasmJsUrl = new URL(`${base}solver-wasm/raphael_wasm_wrapper.js`, self.location.origin).href

let wasmReady = false
let wasmError: string | null = null
let wasmSolve: ((config: unknown) => { actions: string[] }) | null = null
let wasmSimulate: ((config: unknown) => unknown) | null = null
let wasmSimulateDetail: ((config: unknown) => unknown) | null = null

async function initWasm() {
  try {
    const pkg = await import(/* @vite-ignore */ wasmJsUrl)
    await pkg.default()
    await pkg.init_threads(navigator.hardwareConcurrency || 4)
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
    adversarial: false,
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
      const progressUpdate: SolverResponse = { type: 'progress', progress: 10 }
      self.postMessage(progressUpdate)

      const settings = configToWasmSettings(config)

      const progressUpdate2: SolverResponse = { type: 'progress', progress: 30 }
      self.postMessage(progressUpdate2)

      const wasmResult = wasmSolve!(settings)

      const progressUpdate3: SolverResponse = { type: 'progress', progress: 90 }
      self.postMessage(progressUpdate3)

      // Map raphael action names to our skill IDs
      const mappedActions = (wasmResult.actions as string[]).map(name => {
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

      const resultResponse: SolverResponse = { type: 'result', result }
      self.postMessage(resultResponse)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const errorResponse: SolverResponse = {
        type: 'error',
        error: msg === 'NoSolution' ? '找不到可行的製作方案，請確認裝備數值與配方是否正確' : msg,
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

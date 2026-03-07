/**
 * Web Worker script for running the raphael-rs WASM craft solver off the main thread.
 */

import type { SolverConfig, SolverResult, SolverResponse } from './raphael'

/* ---------- WASM initialization ---------- */

// Load WASM from public/ directory to bypass Vite's module transform.
// Vite injects HMR code into src/ JS files which breaks rayon's blob sub-workers.
const base = import.meta.env.BASE_URL ?? '/ff14-craft-helper/'
const wasmJsUrl = new URL(`${base}solver-wasm/raphael_wasm_wrapper.js`, self.location.origin).href

let wasmReady = false
let wasmError: string | null = null
let wasmSolve: ((config: unknown) => { actions: string[] }) | null = null

async function initWasm() {
  try {
    const pkg = await import(/* @vite-ignore */ wasmJsUrl)
    await pkg.default()
    await pkg.init_threads(navigator.hardwareConcurrency || 4)
    wasmSolve = pkg.solve
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
  'FocusedSynthesis': 'FocusedSynthesis',
  'FocusedTouch': 'FocusedTouch',
}

/* ---------- Solver config conversion ---------- */

function configToWasmSettings(config: SolverConfig) {
  const base_progress = Math.floor(
    Math.floor(config.craftsmanship * 10 / config.progress_divider + 2)
    * config.progress_modifier / 100
  )
  const base_quality = Math.floor(
    Math.floor(config.control * 10 / config.quality_divider + 35)
    * config.quality_modifier / 100
  )

  return {
    max_cp: config.cp,
    max_durability: config.durability,
    max_progress: config.progress,
    max_quality: config.hq_target ? config.quality : 0,
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

/* ---------- Message handler ---------- */

self.onmessage = async (e: MessageEvent) => {
  const { type, config } = e.data

  if (type === 'solve') {
    if (!wasmReady) {
      const errorResponse: SolverResponse = {
        type: 'error',
        error: wasmError ?? 'WASM 求解器尚未初始化完成',
      }
      self.postMessage(errorResponse)
      return
    }

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
  }
}

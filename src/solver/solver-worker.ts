/**
 * Web Worker script for running the craft solver off the main thread.
 *
 * TODO: Replace the mock solver with real raphael-rs WASM integration.
 * When the WASM package becomes available:
 *   1. import init, { solve } from 'raphael-rs-wasm'
 *   2. Call init() to load the WASM binary
 *   3. Call solve(config) with the SolverConfig
 *   4. Post back the SolverResult
 */

import type { SolverConfig, SolverResult, SolverMessage, SolverResponse } from './raphael'

/**
 * Mock solver that generates a reasonable action sequence using basic heuristics.
 * This approximates what a real solver would produce.
 */
function mockSolve(config: SolverConfig): SolverResult {
  const actions: string[] = []
  let remainingCp = config.cp
  let remainingDurability = config.durability

  function useCp(cost: number): boolean {
    if (remainingCp >= cost) {
      remainingCp -= cost
      return true
    }
    return false
  }

  function useDurability(cost: number): boolean {
    if (remainingDurability > cost) {
      remainingDurability -= cost
      return true
    }
    return false
  }

  // --- Phase 1: Opening ---
  // Use Reflect for quality opener (cheaper than MuscleMemory for quality-focused)
  if (config.hq_target && useCp(6) && useDurability(10)) {
    actions.push('Reflect')
  } else if (useCp(6) && useDurability(10)) {
    // Use MuscleMemory for progress opener
    actions.push('MuscleMemory')
  }

  // --- Phase 2: Quality phase (if HQ target) ---
  if (config.hq_target) {
    // Manipulation for durability sustain
    if (useCp(96)) {
      actions.push('Manipulation')
    }

    // WasteNot II for efficiency
    if (useCp(98)) {
      actions.push('WasteNotII')
    }

    // Innovation + touch combo (repeat as CP allows)
    const qualityCycles = Math.min(3, Math.floor(remainingCp / 80))
    for (let i = 0; i < qualityCycles; i++) {
      if (useCp(18)) {
        actions.push('Innovation')
      } else break

      // Basic -> Standard -> Advanced combo
      if (useCp(18) && useDurability(5)) {
        actions.push('BasicTouch')
      } else break
      if (useCp(32) && useDurability(5)) {
        actions.push('StandardTouch')
      } else break
      if (useCp(46) && useDurability(5)) {
        actions.push('AdvancedTouch')
      }
    }

    // Finish quality with Great Strides + Byregot's if we have Inner Quiet stacks
    if (useCp(32)) {
      actions.push('GreatStrides')
      if (useCp(18)) {
        actions.push('Innovation')
      }
      if (useCp(24) && useDurability(10)) {
        actions.push('ByregotsBlessing')
      }
    }
  }

  // --- Phase 3: Progress phase ---
  if (useCp(18)) {
    actions.push('Veneration')
  }

  // Use Groundwork if we have durability, otherwise CarefulSynthesis
  const progressActionsNeeded = Math.ceil(config.progress / 500)
  for (let i = 0; i < Math.min(progressActionsNeeded, 5); i++) {
    if (remainingDurability > 20 && useCp(18)) {
      useDurability(20)
      actions.push('Groundwork')
    } else if (remainingDurability > 10 && useCp(7)) {
      useDurability(10)
      actions.push('CarefulSynthesis')
    } else if (remainingDurability > 10) {
      useDurability(10)
      actions.push('BasicSynthesis')
    } else {
      break
    }
  }

  // Estimate rough progress/quality (not accurate, just for display)
  const estimatedProgress = Math.min(config.progress, config.progress)
  const estimatedQuality = config.hq_target
    ? Math.min(config.quality, Math.floor(config.quality * 0.85))
    : 0

  return {
    actions,
    progress: estimatedProgress,
    quality: estimatedQuality,
    steps: actions.length,
  }
}

/**
 * Simulate solving delay to mimic real solver behavior.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

self.onmessage = async (e: MessageEvent<SolverMessage>) => {
  const { type, config } = e.data

  if (type === 'solve') {
    try {
      // Simulate solver computation time
      const response: SolverResponse = { type: 'progress', progress: 10 }
      self.postMessage(response)

      await delay(300)

      const progressUpdate: SolverResponse = { type: 'progress', progress: 50 }
      self.postMessage(progressUpdate)

      await delay(400)

      const progressUpdate2: SolverResponse = { type: 'progress', progress: 90 }
      self.postMessage(progressUpdate2)

      await delay(300)

      const result = mockSolve(config)

      const resultResponse: SolverResponse = { type: 'result', result }
      self.postMessage(resultResponse)
    } catch (err) {
      const errorResponse: SolverResponse = {
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
      }
      self.postMessage(errorResponse)
    }
  }
}

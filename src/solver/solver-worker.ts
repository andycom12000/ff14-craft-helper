/**
 * Web Worker script for running the craft solver off the main thread.
 *
 * TODO: Replace the mock solver with real raphael-rs WASM integration.
 */

import type { SolverConfig, SolverResult, SolverMessage, SolverResponse } from './raphael'

/* ---------- progress / quality formulas (mirror of engine/simulator.ts) ---------- */

function calcProgress(config: SolverConfig, efficiency: number, hasVeneration: boolean): number {
  const base = (config.craftsmanship * 10) / config.progress_divider + 2
  let mod = Math.floor(base * config.progress_modifier / 100)
  mod = Math.floor(mod * efficiency / 100)
  if (hasVeneration) mod = Math.floor(mod * 1.5)
  return mod
}

function calcQuality(config: SolverConfig, efficiency: number, hasInnovation: boolean, hasGreatStrides: boolean, iqStacks: number): number {
  const base = (config.control * 10) / config.quality_divider + 35
  let mod = Math.floor(base * config.quality_modifier / 100)
  const iqBonus = 1 + iqStacks * 0.1
  mod = Math.floor(mod * iqBonus)
  mod = Math.floor(mod * efficiency / 100)
  if (hasInnovation) mod = Math.floor(mod * 1.5)
  if (hasGreatStrides) mod = Math.floor(mod * 2)
  return mod
}

/* ---------- mock solver ---------- */
// Quality actions come before progress completion,
// because the simulator stops executing once progress >= maxProgress.

function mockSolve(config: SolverConfig): SolverResult {
  const actions: string[] = []
  let cp = config.cp
  let dur = config.durability
  const maxDur = config.durability
  let qualityDone = 0
  let iqStacks = 0
  let manipStepsLeft = 0

  function use(cpCost: number, durCost: number, isBuff: boolean) {
    cp -= cpCost
    dur -= durCost
    if (!isBuff && manipStepsLeft > 0 && dur > 0) {
      dur = Math.min(dur + 5, maxDur)
      manipStepsLeft--
    }
  }

  // Calculate exact progress reserve (CP + durability needed)
  function calcProgressReserve(): { cp: number; dur: number } {
    const venGwProg = calcProgress(config, 360, true)
    const venCsProg = calcProgress(config, 180, true)

    // Best case: Veneration + 1 Groundwork
    if (venGwProg >= config.progress) return { cp: 18 + 18, dur: 20 }
    // Veneration + 2 Groundwork
    if (venGwProg * 2 >= config.progress) return { cp: 18 + 36, dur: 40 }
    // Veneration + 1 Groundwork + CarefulSynthesis
    if (venGwProg + venCsProg >= config.progress) return { cp: 18 + 18 + 7, dur: 30 }
    // Veneration + 3 Groundwork
    if (venGwProg * 3 >= config.progress) return { cp: 18 + 54, dur: 60 }
    // Fallback: Veneration + many CarefulSynthesis
    const csNeeded = Math.ceil(config.progress / venCsProg)
    return { cp: 18 + csNeeded * 7, dur: csNeeded * 10 }
  }

  const reserve = calcProgressReserve()

  // Check if we have enough resources beyond the progress reserve
  function cpAvail(): number { return cp - reserve.cp }
  function durAvail(): number { return dur - reserve.dur }

  // ---- Phase 1: Opener (Reflect for IQ stacks, no progress) ----
  if (cpAvail() >= 6 && durAvail() >= 10) {
    use(6, 10, false); actions.push('Reflect'); iqStacks = 2
  }

  // ---- Phase 2: Quality phase ----
  if (config.hq_target && durAvail() > 0 && cpAvail() > 50) {
    // Manipulation for durability sustain (cp:96, 8 steps of +5 dur)
    if (config.use_manipulation && cpAvail() >= 96 + 80) {
      use(96, 0, true); actions.push('Manipulation'); manipStepsLeft = 8
    }

    const doQualityCycle = (): boolean => {
      if (cpAvail() < 18) return false
      use(18, 0, true); actions.push('Innovation')

      if (cpAvail() >= 18 && durAvail() >= 10) {
        use(18, 10, false); actions.push('BasicTouch'); iqStacks = Math.min(10, iqStacks + 1)
        qualityDone += calcQuality(config, 100, true, false, iqStacks)
      } else return false

      if (cpAvail() >= 18 && durAvail() >= 10) {
        use(18, 10, false); actions.push('StandardTouch'); iqStacks = Math.min(10, iqStacks + 1)
        qualityDone += calcQuality(config, 125, true, false, iqStacks)
      } else return true

      if (cpAvail() >= 18 && durAvail() >= 10) {
        use(18, 10, false); actions.push('AdvancedTouch'); iqStacks = Math.min(10, iqStacks + 1)
        qualityDone += calcQuality(config, 150, true, false, iqStacks)
      }
      return true
    }

    for (let i = 0; i < 4; i++) {
      const finisherCp = 74 // GreatStrides(32) + Innovation(18) + Byregot's(24)
      if (cpAvail() < 18 + 18 + finisherCp || durAvail() < 10 + 10) break
      if (!doQualityCycle()) break
    }

    // Finisher: GreatStrides + Innovation + ByregotsBlessing
    if (iqStacks > 0 && durAvail() >= 10) {
      const byregotEff = 100 + 20 * iqStacks
      if (cpAvail() >= 32 + 18 + 24) {
        use(32, 0, true); actions.push('GreatStrides')
        use(18, 0, true); actions.push('Innovation')
        qualityDone += calcQuality(config, byregotEff, true, true, iqStacks)
        use(24, 10, false); actions.push('ByregotsBlessing')
      } else if (cpAvail() >= 32 + 24) {
        use(32, 0, true); actions.push('GreatStrides')
        qualityDone += calcQuality(config, byregotEff, false, true, iqStacks)
        use(24, 10, false); actions.push('ByregotsBlessing')
      } else if (cpAvail() >= 24) {
        qualityDone += calcQuality(config, byregotEff, false, false, iqStacks)
        use(24, 10, false); actions.push('ByregotsBlessing')
      }
    }
  }

  // ---- Phase 3: Progress (finish the craft LAST) ----
  let progressDone = 0

  const useVeneration = cp >= 18
  if (useVeneration) {
    use(18, 0, true); actions.push('Veneration')
  }

  for (let i = 0; i < 10 && progressDone < config.progress; i++) {
    const venActive = useVeneration && i < 4
    const gwProg = calcProgress(config, 360, venActive)
    const csProg = calcProgress(config, 180, venActive)

    if (cp >= 18 && dur >= 20) {
      use(18, 20, false); actions.push('Groundwork'); progressDone += gwProg
    } else if (cp >= 7 && dur >= 10) {
      use(7, 10, false); actions.push('CarefulSynthesis'); progressDone += csProg
    } else if (dur >= 10) {
      const bsProg = calcProgress(config, 120, venActive)
      use(0, 10, false); actions.push('BasicSynthesis'); progressDone += bsProg
    } else {
      break
    }
  }

  return {
    actions,
    progress: Math.min(progressDone, config.progress),
    quality: Math.min(qualityDone, config.quality),
    steps: actions.length,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

self.onmessage = async (e: MessageEvent<SolverMessage>) => {
  const { type, config } = e.data

  if (type === 'solve') {
    try {
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

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
// Tries two strategies (WasteNotII+PreparatoryTouch vs BasicTouch combo)
// and returns the one with better quality.

interface SolveState {
  actions: string[]
  cp: number
  dur: number
  maxDur: number
  qualityDone: number
  iqStacks: number
  manipStepsLeft: number
  wasteNotSteps: number
  innovationSteps: number
}

function createState(config: SolverConfig): SolveState {
  return {
    actions: [],
    cp: config.cp,
    dur: config.durability,
    maxDur: config.durability,
    qualityDone: config.initial_quality ?? 0,
    iqStacks: 0,
    manipStepsLeft: 0,
    wasteNotSteps: 0,
    innovationSteps: 0,
  }
}

function effectiveDurCost(s: SolveState, raw: number): number {
  return s.wasteNotSteps > 0 && raw > 0 ? Math.ceil(raw / 2) : raw
}

function use(s: SolveState, cpCost: number, rawDurCost: number, isBuff: boolean) {
  s.cp -= cpCost
  if (!isBuff) {
    s.dur -= effectiveDurCost(s, rawDurCost)
    if (s.wasteNotSteps > 0) s.wasteNotSteps--
    if (s.innovationSteps > 0) s.innovationSteps--
    if (s.manipStepsLeft > 0 && s.dur > 0) {
      s.dur = Math.min(s.dur + 5, s.maxDur)
      s.manipStepsLeft--
    }
  }
}

function calcProgressReserve(config: SolverConfig): { cp: number; dur: number } {
  const venGwProg = calcProgress(config, 360, true)
  const venCsProg = calcProgress(config, 180, true)

  if (venGwProg >= config.progress) return { cp: 36, dur: 20 }
  if (venGwProg * 2 >= config.progress) return { cp: 54, dur: 40 }
  if (venGwProg + venCsProg >= config.progress) return { cp: 43, dur: 30 }
  if (venGwProg * 3 >= config.progress) return { cp: 72, dur: 60 }
  const csNeeded = Math.ceil(config.progress / venCsProg)
  return { cp: 18 + csNeeded * 7, dur: csNeeded * 10 }
}

function finishProgress(config: SolverConfig, s: SolveState): { progressDone: number } {
  let progressDone = 0
  const useVeneration = s.cp >= 18
  if (useVeneration) {
    use(s, 18, 0, true); s.actions.push('Veneration')
  }
  for (let i = 0; i < 10 && progressDone < config.progress; i++) {
    const venActive = useVeneration && i < 4
    const gwProg = calcProgress(config, 360, venActive)
    const csProg = calcProgress(config, 180, venActive)
    const gwDur = effectiveDurCost(s, 20)
    const csDur = effectiveDurCost(s, 10)

    if (s.cp >= 18 && s.dur >= gwDur) {
      use(s, 18, 20, false); s.actions.push('Groundwork'); progressDone += gwProg
    } else if (s.cp >= 7 && s.dur >= csDur) {
      use(s, 7, 10, false); s.actions.push('CarefulSynthesis'); progressDone += csProg
    } else if (s.dur >= csDur) {
      use(s, 0, 10, false); s.actions.push('BasicSynthesis')
      progressDone += calcProgress(config, 120, venActive)
    } else {
      break
    }
  }
  return { progressDone }
}

function addByregotFinisher(config: SolverConfig, s: SolveState, reserve: { cp: number; dur: number }) {
  const cpAvail = s.cp - reserve.cp
  const durAvail = s.dur - reserve.dur
  if (s.iqStacks <= 0 || durAvail < effectiveDurCost(s, 10)) return
  const byregotEff = 100 + 20 * s.iqStacks
  if (cpAvail >= 32 + 18 + 24) {
    use(s, 32, 0, true); s.actions.push('GreatStrides')
    use(s, 18, 0, true); s.actions.push('Innovation'); s.innovationSteps = 4
    s.qualityDone += calcQuality(config, byregotEff, true, true, s.iqStacks)
    use(s, 24, 10, false); s.actions.push('ByregotsBlessing')
  } else if (cpAvail >= 32 + 24) {
    use(s, 32, 0, true); s.actions.push('GreatStrides')
    s.qualityDone += calcQuality(config, byregotEff, s.innovationSteps > 0, true, s.iqStacks)
    use(s, 24, 10, false); s.actions.push('ByregotsBlessing')
  } else if (cpAvail >= 24) {
    s.qualityDone += calcQuality(config, byregotEff, s.innovationSteps > 0, false, s.iqStacks)
    use(s, 24, 10, false); s.actions.push('ByregotsBlessing')
  }
}

/** Strategy A: WasteNotII + PreparatoryTouch (high efficiency) */
function solveWasteNot2(config: SolverConfig): SolverResult {
  const s = createState(config)
  const reserve = calcProgressReserve(config)
  const cpAvail = () => s.cp - reserve.cp
  const durAvail = () => s.dur - reserve.dur

  // Opener
  if (cpAvail() >= 6 && durAvail() >= 10) {
    use(s, 6, 10, false); s.actions.push('Reflect'); s.iqStacks = 2
  }

  if (config.hq_target && s.qualityDone < config.quality && cpAvail() > 0) {
    // WasteNotII + Innovation + PreparatoryTouch loop + finisher
    const minNeeded = 98 + 18 + 40 + 32 + 24 // WN2 + Innov + 1×PrepTouch + GS + Byregot
    if (cpAvail() >= minNeeded) {
      use(s, 98, 0, true); s.actions.push('WasteNotII'); s.wasteNotSteps = 8

      if (config.use_manipulation && cpAvail() >= 96 + 18 + 40 + 32 + 24) {
        use(s, 96, 0, true); s.actions.push('Manipulation'); s.manipStepsLeft = 8
      }

      use(s, 18, 0, true); s.actions.push('Innovation'); s.innovationSteps = 4

      // PreparatoryTouch loop (40cp, 20dur raw → 10 with WN2, +2 IQ)
      const finisherCp = 32 + 18 + 24
      while (
        cpAvail() >= 40 + finisherCp &&
        durAvail() >= effectiveDurCost(s, 20) + effectiveDurCost(s, 10) &&
        s.iqStacks < 10 &&
        s.qualityDone < config.quality
      ) {
        // Refresh Innovation if expired
        if (s.innovationSteps <= 0 && cpAvail() >= 18 + 40 + finisherCp) {
          use(s, 18, 0, true); s.actions.push('Innovation'); s.innovationSteps = 4
        }
        use(s, 40, 20, false); s.actions.push('PreparatoryTouch')
        s.iqStacks = Math.min(10, s.iqStacks + 2)
        s.qualityDone += calcQuality(config, 200, s.innovationSteps > 0, false, s.iqStacks)
      }

      // Byregot finisher
      addByregotFinisher(config, s, reserve)
    }
  }

  const { progressDone } = finishProgress(config, s)
  return {
    actions: s.actions,
    progress: Math.min(progressDone, config.progress),
    quality: Math.min(s.qualityDone, config.quality),
    steps: s.actions.length,
  }
}

/** Strategy B: Basic touch combo (Innovation → Basic → Standard → Advanced) */
function solveBasicCombo(config: SolverConfig): SolverResult {
  const s = createState(config)
  const reserve = calcProgressReserve(config)
  const cpAvail = () => s.cp - reserve.cp
  const durAvail = () => s.dur - reserve.dur

  // Opener
  if (cpAvail() >= 6 && durAvail() >= 10) {
    use(s, 6, 10, false); s.actions.push('Reflect'); s.iqStacks = 2
  }

  if (config.hq_target && s.qualityDone < config.quality && cpAvail() > 50) {
    if (config.use_manipulation && cpAvail() >= 96 + 80) {
      use(s, 96, 0, true); s.actions.push('Manipulation'); s.manipStepsLeft = 8
    }

    for (let cycle = 0; cycle < 4; cycle++) {
      const finisherCp = 74
      if (cpAvail() < 18 + 18 + finisherCp || durAvail() < 20) break

      use(s, 18, 0, true); s.actions.push('Innovation'); s.innovationSteps = 4

      if (cpAvail() >= 18 && durAvail() >= 10) {
        use(s, 18, 10, false); s.actions.push('BasicTouch')
        s.iqStacks = Math.min(10, s.iqStacks + 1)
        s.qualityDone += calcQuality(config, 100, true, false, s.iqStacks)
      } else break

      if (cpAvail() >= 18 && durAvail() >= 10) {
        use(s, 18, 10, false); s.actions.push('StandardTouch')
        s.iqStacks = Math.min(10, s.iqStacks + 1)
        s.qualityDone += calcQuality(config, 125, true, false, s.iqStacks)
      } else continue

      if (cpAvail() >= 18 && durAvail() >= 10) {
        use(s, 18, 10, false); s.actions.push('AdvancedTouch')
        s.iqStacks = Math.min(10, s.iqStacks + 1)
        s.qualityDone += calcQuality(config, 150, true, false, s.iqStacks)
      }
    }

    addByregotFinisher(config, s, reserve)
  }

  const { progressDone } = finishProgress(config, s)
  return {
    actions: s.actions,
    progress: Math.min(progressDone, config.progress),
    quality: Math.min(s.qualityDone, config.quality),
    steps: s.actions.length,
  }
}

function mockSolve(config: SolverConfig): SolverResult {
  const a = solveWasteNot2(config)
  const b = solveBasicCombo(config)

  const aOk = a.progress >= config.progress
  const bOk = b.progress >= config.progress
  if (aOk && bOk) return a.quality >= b.quality ? a : b
  if (aOk) return a
  if (bOk) return b
  return a.quality >= b.quality ? a : b
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

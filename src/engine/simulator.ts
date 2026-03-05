import type { BuffType } from './buffs'

export interface CraftState {
  progress: number
  quality: number
  durability: number
  cp: number
  maxProgress: number
  maxQuality: number
  maxDurability: number
  maxCp: number
  buffs: Map<BuffType, { stacks: number; duration: number }>
  step: number
  condition: CraftCondition
  isComplete: boolean
  isSuccess: boolean
}

export type CraftCondition =
  | 'Normal'
  | 'Good'
  | 'Excellent'
  | 'Poor'
  | 'Centered'
  | 'Sturdy'
  | 'Pliant'
  | 'Malleable'
  | 'Primed'
  | 'GoodOmen'

export interface StepResult {
  action: string
  state: CraftState
  success: boolean
}

export interface CraftParams {
  craftsmanship: number
  control: number
  cp: number
  recipeLevelTable: {
    classJobLevel: number
    stars: number
    difficulty: number
    quality: number
    durability: number
    progressDivider: number
    qualityDivider: number
    progressModifier: number
    qualityModifier: number
  }
  crafterLevel: number
  initialQuality: number
}

export function createInitialState(params: CraftParams): CraftState {
  return {
    progress: 0,
    quality: params.initialQuality,
    durability: params.recipeLevelTable.durability,
    cp: params.cp,
    maxProgress: params.recipeLevelTable.difficulty,
    maxQuality: params.recipeLevelTable.quality,
    maxDurability: params.recipeLevelTable.durability,
    maxCp: params.cp,
    buffs: new Map(),
    step: 0,
    condition: 'Normal',
    isComplete: false,
    isSuccess: false,
  }
}

function getProgressEfficiency(action: string): number {
  const map: Record<string, number> = {
    BasicSynthesis: 120,
    CarefulSynthesis: 180,
    RapidSynthesis: 500,
    Groundwork: 360,
    IntensiveSynthesis: 400,
    PrudentSynthesis: 180,
    MuscleMemory: 300,
    FocusedSynthesis: 200,
    Veneration: 0,
  }
  return map[action] ?? 0
}

function getQualityEfficiency(action: string): number {
  const map: Record<string, number> = {
    BasicTouch: 100,
    StandardTouch: 125,
    AdvancedTouch: 150,
    PreciseTouch: 150,
    PrudentTouch: 100,
    PreparatoryTouch: 200,
    HastyTouch: 100,
    FocusedTouch: 150,
    TrainedFinesse: 100,
    ByregotsBlessing: 100,
    Reflect: 300,
    TrainedEye: 0,
  }
  return map[action] ?? 0
}

function getCpCost(action: string): number {
  const map: Record<string, number> = {
    BasicSynthesis: 0,
    CarefulSynthesis: 7,
    RapidSynthesis: 0,
    Groundwork: 18,
    IntensiveSynthesis: 6,
    PrudentSynthesis: 18,
    MuscleMemory: 6,
    FocusedSynthesis: 5,
    BasicTouch: 18,
    StandardTouch: 32,
    AdvancedTouch: 46,
    PreciseTouch: 18,
    PrudentTouch: 25,
    PreparatoryTouch: 40,
    HastyTouch: 0,
    FocusedTouch: 18,
    TrainedFinesse: 32,
    ByregotsBlessing: 24,
    Reflect: 6,
    TrainedEye: 250,
    Observe: 7,
    WasteNot: 56,
    WasteNotII: 98,
    Veneration: 18,
    Innovation: 18,
    GreatStrides: 32,
    MastersMend: 88,
    Manipulation: 96,
    Immovable: 0,
    FinalAppraisal: 1,
    TricksOfTheTrade: 0,
    DelicateSynthesis: 32,
  }
  return map[action] ?? 0
}

function getDurabilityCost(action: string): number {
  const map: Record<string, number> = {
    PrudentSynthesis: 5,
    PrudentTouch: 5,
    PreparatoryTouch: 20,
    Groundwork: 20,
    TrainedFinesse: 0,
    Observe: 0,
    WasteNot: 0,
    WasteNotII: 0,
    Veneration: 0,
    Innovation: 0,
    GreatStrides: 0,
    MastersMend: 0,
    Manipulation: 0,
    FinalAppraisal: 0,
    TricksOfTheTrade: 0,
    MuscleMemory: 10,
    Reflect: 10,
    TrainedEye: 10,
  }
  return map[action] ?? 10
}

function isProgressAction(action: string): boolean {
  return getProgressEfficiency(action) > 0
}

function isQualityAction(action: string): boolean {
  return getQualityEfficiency(action) > 0
}

function isBuff(action: string): boolean {
  return ['WasteNot', 'WasteNotII', 'Veneration', 'Innovation', 'GreatStrides', 'Manipulation', 'FinalAppraisal'].includes(action)
}

function calculateProgressIncrease(
  params: CraftParams,
  state: CraftState,
  efficiency: number,
): number {
  const { craftsmanship } = params
  const { progressDivider, progressModifier } = params.recipeLevelTable
  const base = (craftsmanship * 10) / progressDivider + 2
  let modified = Math.floor(base * progressModifier / 100)
  modified = Math.floor(modified * efficiency / 100)

  if (state.buffs.has('Veneration')) {
    modified = Math.floor(modified * 1.5)
  }
  if (state.buffs.has('MuscleMemory')) {
    modified = Math.floor(modified * 2)
  }

  return modified
}

function calculateQualityIncrease(
  params: CraftParams,
  state: CraftState,
  efficiency: number,
): number {
  const { control } = params
  const { qualityDivider, qualityModifier } = params.recipeLevelTable
  const base = (control * 10) / qualityDivider + 35
  let modified = Math.floor(base * qualityModifier / 100)

  const innerQuietStacks = state.buffs.get('InnerQuiet')?.stacks ?? 0
  const iqBonus = 1 + innerQuietStacks * 0.1
  modified = Math.floor(modified * iqBonus)

  modified = Math.floor(modified * efficiency / 100)

  if (state.buffs.has('Innovation')) {
    modified = Math.floor(modified * 1.5)
  }
  if (state.buffs.has('GreatStrides')) {
    modified = Math.floor(modified * 2)
  }

  return modified
}

export function simulateStep(
  params: CraftParams,
  state: CraftState,
  action: string,
): StepResult {
  const newState: CraftState = {
    ...state,
    buffs: new Map(state.buffs),
    step: state.step + 1,
  }

  // CP cost
  let cpCost = getCpCost(action)
  if (state.buffs.has('Pliant')) {
    cpCost = Math.ceil(cpCost / 2)
  }
  newState.cp -= cpCost

  // Durability cost
  let duraCost = getDurabilityCost(action)
  if ((state.buffs.has('WasteNot') || state.buffs.has('WasteNotII')) && duraCost > 0) {
    duraCost = Math.ceil(duraCost / 2)
  }
  newState.durability -= duraCost

  // Progress actions
  if (isProgressAction(action)) {
    const eff = getProgressEfficiency(action)
    const increase = calculateProgressIncrease(params, state, eff)
    newState.progress = Math.min(newState.progress + increase, newState.maxProgress)
    // Remove MuscleMemory buff after progress action
    newState.buffs.delete('MuscleMemory')
  }

  // Quality actions
  if (isQualityAction(action)) {
    let eff = getQualityEfficiency(action)
    if (action === 'ByregotsBlessing') {
      const iqStacks = state.buffs.get('InnerQuiet')?.stacks ?? 0
      eff = 100 + iqStacks * 20
    }
    const increase = calculateQualityIncrease(params, state, eff)
    newState.quality = Math.min(newState.quality + increase, newState.maxQuality)

    // Update Inner Quiet
    if (action !== 'ByregotsBlessing') {
      const iq = newState.buffs.get('InnerQuiet')
      const currentStacks = iq?.stacks ?? 0
      const addStacks = action === 'PreparatoryTouch' || action === 'Reflect' || action === 'PreciseTouch' ? 2 : 1
      newState.buffs.set('InnerQuiet', {
        stacks: Math.min(currentStacks + addStacks, 10),
        duration: Infinity,
      })
    } else {
      newState.buffs.delete('InnerQuiet')
    }

    // Remove GreatStrides after quality action
    newState.buffs.delete('GreatStrides')
  }

  // Special actions
  if (action === 'MastersMend') {
    newState.durability = Math.min(newState.durability + 30, newState.maxDurability)
  }
  if (action === 'TricksOfTheTrade') {
    newState.cp = Math.min(newState.cp + 20, newState.maxCp)
  }
  if (action === 'TrainedEye') {
    newState.quality = newState.maxQuality
  }
  if (action === 'DelicateSynthesis') {
    const pIncrease = calculateProgressIncrease(params, state, 100)
    newState.progress = Math.min(newState.progress + pIncrease, newState.maxProgress)
    const qIncrease = calculateQualityIncrease(params, state, 100)
    newState.quality = Math.min(newState.quality + qIncrease, newState.maxQuality)
    const iq = newState.buffs.get('InnerQuiet')
    const stacks = iq?.stacks ?? 0
    newState.buffs.set('InnerQuiet', { stacks: Math.min(stacks + 1, 10), duration: Infinity })
  }

  // Buff applications
  if (action === 'WasteNot') newState.buffs.set('WasteNot', { stacks: 1, duration: 4 })
  if (action === 'WasteNotII') newState.buffs.set('WasteNotII', { stacks: 1, duration: 8 })
  if (action === 'Veneration') newState.buffs.set('Veneration', { stacks: 1, duration: 4 })
  if (action === 'Innovation') newState.buffs.set('Innovation', { stacks: 1, duration: 4 })
  if (action === 'GreatStrides') newState.buffs.set('GreatStrides', { stacks: 1, duration: 3 })
  if (action === 'Manipulation') newState.buffs.set('Manipulation', { stacks: 1, duration: 8 })
  if (action === 'FinalAppraisal') newState.buffs.set('FinalAppraisal', { stacks: 1, duration: 5 })
  if (action === 'MuscleMemory') newState.buffs.set('MuscleMemory', { stacks: 1, duration: 5 })

  // Manipulation healing (after durability cost)
  if (state.buffs.has('Manipulation') && !isBuff(action) && newState.durability > 0) {
    newState.durability = Math.min(newState.durability + 5, newState.maxDurability)
  }

  // Tick down buff durations
  for (const [buff, info] of newState.buffs) {
    if (info.duration !== Infinity && !isBuff(action)) {
      const newDuration = info.duration - 1
      if (newDuration <= 0) {
        newState.buffs.delete(buff)
      } else {
        newState.buffs.set(buff, { ...info, duration: newDuration })
      }
    }
  }

  // FinalAppraisal check
  if (newState.progress >= newState.maxProgress && newState.buffs.has('FinalAppraisal')) {
    newState.progress = newState.maxProgress - 1
    newState.buffs.delete('FinalAppraisal')
  }

  // Check completion
  if (newState.progress >= newState.maxProgress) {
    newState.isComplete = true
    newState.isSuccess = true
  }
  if (newState.durability <= 0 && !newState.isComplete) {
    newState.isComplete = true
    newState.isSuccess = false
  }

  newState.condition = 'Normal'

  return { action, state: newState, success: true }
}

export function simulateAll(
  params: CraftParams,
  initialState: CraftState,
  actions: string[],
): StepResult[] {
  const results: StepResult[] = []
  let state = initialState

  for (const action of actions) {
    if (state.isComplete) break
    const result = simulateStep(params, state, action)
    results.push(result)
    state = result.state
  }

  return results
}

export function canUseAction(state: CraftState, action: string): boolean {
  if (state.isComplete) return false
  if (state.cp < getCpCost(action)) return false

  if (action === 'MuscleMemory' && state.step !== 0) return false
  if (action === 'Reflect' && state.step !== 0) return false
  if (action === 'TrainedEye' && state.step !== 0) return false
  if (action === 'TrainedFinesse') {
    const iq = state.buffs.get('InnerQuiet')
    if (!iq || iq.stacks < 10) return false
  }
  if (action === 'ByregotsBlessing') {
    const iq = state.buffs.get('InnerQuiet')
    if (!iq || iq.stacks < 1) return false
  }
  if (action === 'PrudentSynthesis' || action === 'PrudentTouch') {
    if (state.buffs.has('WasteNot') || state.buffs.has('WasteNotII')) return false
  }
  if (action === 'IntensiveSynthesis' || action === 'PreciseTouch' || action === 'TricksOfTheTrade') {
    if (state.condition !== 'Good' && state.condition !== 'Excellent') return false
  }

  return true
}

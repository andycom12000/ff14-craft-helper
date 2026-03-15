import type { BuffType } from './buffs'
import { getSkillById } from './skills'

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
  canHq: boolean
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

// CP cost helper for canUseAction
function getCpCost(action: string): number {
  return getSkillById(action)?.cp ?? 0
}

export function canUseAction(state: CraftState, action: string, params?: CraftParams): boolean {
  if (state.isComplete) return false
  if (state.cp < getCpCost(action)) return false

  if (action === 'MuscleMemory' && state.step !== 0) return false
  if (action === 'Reflect' && state.step !== 0) return false
  if (action === 'TrainedEye') {
    if (state.step !== 0) return false
    // TrainedEye requires crafter level >= recipe level + 10
    if (params && params.crafterLevel < params.recipeLevelTable.classJobLevel + 10) return false
  }
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

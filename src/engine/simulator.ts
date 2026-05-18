import type { BuffType } from './buffs'
import {
  applyConditionToAction,
  capSuccessRate,
  divCeilHalf,
  malleableProgressMod,
  type ModifiedOutcome,
} from './expert-conditions'
import { getSkillById, type SkillDefinition } from './skills'

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
  /**
   * True for expert recipes (`Recipe.isExpert === true`). Drives upstream
   * raphael-rs behaviour: expert recipes hard-disable `adversarial` because
   * the search space is unbounded and would OOM. Defaults to false when the
   * source Recipe omits `isExpert`.
   */
  isExpert?: boolean
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

// ---------------------------------------------------------------------------
// Expert-condition aware action resolution
// ---------------------------------------------------------------------------

/**
 * Per-action cost / outcome resolved against the current craft state's
 * condition. The CP and durability fields here are already adjusted for
 * Pliant / Sturdy / WasteNot (raphael handles WasteNot inside the WASM
 * solver; this TS path applies Pliant / Sturdy from the condition layer).
 *
 * `progressModFactor` is the multiplicative factor to apply to the
 * action's `action_progress_mod` (the per-thousand layer in the raphael
 * progress formula). It is `1` when no expert progress flag fires, and
 * the caller is responsible for the integer `× 3 / 2 floor` at the
 * appropriate layer — `resolveActionProgressMod` exposes that arithmetic
 * directly so callers do not have to re-implement the rule.
 */
export interface ResolvedAction {
  cpCost: number
  durabilityCost: number
  /** True if the action succeeded this step. < 100% actions still count as success (deterministic). */
  success: boolean
  /** Effective success rate after Centered bonus and the 100 cap (informational). */
  effectiveSuccessRate: number
  /** Raw outcome from `applyConditionToAction` for downstream consumers (e.g. WASM step adapter). */
  outcome: ModifiedOutcome
}

/**
 * Resolve an action's CP / durability / success against the current
 * craft state, taking the active expert condition into account.
 *
 * Notes
 *  - CP is `div_ceil(2)` when Pliant is active.
 *  - Durability is `div_ceil(2)` when Sturdy is active. Other durability
 *    modifiers (WasteNot, TrainedPerfection) are NOT applied here — they
 *    live in the WASM solver path. This function is the boundary that
 *    layers expert conditions on top of an action's base costs.
 *  - Success rate: action's intrinsic success rate (defaulted to 100 for
 *    actions without an explicit field) plus `successRateBonusPp`, capped
 *    at 100. Because the TS-side simulator does not roll RNG, any
 *    < 100% action is treated as a success (matches raphael's
 *    deterministic search semantics).
 *  - Progress / quality numbers are computed by the WASM solver against
 *    the same condition; `progressModMul3Div2` is surfaced via the
 *    `outcome` field so the WASM step adapter can corroborate.
 */
export function applyAction(
  state: CraftState,
  action: SkillDefinition,
  baseSuccessRate = 100,
): ResolvedAction {
  const outcome = applyConditionToAction(action, state.condition, state)

  const cpCost = outcome.cpCeilHalve ? divCeilHalf(action.cp) : action.cp
  const durabilityCost = outcome.durabilityCeilHalve
    ? divCeilHalf(action.durability)
    : action.durability

  const effectiveSuccessRate = capSuccessRate(baseSuccessRate + outcome.successRateBonusPp)

  // Deterministic: < 100% rated actions still resolve as successes, mirroring
  // raphael-sim's search semantics. RNG-driven behaviour is out of scope for
  // this engine layer.
  const success = true

  return {
    cpCost,
    durabilityCost,
    success,
    effectiveSuccessRate,
    outcome,
  }
}

/**
 * Apply Malleable's `× 3 / 2 floor` to the action_progress_mod layer if
 * the outcome flag is set. Caller is responsible for the final formula
 * `/ 1000` floor (per raphael's integer pipeline).
 */
export function resolveActionProgressMod(
  baseActionProgressMod: number,
  outcome: ModifiedOutcome,
): number {
  return outcome.progressModMul3Div2
    ? malleableProgressMod(baseActionProgressMod)
    : baseActionProgressMod
}

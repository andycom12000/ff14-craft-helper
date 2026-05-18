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
  /**
   * Pending +duration bonus planted by a Primed condition. Defaults to 0.
   * Consumed (reset to 0) on the next step where the chosen action applies
   * one of the duration-bearing buffs in `PRIMED_ELIGIBLE_BUFFS`. Persists
   * across non-buff actions (BasicSynthesis, HastyTouch, …). Re-setting
   * Primed *overwrites* (does not stack) — matches FFXIV behaviour.
   */
  pendingBuffDurationBonus: number
  /**
   * Condition that the *next* step must take, planted by a GoodOmen
   * condition. Defaults to `null`. Consumed (reset to `null`) at the
   * start of the next step by `consumeForcedCondition`.
   */
  forcedNextCondition: CraftCondition | null
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
    pendingBuffDurationBonus: 0,
    forcedNextCondition: null,
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

// ---------------------------------------------------------------------------
// Stateful expert conditions (Primed / GoodOmen) — state transitions
// ---------------------------------------------------------------------------

/**
 * Duration-bearing buffs eligible for Primed's `+2 turns` bonus.
 *
 * Hardcoded (rather than derived from `BUFF_DEFINITIONS[type].maxDuration`)
 * for two reasons:
 *  1. The list is small and stable; explicit is easier to audit.
 *  2. `BuffType` currently includes `Pliant` as a pre-existing bug
 *     (Pliant is a Condition, not a buff). Hardcoding avoids accidentally
 *     pulling it in via a `maxDuration > 0` heuristic.
 *
 * Out of the eligible list intentionally:
 *  - InnerQuiet           (no duration; tracked as stacks)
 *  - TrainedPerfection    (one-shot, no duration)
 *  - HeartAndSoul         (one-shot, no duration)
 *  - QuickInnovation      (one-turn freebie; +2 here would change semantics)
 */
export const PRIMED_ELIGIBLE_BUFFS: ReadonlyArray<BuffType> = [
  'Manipulation',
  'WasteNot',
  'WasteNotII',
  'Innovation',
  'Veneration',
  'GreatStrides',
  'MuscleMemory',
  'FinalAppraisal',
]

const PRIMED_ELIGIBLE_BUFF_SET = new Set<BuffType>(PRIMED_ELIGIBLE_BUFFS)

/**
 * Map a skill id to the duration-bearing buff it applies, if any.
 * Returns `null` for non-buff-applying actions (BasicSynthesis, HastyTouch,
 * etc.) — those carry Primed's pending bonus forward without consuming it.
 *
 * The mapping is the subset of `PRIMED_ELIGIBLE_BUFFS` that have a matching
 * skill id; other buff-like actions (HeartAndSoul, QuickInnovation,
 * TrainedPerfection) are not eligible per the list above.
 */
export function getActionAppliedBuff(actionId: string): BuffType | null {
  switch (actionId) {
    case 'Manipulation':     return 'Manipulation'
    case 'WasteNot':         return 'WasteNot'
    case 'WasteNotII':       return 'WasteNotII'
    case 'Innovation':       return 'Innovation'
    case 'Veneration':       return 'Veneration'
    case 'GreatStrides':     return 'GreatStrides'
    case 'MuscleMemory':     return 'MuscleMemory'
    case 'FinalAppraisal':   return 'FinalAppraisal'
    default:                 return null
  }
}

/**
 * Commit the post-action side effects of an `applyAction` resolution to
 * the craft state. Two responsibilities, both stateful-expert flavour:
 *
 *  1. **Consume pending Primed bonus**: if `state.pendingBuffDurationBonus`
 *     is > 0 *and* `action` applies one of the eligible duration-bearing
 *     buffs, add the bonus turns to that buff's `duration` and reset
 *     the pending bonus to 0. If the action does not apply an eligible
 *     buff, the pending bonus is preserved (carries to a later step).
 *
 *  2. **Plant new pending state**: write `outcome.nextBuffDurationBonus`
 *     into `state.pendingBuffDurationBonus` (Primed *overwrites*, does
 *     not accumulate — matches FFXIV), and write `outcome.forceNextCondition`
 *     into `state.forcedNextCondition` (GoodOmen).
 *
 * `buffsBeforeCommit` is the (already-mutated) buff map for the step,
 * post-application. Callers that drive the WASM solver shouldn't normally
 * need this helper directly — it's the TS-side state transition used by
 * the manual / test path. There is no buff duration cap applied: FFXIV
 * does not cap Primed-bonused durations beyond the natural buff max.
 */
export function commitOutcomeToState(
  state: CraftState,
  action: SkillDefinition,
  outcome: ModifiedOutcome,
): void {
  // 1. Consume pending Primed bonus, if any, when this action applies an
  //    eligible buff.
  const appliedBuff = getActionAppliedBuff(action.id)
  if (
    state.pendingBuffDurationBonus > 0 &&
    appliedBuff !== null &&
    PRIMED_ELIGIBLE_BUFF_SET.has(appliedBuff)
  ) {
    const buff = state.buffs.get(appliedBuff)
    if (buff) {
      buff.duration += state.pendingBuffDurationBonus
    }
    state.pendingBuffDurationBonus = 0
  }

  // 2. Plant new pending state from this step's outcome (Primed / GoodOmen).
  //    Primed overwrites — no accumulation across consecutive Primed steps.
  if (outcome.nextBuffDurationBonus > 0) {
    state.pendingBuffDurationBonus = outcome.nextBuffDurationBonus
  }
  if (outcome.forceNextCondition !== null) {
    state.forcedNextCondition = outcome.forceNextCondition
  }
}

/**
 * Pick the condition for the *upcoming* step. If a GoodOmen-style forced
 * condition is pending, returns that and consumes it (resets to `null`);
 * otherwise returns `pickerChoice` unchanged.
 *
 * Call this at the boundary where a new step begins — typically right
 * before the next `applyAction`.
 */
export function consumeForcedCondition(
  state: CraftState,
  pickerChoice: CraftCondition,
): CraftCondition {
  if (state.forcedNextCondition !== null) {
    const forced = state.forcedNextCondition
    state.forcedNextCondition = null
    return forced
  }
  return pickerChoice
}

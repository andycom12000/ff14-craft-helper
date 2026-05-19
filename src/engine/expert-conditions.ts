/**
 * Expert craft condition effects.
 *
 * Pure, side-effect-free helpers describing how expert conditions modify
 * a single action's CP cost, durability cost, progress modifier, success
 * rate, and (for the stateful conditions) what state-side fields to set
 * for the *next* step.
 *
 * Stateless conditions (R1): Centered / Sturdy / Pliant / Malleable.
 * Stateful conditions (R2):
 *  - Primed   → `nextBuffDurationBonus: 2` (next buff-applying action's
 *               duration += 2; carries until consumed).
 *  - GoodOmen → `forceNextCondition: 'Good'` (next step's condition is
 *               forced to Good regardless of the picker).
 *
 * Arithmetic aligns with raphael-sim:
 *  - Integer math; explicit floor / ceil at the boundaries
 *  - Success-rate bonus is additive percentage points, capped at 100
 *  - Durability / CP halving uses `div_ceil(2)` (== `Math.ceil(n / 2)`)
 *  - Progress modifier multiplies by 3 then floor-divides by 2 at the
 *    `action_progress_mod` (per-thousand) layer, before the final
 *    formula `/ 1000` floor.
 */

import type { CraftCondition } from './simulator'

export interface ModifiedOutcome {
  /** Additive success-rate bonus in percentage points (cap 100). */
  successRateBonusPp: number
  /** `true` → action's base durability cost becomes `Math.ceil(base / 2)`. */
  durabilityCeilHalve: boolean
  /** `true` → action's base CP cost becomes `Math.ceil(base / 2)`. */
  cpCeilHalve: boolean
  /** `true` → action_progress_mod multiplied by 3 then floor-divided by 2. */
  progressModMul3Div2: boolean
  /**
   * Bonus duration (in turns) to add to the next buff-applying action's
   * resulting buff. Set by `Primed` (= 2); zero otherwise. The caller
   * stores this into `CraftState.pendingBuffDurationBonus` after the
   * Primed step settles, and consumes it on the next buff-applying step.
   */
  nextBuffDurationBonus: number
  /**
   * Condition to force on the *next* step. Set by `GoodOmen` (= 'Good');
   * `null` otherwise. The caller stores this into
   * `CraftState.forcedNextCondition` after the GoodOmen step settles.
   */
  forceNextCondition: CraftCondition | null
}

const DEFAULT_OUTCOME: ModifiedOutcome = {
  successRateBonusPp: 0,
  durabilityCeilHalve: false,
  cpCeilHalve: false,
  progressModMul3Div2: false,
  nextBuffDurationBonus: 0,
  forceNextCondition: null,
}

/** Compute the modifier set the given condition imposes on an action. */
export function applyConditionToAction(condition: CraftCondition): ModifiedOutcome {
  switch (condition) {
    case 'Centered':
      return { ...DEFAULT_OUTCOME, successRateBonusPp: 25 }
    case 'Sturdy':
      return { ...DEFAULT_OUTCOME, durabilityCeilHalve: true }
    case 'Pliant':
      return { ...DEFAULT_OUTCOME, cpCeilHalve: true }
    case 'Malleable':
      return { ...DEFAULT_OUTCOME, progressModMul3Div2: true }
    case 'Primed':
      return { ...DEFAULT_OUTCOME, nextBuffDurationBonus: 2 }
    case 'GoodOmen':
      return { ...DEFAULT_OUTCOME, forceNextCondition: 'Good' }
    default:
      return { ...DEFAULT_OUTCOME }
  }
}

/** Cap a success-rate sum at 100. */
export function capSuccessRate(rate: number): number {
  return rate > 100 ? 100 : rate
}

/** `div_ceil(n, 2)` — JavaScript equivalent of raphael-sim's integer half-ceil. */
export function divCeilHalf(n: number): number {
  return Math.ceil(n / 2)
}

/** Integer `action_progress_mod × 3 / 2` (floor), per Malleable's rule. */
export function malleableProgressMod(actionProgressMod: number): number {
  return Math.floor((actionProgressMod * 3) / 2)
}

/**
 * Expert craft condition effects (stateless slice).
 *
 * Pure, side-effect-free helpers describing how the four stateless
 * expert conditions (Centered / Sturdy / Pliant / Malleable) modify
 * a single action's CP cost, durability cost, progress modifier, and
 * success rate.
 *
 * Arithmetic aligns with raphael-sim:
 *  - Integer math; explicit floor / ceil at the boundaries
 *  - Success-rate bonus is additive percentage points, capped at 100
 *  - Durability / CP halving uses `div_ceil(2)` (== `Math.ceil(n / 2)`)
 *  - Progress modifier multiplies by 3 then floor-divides by 2 at the
 *    `action_progress_mod` (per-thousand) layer, before the final
 *    formula `/ 1000` floor.
 *
 * Out of scope for this slice: Primed and GoodOmen. The `ModifiedOutcome`
 * interface keeps `nextBuffDurationBonus` and `forceNextCondition` fields
 * reserved for R2; this module always returns the defaults (0 / null).
 */

import type { CraftCondition, CraftState } from './simulator'
import type { SkillDefinition } from './skills'

export interface ModifiedOutcome {
  /** Additive success-rate bonus in percentage points (cap 100). */
  successRateBonusPp: number
  /** `true` → action's base durability cost becomes `Math.ceil(base / 2)`. */
  durabilityCeilHalve: boolean
  /** `true` → action's base CP cost becomes `Math.ceil(base / 2)`. */
  cpCeilHalve: boolean
  /** `true` → action_progress_mod multiplied by 3 then floor-divided by 2. */
  progressModMul3Div2: boolean
  /** Reserved for Primed (R2). Always 0 here. */
  nextBuffDurationBonus: number
  /** Reserved for GoodOmen (R2). Always null here. */
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

function defaultOutcome(): ModifiedOutcome {
  return { ...DEFAULT_OUTCOME }
}

/**
 * Compute the modifier set the given condition imposes on the given action.
 *
 * The `state` argument is part of the signature so R2 (Primed / GoodOmen)
 * can read pending buff / forced-condition fields without changing the
 * call site; this slice ignores it.
 */
export function applyConditionToAction(
  _action: SkillDefinition,
  condition: CraftCondition,
  _state?: CraftState,
): ModifiedOutcome {
  switch (condition) {
    case 'Centered':
      return { ...defaultOutcome(), successRateBonusPp: 25 }
    case 'Sturdy':
      return { ...defaultOutcome(), durabilityCeilHalve: true }
    case 'Pliant':
      return { ...defaultOutcome(), cpCeilHalve: true }
    case 'Malleable':
      return { ...defaultOutcome(), progressModMul3Div2: true }
    // Normal / Good / Excellent / Poor → no expert flags here.
    // Primed / GoodOmen → R2 slice; default for now.
    default:
      return defaultOutcome()
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

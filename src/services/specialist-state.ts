/**
 * Specialist identity — pure derivations from gearset state.
 *
 * Single source of truth: every gearset carries `isSpecialist: boolean`. All
 * specialist-driven calculations (soul-of-the-crafter stat bonus, which jobs
 * can use Heart & Soul / Quick Innovation) flow from that flag.
 *
 * This module is intentionally Vue/Pinia-free so it can be unit-tested as a
 * plain reducer and reused outside component scope.
 *
 * Note: in-game the player can only slot 3 specialist soul crystals at once,
 * but this slice does NOT enforce that cap — the UI shows a soft warning
 * when count > 3. Callers must not assume the cap holds.
 */

import type { GearsetMap, GearsetStats } from '@/stores/gearsets'

/** Soul of the Crafter bonus — applied when `isSpecialist` is true. */
export const SPECIALIST_BONUS = {
  craftsmanship: 20,
  control: 20,
  cp: 15,
} as const

/**
 * Job codes (e.g. `CRP`, `BSM`) for every gearset currently flagged
 * `isSpecialist: true`, in the iteration order of the input map.
 */
export function currentSpecialists(gearsets: GearsetMap): string[] {
  const result: string[] = []
  for (const [job, stats] of Object.entries(gearsets)) {
    if (stats.isSpecialist) result.push(job)
  }
  return result
}

/** Convenience counter — equivalent to `currentSpecialists(gearsets).length`. */
export function specialistCount(gearsets: GearsetMap): number {
  return currentSpecialists(gearsets).length
}

/**
 * Actions that in-game require a Soul of the Crafter (specialist) slotted on
 * the active gearset. Used by `canUseSpecialistAction` — every other action
 * is unaffected by specialist status.
 */
const SPECIALIST_GATED_ACTIONS: ReadonlySet<string> = new Set([
  'HeartAndSoul',
  'QuickInnovation',
])

/**
 * Returns whether `action` is usable given `gearset`'s specialist status.
 *
 * - Specialist-gated actions (`HeartAndSoul`, `QuickInnovation`) require
 *   `gearset.isSpecialist === true`. A `null` gearset is treated as
 *   non-specialist.
 * - Every other action — including `Manipulation` and any unknown id —
 *   returns `true` (specialist status is irrelevant).
 *
 * This is the single source of truth for the SolverPanel checkbox-gating
 * logic; reuse it instead of inlining the action list.
 */
export function canUseSpecialistAction(
  gearset: Pick<GearsetStats, 'isSpecialist'> | null | undefined,
  action: string,
): boolean {
  if (!SPECIALIST_GATED_ACTIONS.has(action)) return true
  return gearset?.isSpecialist === true
}

/**
 * Returns a copy of `gearset` with the Soul of the Crafter bonus folded into
 * craftsmanship / control / cp when `isSpecialist` is true. When false,
 * returns a shallow copy with the same stats — never the input reference,
 * so callers can mutate freely.
 */
export function applyCrafterSoulBonus(gearset: GearsetStats): GearsetStats {
  if (!gearset.isSpecialist) {
    return { ...gearset }
  }
  return {
    ...gearset,
    craftsmanship: gearset.craftsmanship + SPECIALIST_BONUS.craftsmanship,
    control: gearset.control + SPECIALIST_BONUS.control,
    cp: gearset.cp + SPECIALIST_BONUS.cp,
  }
}

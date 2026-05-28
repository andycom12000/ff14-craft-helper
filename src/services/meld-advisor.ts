/**
 * Materia Meld Advisor.
 *
 * Reverse-solves the minimum materia spend on a same-job recipe set so the
 * Raphael solver can double-max (= guarantee HQ) every target, and compares
 * to a maintained per-patch BiS reference. The gap between the two is the
 * headline value.
 *
 * Algorithm (approach B = closed-form prefilter + bounded solver confirmation):
 *   0. already-meets check (skip if current gearset already double-maxes)
 *   1. pick binding recipe (single-axis-max binding for v1)
 *   2. solveProgressBreakpoint (closed-form)
 *   3. solveQualityBreakpoint (closed-form binary search, honours initialQuality
 *      from HQ ingredients)
 *   4. confirmBreakpointWithSolver (1-3 real solves, bump up on shortfall)
 *   5. translateDeltaToMeldPlan (guaranteed → overmeld, fail ladder)
 *   6. computeBisPlan (current → BIS_REFERENCE, deep overmeld)
 *   7. assemble MeldAdvice with gapGil
 *
 * Stat-stacking (ADR-0001): the Δstats produced by this service are RAW gear
 * deltas. They MUST be folded into the gearset before Soul/food/medicine.
 * The reverse-solve uses `recipeToCraftParams` (canonical entry) so Soul and
 * existing buffs stack correctly.
 */
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { MarketData } from '@/api/universalis'
import type { CraftStat, BiSReference } from '@/engine/materia'

export type MateriaPriceMap = Map<number, MarketData>

export interface MeldStep {
  stat: CraftStat
  grade: number
  placedCount: number       // melds that must succeed
  expectedCount: number     // including overmeld failure waste
  unitPrice: number | null  // null = Universalis had no listing
  subtotal: number | null   // unitPrice * expectedCount, null if no price
}

export interface MeldPlan {
  feasible: boolean
  reason?: string
  deltaStats: { craftsmanship: number; control: number; cp: number }
  steps: MeldStep[]
  totalGil: number | null   // null when any step has no price
  confirmedBySolver: boolean
}

export interface MeldAdvice {
  costOptimal: MeldPlan
  bis: MeldPlan
  gapGil: number | null     // bis.totalGil - costOptimal.totalGil; null if either is null
  alreadyMeetsThreshold: boolean
}

export interface AdviseMeldOptions {
  bisReference: BiSReference
  /** initialQuality from HQ ingredients (default 0). Required so we don't
   *  over-estimate the control breakpoint. */
  initialQuality?: number
  isCancelled?: () => boolean
}

/** Stub — will be filled in over Tasks 6-12. */
export async function adviseMeld(
  _targets: Recipe[],
  _gearset: GearsetStats,
  _priceMap: MateriaPriceMap,
  _options: AdviseMeldOptions,
): Promise<MeldAdvice> {
  const empty: MeldPlan = {
    feasible: true,
    deltaStats: { craftsmanship: 0, control: 0, cp: 0 },
    steps: [],
    totalGil: 0,
    confirmedBySolver: false,
  }
  return {
    costOptimal: empty,
    bis: { ...empty },
    gapGil: 0,
    alreadyMeetsThreshold: true,
  }
}

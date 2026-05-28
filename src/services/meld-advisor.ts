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
import {
  computeBaseProgress,
  computeBaseQuality,
  QUALITY_PHASE_UPPER_BOUND_MULTIPLIER,
  AVG_QUALITY_CP_COST,
  MARGIN,
} from '@/services/feasibility-prefilter'
import { gearsetToBuffedStats } from '@/services/stat-stacking'

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

/**
 * Pick the single hardest recipe to drive the breakpoint.
 * v1: highest progress; tie-break by highest quality.
 * Multi-recipe per-axis dominance is v2.
 */
export function findBindingRecipe(targets: Recipe[]): Recipe | null {
  if (targets.length === 0) return null
  let best = targets[0]
  for (const r of targets.slice(1)) {
    const bestP = best.recipeLevelTable.progress
    const bestQ = best.recipeLevelTable.quality
    const rP = r.recipeLevelTable.progress
    const rQ = r.recipeLevelTable.quality
    if (rP > bestP || (rP === bestP && rQ > bestQ)) best = r
  }
  return best
}

/** Coarse upper bound on progress steps in a typical max-quality macro. */
const PROGRESS_STEP_UPPER_BOUND = 10

/**
 * Step 2 — closed-form: minimum Δcraftsmanship so the binding recipe's
 * progress is clearable. Returns 0 if the current gearset (after Soul) already
 * suffices.
 */
export function solveProgressBreakpoint(
  recipe: Recipe,
  gearset: GearsetStats,
): number {
  const buffed = gearsetToBuffedStats(gearset, undefined)
  const rlt = recipe.recipeLevelTable
  const bp = computeBaseProgress(buffed.craftsmanship, gearset.level, rlt)
  const reachable = bp * PROGRESS_STEP_UPPER_BOUND
  if (reachable >= rlt.progress) return 0

  // Binary search for the minimum craftsmanship delta that flips
  // computeBaseProgress * step upper bound >= recipe.progress.
  let lo = 0
  let hi = 10_000
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const bumped = computeBaseProgress(buffed.craftsmanship + mid, gearset.level, rlt)
    if (bumped * PROGRESS_STEP_UPPER_BOUND >= rlt.progress) hi = mid
    else lo = mid + 1
  }
  return lo
}

/**
 * Internal: does the closed-form upper bound allow reaching max quality
 * for this gearset (after Soul/buffs), given an initialQuality head start?
 *
 * Mirrors the math of `canReachHQQuality` but accepts an explicit
 * initialQuality so HQ sub-materials are honoured.
 */
function quietCanReachHQQuality(
  recipe: Recipe,
  gearset: GearsetStats,
  initialQuality: number,
): boolean {
  const buffed = gearsetToBuffedStats(gearset, undefined)
  const baseQuality = computeBaseQuality(buffed.control, gearset.level, recipe.recipeLevelTable)
  const maxQualitySteps = Math.floor(buffed.cp / AVG_QUALITY_CP_COST)
  const maxAchievable =
    baseQuality * QUALITY_PHASE_UPPER_BOUND_MULTIPLIER * maxQualitySteps * MARGIN
  return (maxAchievable + initialQuality) >= recipe.recipeLevelTable.quality
}

const CP_STEP = 6
const CP_SEARCH_LIMIT = 600

/**
 * Step 3 — closed-form: minimum Δcontrol + Δcp on top of an existing
 * Δcraftsmanship so the binding recipe is quality-feasible. v1 greedy:
 * binary-search Δcontrol at each candidate Δcp.
 */
export function solveQualityBreakpoint(
  recipe: Recipe,
  gearset: GearsetStats,
  craftsmanshipDelta: number,
  initialQuality: number,
): { control: number; cp: number } {
  const withCraft: GearsetStats = {
    ...gearset,
    craftsmanship: gearset.craftsmanship + craftsmanshipDelta,
  }

  const tryControlBinary = (cpDelta: number): number | null => {
    const withCp: GearsetStats = { ...withCraft, cp: withCraft.cp + cpDelta }
    if (quietCanReachHQQuality(recipe, withCp, initialQuality)) return 0
    let lo = 1
    let hi = 10_000
    let last: number | null = null
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2)
      const probe: GearsetStats = { ...withCp, control: withCp.control + mid }
      if (quietCanReachHQQuality(recipe, probe, initialQuality)) {
        last = mid
        hi = mid - 1
      } else {
        lo = mid + 1
      }
    }
    return last
  }

  let bestControl = tryControlBinary(0)
  let bestCp = 0
  if (bestControl === null) {
    for (let cpDelta = CP_STEP; cpDelta <= CP_SEARCH_LIMIT; cpDelta += CP_STEP) {
      const c = tryControlBinary(cpDelta)
      if (c !== null) {
        bestControl = c
        bestCp = cpDelta
        break
      }
    }
  }
  return { control: bestControl ?? 10_000, cp: bestCp }
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

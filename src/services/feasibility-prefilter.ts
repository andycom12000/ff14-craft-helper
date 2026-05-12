import type { RecipeLevelTable, Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { FoodBuff } from '@/engine/food-medicine'
import { applyBuffsToStats } from '@/engine/food-medicine'

// Derived from raphael-sim/src/actions.rs:46-47 and effects.rs:70-80.
// Whole-phase upper bound — empirically matches what raphael-solver can
// actually achieve in ~10 quality steps. Tuned for false positive (over-accept,
// solver catches the rest) over false negative.
export const QUALITY_PHASE_UPPER_BOUND_MULTIPLIER = 25
export const AVG_QUALITY_CP_COST = 18
export const MARGIN = 1.10

export function computeBaseQuality(control: number, crafterLevel: number, rlt: RecipeLevelTable): number {
  let bq = (control * 10) / rlt.qualityDivider + 35
  if (crafterLevel <= rlt.classJobLevel) bq = (bq * rlt.qualityModifier) / 100
  return Math.floor(bq)
}

export function computeBaseProgress(craftsmanship: number, crafterLevel: number, rlt: RecipeLevelTable): number {
  let bp = (craftsmanship * 10) / rlt.progressDivider + 2
  if (crafterLevel <= rlt.classJobLevel) bp = (bp * rlt.progressModifier) / 100
  return Math.floor(bp)
}

export function canReachHQQuality(
  recipe: Recipe,
  gearset: GearsetStats,
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null },
): boolean {
  const stats = applyBuffsToStats(
    { craftsmanship: gearset.craftsmanship, control: gearset.control, cp: gearset.cp },
    buffs,
  )
  const baseQuality = computeBaseQuality(stats.control, gearset.level, recipe.recipeLevelTable)
  const maxQualitySteps = Math.floor(stats.cp / AVG_QUALITY_CP_COST)
  const maxAchievable = baseQuality * QUALITY_PHASE_UPPER_BOUND_MULTIPLIER * maxQualitySteps * MARGIN
  return maxAchievable >= recipe.recipeLevelTable.quality
}

/**
 * Strict separation factor for `canReachHQQualityStrict`. Calibrated against
 * a 57-row prediction-vs-actual matrix (19 recipes × 3 gearsets) collected
 * via BenchPanel in May 2026. See:
 *   src/__tests__/fixtures/prefilter-fixture.json
 *   docs/superpowers/specs/2026-05-12-batch-perf-next-sprints-design.md §7.5
 *
 * Reached datapoints had `maxAchievable / recipe.quality ≥ 26.21`.
 * Unreached datapoints had `maxAchievable / recipe.quality ≤ 20.59`.
 * K=23 sits in the gap with ~12% margin on both sides.
 */
export const STRICT_CALIBRATION_FACTOR = 23

/**
 * Tighter version of canReachHQQuality used as a gate before raphael's
 * strict_quality probe. Predicting false here means "we believe HQ is
 * unachievable, so paying the strict-mode search cost is worthwhile because
 * raphael will NoSolution out early." Calibrated for 0 false negatives on
 * the 57-row fixture; future formula drift caught by the unit test.
 */
export function canReachHQQualityStrict(
  recipe: Recipe,
  gearset: GearsetStats,
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null },
): boolean {
  const stats = applyBuffsToStats(
    { craftsmanship: gearset.craftsmanship, control: gearset.control, cp: gearset.cp },
    buffs,
  )
  const baseQuality = computeBaseQuality(stats.control, gearset.level, recipe.recipeLevelTable)
  const maxQualitySteps = Math.floor(stats.cp / AVG_QUALITY_CP_COST)
  const maxAchievable = baseQuality * QUALITY_PHASE_UPPER_BOUND_MULTIPLIER * maxQualitySteps * MARGIN
  return maxAchievable >= recipe.recipeLevelTable.quality * STRICT_CALIBRATION_FACTOR
}

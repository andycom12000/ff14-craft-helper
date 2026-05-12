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

import type { GearsetStats } from '@/stores/gearsets'
import type { FoodBuff, EnhancedStats } from '@/engine/food-medicine'
import type { CraftParams } from '@/engine/simulator'
import type { Recipe } from '@/stores/recipe'
import { applyBuffsToStats } from '@/engine/food-medicine'
import { applyCrafterSoulBonus } from '@/services/specialist-state'

/**
 * Single source of truth for buffed character stats.
 *
 * Stacking order (see docs/adr/0001-stat-stacking-order.md):
 *   raw gear → + Soul of the Crafter → × food % → × medicine %
 *
 * Every non-simulator caller that needs the stats the solver / scorer will
 * actually see MUST go through this function. Do not call `applyFoodBuff` /
 * `applyMedicineBuff` / `applyBuffsToStats` directly on raw gearset stats —
 * doing so silently drops the specialist Soul bonus or applies food before
 * Soul, which is non-commutative when a food cap is hit.
 */
export function gearsetToBuffedStats(
  gearset: GearsetStats,
  buffs: { food: FoodBuff | null; medicine: FoodBuff | null } | undefined,
): EnhancedStats {
  const withSoul = applyCrafterSoulBonus(gearset)
  const base: EnhancedStats = {
    craftsmanship: withSoul.craftsmanship,
    control: withSoul.control,
    cp: withSoul.cp,
  }
  return applyBuffsToStats(base, buffs)
}

/**
 * Recipe + Gearset (+ optional food/medicine) → CraftParams for the WASM
 * solver. ADR-0001 canonical entry point — Soul of the Crafter, food, and
 * medicine are stacked in the documented order via `gearsetToBuffedStats`.
 * Callers MUST NOT post-process the returned params with `applyFoodBuff` —
 * pass buffs in here instead.
 */
export function recipeToCraftParams(
  recipe: Recipe,
  gearset: GearsetStats,
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null },
): CraftParams {
  const buffed = gearsetToBuffedStats(gearset, buffs)
  return {
    craftsmanship: buffed.craftsmanship,
    control: buffed.control,
    cp: buffed.cp,
    crafterLevel: gearset.level,
    recipeLevelTable: recipe.recipeLevelTable,
    canHq: recipe.canHq,
    initialQuality: 0,
    isExpert: recipe.isExpert ?? false,
  }
}

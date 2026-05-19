import type { GearsetStats } from '@/stores/gearsets'
import type { FoodBuff, EnhancedStats } from '@/engine/food-medicine'
import { applyFoodBuff, applyMedicineBuff } from '@/engine/food-medicine'
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
  if (!buffs) return base
  return applyMedicineBuff(applyFoodBuff(base, buffs.food), buffs.medicine)
}

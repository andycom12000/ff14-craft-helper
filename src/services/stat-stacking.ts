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
/** A raw-gear stat delta — e.g. the session meld override (Slice C). */
export interface RawStatDelta {
  craftsmanship: number
  control: number
  cp: number
}

/**
 * Fold a raw-gear stat delta (the session meld override) onto a gearset's raw
 * stats, returning a NEW gearset. Per ADR-0001 the override is a raw-gear delta
 * that MUST be applied BEFORE Soul/food/medicine — feed the result into
 * `gearsetToBuffedStats` / `applyCrafterSoulBonus`, never after. Returns the
 * gearset unchanged (no allocation) when `delta` is null/undefined, so the
 * no-override path stays byte-identical to today.
 */
export function applyRawStatDelta(
  gearset: GearsetStats,
  delta: RawStatDelta | null | undefined,
): GearsetStats {
  if (!delta) return gearset
  return {
    ...gearset,
    craftsmanship: gearset.craftsmanship + delta.craftsmanship,
    control: gearset.control + delta.control,
    cp: gearset.cp + delta.cp,
  }
}

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
  initialQuality: number = 0,
): CraftParams {
  const buffed = gearsetToBuffedStats(gearset, buffs)
  return {
    craftsmanship: buffed.craftsmanship,
    control: buffed.control,
    cp: buffed.cp,
    crafterLevel: gearset.level,
    recipeLevelTable: recipe.recipeLevelTable,
    canHq: recipe.canHq,
    initialQuality,
    isExpert: recipe.isExpert ?? false,
  }
}

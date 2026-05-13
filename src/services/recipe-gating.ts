import type { Recipe } from '@/stores/recipe'

export type LevelGateVerdict =
  | { kind: 'ok' }
  | { kind: 'soft'; crafterLevel: number; recipeLevel: number; progressModifier: number; qualityModifier: number }
  | { kind: 'hard'; crafterLevel: number; recipeLevel: number; reasons: HardGateReason[] }

export type HardGateReason = 'stars' | 'expert' | 'requiredCraftsmanship' | 'requiredControl'

/**
 * Returns hard-gate reasons present on a recipe. Empty array means the recipe
 * is a standard 0-star recipe with no stat gates — in FFXIV, such recipes
 * apply progress/quality modifiers as a soft penalty when the crafter is below
 * recipe level, rather than blocking synthesis.
 *
 * See raphael-data's get_game_settings: the level comparison merely scales
 * base_progress / base_quality by progressModifier / qualityModifier; there is
 * no hard level gate in the formula itself. Hard gates come from the Recipe
 * sheet (IsExpert, RequiredCraftsmanship, RequiredControl) or the recipe's
 * star rating, which the game uses to block synthesis at the UI level.
 */
export function recipeHardGateReasons(recipe: Recipe): HardGateReason[] {
  const reasons: HardGateReason[] = []
  if ((recipe.stars ?? 0) > 0) reasons.push('stars')
  if (recipe.isExpert) reasons.push('expert')
  if ((recipe.requiredCraftsmanship ?? 0) > 0) reasons.push('requiredCraftsmanship')
  if ((recipe.requiredControl ?? 0) > 0) reasons.push('requiredControl')
  return reasons
}

export function isRecipeHardGated(recipe: Recipe): boolean {
  return recipeHardGateReasons(recipe).length > 0
}

/**
 * Classifies whether a gearset can attempt a recipe given its level.
 *
 *   ok   — crafter meets the recipe's classJobLevel
 *   soft — below level, but recipe is 0-star with no stat gate; synthesis is
 *          allowed in-game with progressModifier / qualityModifier scaling
 *   hard — below level AND recipe has at least one hard gate (stars, expert,
 *          required craftsmanship/control); synthesis is blocked in-game
 */
export function checkLevelGate(
  recipe: Recipe,
  crafterLevel: number,
): LevelGateVerdict {
  const recipeLevel = recipe.recipeLevelTable.classJobLevel
  if (crafterLevel >= recipeLevel) return { kind: 'ok' }
  const reasons = recipeHardGateReasons(recipe)
  if (reasons.length > 0) {
    return { kind: 'hard', crafterLevel, recipeLevel, reasons }
  }
  return {
    kind: 'soft',
    crafterLevel,
    recipeLevel,
    progressModifier: recipe.recipeLevelTable.progressModifier,
    qualityModifier: recipe.recipeLevelTable.qualityModifier,
  }
}

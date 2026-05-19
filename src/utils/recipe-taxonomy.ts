/**
 * recipe-taxonomy.ts
 *
 * Derives a stable, analytics-friendly taxonomy from a Recipe object.
 *
 * Field mapping notes (actual Recipe type vs. GA spec assumptions):
 *   - spec `rlv`               → Recipe.recipeLevelTable.classJobLevel
 *   - spec `stars`             → Recipe.stars  (exists)
 *   - spec `isExpert`          → Recipe.isExpert  (exists, optional)
 *   - spec `requiresSpecialist`→ NOT on Recipe → always false
 *   - spec `isCollectable`     → NOT on Recipe → always false
 *   - spec `craftType`         → NOT on Recipe (craftType int is RecipeRecord-only);
 *                                 craft_kind derived from Recipe.isExpert
 *   - spec `category`          → NOT on Recipe → always 'misc'
 */

import type { Recipe } from '@/stores/recipe'

export type CraftKind = 'normal' | 'quick' | 'custom_delivery' | 'company' | 'expert'
export type RecipeCategory = 'gear' | 'consumable' | 'housing' | 'material' | 'misc'
export type ActionCountBucket = 'short' | 'medium' | 'long' | 'unknown'

export interface RecipeTaxonomy {
  /** Recipe level table value (classJobLevel). */
  rlv: number
  stars: number
  is_expert: boolean
  /** Always false — Recipe type has no requiresSpecialist field. */
  requires_specialist: boolean
  /** Always false — Recipe type has no isCollectable field. */
  is_collectable: boolean
  craft_kind: CraftKind
  /** Always 'misc' — Recipe type has no item-category field. */
  category: RecipeCategory
  expected_action_count_bucket: ActionCountBucket
}

function bucketActionCount(count: number | undefined | null): ActionCountBucket {
  if (count == null) return 'unknown'
  if (count < 15) return 'short'
  if (count <= 25) return 'medium'
  return 'long'
}

/**
 * Derives a craft_kind from the Recipe.
 * Since the Recipe type does not carry a craftType integer, we infer:
 *   - isExpert === true  → 'expert'
 *   - otherwise          → 'normal'
 */
function deriveCraftKind(r: Partial<Recipe>): CraftKind {
  if (r.isExpert === true) return 'expert'
  return 'normal'
}

export function computeRecipeTaxonomy(recipe: Recipe, actionCount?: number): RecipeTaxonomy {
  // Use Partial to be defensive — partial/mock recipes may omit optional fields.
  const r = recipe as Partial<Recipe>

  return {
    rlv: r.recipeLevelTable?.classJobLevel ?? 0,
    stars: typeof r.stars === 'number' ? r.stars : 0,
    is_expert: r.isExpert === true,
    requires_specialist: false,
    is_collectable: false,
    craft_kind: deriveCraftKind(r),
    category: 'misc',
    expected_action_count_bucket: bucketActionCount(actionCount),
  }
}

/** Flat snake_case record suitable for spreading into a trackEvent payload. */
export function flattenTaxonomyForEvent(
  t: RecipeTaxonomy,
): Record<string, string | number | boolean> {
  return {
    rlv: t.rlv,
    stars: t.stars,
    is_expert: t.is_expert,
    requires_specialist: t.requires_specialist,
    is_collectable: t.is_collectable,
    craft_kind: t.craft_kind,
    category: t.category,
    expected_action_count_bucket: t.expected_action_count_bucket,
  }
}

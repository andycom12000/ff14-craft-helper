/**
 * recipe-taxonomy.ts
 *
 * Derives a stable, analytics-friendly taxonomy from a Recipe object.
 *
 * Field mapping (after data pipeline enrichment 2026-05-19):
 *   - spec `rlv`                → Recipe.recipeLevelTable.classJobLevel
 *   - spec `stars`              → Recipe.stars
 *   - spec `isExpert`           → Recipe.isExpert
 *   - spec `requires_specialist`→ Recipe.requiresSpecialist (build-time-derived)
 *   - spec `is_collectable`     → Recipe.isCollectable (from result Item)
 *   - spec `craft_kind`         → Recipe.craftKind (build-time-derived)
 *   - spec `category`           → looked up by CALLER from Item.category;
 *                                 this util defaults to 'misc'
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
  requires_specialist: boolean
  is_collectable: boolean
  craft_kind: CraftKind
  /** Always 'misc' — category lives on Item, not Recipe; caller overrides from item lookup. */
  category: RecipeCategory
  expected_action_count_bucket: ActionCountBucket
}

function bucketActionCount(count: number | undefined | null): ActionCountBucket {
  if (count == null) return 'unknown'
  if (count < 15) return 'short'
  if (count <= 25) return 'medium'
  return 'long'
}

export function computeRecipeTaxonomy(recipe: Recipe, actionCount?: number): RecipeTaxonomy {
  const r = recipe as Partial<Recipe>
  return {
    rlv: r.recipeLevelTable?.classJobLevel ?? 0,
    stars: typeof r.stars === 'number' ? r.stars : 0,
    is_expert: r.isExpert === true,
    requires_specialist: r.requiresSpecialist === true,
    is_collectable: r.isCollectable === true,
    craft_kind: r.craftKind ?? 'normal',
    // category lives on Item, not Recipe — caller looks it up separately.
    // We keep 'misc' here so the flat-event helper has a stable key.
    // Tasks 6 / 9 (recipe_select / bom_target_add) override this from item lookup.
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

import type { Recipe } from '@/stores/recipe'

export type CraftKind = 'normal' | 'quick' | 'custom_delivery' | 'company' | 'expert'
export type ActionCountBucket = 'short' | 'medium' | 'long' | 'unknown'

export interface RecipeTaxonomy {
  rlv: number
  stars: number
  is_expert: boolean
  requires_specialist: boolean
  is_collectable: boolean
  craft_kind: CraftKind
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
    rlv: r.rlv ?? r.recipeLevelTable?.classJobLevel ?? 0,
    stars: typeof r.stars === 'number' ? r.stars : 0,
    is_expert: r.isExpert === true,
    requires_specialist: r.requiresSpecialist === true,
    is_collectable: r.isCollectable === true,
    craft_kind: r.craftKind ?? 'normal',
    expected_action_count_bucket: bucketActionCount(actionCount),
  }
}

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
    expected_action_count_bucket: t.expected_action_count_bucket,
  }
}

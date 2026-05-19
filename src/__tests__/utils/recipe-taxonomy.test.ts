import { describe, it, expect } from 'vitest'
import { computeRecipeTaxonomy, flattenTaxonomyForEvent } from '@/utils/recipe-taxonomy'
import type { Recipe } from '@/stores/recipe'

/**
 * Minimal Recipe fixture.
 * Actual Recipe (stores/recipe.ts) fields differ from the GA spec assumptions:
 *   - No top-level `rlv`  → use recipeLevelTable.classJobLevel
 *   - No `requiresSpecialist` → always false
 *   - No `isCollectable`  → always false
 *   - No `craftType`      → taxonomy craft_kind derived from job abbreviation
 *   - No `category`       → always 'misc'
 */
function makeRecipe(overrides: Partial<Recipe>): Recipe {
  return {
    id: 1,
    itemId: 100,
    name: 'Test',
    icon: '',
    job: 'CRP',
    level: 90,
    stars: 0,
    canHq: true,
    materialQualityFactor: 75,
    amountResult: 1,
    ingredients: [],
    recipeLevelTable: {
      classJobLevel: 90,
      stars: 0,
      difficulty: 4500,
      quality: 14500,
      durability: 70,
      suggestedCraftsmanship: 3500,
      progressDivider: 130,
      qualityDivider: 115,
      progressModifier: 80,
      qualityModifier: 70,
    },
    isExpert: false,
    requiredCraftsmanship: 0,
    requiredControl: 0,
    requiredQuality: 0,
    ...overrides,
  } as Recipe
}

describe('computeRecipeTaxonomy', () => {
  it('extracts plain fields from a recipe', () => {
    const r = makeRecipe({
      recipeLevelTable: {
        classJobLevel: 90,
        stars: 2,
        difficulty: 4500,
        quality: 14500,
        durability: 70,
        suggestedCraftsmanship: 3500,
        progressDivider: 130,
        qualityDivider: 115,
        progressModifier: 80,
        qualityModifier: 70,
      },
      stars: 2,
      isExpert: true,
    })
    const t = computeRecipeTaxonomy(r)
    expect(t.rlv).toBe(90)
    expect(t.stars).toBe(2)
    expect(t.is_expert).toBe(true)
  })

  it('defaults expected_action_count_bucket to unknown when not provided', () => {
    const r = makeRecipe({})
    expect(computeRecipeTaxonomy(r).expected_action_count_bucket).toBe('unknown')
  })

  it('classifies action_count buckets (< 15 short / 15–25 medium / > 25 long)', () => {
    expect(computeRecipeTaxonomy(makeRecipe({}), 10).expected_action_count_bucket).toBe('short')
    expect(computeRecipeTaxonomy(makeRecipe({}), 20).expected_action_count_bucket).toBe('medium')
    expect(computeRecipeTaxonomy(makeRecipe({}), 30).expected_action_count_bucket).toBe('long')
    expect(computeRecipeTaxonomy(makeRecipe({}), 14).expected_action_count_bucket).toBe('short')
    expect(computeRecipeTaxonomy(makeRecipe({}), 15).expected_action_count_bucket).toBe('medium')
    expect(computeRecipeTaxonomy(makeRecipe({}), 25).expected_action_count_bucket).toBe('medium')
    expect(computeRecipeTaxonomy(makeRecipe({}), 26).expected_action_count_bucket).toBe('long')
  })

  it('maps craft_kind: expert recipe gets expert, normal gets normal', () => {
    expect(computeRecipeTaxonomy(makeRecipe({ isExpert: true })).craft_kind).toBe('expert')
    expect(computeRecipeTaxonomy(makeRecipe({ isExpert: false })).craft_kind).toBe('normal')
    expect(computeRecipeTaxonomy(makeRecipe({})).craft_kind).toBe('normal')
  })

  it('falls back to safe defaults for missing / partial recipe fields', () => {
    const partial = { id: 99, name: 'Mystery' } as unknown as Recipe
    const t = computeRecipeTaxonomy(partial)
    expect(t.stars).toBe(0)
    expect(t.is_expert).toBe(false)
    expect(t.craft_kind).toBe('normal')
    expect(t.category).toBe('misc')
    expect(t.requires_specialist).toBe(false)
    expect(t.is_collectable).toBe(false)
  })

  it('requires_specialist and is_collectable are always false (fields absent from Recipe type)', () => {
    const r = makeRecipe({})
    const t = computeRecipeTaxonomy(r)
    expect(t.requires_specialist).toBe(false)
    expect(t.is_collectable).toBe(false)
  })

  it('flattenTaxonomyForEvent returns flat snake_case keys suitable for trackEvent', () => {
    const r = makeRecipe({
      recipeLevelTable: {
        classJobLevel: 90,
        stars: 2,
        difficulty: 4500,
        quality: 14500,
        durability: 70,
        suggestedCraftsmanship: 3500,
        progressDivider: 130,
        qualityDivider: 115,
        progressModifier: 80,
        qualityModifier: 70,
      },
      stars: 2,
      isExpert: true,
    })
    const flat = flattenTaxonomyForEvent(computeRecipeTaxonomy(r))
    expect(flat).toMatchObject({
      rlv: 90,
      stars: 2,
      is_expert: true,
      is_collectable: false,
    })
  })
})

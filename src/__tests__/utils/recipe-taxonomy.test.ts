import { describe, it, expect } from 'vitest'
import { computeRecipeTaxonomy, flattenTaxonomyForEvent } from '@/utils/recipe-taxonomy'
import type { Recipe } from '@/stores/recipe'

function makeRecipe(overrides: Partial<Recipe>): Recipe {
  return {
    id: 1, itemId: 100, name: 'Test', icon: '', job: 'CRP', level: 90,
    stars: 0, canHq: true, materialQualityFactor: 50, amountResult: 1,
    ingredients: [],
    recipeLevelTable: {
      classJobLevel: 90, stars: 0, difficulty: 5000, quality: 15000,
      durability: 70, suggestedCraftsmanship: 4000,
      progressDivider: 130, qualityDivider: 115,
      progressModifier: 100, qualityModifier: 100, conditionsFlag: 15,
    },
    isExpert: false, requiresSpecialist: false, isCollectable: false,
    craftKind: 'normal',
    ...overrides,
  } as Recipe
}

describe('computeRecipeTaxonomy (full taxonomy)', () => {
  it('reads stars + is_expert from recipe', () => {
    const t = computeRecipeTaxonomy(makeRecipe({ stars: 3, isExpert: true }))
    expect(t.stars).toBe(3)
    expect(t.is_expert).toBe(true)
  })

  it('reads rlv from recipeLevelTable.classJobLevel', () => {
    const t = computeRecipeTaxonomy(makeRecipe({
      recipeLevelTable: { classJobLevel: 640 } as Recipe['recipeLevelTable'],
    }))
    expect(t.rlv).toBe(640)
  })

  it('reads requires_specialist when set', () => {
    expect(computeRecipeTaxonomy(makeRecipe({ requiresSpecialist: true })).requires_specialist).toBe(true)
    expect(computeRecipeTaxonomy(makeRecipe({ requiresSpecialist: false })).requires_specialist).toBe(false)
  })

  it('reads is_collectable when set', () => {
    expect(computeRecipeTaxonomy(makeRecipe({ isCollectable: true })).is_collectable).toBe(true)
  })

  it('reads craft_kind from Recipe.craftKind', () => {
    expect(computeRecipeTaxonomy(makeRecipe({ craftKind: 'quick' })).craft_kind).toBe('quick')
    expect(computeRecipeTaxonomy(makeRecipe({ craftKind: 'company' })).craft_kind).toBe('company')
    expect(computeRecipeTaxonomy(makeRecipe({ craftKind: 'expert' })).craft_kind).toBe('expert')
  })

  it('craft_kind falls back to normal when undefined', () => {
    expect(computeRecipeTaxonomy(makeRecipe({ craftKind: undefined })).craft_kind).toBe('normal')
  })

  it('classifies action_count buckets', () => {
    expect(computeRecipeTaxonomy(makeRecipe({}), 10).expected_action_count_bucket).toBe('short')
    expect(computeRecipeTaxonomy(makeRecipe({}), 20).expected_action_count_bucket).toBe('medium')
    expect(computeRecipeTaxonomy(makeRecipe({}), 30).expected_action_count_bucket).toBe('long')
  })

  it('flattenTaxonomyForEvent returns flat snake_case keys', () => {
    const r = makeRecipe({ stars: 2, isExpert: true, isCollectable: true, requiresSpecialist: true, craftKind: 'expert' })
    const flat = flattenTaxonomyForEvent(computeRecipeTaxonomy(r))
    expect(flat).toMatchObject({
      stars: 2, is_expert: true, is_collectable: true,
      requires_specialist: true, craft_kind: 'expert',
    })
  })
})

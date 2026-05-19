import { describe, it, expect } from 'vitest'
import { computeBaseQuality, computeBaseProgress, canReachHQQuality } from '@/services/feasibility-prefilter'
import type { Recipe } from '@/stores/recipe'
import { COMMON_FOODS } from '@/engine/food-medicine'

const lv90Rlt = {
  classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
  durability: 80, suggestedCraftsmanship: 3500,
  progressDivider: 130, qualityDivider: 115,
  progressModifier: 90, qualityModifier: 80,
}

describe('computeBaseQuality / computeBaseProgress', () => {
  it('applies recipe-level modifier when crafter level ≤ rlvl', () => {
    expect(computeBaseQuality(3800, 90, lv90Rlt)).toBe(292)
    expect(computeBaseProgress(4000, 90, lv90Rlt)).toBe(278)
  })

  it('skips modifier when crafter outlevels recipe', () => {
    expect(computeBaseQuality(3800, 100, lv90Rlt)).toBe(365)
  })
})

const lv94Recipe: Recipe = {
  id: 1, itemId: 100, name: 'test', icon: '', job: 'CRP',
  level: 94, stars: 0, canHq: true, materialQualityFactor: 50, amountResult: 1,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 94, stars: 0, difficulty: 4400, quality: 8500,
    durability: 80, suggestedCraftsmanship: 3950,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 80,
  },
}

describe('canReachHQQuality', () => {
  it('passes when control + CP comfortably exceed target', () => {
    expect(canReachHQQuality(lv94Recipe, { level: 100, craftsmanship: 5000, control: 5000, cp: 700, isSpecialist: false })).toBe(true)
  })

  it('rejects when both control and CP are starved', () => {
    expect(canReachHQQuality(lv94Recipe, { level: 94, craftsmanship: 3500, control: 100, cp: 50, isSpecialist: false })).toBe(false)
  })
})

describe('canReachHQQuality — specialist Soul bonus is counted', () => {
  // quality: 2500 is between withoutSoul max (~1870) and withSoul max (~3795),
  // making it a tight threshold that the +20 control / +15 CP Soul bonus flips.
  const tightRecipe: Recipe = {
    ...lv94Recipe,
    recipeLevelTable: { ...lv94Recipe.recipeLevelTable, quality: 2500 },
  }

  it('specialist gearset is evaluated WITH +20/+20/+15 Soul bonus', () => {
    const borderline = { level: 100, craftsmanship: 4000, control: 380, cp: 35, isSpecialist: false }
    const borderlineSpec = { ...borderline, isSpecialist: true }
    const withoutSoul = canReachHQQuality(tightRecipe, borderline)
    const withSoul = canReachHQQuality(tightRecipe, borderlineSpec)
    expect(withoutSoul).toBe(false)
    expect(withSoul).toBe(true)
  })

  it('food % is applied AFTER Soul (specialist + 高山茶 HQ)', () => {
    const gearset = { level: 100, craftsmanship: 4000, control: 380, cp: 35, isSpecialist: true }
    const food = COMMON_FOODS.find(f => f.id === 36060)!
    const result = canReachHQQuality(tightRecipe, gearset, { food, medicine: null })
    expect(result).toBe(true)
  })
})

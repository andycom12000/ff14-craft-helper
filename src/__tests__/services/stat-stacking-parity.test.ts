// src/__tests__/services/stat-stacking-parity.test.ts
import { describe, it, expect } from 'vitest'
import { COMMON_FOODS, COMMON_MEDICINES, applyFoodBuff, applyMedicineBuff } from '@/engine/food-medicine'
import { applyCrafterSoulBonus } from '@/services/specialist-state'
import { gearsetToBuffedStats, recipeToCraftParams } from '@/services/stat-stacking'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

const recipe: Recipe = {
  id: 1, itemId: 100, name: 'Parity', icon: '', job: 'CRP',
  level: 90, stars: 0, canHq: true, materialQualityFactor: 75, amountResult: 1,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
    durability: 80, suggestedCraftsmanship: 0,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 80,
  },
}

describe('Cross-caller stacking parity (#34)', () => {
  // Exercise the three independent paths that all need to agree:
  //   A. gearsetToBuffedStats (canonical helper)
  //   B. recipeToCraftParams(recipe, gearset, buffs) (solver/batch path)
  //   C. The simulator-style sequence FoodMedicine.vue uses:
  //      applyCrafterSoulBonus → applyFoodBuff → applyMedicineBuff
  //
  // All three MUST produce identical { craftsmanship, control, cp }.

  it.each([
    { isSpecialist: false, craft: 4000, control: 3800, cp: 600 },
    { isSpecialist: true,  craft: 4000, control: 3800, cp: 600 },
    { isSpecialist: true,  craft: 4000, control: 100,  cp: 100 },   // food not capped
    { isSpecialist: true,  craft: 5000, control: 5000, cp: 700 },   // food capped
  ])('parity for gearset %j', (gs) => {
    const gearset: GearsetStats = {
      level: 100, craftsmanship: gs.craft, control: gs.control, cp: gs.cp,
      isSpecialist: gs.isSpecialist,
    }
    const food = COMMON_FOODS.find(f => f.id === 36060)!
    const medicine = COMMON_MEDICINES.find(m => m.id === 44168)!
    const buffs = { food, medicine }

    // A
    const a = gearsetToBuffedStats(gearset, buffs)

    // B
    const params = recipeToCraftParams(recipe, gearset, buffs)
    const b = { craftsmanship: params.craftsmanship, control: params.control, cp: params.cp }

    // C — what FoodMedicine.vue + useSimulator does (inline)
    const withSoul = applyCrafterSoulBonus(gearset)
    const afterFood = applyFoodBuff(
      { craftsmanship: withSoul.craftsmanship, control: withSoul.control, cp: withSoul.cp },
      food,
    )
    const c = applyMedicineBuff(afterFood, medicine)

    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })
})

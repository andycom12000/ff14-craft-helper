// src/__tests__/services/stat-stacking-parity.test.ts
import { describe, it, expect } from 'vitest'
import { COMMON_FOODS, COMMON_MEDICINES, applyFoodBuff, applyMedicineBuff } from '@/engine/food-medicine'
import { applyCrafterSoulBonus } from '@/services/specialist-state'
import { gearsetToBuffedStats, recipeToCraftParams } from '@/services/stat-stacking'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { FoodBuff } from '@/engine/food-medicine'

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

describe('materia delta is applied at raw gear (ADR-0001)', () => {
  it('ordering matters when materia causes food percent to cross the cap boundary', () => {
    // Use food 36060 (高山茶 HQ): control { percent: 5, max: 76 }.
    //
    // Cap fires when floor(base * 5 / 100) >= 76, i.e. base >= 1520.
    // Without materia: base=1460 → floor(1460*0.05)=73  (< 76, percent wins, +73)
    // With materia 60: base=1520 → floor(1520*0.05)=76  (== 76, cap kicks in, +76)
    //
    // Correct path (materia at raw gear, ADR-0001):
    //   gearsetToBuffedStats({control: 1460+60=1520}, buffs) → 1520 + 76 = 1596
    //
    // Wrong path (materia added after full stacking — the forbidden anti-pattern):
    //   gearsetToBuffedStats({control: 1460}, buffs) → 1460 + 73 = 1533, then +60 = 1593
    //
    // 1596 ≠ 1593 — order provably matters.

    const food = COMMON_FOODS.find((f): f is FoodBuff & { control: NonNullable<FoodBuff['control']> } =>
      f.id === 36060 && f.control !== undefined,
    )!
    expect(food).toBeDefined()

    const { percent, max } = food.control
    // Verify our math: base=1460 is below cap, base+60=1520 is at the cap.
    const BASE_CONTROL = 1460
    const MATERIA_DELTA = 60
    expect(Math.floor(BASE_CONTROL * percent / 100)).toBeLessThan(max)
    expect(Math.floor((BASE_CONTROL + MATERIA_DELTA) * percent / 100)).toBeGreaterThanOrEqual(max)

    const gearset: GearsetStats = {
      level: 100, craftsmanship: 1000, control: BASE_CONTROL, cp: 600, isSpecialist: false,
    }
    const buffs = { food, medicine: null }

    // Correct: materia baked into raw gear before gearsetToBuffedStats (ADR-0001 compliant).
    const correct = gearsetToBuffedStats(
      { ...gearset, control: gearset.control + MATERIA_DELTA },
      buffs,
    )

    // Wrong: apply full stacking first, then tack materia on at the end.
    const stacked = gearsetToBuffedStats(gearset, buffs)
    const wrong = { ...stacked, control: stacked.control + MATERIA_DELTA }

    // The two paths MUST disagree on control — that is what proves the order matters.
    expect(correct.control).toBe(BASE_CONTROL + MATERIA_DELTA + max)  // 1520 + 76 = 1596
    expect(wrong.control).toBe(BASE_CONTROL + Math.floor(BASE_CONTROL * percent / 100) + MATERIA_DELTA)  // 1460 + 73 + 60 = 1593
    expect(correct.control).not.toBe(wrong.control)
  })
})

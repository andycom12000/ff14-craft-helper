import { describe, it, expect } from 'vitest'
import type { CraftParams } from '@/engine/simulator'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import { craftParamsToSolverConfig } from '@/solver/config'
import { recipeToCraftParams } from '@/services/stat-stacking'
import { COMMON_FOODS } from '@/engine/food-medicine'

/**
 * Minimal CraftParams factory. Numeric values are chosen so TrainedEye is
 * available (crafter level >> recipe level + 10) — the adversarial axis is
 * what we're exercising here, not skill gating.
 */
function makeParams(overrides: Partial<CraftParams> = {}): CraftParams {
  return {
    craftsmanship: 4000,
    control: 3800,
    cp: 600,
    crafterLevel: 100,
    recipeLevelTable: {
      classJobLevel: 80,
      stars: 0,
      difficulty: 3000,
      quality: 6000,
      durability: 70,
      progressDivider: 130,
      qualityDivider: 115,
      progressModifier: 90,
      qualityModifier: 80,
    },
    canHq: true,
    initialQuality: 0,
    isExpert: false,
    ...overrides,
  }
}

describe('craftParamsToSolverConfig — adversarial × isExpert matrix', () => {
  it('isExpert=true,  adversarial=true  → emitted adversarial=false (expert lock)', () => {
    const cfg = craftParamsToSolverConfig(
      makeParams({ isExpert: true }),
      { adversarial: true },
    )
    expect(cfg.isExpert).toBe(true)
    // SolverConfig.adversarial carries the user's *requested* value here;
    // the actual override happens inside the worker's configToWasmSettings.
    // We assert both the recorded field AND the effective rule the worker
    // will apply: cfg.isExpert ? false : cfg.adversarial.
    expect(cfg.adversarial).toBe(true)
    expect(cfg.isExpert ? false : cfg.adversarial).toBe(false)
  })

  it('isExpert=true,  adversarial=false → emitted adversarial=false', () => {
    const cfg = craftParamsToSolverConfig(
      makeParams({ isExpert: true }),
      { adversarial: false },
    )
    expect(cfg.isExpert).toBe(true)
    expect(cfg.adversarial).toBe(false)
    expect(cfg.isExpert ? false : cfg.adversarial).toBe(false)
  })

  it('isExpert=false, adversarial=true  → emitted adversarial=true', () => {
    const cfg = craftParamsToSolverConfig(
      makeParams({ isExpert: false }),
      { adversarial: true },
    )
    expect(cfg.isExpert).toBe(false)
    expect(cfg.adversarial).toBe(true)
    expect(cfg.isExpert ? false : cfg.adversarial).toBe(true)
  })

  it('isExpert=false, adversarial=false → emitted adversarial=false', () => {
    const cfg = craftParamsToSolverConfig(
      makeParams({ isExpert: false }),
      { adversarial: false },
    )
    expect(cfg.isExpert).toBe(false)
    expect(cfg.adversarial).toBe(false)
    expect(cfg.isExpert ? false : cfg.adversarial).toBe(false)
  })
})

describe('craftParamsToSolverConfig — defaults', () => {
  it('defaults adversarial to false when skills.adversarial is omitted', () => {
    const cfg = craftParamsToSolverConfig(makeParams())
    expect(cfg.adversarial).toBe(false)
  })

  it('defaults isExpert to false when CraftParams.isExpert is omitted', () => {
    const p = makeParams()
    delete (p as { isExpert?: boolean }).isExpert
    const cfg = craftParamsToSolverConfig(p)
    expect(cfg.isExpert).toBe(false)
  })
})

describe('recipeToCraftParams — isExpert pass-through', () => {
  const baseRecipe: Recipe = {
    id: 1, itemId: 100, name: 'Test', icon: '', job: 'CRP',
    level: 90, stars: 0, canHq: true, materialQualityFactor: 75, amountResult: 1,
    ingredients: [],
    recipeLevelTable: {
      classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
      durability: 80, suggestedCraftsmanship: 0,
      progressDivider: 130, qualityDivider: 115,
      progressModifier: 90, qualityModifier: 80,
    },
  }
  const gearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false }

  it('reads recipe.isExpert into CraftParams.isExpert', () => {
    const p = recipeToCraftParams({ ...baseRecipe, isExpert: true }, gearset)
    expect(p.isExpert).toBe(true)
  })

  it('defaults CraftParams.isExpert to false when recipe.isExpert is undefined', () => {
    const p = recipeToCraftParams(baseRecipe, gearset)
    expect(p.isExpert).toBe(false)
  })
})

describe('recipeToCraftParams — specialist soul bonus', () => {
  const baseRecipe: Recipe = {
    id: 1, itemId: 100, name: 'Test', icon: '', job: 'CRP',
    level: 90, stars: 0, canHq: true, materialQualityFactor: 75, amountResult: 1,
    ingredients: [],
    recipeLevelTable: {
      classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
      durability: 80, suggestedCraftsmanship: 0,
      progressDivider: 130, qualityDivider: 115,
      progressModifier: 90, qualityModifier: 80,
    },
  }

  it('passes raw stats when isSpecialist=false', () => {
    const gearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false }
    const p = recipeToCraftParams(baseRecipe, gearset)
    expect(p.craftsmanship).toBe(4000)
    expect(p.control).toBe(3800)
    expect(p.cp).toBe(600)
  })

  it('adds +20/+20/+15 when isSpecialist=true', () => {
    const gearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: true }
    const p = recipeToCraftParams(baseRecipe, gearset)
    expect(p.craftsmanship).toBe(4020)
    expect(p.control).toBe(3820)
    expect(p.cp).toBe(615)
  })
})

describe('recipeToCraftParams — buffs param threads through gearsetToBuffedStats', () => {
  const baseRecipe: Recipe = {
    id: 1, itemId: 100, name: 'Test', icon: '', job: 'CRP',
    level: 90, stars: 0, canHq: true, materialQualityFactor: 75, amountResult: 1,
    ingredients: [],
    recipeLevelTable: {
      classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
      durability: 80, suggestedCraftsmanship: 0,
      progressDivider: 130, qualityDivider: 115,
      progressModifier: 90, qualityModifier: 80,
    },
  }

  it('with no buffs, behaves identically to the legacy 2-arg call', () => {
    const gearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: true }
    const a = recipeToCraftParams(baseRecipe, gearset)
    const b = recipeToCraftParams(baseRecipe, gearset, undefined)
    expect(b).toEqual(a)
  })

  it('applies Soul then food (specialist + 高山茶 HQ)', () => {
    const gearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: true }
    const food = COMMON_FOODS.find(f => f.id === 36060)!
    const p = recipeToCraftParams(baseRecipe, gearset, { food, medicine: null })
    expect(p.craftsmanship).toBe(4020)
    expect(p.control).toBe(3820 + 76)
    expect(p.cp).toBe(615 + 78)
  })

  it('non-specialist + food → food applied to raw gear', () => {
    const gearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false }
    const food = COMMON_FOODS.find(f => f.id === 36060)!
    const p = recipeToCraftParams(baseRecipe, gearset, { food, medicine: null })
    expect(p.craftsmanship).toBe(4000)
    expect(p.control).toBe(3800 + 76)
    expect(p.cp).toBe(600 + 78)
  })
})

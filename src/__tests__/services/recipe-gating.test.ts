import { describe, it, expect } from 'vitest'
import type { Recipe } from '@/stores/recipe'
import {
  recipeHardGateReasons,
  isRecipeHardGated,
  checkLevelGate,
} from '@/services/recipe-gating'

const base: Recipe = {
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

describe('recipeHardGateReasons', () => {
  it('returns empty array for standard 0-star recipe', () => {
    expect(recipeHardGateReasons(base)).toEqual([])
    expect(isRecipeHardGated(base)).toBe(false)
  })

  it('flags stars > 0', () => {
    const r = { ...base, stars: 1 }
    expect(recipeHardGateReasons(r)).toContain('stars')
    expect(isRecipeHardGated(r)).toBe(true)
  })

  it('flags isExpert', () => {
    const r = { ...base, isExpert: true }
    expect(recipeHardGateReasons(r)).toContain('expert')
  })

  it('flags requiredCraftsmanship > 0', () => {
    const r = { ...base, requiredCraftsmanship: 3500 }
    expect(recipeHardGateReasons(r)).toContain('requiredCraftsmanship')
  })

  it('flags requiredControl > 0', () => {
    const r = { ...base, requiredControl: 3000 }
    expect(recipeHardGateReasons(r)).toContain('requiredControl')
  })

  it('returns all triggered reasons together', () => {
    const r = { ...base, stars: 2, isExpert: true, requiredCraftsmanship: 1 }
    expect(recipeHardGateReasons(r).sort()).toEqual(
      ['expert', 'requiredCraftsmanship', 'stars'].sort(),
    )
  })
})

describe('checkLevelGate', () => {
  it('returns ok when crafter level meets recipe level', () => {
    expect(checkLevelGate(base, 90).kind).toBe('ok')
    expect(checkLevelGate(base, 100).kind).toBe('ok')
  })

  it('returns soft for 0-star recipe below level — carries the modifiers', () => {
    const v = checkLevelGate(base, 89)
    expect(v.kind).toBe('soft')
    if (v.kind !== 'soft') throw new Error('unreachable')
    expect(v.crafterLevel).toBe(89)
    expect(v.recipeLevel).toBe(90)
    expect(v.progressModifier).toBe(90)
    expect(v.qualityModifier).toBe(80)
  })

  it('returns hard for starred recipe below level — carries the reasons', () => {
    const v = checkLevelGate({ ...base, stars: 1 }, 89)
    expect(v.kind).toBe('hard')
    if (v.kind !== 'hard') throw new Error('unreachable')
    expect(v.reasons).toContain('stars')
  })

  it('returns hard for expert recipe below level', () => {
    const v = checkLevelGate({ ...base, isExpert: true }, 89)
    expect(v.kind).toBe('hard')
  })

  it('returns hard for stat-gated recipe below level', () => {
    const v = checkLevelGate({ ...base, requiredCraftsmanship: 4000 }, 89)
    expect(v.kind).toBe('hard')
  })

  it('檻框隔離牆 case: 0-star Lv 100 recipe at gearset Lv 99 → soft', () => {
    // Mirrors the real recipe id 6254 (rlv 690, classJobLevel 100, 0 stars,
    // no stat gates, not expert) — the bug that motivated this fix.
    const rail: Recipe = {
      ...base,
      id: 6254, level: 100,
      recipeLevelTable: {
        ...base.recipeLevelTable,
        classJobLevel: 100, progressModifier: 90, qualityModifier: 75,
      },
    }
    const v = checkLevelGate(rail, 99)
    expect(v.kind).toBe('soft')
  })
})

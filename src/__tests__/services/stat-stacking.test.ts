import { describe, it, expect } from 'vitest'
import { gearsetToBuffedStats, recipeToCraftParams } from '@/services/stat-stacking'
import { COMMON_FOODS, COMMON_MEDICINES } from '@/engine/food-medicine'
import { SPECIALIST_BONUS } from '@/services/specialist-state'
import type { GearsetStats } from '@/stores/gearsets'
import type { Recipe } from '@/stores/recipe'

const gearset = (over: Partial<GearsetStats> = {}): GearsetStats => ({
  level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false,
  ...over,
})

describe('gearsetToBuffedStats — canonical order', () => {
  it('returns raw stats when non-specialist and no buffs', () => {
    expect(gearsetToBuffedStats(gearset(), undefined))
      .toEqual({ craftsmanship: 4000, control: 3800, cp: 600 })
  })

  it('adds Soul of the Crafter when isSpecialist=true (no buffs)', () => {
    expect(gearsetToBuffedStats(gearset({ isSpecialist: true }), undefined))
      .toEqual({
        craftsmanship: 4000 + SPECIALIST_BONUS.craftsmanship,
        control: 3800 + SPECIALIST_BONUS.control,
        cp: 600 + SPECIALIST_BONUS.cp,
      })
  })

  it('applies food % AFTER Soul (not commutative)', () => {
    // 高山茶 HQ: control +5% cap 76, cp +26% cap 78
    const food = COMMON_FOODS.find(f => f.id === 36060)!
    const buffed = gearsetToBuffedStats(
      gearset({ isSpecialist: true }),
      { food, medicine: null },
    )
    // post-Soul control = 3820; 5% of 3820 = 191 → capped at 76 → 3896
    expect(buffed.control).toBe(3820 + 76)
    // post-Soul cp = 615; 26% of 615 = 159 → capped at 78 → 693
    expect(buffed.cp).toBe(615 + 78)
    // craftsmanship: post-Soul 4020, food gives no craft bonus → 4020
    expect(buffed.craftsmanship).toBe(4020)
  })

  it('Soul→Food differs from Food→Soul on capped axes', () => {
    const food = COMMON_FOODS.find(f => f.id === 36060)!
    const tinyGearset = gearset({ isSpecialist: true, control: 100, cp: 100 })
    const canonical = gearsetToBuffedStats(tinyGearset, { food, medicine: null })
    // canonical: control 100+20=120; 5% of 120 = 6 (not capped) → 126
    // canonical: cp 100+15=115; 26% of 115 = 29 → 144
    expect(canonical.control).toBe(126)
    expect(canonical.cp).toBe(144)
  })

  it('applies medicine on top of food result', () => {
    // 巨匠藥液 HQ: control +3% cap 63
    const food = COMMON_FOODS.find(f => f.id === 36060)!     // control +5% cap 76
    const medicine = COMMON_MEDICINES.find(m => m.id === 44168)!
    const buffed = gearsetToBuffedStats(
      gearset({ isSpecialist: false }),
      { food, medicine },
    )
    // control: 3800 (no Soul) → +5% cap 76 → 3876 → +3% of 3876 = 116 → cap 63 → 3939
    expect(buffed.control).toBe(3939)
  })
})

const sampleRecipe = {
  id: 1, name: 'x', job: 'CRP', canHq: true, isExpert: false,
  recipeLevelTable: {
    classJobLevel: 100, progressDivider: 1, qualityDivider: 1,
    progressModifier: 100, qualityModifier: 100,
    progress: 1000, quality: 5000, durability: 80,
  },
} as unknown as Recipe

const sampleGearset = {
  level: 100, craftsmanship: 4000, control: 4000, cp: 600, isSpecialist: false,
}

describe('recipeToCraftParams initialQuality override', () => {
  it('defaults initialQuality to 0', () => {
    const params = recipeToCraftParams(sampleRecipe, sampleGearset)
    expect(params.initialQuality).toBe(0)
  })

  it('honours an explicit initialQuality override', () => {
    const params = recipeToCraftParams(sampleRecipe, sampleGearset, undefined, 1200)
    expect(params.initialQuality).toBe(1200)
  })
})

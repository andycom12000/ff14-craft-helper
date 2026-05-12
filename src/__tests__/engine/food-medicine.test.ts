import { describe, it, expect } from 'vitest'
import { applyBuffsToStats, COMMON_FOODS, COMMON_MEDICINES } from '@/engine/food-medicine'

describe('applyBuffsToStats', () => {
  const base = { craftsmanship: 4000, control: 3800, cp: 600 }

  it('returns base when no buffs', () => {
    expect(applyBuffsToStats(base, undefined)).toEqual(base)
    expect(applyBuffsToStats(base, { food: null, medicine: null })).toEqual(base)
  })

  it('applies food then medicine, additive on stats', () => {
    const food = COMMON_FOODS[0]
    const medicine = COMMON_MEDICINES[0]
    const result = applyBuffsToStats(base, { food, medicine })
    expect(result.craftsmanship).toBeGreaterThanOrEqual(base.craftsmanship)
    expect(result.cp).toBeGreaterThanOrEqual(base.cp)
  })
})

import { describe, it, expect } from 'vitest'
import type { MeldAdvice, MeldPlan, MeldStep } from '@/services/meld-advisor'
import { adviseMeld, findBindingRecipe, solveProgressBreakpoint } from '@/services/meld-advisor'
import type { Recipe } from '@/stores/recipe'
import { BIS_REFERENCE } from '@/engine/materia'

const makeRecipe = (id: number, progress: number, quality: number): Recipe => ({
  id, name: `r${id}`, job: 'CRP', canHq: true, isExpert: false,
  recipeLevelTable: {
    classJobLevel: 100, progressDivider: 1, qualityDivider: 1,
    progressModifier: 100, qualityModifier: 100,
    progress, quality, durability: 80,
  },
} as unknown as Recipe)

describe('adviseMeld (stub)', () => {
  it('returns a MeldAdvice with both plans present', async () => {
    const advice: MeldAdvice = await adviseMeld(
      [],                       // empty targets — exercises the empty path
      { level: 100, craftsmanship: 4000, control: 4000, cp: 600, isSpecialist: false },
      new Map(),
      { bisReference: BIS_REFERENCE },
    )
    expect(advice.costOptimal).toBeDefined()
    expect(advice.bis).toBeDefined()
    expect(typeof advice.alreadyMeetsThreshold).toBe('boolean')
  })
})

// Trivial type-level checks (compile-time only; no runtime asserts needed).
const _stepShape: MeldStep = {
  stat: 'craftsmanship', grade: 12, placedCount: 1, expectedCount: 1,
  unitPrice: null, subtotal: null,
}
const _planShape: MeldPlan = {
  feasible: true, deltaStats: { craftsmanship: 0, control: 0, cp: 0 },
  steps: [_stepShape], totalGil: null, confirmedBySolver: false,
}
void _stepShape; void _planShape

describe('findBindingRecipe', () => {
  it('returns null for an empty list', () => {
    expect(findBindingRecipe([])).toBeNull()
  })

  it('picks the recipe with the highest progress requirement', () => {
    const a = makeRecipe(1, 1000, 5000)
    const b = makeRecipe(2, 2000, 4000)
    expect(findBindingRecipe([a, b])).toBe(b)
  })

  it('breaks ties by highest quality', () => {
    const a = makeRecipe(1, 1000, 4000)
    const b = makeRecipe(2, 1000, 5000)
    expect(findBindingRecipe([a, b])).toBe(b)
  })
})

describe('solveProgressBreakpoint', () => {
  const baseGearset = {
    level: 100, craftsmanship: 100, control: 4000, cp: 600, isSpecialist: false,
  }

  it('returns 0 when the gearset already exceeds the breakpoint', () => {
    const easy = makeRecipe(1, 100, 1000)
    const strong = { ...baseGearset, craftsmanship: 5000 }
    expect(solveProgressBreakpoint(easy, strong)).toBe(0)
  })

  it('returns a positive delta when craftsmanship is short', () => {
    const hard = makeRecipe(1, 50000, 5000)
    const delta = solveProgressBreakpoint(hard, baseGearset)
    expect(delta).toBeGreaterThan(0)
  })

  it('delta is monotonically non-increasing as base craftsmanship rises', () => {
    const hard = makeRecipe(1, 50000, 5000)
    const lo = solveProgressBreakpoint(hard, { ...baseGearset, craftsmanship: 100 })
    const hi = solveProgressBreakpoint(hard, { ...baseGearset, craftsmanship: 2000 })
    expect(hi).toBeLessThanOrEqual(lo)
  })
})

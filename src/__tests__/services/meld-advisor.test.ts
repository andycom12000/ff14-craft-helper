import { describe, it, expect, vi } from 'vitest'
import type { MeldAdvice, MeldPlan, MeldStep } from '@/services/meld-advisor'
import { adviseMeld, findBindingRecipe, solveProgressBreakpoint, solveQualityBreakpoint, confirmBreakpointWithSolver, translateDeltaToMeldPlan } from '@/services/meld-advisor'
import type { Recipe } from '@/stores/recipe'
import { BIS_REFERENCE, MATERIA_GRADES } from '@/engine/materia'

const makeRecipe = (id: number, progress: number, quality: number): Recipe => ({
  id, name: `r${id}`, job: 'CRP', canHq: true, isExpert: false,
  recipeLevelTable: {
    classJobLevel: 100, progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 15,
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

describe('solveQualityBreakpoint', () => {
  const gearset = {
    level: 100, craftsmanship: 5000, control: 1000, cp: 300, isSpecialist: false,
  }

  it('returns zeros when gearset already reaches quality', () => {
    const easy = makeRecipe(1, 100, 100)
    const strong = { ...gearset, control: 5000, cp: 600 }
    const delta = solveQualityBreakpoint(easy, strong, 0, 0)
    expect(delta.control).toBe(0)
    expect(delta.cp).toBe(0)
  })

  it('returns a positive control delta on a hard recipe', () => {
    const hard = makeRecipe(1, 1000, 8000)
    const delta = solveQualityBreakpoint(hard, gearset, 0, 0)
    expect(delta.control + delta.cp).toBeGreaterThan(0)
  })

  it('higher initialQuality (HQ ingredients) lowers the control delta', () => {
    const recipe = makeRecipe(1, 1000, 8000)
    const noHq = solveQualityBreakpoint(recipe, gearset, 0, 0)
    const someHq = solveQualityBreakpoint(recipe, gearset, 0, 2000)
    expect(someHq.control).toBeLessThanOrEqual(noHq.control)
  })
})

describe('translateDeltaToMeldPlan', () => {
  const priceMap = new Map<number, any>(
    MATERIA_GRADES.map(m => [
      m.itemId,
      { minPriceNQ: 1000 + m.value, minPriceHQ: 0, listings: [] },
    ]),
  )

  it('returns an empty feasible plan when delta is zero', () => {
    const plan = translateDeltaToMeldPlan(
      { craftsmanship: 0, control: 0, cp: 0 },
      priceMap,
    )
    expect(plan.feasible).toBe(true)
    expect(plan.steps).toHaveLength(0)
    expect(plan.totalGil).toBe(0)
  })

  it('fits a small delta into guaranteed slots (no failure multiplier)', () => {
    const plan = translateDeltaToMeldPlan(
      { craftsmanship: 60, control: 0, cp: 0 },
      priceMap,
    )
    expect(plan.feasible).toBe(true)
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].placedCount).toBe(plan.steps[0].expectedCount)
    expect(plan.steps[0].subtotal).toBeGreaterThan(0)
  })

  it('applies the fail ladder when overflow lands in overmeld slots', () => {
    const huge = { craftsmanship: 5000, control: 0, cp: 0 }
    const plan = translateDeltaToMeldPlan(huge, priceMap)
    const overmeldStep = plan.steps.find(s => s.expectedCount > s.placedCount)
    expect(overmeldStep).toBeDefined()
  })

  it('marks plan infeasible when delta exceeds total slots', () => {
    const beyond = { craftsmanship: 50_000, control: 50_000, cp: 50_000 }
    const plan = translateDeltaToMeldPlan(beyond, priceMap)
    expect(plan.feasible).toBe(false)
    expect(plan.reason).toMatch(/槽位/)
  })

  it('reports null subtotal when a step has no price data', () => {
    const empty = new Map()
    const plan = translateDeltaToMeldPlan(
      { craftsmanship: 60, control: 0, cp: 0 },
      empty,
    )
    expect(plan.steps[0].subtotal).toBeNull()
    expect(plan.totalGil).toBeNull()
  })
})

describe('confirmBreakpointWithSolver', () => {
  it('returns confirmed=true on first solver pass', async () => {
    const recipe = makeRecipe(1, 1000, 5000)
    const gs = { level: 100, craftsmanship: 5000, control: 5000, cp: 600, isSpecialist: false }

    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn().mockResolvedValue({
      progress: 1000, max_progress: 1000, quality: 5000, max_quality: 5000,
    })

    const out = await confirmBreakpointWithSolver(
      recipe, gs,
      { craftsmanship: 0, control: 0, cp: 0 },
      0,
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(out.confirmedBySolver).toBe(true)
    expect(fakeSolve).toHaveBeenCalledTimes(1)
  })

  it('bumps stats and retries when first attempt falls short', async () => {
    const recipe = makeRecipe(1, 1000, 5000)
    const gs = { level: 100, craftsmanship: 1000, control: 1000, cp: 600, isSpecialist: false }

    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn()
      .mockResolvedValueOnce({ progress: 500, max_progress: 1000, quality: 4000, max_quality: 5000 })
      .mockResolvedValueOnce({ progress: 1000, max_progress: 1000, quality: 5000, max_quality: 5000 })

    const out = await confirmBreakpointWithSolver(
      recipe, gs,
      { craftsmanship: 100, control: 100, cp: 0 },
      0,
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(out.confirmedBySolver).toBe(true)
    expect(fakeSolve).toHaveBeenCalledTimes(2)
    expect(out.deltaStats.craftsmanship).toBeGreaterThan(100)
  })

  it('returns confirmed=false after bounded retries fail', async () => {
    const recipe = makeRecipe(1, 1000, 5000)
    const gs = { level: 100, craftsmanship: 1000, control: 1000, cp: 600, isSpecialist: false }

    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn().mockResolvedValue({
      progress: 500, max_progress: 1000, quality: 4000, max_quality: 5000,
    })

    const out = await confirmBreakpointWithSolver(
      recipe, gs,
      { craftsmanship: 100, control: 100, cp: 0 },
      0,
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(out.confirmedBySolver).toBe(false)
    expect(fakeSolve.mock.calls.length).toBeLessThanOrEqual(3)
  })
})

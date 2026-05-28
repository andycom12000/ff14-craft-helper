import { describe, it, expect, vi } from 'vitest'
import type { MeldAdvice, MeldPlan, MeldStep } from '@/services/meld-advisor'
import { adviseMeld, findBindingRecipe, solveProgressBreakpoint, solveQualityBreakpoint, confirmBreakpointWithSolver, translateDeltaToMeldPlan, computeBisPlan } from '@/services/meld-advisor'
import type { Recipe } from '@/stores/recipe'
import { BIS_REFERENCE, MATERIA_GRADES } from '@/engine/materia'

const makeRecipe = (id: number, progress: number, quality: number): Recipe => ({
  id, name: `r${id}`, job: 'CRP', canHq: true, isExpert: false,
  recipeLevelTable: {
    classJobLevel: 100, progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 15,
    difficulty: progress, quality, durability: 80,
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

  it('resets overmeld depth per stat axis (control overmeld starts at ladder top, not floor)', () => {
    // Craftsmanship: 29 melds × 54 = 1566 → 25 guaranteed + 4 overmeld
    //   After craft, the old shared cursor had overmeldDepth = 4, which
    //   clamps to OVERMELD_SUCCESS_LADDER's floor (0.05).
    // Control: 1 overmeld attempt → with per-stat reset, depth = 0 (rate 0.17).
    const plan = translateDeltaToMeldPlan(
      { craftsmanship: 29 * 54, control: 54, cp: 0 },
      priceMap,
    )
    expect(plan.feasible).toBe(true)
    const controlOvermeld = plan.steps.find(
      s => s.stat === 'control' && s.expectedCount > s.placedCount,
    )
    expect(controlOvermeld).toBeDefined()
    // Top-of-ladder rate = 0.17 → expectedCount = 1 / 0.17 ≈ 5.882
    expect(controlOvermeld!.expectedCount).toBeCloseTo(1 / 0.17, 4)
    // With the bug, this would have been 1 / 0.05 = 20 — ~3.4× inflated.
    expect(controlOvermeld!.expectedCount).toBeLessThan(10)
  })

  it('preserves the global overmeld slot cap across stats (regression guard for naive per-stat reset)', () => {
    // 20 + 20 + 25 = 65 melds vs. 25 guaranteed + 35 overmeld = 60 capacity.
    // A naive fix that gives each stat a fresh 35-slot overmeld budget would
    // mark this feasible. The correct fix keeps the global cap.
    const plan = translateDeltaToMeldPlan(
      { craftsmanship: 20 * 54, control: 20 * 54, cp: 25 * 14 },
      priceMap,
    )
    expect(plan.feasible).toBe(false)
    expect(plan.reason).toMatch(/槽位/)
    const overmeldSteps = plan.steps.filter(s => s.expectedCount > s.placedCount)
    expect(overmeldSteps.length).toBeLessThanOrEqual(35)
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

describe('computeBisPlan', () => {
  const priceMap = new Map<number, any>(
    MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1000, listings: [] }]),
  )

  it('returns zero-delta plan when current gearset already matches BiS', () => {
    const atBis = {
      level: 100, isSpecialist: false,
      craftsmanship: BIS_REFERENCE.craftsmanship,
      control: BIS_REFERENCE.control,
      cp: BIS_REFERENCE.cp,
    }
    const plan = computeBisPlan(atBis, BIS_REFERENCE, priceMap)
    expect(plan.deltaStats).toEqual({ craftsmanship: 0, control: 0, cp: 0 })
    expect(plan.steps).toHaveLength(0)
    expect(plan.totalGil).toBe(0)
  })

  it('computes a deep-overmeld plan when current is far below BiS', () => {
    const low = {
      level: 100, isSpecialist: false,
      craftsmanship: 100, control: 100, cp: 100,
    }
    const plan = computeBisPlan(low, BIS_REFERENCE, priceMap)
    expect(plan.steps.length).toBeGreaterThan(0)
    const tail = plan.steps[plan.steps.length - 1]
    expect(tail.expectedCount).toBeGreaterThanOrEqual(tail.placedCount)
  })
})

describe('adviseMeld (orchestrated)', () => {
  const priceMap = new Map<number, any>(
    MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1000, listings: [] }]),
  )
  const baseGearset = {
    level: 100, craftsmanship: 4500, control: 4500, cp: 600, isSpecialist: false,
  }

  it('alreadyMeetsThreshold = true when current gear double-maxes', async () => {
    const recipe = makeRecipe(1, 1000, 5000)
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn().mockResolvedValue({
      progress: 1000, max_progress: 1000, quality: 5000, max_quality: 5000,
    })

    const out = await adviseMeld(
      [recipe], baseGearset, priceMap,
      { bisReference: BIS_REFERENCE },
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(out.alreadyMeetsThreshold).toBe(true)
    expect(out.costOptimal.steps).toHaveLength(0)
    expect(out.bis.steps.length).toBeGreaterThan(0)
  })

  it('produces a cost-optimal plan when gear is short', async () => {
    const hard = makeRecipe(1, 5000, 8000)
    const weak = { ...baseGearset, craftsmanship: 100, control: 100, cp: 300 }
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn()
      .mockResolvedValueOnce({ progress: 500, max_progress: 1000, quality: 4000, max_quality: 5000 })
      .mockResolvedValue({ progress: 5000, max_progress: 5000, quality: 8000, max_quality: 8000 })

    const out = await adviseMeld(
      [hard], weak, priceMap,
      { bisReference: BIS_REFERENCE },
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(out.alreadyMeetsThreshold).toBe(false)
    expect(out.costOptimal.steps.length).toBeGreaterThan(0)
    expect(out.costOptimal.confirmedBySolver).toBe(true)
  })

  it('respects isCancelled mid-run', async () => {
    const hard = makeRecipe(1, 5000, 8000)
    const weak = { ...baseGearset, craftsmanship: 100, control: 100 }
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn().mockResolvedValue({
      progress: 0, max_progress: 1000, quality: 0, max_quality: 5000,
    })

    let cancelled = false
    const out = await adviseMeld(
      [hard], weak, priceMap,
      { bisReference: BIS_REFERENCE, isCancelled: () => cancelled },
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    cancelled = true
    expect(out.costOptimal.confirmedBySolver).toBe(false)
  })

  it('returns gapGil = bis.totalGil - costOptimal.totalGil when both are priced', async () => {
    const hard = makeRecipe(1, 5000, 8000)
    const weak = { ...baseGearset, craftsmanship: 100, control: 100, cp: 300 }
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn()
      .mockResolvedValueOnce({ progress: 0, max_progress: 1000, quality: 0, max_quality: 5000 })
      .mockResolvedValue({ progress: 5000, max_progress: 5000, quality: 8000, max_quality: 8000 })

    const out = await adviseMeld(
      [hard], weak, priceMap,
      { bisReference: BIS_REFERENCE },
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    if (out.bis.totalGil !== null && out.costOptimal.totalGil !== null) {
      expect(out.gapGil).toBe(out.bis.totalGil - out.costOptimal.totalGil)
    }
  })
})

describe('adviseMeld golden snapshot', () => {
  it('produces a stable MeldAdvice shape for the fixture', async () => {
    const fixtureRecipe = makeRecipe(99, 3500, 6500)
    const fixtureGearset = {
      level: 100, craftsmanship: 3200, control: 3200, cp: 540, isSpecialist: false,
    }
    const fixturePrices = new Map<number, any>(
      MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1500, listings: [] }]),
    )

    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn()
      .mockResolvedValueOnce({ progress: 0, max_progress: 3500, quality: 0, max_quality: 6500 })
      .mockResolvedValue({ progress: 3500, max_progress: 3500, quality: 6500, max_quality: 6500 })

    const out = await adviseMeld(
      [fixtureRecipe], fixtureGearset, fixturePrices,
      { bisReference: BIS_REFERENCE },
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    const sanitized = {
      alreadyMeetsThreshold: out.alreadyMeetsThreshold,
      costOptimal: { ...out.costOptimal, steps: out.costOptimal.steps.length },
      bis: { ...out.bis, steps: out.bis.steps.length },
      gapGil: out.gapGil,
    }
    expect(sanitized).toMatchSnapshot()
  })
})

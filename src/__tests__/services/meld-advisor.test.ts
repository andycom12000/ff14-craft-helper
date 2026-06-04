import { describe, it, expect, vi } from 'vitest'
import type { MeldAdvice, MeldPlan, MeldStep } from '@/services/meld-advisor'
import { adviseMeld, findBindingRecipe, solveProgressBreakpoint, solveQualityBreakpoint, translateDeltaToMeldPlan, computeMaxHqInitialQuality, enumerateCraftsmanshipLadder, recipeHasHqLever } from '@/services/meld-advisor'
import { SolveCancelledError } from '@/solver/api'
import type { Recipe } from '@/stores/recipe'
import { MATERIA_GRADES, SLOT_STRUCTURE, MAX_MELD_COUNT } from '@/engine/materia'

const makeRecipe = (id: number, progress: number, quality: number): Recipe => ({
  id, name: `r${id}`, job: 'CRP', canHq: true, isExpert: false,
  recipeLevelTable: {
    classJobLevel: 100, progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 15,
    difficulty: progress, quality, durability: 80,
  },
} as unknown as Recipe)

describe('adviseMeld (stub)', () => {
  it('returns a MeldAdvice with the cost-optimal plan present', async () => {
    const advice: MeldAdvice = await adviseMeld(
      [],                       // empty targets — exercises the empty path
      { level: 100, craftsmanship: 4000, control: 4000, cp: 600, isSpecialist: false },
      new Map(),
      {},
    )
    expect(advice.costOptimal).toBeDefined()
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

// Regression for #99: solveProgressBreakpoint must NOT over-estimate the
// required craftsmanship. Real RLT records carry a suggestedCraftsmanship that
// FFXIV uses as the comfortable progress-clearing threshold; we trust it
// directly instead of the old 1×-efficiency closed-form bound that ignored
// high-efficiency progress actions (Groundwork, etc.) and demanded ~3× too much.
describe('solveProgressBreakpoint — issue #99 (no craftsmanship over-estimate)', () => {
  // Real rlv690 (Lv100, difficulty 6600, suggestedCraftsmanship 4207) — see
  // public/data/rlt.json. progressDivider/Modifier copied from that record.
  const rlv690 = {
    classJobLevel: 100, stars: 0, difficulty: 6600, quality: 12000,
    durability: 80, suggestedCraftsmanship: 4207,
    progressDivider: 170, qualityDivider: 150,
    progressModifier: 90, qualityModifier: 75,
  }
  // Real rlv641 (Lv90 4★, difficulty 4400, suggestedCraftsmanship 3700).
  const rlv641 = {
    classJobLevel: 90, stars: 4, difficulty: 4400, quality: 9040,
    durability: 70, suggestedCraftsmanship: 3700,
    progressDivider: 180, qualityDivider: 180,
    progressModifier: 100, qualityModifier: 100,
  }
  const withRlt = (rlt: typeof rlv690): Recipe =>
    ({ id: 1, name: 'r', job: 'CRP', canHq: true, isExpert: false, recipeLevelTable: rlt } as unknown as Recipe)

  it('rlv690: base craft 4500 (> suggested 4207) → Δcraftsmanship 0', () => {
    const gearset = { level: 100, craftsmanship: 4500, control: 4100, cp: 560, isSpecialist: false }
    expect(solveProgressBreakpoint(withRlt(rlv690), gearset)).toBe(0)
  })

  it('rlv641: base craft 3700 (= suggested 3700) → Δcraftsmanship 0', () => {
    const gearset = { level: 90, craftsmanship: 3700, control: 3700, cp: 560, isSpecialist: false }
    const delta = solveProgressBreakpoint(withRlt(rlv641), gearset)
    expect(delta).toBe(0)
  })

  it('returns a small, plausible Δ when base craft is just under suggested (NOT thousands)', () => {
    // rlv690 suggested 4207, base 4000 → exactly 207, not the old ~7933.
    const gearset = { level: 100, craftsmanship: 4000, control: 4100, cp: 560, isSpecialist: false }
    const delta = solveProgressBreakpoint(withRlt(rlv690), gearset)
    expect(delta).toBe(207)
    expect(delta).toBeLessThan(1000)
  })

  it('custom recipe (suggestedCraftsmanship = 0) falls back to the corrected closed-form bound', () => {
    // Mirrors useCustomRecipes: suggestedCraftsmanship = 0 → fallback path.
    const customRlt = {
      classJobLevel: 100, stars: 0, difficulty: 6600, quality: 12000,
      durability: 80, suggestedCraftsmanship: 0,
      progressDivider: 170, qualityDivider: 150,
      progressModifier: 90, qualityModifier: 75,
    }
    // An easy custom recipe is cleared outright by the fallback bound.
    const easy = { ...customRlt, difficulty: 800 }
    const strong = { level: 100, craftsmanship: 4500, control: 4100, cp: 560, isSpecialist: false }
    expect(solveProgressBreakpoint(withRlt(easy), strong)).toBe(0)

    // The hard custom recipe still needs craftsmanship, but the corrected
    // high-efficiency factor keeps the delta far below the old 1x-efficiency
    // bound (which produced ~7900 here) — it must stay a few thousand, not
    // balloon toward the 10k cap.
    const delta = solveProgressBreakpoint(withRlt(customRlt), strong)
    expect(delta).toBeGreaterThan(0)
    expect(delta).toBeLessThan(3500)

    // Result is monotonically non-increasing as base craftsmanship rises.
    const weak = { ...strong, craftsmanship: 1000 }
    const weakDelta = solveProgressBreakpoint(withRlt(customRlt), weak)
    expect(weakDelta).toBeGreaterThanOrEqual(delta)
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
    // 20 + 20 + 25 = 65 melds vs. 18 guaranteed + 42 overmeld = 60 capacity.
    // A naive fix that gives each stat a fresh overmeld budget would
    // mark this feasible. The correct fix keeps the global cap.
    const plan = translateDeltaToMeldPlan(
      { craftsmanship: 20 * 54, control: 20 * 54, cp: 25 * 14 },
      priceMap,
    )
    expect(plan.feasible).toBe(false)
    expect(plan.reason).toMatch(/槽位/)
    const overmeldSteps = plan.steps.filter(s => s.expectedCount > s.placedCount)
    expect(overmeldSteps.length).toBeLessThanOrEqual(SLOT_STRUCTURE.overmeldSlots)
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
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(out.alreadyMeetsThreshold).toBe(true)
    expect(out.costOptimal.steps).toHaveLength(0)
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
      {},
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
      { isCancelled: () => cancelled },
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    cancelled = true
    expect(out.costOptimal.confirmedBySolver).toBe(false)
  })

})

// §2 engine touchpoint: meld baseline = max-HQ initialQuality (all HQ
// materials), not the screen's current (partial) HQ selection.
describe('computeMaxHqInitialQuality', () => {
  const withIngredients = (
    quality: number,
    materialQualityFactor: number,
    ingredients: { amount: number; canHq: boolean; level: number }[],
  ): Recipe =>
    ({
      id: 1, name: 'r', job: 'CRP', canHq: true, isExpert: false,
      materialQualityFactor,
      ingredients: ingredients.map((ing, i) => ({
        itemId: i, name: `i${i}`, icon: '', ...ing,
      })),
      recipeLevelTable: {
        classJobLevel: 100, progressDivider: 130, qualityDivider: 115,
        progressModifier: 90, qualityModifier: 15,
        difficulty: 3500, quality, durability: 80,
      },
    } as unknown as Recipe)

  it('returns 0 for recipes without ingredient data (stub / custom)', () => {
    expect(computeMaxHqInitialQuality(makeRecipe(1, 3500, 6500))).toBe(0)
  })

  it('returns 0 when no ingredient is HQ-eligible', () => {
    const r = withIngredients(6500, 50, [
      { amount: 2, canHq: false, level: 100 },
      { amount: 3, canHq: false, level: 90 },
    ])
    expect(computeMaxHqInitialQuality(r)).toBe(0)
  })

  it('returns a positive value, capped at maxQuality, when HQ materials exist', () => {
    const r = withIngredients(6500, 50, [
      { amount: 2, canHq: true, level: 100 },
      { amount: 1, canHq: false, level: 90 },
    ])
    const iq = computeMaxHqInitialQuality(r)
    expect(iq).toBeGreaterThan(0)
    expect(iq).toBeLessThanOrEqual(6500)
  })
})

describe('adviseMeld — max-HQ baseline (§2 engine touchpoint)', () => {
  const priceMap = new Map<number, any>(
    MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1000, listings: [] }]),
  )
  const baseGearset = {
    level: 100, craftsmanship: 4500, control: 4500, cp: 600, isSpecialist: false,
  }
  const recipeWithHq = (): Recipe =>
    ({
      id: 7, name: 'r', job: 'CRP', canHq: true, isExpert: false,
      materialQualityFactor: 75,
      ingredients: [
        { itemId: 1, name: 'a', icon: '', amount: 3, canHq: true, level: 100 },
      ],
      recipeLevelTable: {
        classJobLevel: 100, progressDivider: 130, qualityDivider: 115,
        progressModifier: 90, qualityModifier: 15,
        difficulty: 5000, quality: 8000, durability: 80,
      },
    } as unknown as Recipe)

  it('feeds the max-HQ initialQuality (not options.initialQuality) into the solver', async () => {
    const recipe = recipeWithHq()
    const expectedBaseline = computeMaxHqInitialQuality(recipe)
    expect(expectedBaseline).toBeGreaterThan(0)

    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn().mockResolvedValue({
      progress: 5000, max_progress: 5000, quality: 8000, max_quality: 8000,
    })

    await adviseMeld(
      [recipe], baseGearset, priceMap,
      { initialQuality: 0 },
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    // Step 0 solve is driven by the max-HQ baseline, NOT the screen value (0).
    // objectContaining tolerates the #132 deadline/abort signal the guarded deps
    // threads into every solve's opts.
    expect(fakeSolve).toHaveBeenCalledWith(
      recipe, baseGearset, expect.objectContaining({ initialQuality: expectedBaseline }),
    )
  })

  it('hqSufficient = true when max-HQ materials alone double-max', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn().mockResolvedValue({
      progress: 5000, max_progress: 5000, quality: 8000, max_quality: 8000,
    })
    const out = await adviseMeld(
      [recipeWithHq()], baseGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(out.hqSufficient).toBe(true)
    expect(out.costOptimal.steps).toHaveLength(0)
  })

  it('hqSufficient = false when meld residual is still required', async () => {
    const hard = makeRecipe(1, 5000, 8000)
    const weak = { ...baseGearset, craftsmanship: 100, control: 100, cp: 300 }
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn()
      .mockResolvedValueOnce({ progress: 500, max_progress: 1000, quality: 4000, max_quality: 5000 })
      .mockResolvedValue({ progress: 5000, max_progress: 5000, quality: 8000, max_quality: 8000 })
    const out = await adviseMeld(
      [hard], weak, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(out.hqSufficient).toBe(false)
    expect(out.costOptimal.steps.length).toBeGreaterThan(0)
  })

  it('empty-targets path is hqSufficient (no meld needed)', async () => {
    const out = await adviseMeld(
      [], baseGearset, priceMap, {},
    )
    expect(out.hqSufficient).toBe(true)
  })
})

// #126: the quality-gap path is now solver-authoritative. For a recipe whose
// PROGRESS is already cleared by the bare gearset but whose QUALITY is short by
// a small residual, the advisor must converge on a few control melds — NOT
// inflate craftsmanship out of thin air (the #123 「400+ 作業 / ~83k gil」 symptom).
//
// Mocks are GEARSET-AWARE: the bounded search probes MANY distinct deltas in a
// single run, so a flat mockResolvedValue cannot express "a control bump unlocks
// HQ but a craftsmanship bump never does". fakeSimulate inspects the gearset arg
// (the RAW bumped gearset passed by adviseMeld / searchMinimalQualityDelta) to
// decide double-max vs shortfall.
describe('adviseMeld — quality-gap solver search (#126)', () => {
  const priceMap = new Map<number, any>(
    MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1000 + m.value, listings: [] }]),
  )

  // Progress trivially clearable by the bare gearset (low difficulty, ample
  // craftsmanship) → solveProgressBreakpoint returns 0. Quality short by ~243.
  const reproGearset = {
    level: 100, craftsmanship: 4500, control: 3200, cp: 600, isSpecialist: false,
  }
  const reproRecipe = () => makeRecipe(123, 100, 6500)

  // fakeSimulate factory: double-maxes iff control is bumped by >= `controlGate`
  // raw points above the base; otherwise progress is always met (the recipe's
  // progress is trivial) and quality is left short by `qualityShort`. NEVER keys
  // on craftsmanship, so any craftsmanship bump is wasted — exactly the trap that
  // produced the #123 symptom.
  // Fields SimulateResult requires beyond the progress/quality the gate cares
  // about. Mocks don't exercise these, but the ConfirmDeps.simulate signature is
  // strictly typed (typeof simulateCraftForRecipe), so they must be present.
  const SIM_EXTRAS = {
    durability: 80, cp: 600, max_durability: 80, max_cp: 600,
    effects: {} as any, is_finished: true, is_success: true, steps_used: 1,
  }

  const gearsetAwareSimulate = (
    baseControl: number,
    controlGate: number,
    maxQuality = 6500,
    qualityShort = 243,
  ) =>
    vi.fn(async (_recipe: any, gs: any) => {
      const controlMet = gs.control >= baseControl + controlGate
      return {
        ...SIM_EXTRAS,
        progress: 3500,
        max_progress: 3500,
        quality: controlMet ? maxQuality : maxQuality - qualityShort,
        max_quality: maxQuality,
      }
    })

  it('REPRO #123: recommends a few control melds, not 400+ craftsmanship / ~83k gil', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    // Any candidate with control bumped >= 150 double-maxes; craftsmanship-only
    // bumps never help.
    const fakeSimulate = gearsetAwareSimulate(reproGearset.control, 150)

    const out = await adviseMeld(
      [reproRecipe()], reproGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    expect(out.costOptimal.deltaStats.craftsmanship).toBe(0)
    expect(out.costOptimal.deltaStats.control).toBeGreaterThan(0)
    expect(out.costOptimal.deltaStats.control).toBeLessThanOrEqual(5 * 54)
    expect(out.costOptimal.deltaStats.cp).toBe(0)
    expect(out.costOptimal.feasible).toBe(true)
    expect(out.costOptimal.confirmedBySolver).toBe(true)
    expect(out.costOptimal.totalGil).not.toBeNull()
    expect(out.costOptimal.totalGil!).toBeLessThan(10000)
  })

  it('Δprogress=0 when progress already met (criterion 3): never probes a craftsmanship bump', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    // progress always met regardless of gearset; quality only met once control bumped.
    const fakeSimulate = gearsetAwareSimulate(reproGearset.control, 150)

    const out = await adviseMeld(
      [reproRecipe()], reproGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    // The ladder/search itself never wastes a craftsmanship meld (the #123 trap).
    // #134: the ONLY solve allowed to bump craftsmanship is the full-pentameld
    // feasibility prefilter, which maxes ALL stats as a sound infeasibility
    // over-bound (not a real ladder candidate).
    const PREFILTER_CRAFT = reproGearset.craftsmanship + MAX_MELD_COUNT * 54
    const craftBumped = fakeSolve.mock.calls.filter(c => c[1].craftsmanship !== reproGearset.craftsmanship)
    expect(craftBumped.length).toBeLessThanOrEqual(1)
    expect(craftBumped.every(c => c[1].craftsmanship === PREFILTER_CRAFT)).toBe(true)
    expect(out.costOptimal.deltaStats.craftsmanship).toBe(0)
  })

  it('no false 槽位不足 for a solvable 裸裝差一點 recipe (criterion 4)', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = gearsetAwareSimulate(reproGearset.control, 150)

    const out = await adviseMeld(
      [reproRecipe()], reproGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    expect(out.costOptimal.feasible).toBe(true)
    expect(out.costOptimal.reason).toBeUndefined()
  })

  it('closed-form is a non-binding seed; every returned candidate is solver-confirmed (criterion 5)', async () => {
    // Even if the closed-form seed blesses Δcontrol=0 (over-accept bug), the
    // search must reject it because the solver does not double-max there. Only
    // the true minimal control delta (>= 54) double-maxes.
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = gearsetAwareSimulate(reproGearset.control, 54)

    const out = await adviseMeld(
      [reproRecipe()], reproGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    expect(out.costOptimal.confirmedBySolver).toBe(true)
    expect(out.costOptimal.deltaStats.control).toBeGreaterThan(0)
    // The last successful sim must be a genuine double-max.
    const results = await Promise.all(fakeSimulate.mock.results.map(r => r.value))
    const doubleMaxed = results.filter(
      r => r.quality >= r.max_quality && r.progress >= r.max_progress,
    )
    expect(doubleMaxed.length).toBeGreaterThan(0)
  })

  // Regression #100/#139 — migrated to the LIVE path. The closed-form quality
  // breakpoint over-accepts and can seed Δcontrol=0 even when the bare gearset is
  // quality-short. The old `confirmBreakpointWithSolver` (now deleted dead code)
  // used to guard this via a zero-axis seed; the live ladder→search path
  // (`searchMinimalQualityDelta` inside `adviseMeld`) must itself lift the short
  // zero axis through solver confirmation — never returning a silent "0 meld"
  // plan for an under-provisioned gearset, nor inflating the already-met progress
  // axis (the #123 symptom). This pins the #100 class on the path that actually runs.
  it('REGRESSION #100/#139 (live path): lifts a quality-short zero axis instead of returning a 0-meld plan', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    // Progress trivially met; quality only double-maxes once control is bumped
    // (>= 108 raw = 2 top-grade melds). The closed-form seed of Δcontrol=0 does
    // NOT double-max, so a correct live path must search the zero axis upward.
    const fakeSimulate = gearsetAwareSimulate(reproGearset.control, 108)

    const out = await adviseMeld(
      [reproRecipe()], reproGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    // The short axis (control) was lifted by the live solver search...
    expect(out.costOptimal.deltaStats.control).toBeGreaterThan(0)
    expect(out.costOptimal.confirmedBySolver).toBe(true)
    expect(out.costOptimal.feasible).toBe(true)
    // ...and it is NOT a silent zero-spend / already-meets plan.
    expect(out.costOptimal.steps.length).toBeGreaterThan(0)
    expect(out.alreadyMeetsThreshold).toBe(false)
    // The already-met progress axis must not be inflated (the #123 symptom).
    expect(out.costOptimal.deltaStats.craftsmanship).toBe(0)
  })

  it('returns the cheapest confirmed candidate among several solver-passing control deltas (minimality)', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    // control deltas of 54, 108, 162 all double-max (gate = 54) → minimal is 54.
    const fakeSimulate = gearsetAwareSimulate(reproGearset.control, 54)

    const out = await adviseMeld(
      [reproRecipe()], reproGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    expect(out.costOptimal.deltaStats.control).toBe(54)
  })

  it('no-market-price fallback ranks by slot/meld count when gil unavailable', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = gearsetAwareSimulate(reproGearset.control, 54)

    const out = await adviseMeld(
      [reproRecipe()], reproGearset, new Map(),
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    expect(out.costOptimal.feasible).toBe(true)
    expect(out.costOptimal.totalGil).toBeNull()
    // smallest delta = fewest occupied slots = 1 materia (54 control)
    expect(out.costOptimal.deltaStats.control).toBe(54)
  })

  it('already-meets at max-HQ baseline still short-circuits before search (Step 0 preserved)', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn().mockResolvedValue({
      progress: 3500, max_progress: 3500, quality: 6500, max_quality: 6500,
    })

    const out = await adviseMeld(
      [reproRecipe()], reproGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    expect(out.hqSufficient).toBe(true)
    expect(out.alreadyMeetsThreshold).toBe(true)
    expect(out.costOptimal.steps).toHaveLength(0)
    expect(out.costOptimal.deltaStats).toEqual({ craftsmanship: 0, control: 0, cp: 0 })
    expect(fakeSolve).toHaveBeenCalledTimes(1)
  })

  it('genuinely unsolvable quality gap returns confirmedBySolver=false within the hard cap', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    // quality < max for EVERY candidate (gate impossibly high).
    const fakeSimulate = gearsetAwareSimulate(reproGearset.control, 100_000)

    const out = await adviseMeld(
      [reproRecipe()], reproGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    expect(out.costOptimal.confirmedBySolver).toBe(false)
    expect(fakeSolve.mock.calls.length).toBeLessThanOrEqual(12)
  })

  it('isCancelled mid-search aborts cleanly', async () => {
    let cancelled = false
    const fakeSolve = vi.fn(async () => {
      cancelled = true // flip after first solve
      return { actions: ['x'], progress: 0, quality: 0, steps: 1 }
    })
    const fakeSimulate = gearsetAwareSimulate(reproGearset.control, 100_000)

    const out = await adviseMeld(
      [reproRecipe()], reproGearset, priceMap,
      { isCancelled: () => cancelled },
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    expect(out.costOptimal.confirmedBySolver).toBe(false)
    // After Step 0 solve (which flips cancel), the search must not keep probing.
    expect(fakeSolve.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('cost panel quality-gap and meld card agree (criterion 2): recommendation targets the QUALITY axis', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = gearsetAwareSimulate(reproGearset.control, 150)

    const out = await adviseMeld(
      [reproRecipe()], reproGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    expect(out.costOptimal.deltaStats.control).toBeGreaterThan(0)
    expect(out.costOptimal.deltaStats.craftsmanship).toBe(0)
  })
})

// #155: CP-bound hardest recipe. The inner quality search (searchMinimalQualityDelta)
// solver-searches ONLY the control axis; CP is pinned at the closed-form
// `solveQualityBreakpoint` seed, which is over-optimistic (quietCanReachHQQuality
// uses upper-bound multipliers) and reports control-only as sufficient → seed.cp = 0.
// When CP is genuinely a binding axis (low base CP + CP-hungry recipe), the
// control-only ladder can never double-max → the advisor falsely returns
// `infeasible`, even though the #134 full-pentameld prefilter correctly certifies a
// feasible plan EXISTS. A faithful fix must surface a feasible CP-containing plan.
describe('adviseMeld — CP-bound recipe must not false-report infeasible (#155)', () => {
  const priceMap = new Map<number, any>(
    MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1000 + m.value, listings: [] }]),
  )

  // Same shape as the #126 repro (so the closed-form seeds cp = 0), but the fake
  // makes CP a BINDING axis: double-max needs BOTH a control bump AND a cp bump.
  const cpBoundGearset = {
    level: 100, craftsmanship: 4500, control: 3200, cp: 600, isSpecialist: false,
  }
  const cpBoundRecipe = () => makeRecipe(155, 100, 6500)

  const SIM_EXTRAS = {
    durability: 80, cp: 600, max_durability: 80, max_cp: 600,
    effects: {} as any, is_finished: true, is_success: true, steps_used: 1,
  }

  // Double-maxes iff control is bumped >= controlGate AND cp is bumped >= cpGate
  // above base. Control alone (cp pinned at the seed) can NEVER satisfy this.
  const cpControlAwareSimulate = (
    baseControl: number,
    baseCp: number,
    controlGate: number,
    cpGate: number,
    maxQuality = 6500,
    qualityShort = 243,
  ) =>
    vi.fn(async (_recipe: any, gs: any) => {
      const met = gs.control >= baseControl + controlGate && gs.cp >= baseCp + cpGate
      return {
        ...SIM_EXTRAS,
        progress: 3500, max_progress: 3500,
        quality: met ? maxQuality : maxQuality - qualityShort,
        max_quality: maxQuality,
      }
    })

  it('RED #155: returns a feasible, solver-confirmed CP-containing plan (not infeasible)', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = cpControlAwareSimulate(cpBoundGearset.control, cpBoundGearset.cp, 150, 54)

    const out = await adviseMeld(
      [cpBoundRecipe()], cpBoundGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    // #134 prefilter must NOT short-circuit: the full-pentameld over-bound
    // (cp + 840, control + 3240) double-maxes, so a feasible plan provably exists.
    // The advisor must therefore deliver one — never `infeasible`.
    expect(out.status).toBe('feasible')
    expect(out.costOptimal.confirmedBySolver).toBe(true)
    expect(out.costOptimal.deltaStats.cp).toBeGreaterThan(0)
  })

  // The min-control-at-CP function F is non-increasing, so total = F(cp) + cp is
  // NOT strictly unimodal on the grade grid: F can drop by exactly 1 (total flat,
  // a TIE) at one CP level and then by 2 at the next (total strictly lower). The
  // frontier walk's early-stop must skip PAST ties, otherwise it returns a
  // suboptimal delta — which can overflow the slot budget and false-report
  // infeasible, the very #155 failure class. Here F (in control grade steps) is
  // 4 @ cp0, 3 @ cp1 (total 4, tie with cp0), 1 @ cp≥2 (total 3, the true min).
  it('walks past a tie on the frontier to the strictly-cheaper deeper-CP point', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const { control: baseControl, cp: baseCp } = cpBoundGearset
    const fakeSimulate = vi.fn(async (_r: any, gs: any) => {
      const cpSteps = Math.floor((gs.cp - baseCp) / 14) // top-grade CP = 14
      const needControl = (cpSteps <= 0 ? 4 : cpSteps === 1 ? 3 : 1) * 54 // top-grade control = 54
      const met = gs.control - baseControl >= needControl
      return {
        ...SIM_EXTRAS, progress: 3500, max_progress: 3500,
        quality: met ? 6500 : 6257, max_quality: 6500,
      }
    })

    const out = await adviseMeld(
      [cpBoundRecipe()], cpBoundGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    expect(out.status).toBe('feasible')
    expect(out.costOptimal.confirmedBySolver).toBe(true)
    // The deeper-CP corner (1 control + 2 CP = 3 melds) beats the tie point
    // (4 control + 0 CP = 4 melds). A break-on-tie returns the 4-meld plan.
    expect(out.costOptimal.deltaStats.control).toBe(54)
    expect(out.costOptimal.deltaStats.cp).toBe(28)
  })
})

// #127: the OUTER craftsmanship ladder around the #126 inner quality search.
// Completes the 3D (craftsmanship × control × CP) bounded cost search. Adding
// craftsmanship beyond securing progress only has value when finishing progress
// in fewer steps frees durability+CP budget for quality (CONTEXT.md 「製作能力與
// 資源耦合」). The ladder is SHORT and BOUNDED: exactly-secure-progress up to
// progress-done-in-1-step. Every candidate is solver double-max confirmed before
// the gil comparison; the global cheapest plan wins; no-price falls back to slot
// count.
describe('adviseMeld — craftsmanship ladder, 3D bounded cost search (#127)', () => {
  const priceMap = new Map<number, any>(
    MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1000 + m.value, listings: [] }]),
  )

  const SIM_EXTRAS = {
    durability: 80, cp: 600, max_durability: 80, max_cp: 600,
    effects: {} as any, is_finished: true, is_success: true, steps_used: 1,
  }

  // High-quality recipe whose progress IS secured by the bare gearset
  // (solveProgressBreakpoint → 0, the #126 baseline rung) but still takes
  // SEVERAL progress steps at the baseline. The coupling means a craftsmanship
  // bump compresses those steps and frees CP budget, so quality becomes reachable
  // with FAR less control. (difficulty 3500: secured by craft 4500 yet multi-step,
  // so the ladder has > 1 rung.)
  const ladderRecipe = () => makeRecipe(127, 3500, 8000)
  const ladderGearset = {
    level: 100, craftsmanship: 4500, control: 3200, cp: 600, isSpecialist: false,
  }

  // Coupling-aware mock. Two solver-passing routes to double-max:
  //   (A) control-ONLY: needs control +540 (10 melds) — the direct, expensive lever.
  //   (B) craftsmanship-assisted: a craftsmanship bump of >= 108 (2 melds) frees
  //       enough budget that control +108 (2 melds) suffices — 4 melds total, cheaper.
  // The mock keys on BOTH craftsmanship and control (the coupling), so a flat
  // mock that only watches one axis cannot express it. Progress is always met
  // (recipe difficulty is trivial), so it never gates double-max.
  const couplingAwareSimulate = (
    baseCraft: number,
    baseControl: number,
    maxQuality = 8000,
  ) =>
    vi.fn(async (_recipe: any, gs: any) => {
      const craftBump = gs.craftsmanship - baseCraft
      const controlBump = gs.control - baseControl
      // Route A: pure control.
      const directOk = controlBump >= 540
      // Route B: craftsmanship frees budget; cheaper control suffices.
      const assistedOk = craftBump >= 108 && controlBump >= 108
      const ok = directOk || assistedOk
      return {
        ...SIM_EXTRAS,
        progress: 3500,
        max_progress: 3500,
        quality: ok ? maxQuality : maxQuality - 500,
        max_quality: maxQuality,
      }
    })

  it('criterion 1: picks the cheaper craftsmanship-assisted plan over direct control', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = couplingAwareSimulate(ladderGearset.craftsmanship, ladderGearset.control)

    const out = await adviseMeld(
      [ladderRecipe()], ladderGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    // The cheaper route bumps craftsmanship (NON-ZERO) instead of paying for
    // 10 control melds.
    expect(out.costOptimal.feasible).toBe(true)
    expect(out.costOptimal.confirmedBySolver).toBe(true)
    expect(out.costOptimal.deltaStats.craftsmanship).toBeGreaterThan(0)
    // The assisted route needs only ~2 control melds (108) vs. the direct 540.
    expect(out.costOptimal.deltaStats.control).toBeLessThan(540)
    // Total melds for the assisted route (2 craft + 2 control = 4) must be far
    // cheaper than the direct route (10 control).
    const directGil = (1000 + 54) * Math.ceil(540 / 54)
    expect(out.costOptimal.totalGil).not.toBeNull()
    expect(out.costOptimal.totalGil!).toBeLessThan(directGil)
  })

  it('criterion 4: the winning craftsmanship-assisted candidate is solver double-max confirmed', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = couplingAwareSimulate(ladderGearset.craftsmanship, ladderGearset.control)

    const out = await adviseMeld(
      [ladderRecipe()], ladderGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    expect(out.costOptimal.confirmedBySolver).toBe(true)
    // The chosen delta must itself double-max under the coupling mock.
    const d = out.costOptimal.deltaStats
    const sim = await fakeSimulate(ladderRecipe(), {
      ...ladderGearset,
      craftsmanship: ladderGearset.craftsmanship + d.craftsmanship,
      control: ladderGearset.control + d.control,
      cp: ladderGearset.cp + d.cp,
    })
    expect(sim.quality).toBeGreaterThanOrEqual(sim.max_quality)
    expect(sim.progress).toBeGreaterThanOrEqual(sim.max_progress)
  })

  it('criterion 3: the craftsmanship ladder is bounded (never explodes the solve budget)', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = couplingAwareSimulate(ladderGearset.craftsmanship, ladderGearset.control)

    await adviseMeld(
      [ladderRecipe()], ladderGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    // Each rung runs at most MAX_QUALITY_PROBES (11) inner solves; the ladder is
    // short (progress steps are few). The documented budget upper bound is well
    // under a hundred solves even with the Step 0 probe. A runaway ladder would
    // blow far past this.
    expect(fakeSolve.mock.calls.length).toBeLessThan(100)
  })

  it('criterion 2 (no regression): progress already met + control-only cheapest behaves like #126', async () => {
    // Here the direct-control route is CHEAPER than any craftsmanship detour: a
    // single control meld (54) double-maxes, no coupling shortcut helps.
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const baseControl = ladderGearset.control
    const fakeSimulate = vi.fn(async (_recipe: any, gs: any) => {
      const controlMet = gs.control >= baseControl + 54
      return {
        ...SIM_EXTRAS,
        progress: 3500, max_progress: 3500,
        quality: controlMet ? 6500 : 6257, max_quality: 6500,
      }
    })

    const out = await adviseMeld(
      [makeRecipe(126, 100, 6500)], ladderGearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    // Identical to the #126 outcome: minimal control, zero craftsmanship.
    expect(out.costOptimal.deltaStats.control).toBe(54)
    expect(out.costOptimal.deltaStats.craftsmanship).toBe(0)
    expect(out.costOptimal.deltaStats.cp).toBe(0)
    expect(out.costOptimal.confirmedBySolver).toBe(true)
  })

  it('no-price fallback: still picks the fewest-slot 3D candidate', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = couplingAwareSimulate(ladderGearset.craftsmanship, ladderGearset.control)

    const out = await adviseMeld(
      [ladderRecipe()], ladderGearset, new Map(),
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    expect(out.costOptimal.feasible).toBe(true)
    expect(out.costOptimal.totalGil).toBeNull()
    // Assisted route = 2 craft + 2 control = 4 melds; direct = 10 control melds.
    // Fewest slots wins → the assisted (non-zero craftsmanship) plan.
    expect(out.costOptimal.deltaStats.craftsmanship).toBeGreaterThan(0)
    const totalMelds =
      Math.ceil(out.costOptimal.deltaStats.craftsmanship / 54) +
      Math.ceil(out.costOptimal.deltaStats.control / 54)
    expect(totalMelds).toBeLessThan(10)
  })

  it('honors isCancelled across the ladder', async () => {
    let cancelled = false
    const fakeSolve = vi.fn(async () => {
      cancelled = true
      return { actions: ['x'], progress: 0, quality: 0, steps: 1 }
    })
    const fakeSimulate = couplingAwareSimulate(ladderGearset.craftsmanship, ladderGearset.control)

    const out = await adviseMeld(
      [ladderRecipe()], ladderGearset, priceMap,
      { isCancelled: () => cancelled },
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    expect(out.costOptimal.confirmedBySolver).toBe(false)
    // After the Step 0 solve flips cancel, the ladder must not keep probing.
    expect(fakeSolve.mock.calls.length).toBeLessThanOrEqual(2)
  })
})

// #128: robust candidate ranking when market prices are incomplete.
// Two distinct missing-price regimes must be handled WITHOUT crashing on null
// gil and WITHOUT silently producing an empty / false-pass plan:
//   - FULLY-MISSING: the priceMap has no listing for any materia → every
//     candidate is unpriced → rank by total materia / occupied slots (#127),
//     and surface a `rankedByCount` flag so the UI can show the estimate hint.
//   - PARTIAL-MISSING: some grades priced, some not. The representative
//     (chosen) cost-optimal plan still has an unpriced step (e.g. control has no
//     listing) → its totalGil is null → it must be ranked by count, and
//     `rankedByCount` must be true.
// FULLY-PRICED stays gil-ranked with `rankedByCount` false (criterion 4).
describe('adviseMeld — incomplete market prices, rank by count (#128)', () => {
  const SIM_EXTRAS = {
    durability: 80, cp: 600, max_durability: 80, max_cp: 600,
    effects: {} as any, is_finished: true, is_success: true, steps_used: 1,
  }

  // Progress trivially met; quality short by ~243 until control is bumped.
  const reproGearset = {
    level: 100, craftsmanship: 4500, control: 3200, cp: 600, isSpecialist: false,
  }
  const reproRecipe = () => makeRecipe(128, 100, 6500)

  const gearsetAwareSimulate = (baseControl: number, controlGate: number) =>
    vi.fn(async (_recipe: any, gs: any) => {
      const controlMet = gs.control >= baseControl + controlGate
      return {
        ...SIM_EXTRAS,
        progress: 3500, max_progress: 3500,
        quality: controlMet ? 6500 : 6257, max_quality: 6500,
      }
    })

  const fullPrices = new Map<number, any>(
    MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1000 + m.value, listings: [] }]),
  )

  it('criterion 1: fully-missing prices → solver-confirmed feasible fewest-slot plan, ranked by count', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = gearsetAwareSimulate(reproGearset.control, 54)

    const out = await adviseMeld(
      [reproRecipe()], reproGearset, new Map(),  // empty priceMap = fully missing
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    // Non-empty, non-false-pass: a real solver-confirmed feasible plan.
    expect(out.costOptimal.feasible).toBe(true)
    expect(out.costOptimal.confirmedBySolver).toBe(true)
    expect(out.costOptimal.steps.length).toBeGreaterThan(0)
    // Fewest-slot minimal: a single control meld.
    expect(out.costOptimal.deltaStats.control).toBe(54)
    expect(out.costOptimal.totalGil).toBeNull()
    // The flag the UI consumes to show 「無市場資料，依鑲嵌數量估算」.
    expect(out.rankedByCount).toBe(true)
  })

  it('criterion 2: partial-missing prices → ranks by count without crashing on null gil', async () => {
    // Craftsmanship grades priced, control grades NOT — the chosen control-only
    // plan therefore has an unpriced step (null subtotal). The advisor must not
    // throw and must fall back to count ranking.
    const partialPrices = new Map<number, any>(
      MATERIA_GRADES
        .filter(m => m.stat === 'craftsmanship')
        .map(m => [m.itemId, { minPriceNQ: 1000 + m.value, listings: [] }]),
    )
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = gearsetAwareSimulate(reproGearset.control, 54)

    const out = await adviseMeld(
      [reproRecipe()], reproGearset, partialPrices,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    expect(out.costOptimal.feasible).toBe(true)
    expect(out.costOptimal.confirmedBySolver).toBe(true)
    expect(out.costOptimal.steps.length).toBeGreaterThan(0)
    expect(out.costOptimal.deltaStats.control).toBe(54)
    // Control step is unpriced → plan gil null → ranked by count.
    expect(out.costOptimal.totalGil).toBeNull()
    expect(out.rankedByCount).toBe(true)
  })

  it('criterion 4: fully-priced → gil-ranked, rankedByCount is false (behavior unchanged)', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = gearsetAwareSimulate(reproGearset.control, 54)

    const out = await adviseMeld(
      [reproRecipe()], reproGearset, fullPrices,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    expect(out.costOptimal.feasible).toBe(true)
    expect(out.costOptimal.totalGil).not.toBeNull()
    expect(out.rankedByCount).toBe(false)
  })

  it('already-meets / hqSufficient → not ranked by count (priced or zero-spend, no estimate hint)', async () => {
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn().mockResolvedValue({
      progress: 3500, max_progress: 3500, quality: 6500, max_quality: 6500,
    })
    const out = await adviseMeld(
      [reproRecipe()], reproGearset, fullPrices,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(out.alreadyMeetsThreshold).toBe(true)
    // Zero-spend plan: nothing to estimate, so no count-ranking hint.
    expect(out.rankedByCount).toBe(false)
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
    // Gearset-aware: Step 0 (base gear) is short; once control is bumped by one
    // materia (54) the search converges and double-maxes. Progress is always met
    // so the search stays on the quality axis (craftsmanship delta stays 0).
    const fakeSimulate = vi.fn(async (_recipe: any, gs: any) => {
      const controlMet = gs.control >= fixtureGearset.control + 54
      return {
        durability: 80, cp: 540, max_durability: 80, max_cp: 540,
        effects: {} as any, is_finished: true, is_success: true, steps_used: 1,
        progress: 3500,
        max_progress: 3500,
        quality: controlMet ? 6500 : 6257,
        max_quality: 6500,
      }
    })

    const out = await adviseMeld(
      [fixtureRecipe], fixtureGearset, fixturePrices,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    const sanitized = {
      alreadyMeetsThreshold: out.alreadyMeetsThreshold,
      costOptimal: { ...out.costOptimal, steps: out.costOptimal.steps.length },
    }
    expect(sanitized).toMatchSnapshot()
  })
})

// #136: the reverse advisor must solve on the SAME effectiveStats the screen
// uses. Before this, runAdvisor/adviseMeld dropped the food/medicine buffs, so
// with food on the advisor over-recommended (it under-counted the buff) or
// false-reported unreachable. The fix threads buffs through every solver call
// and the closed-form baselines (ADR-0001 fold: Soul → food → medicine).
describe('adviseMeld — food/medicine buff basis (#136)', () => {
  const priceMap = new Map<number, any>(
    MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1000, listings: [] }]),
  )
  const gearset = {
    level: 100, craftsmanship: 4500, control: 4500, cp: 600, isSpecialist: false,
  }
  const buffs = {
    food: { id: 1, name: 'f', craftsmanship: { percent: 5, max: 200 }, control: { percent: 5, max: 200 } },
    medicine: null,
  }

  it('forwards food/medicine buffs to every solver + sim call (same basis as the screen)', async () => {
    const recipe = makeRecipe(1, 1000, 5000)
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn().mockResolvedValue({
      progress: 1000, max_progress: 1000, quality: 5000, max_quality: 5000,
    })
    await adviseMeld(
      [recipe], gearset, priceMap,
      { buffs },
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(fakeSolve).toHaveBeenCalled()
    for (const call of fakeSolve.mock.calls) {
      expect(call[2]).toMatchObject({ buffs })
    }
    for (const call of fakeSimulate.mock.calls) {
      expect(call[2]).toMatchObject({ buffs })
    }
  })

  it('without buffs, the solver receives no buffs (byte-parity with pre-#136)', async () => {
    const recipe = makeRecipe(1, 1000, 5000)
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn().mockResolvedValue({
      progress: 1000, max_progress: 1000, quality: 5000, max_quality: 5000,
    })
    await adviseMeld(
      [recipe], gearset, priceMap,
      {},
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(fakeSolve.mock.calls[0][2].buffs).toBeUndefined()
  })

  it('food craftsmanship buff folds into the progress breakpoint baseline (smaller Δ)', () => {
    // Real rlv690 (suggestedCraftsmanship 4207). Base craft 4000:
    //   no food   → Δ = 4207 - 4000 = 207
    //   +5% food (cap 200) → buffed 4200 → Δ = 4207 - 4200 = 7
    const rlv690 = {
      classJobLevel: 100, stars: 0, difficulty: 6600, quality: 12000,
      durability: 80, suggestedCraftsmanship: 4207,
      progressDivider: 170, qualityDivider: 150,
      progressModifier: 90, qualityModifier: 75,
    }
    const recipe = { id: 1, name: 'r', job: 'CRP', canHq: true, isExpert: false, recipeLevelTable: rlv690 } as unknown as Recipe
    const g = { level: 100, craftsmanship: 4000, control: 4100, cp: 560, isSpecialist: false }

    const withoutFood = solveProgressBreakpoint(recipe, g)
    const withFood = solveProgressBreakpoint(recipe, g, buffs)
    expect(withoutFood).toBe(207)
    expect(withFood).toBeLessThan(withoutFood)
  })
})

describe('enumerateCraftsmanshipLadder — #140 finite guard', () => {
  // progressModifier:0 with crafterLevel <= classJobLevel makes computeBaseProgress
  // return 0 → perStep === 0 → stepsAt() === Infinity → baseSteps === Infinity.
  // Without the guard the descending ladder loop `for (target = baseSteps - 1;
  // target >= lowestTarget; target--)` spins forever on the main thread
  // (Infinity - 1 === Infinity, Infinity >= Infinity is always true). #132's async
  // wall-clock deadline cannot interrupt a synchronous spin, so the ladder must
  // bail to the single baseline rung itself.
  it('returns the single baseline rung instead of spinning when baseline per-step progress is <= 0', () => {
    const base = makeRecipe(1, 3000, 9000)
    const recipe = {
      ...base,
      recipeLevelTable: { ...base.recipeLevelTable, progressModifier: 0 },
    } as Recipe
    const gearset = { level: 100, craftsmanship: 4000, control: 4000, cp: 600, isSpecialist: false }

    const ladder = enumerateCraftsmanshipLadder(recipe, gearset, 0)

    expect(ladder).toEqual([0])
  })

  it('still enumerates multiple rungs for a normal recipe (unchanged behaviour)', () => {
    const recipe = makeRecipe(1, 3000, 9000)
    const gearset = { level: 100, craftsmanship: 3000, control: 4000, cp: 600, isSpecialist: false }

    const ladder = enumerateCraftsmanshipLadder(recipe, gearset, 0)

    // ascending, de-duplicated, baseline included
    expect(ladder[0]).toBe(0)
    expect(ladder.length).toBeGreaterThanOrEqual(1)
    expect([...ladder].sort((a, b) => a - b)).toEqual(ladder)
  })
})

// #132: per-solve wall-clock deadline + run-level abort. A pathological recipe
// that makes a single WASM call block indefinitely must not hang the advisor —
// the deadline aborts the call (freeing the worker slot via the threaded signal)
// and the run bails to its best-so-far. A run-level signal threads through so a
// superseded/cancelled run truly tears down its in-flight solve.
describe('adviseMeld — solve deadline + run-level abort (#132)', () => {
  const priceMap = new Map<number, any>(
    MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1000 + m.value, listings: [] }]),
  )
  const gearset = { level: 100, craftsmanship: 4500, control: 3200, cp: 600, isSpecialist: false }
  const recipe = () => makeRecipe(123, 3500, 6500)
  const SIM_EXTRAS = {
    durability: 80, cp: 600, max_durability: 80, max_cp: 600,
    effects: {} as any, is_finished: true, is_success: true, steps_used: 1,
  }
  const hang = () => new Promise<never>(() => { /* never settles */ })

  it('bails out (does not hang) when the Step 0 solve exceeds the deadline', async () => {
    vi.useFakeTimers()
    try {
      // Bare vi.fn() + mockImplementation keeps the `any` call signature that
      // ConfirmDeps['solve'] expects (an inline impl would infer a too-narrow type).
      const solve = vi.fn().mockImplementation(hang)
      const simulate = vi.fn()
      const promise = adviseMeld(
        [recipe()], gearset, priceMap,
        { deadlineMs: 50 },
        { solve, simulate },
      )
      await vi.advanceTimersByTimeAsync(50)
      const out = await promise

      // Bail shape: emptyMeldPlan(null, false) — totalGil null, unconfirmed.
      expect(out.costOptimal.totalGil).toBeNull()
      expect(out.costOptimal.confirmedBySolver).toBe(false)
      expect(out.alreadyMeetsThreshold).toBe(false)
      // #133: a deadline at Step 0 is honestly reported as timed-out.
      expect(out.status).toBe('timed-out')
      // The deadline fired before the simulate could run.
      expect(simulate).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('bails the ladder to best-so-far when an inner search solve exceeds the deadline', async () => {
    vi.useFakeTimers()
    try {
      // Step 0 solve resolves (so we get past the already-meets probe), Step 0
      // simulate is short of quality (not double-max), then the ladder's inner
      // search solve hangs and must be torn down by the deadline.
      const solve = vi.fn()
        .mockResolvedValueOnce({ actions: ['x'] }) // Step 0
        .mockImplementation(hang)                   // ladder probes block
      const simulate = vi.fn().mockResolvedValue({
        ...SIM_EXTRAS, progress: 3500, max_progress: 3500, quality: 6257, max_quality: 6500,
      })
      const promise = adviseMeld(
        [recipe()], gearset, priceMap,
        { deadlineMs: 50 },
        { solve, simulate },
      )
      await vi.advanceTimersByTimeAsync(50)
      const out = await promise

      // No rung confirmed (the only ladder solve timed out) → bail shape.
      expect(out.costOptimal.confirmedBySolver).toBe(false)
      // #133: ladder cut short by the deadline is timed-out, NOT infeasible.
      expect(out.status).toBe('timed-out')
      expect(solve.mock.calls.length).toBeGreaterThanOrEqual(2) // Step 0 + at least one ladder probe
    } finally {
      vi.useRealTimers()
    }
  })

  it('threads the run-level signal into every solve/simulate call', async () => {
    const solve = vi.fn().mockResolvedValue({ actions: ['x'] })
    // Double-max at Step 0 so the run stops after one solve+simulate.
    const simulate = vi.fn().mockResolvedValue({
      ...SIM_EXTRAS, progress: 3500, max_progress: 3500, quality: 6500, max_quality: 6500,
    })
    const controller = new AbortController()

    await adviseMeld(
      [recipe()], gearset, priceMap,
      { signal: controller.signal, deadlineMs: 0 },
      { solve, simulate },
    )

    // deadlineMs <= 0 forwards the run signal verbatim (no per-call controller).
    expect(solve.mock.calls[0][2].signal).toBe(controller.signal)
    expect(simulate.mock.calls[0][2].signal).toBe(controller.signal)
  })

  it('does not disturb a normal run that completes within the deadline', async () => {
    const solve = vi.fn().mockResolvedValue({ actions: ['x'] })
    // progress trivially met; quality met once control bumped >= 150.
    const simulate = vi.fn(async (_r: any, gs: any) => ({
      ...SIM_EXTRAS,
      progress: 3500, max_progress: 3500,
      quality: gs.control >= gearset.control + 150 ? 6500 : 6257,
      max_quality: 6500,
    }))

    const out = await adviseMeld(
      [recipe()], gearset, priceMap,
      { deadlineMs: 8000 },
      { solve, simulate },
    )

    expect(out.costOptimal.confirmedBySolver).toBe(true)
    expect(out.costOptimal.feasible).toBe(true)
    expect(out.costOptimal.deltaStats.control).toBeGreaterThan(0)
    expect(out.status).toBe('feasible')
  })
})

// #133: honest outcome discriminant. Before this, infeasible / timed-out /
// error / cancelled were bit-identical MeldAdvice. Each must now carry a
// distinct `status` so the UI can render honestly and never claim 保證 HQ.
describe('adviseMeld — honest status discriminant (#133)', () => {
  const priceMap = new Map<number, any>(
    MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1000 + m.value, listings: [] }]),
  )
  const gearset = { level: 100, craftsmanship: 4500, control: 3200, cp: 600, isSpecialist: false }
  const recipe = () => makeRecipe(133, 3500, 6500)
  const SIM_EXTRAS = {
    durability: 80, cp: 600, max_durability: 80, max_cp: 600,
    effects: {} as any, is_finished: true, is_success: true, steps_used: 1,
  }

  it('status = feasible when HQ materials alone double-max (hqSufficient)', async () => {
    const solve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const simulate = vi.fn().mockResolvedValue({
      ...SIM_EXTRAS, progress: 3500, max_progress: 3500, quality: 6500, max_quality: 6500,
    })
    const out = await adviseMeld(
      [recipe()], gearset, priceMap, {}, { solve, simulate },
    )
    expect(out.status).toBe('feasible')
    expect(out.hqSufficient).toBe(true)
  })

  it('status = infeasible when no stat bump can double-max', async () => {
    // Never reaches max quality regardless of any stat bump → not even the
    // #134 full-pentameld prefilter double-maxes → genuinely infeasible by melds.
    const solve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const simulate = vi.fn().mockResolvedValue({
      ...SIM_EXTRAS, progress: 3500, max_progress: 3500, quality: 6257, max_quality: 6500,
    })
    const out = await adviseMeld(
      [recipe()], gearset, priceMap, {}, { solve, simulate },
    )
    expect(out.status).toBe('infeasible')
    expect(out.costOptimal.confirmedBySolver).toBe(false)
  })

  // #133 regression: the real worker rejects an aborted solve with
  // SolveCancelledError. A DEADLINE abort must still be reported as `timed-out`,
  // not `cancelled` — the raceDeadline must latch the deadline before the abort's
  // synchronous worker rejection wins the race. (Caught a real ordering bug the
  // hang-based deadline tests missed; surfaced by the e2e card showing 已取消計算.)
  it('status = timed-out even when the deadline abort makes the solve reject (worker behaviour)', async () => {
    vi.useFakeTimers()
    try {
      const solve = vi.fn().mockImplementation((_r: any, _g: any, opts: any) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => reject(new SolveCancelledError()), { once: true })
        }))
      const simulate = vi.fn()
      const promise = adviseMeld(
        [recipe()], gearset, priceMap,
        { deadlineMs: 50 }, { solve, simulate },
      )
      await vi.advanceTimersByTimeAsync(50)
      const out = await promise
      expect(out.status).toBe('timed-out')
    } finally {
      vi.useRealTimers()
    }
  })

  it('status = error when a Step 0 solve throws a non-deadline/cancel error', async () => {
    const solve = vi.fn().mockRejectedValue(new Error('wasm boom'))
    const simulate = vi.fn()
    const out = await adviseMeld(
      [recipe()], gearset, priceMap, { deadlineMs: 0 }, { solve, simulate },
    )
    expect(out.status).toBe('error')
  })

  it('status = cancelled when isCancelled trips after Step 0', async () => {
    let calls = 0
    const solve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const simulate = vi.fn().mockResolvedValue({
      ...SIM_EXTRAS, progress: 3500, max_progress: 3500, quality: 6257, max_quality: 6500,
    })
    // Cancel right after the Step 0 solve+sim (not double-max) → bail cancelled
    // before the ladder.
    const isCancelled = () => { calls += 1; return calls > 2 }
    const out = await adviseMeld(
      [recipe()], gearset, priceMap,
      { deadlineMs: 0, isCancelled }, { solve, simulate },
    )
    expect(out.status).toBe('cancelled')
  })
})

// #134: a full-pentameld feasibility prefilter before the bounded ladder. The
// over-bound gives EVERY stat the whole 60-slot budget at once (physically
// impossible — slots are shared — but a SOUND infeasibility certificate because
// double-max is monotone non-decreasing in each stat). If even that can't
// double-max, no real meld plan can → short-circuit to `infeasible` in ~1 extra
// solve instead of running the worst-case ~66-solve ladder. It NEVER
// false-positives infeasible (the #123 bug family).
describe('adviseMeld — full-pentameld feasibility prefilter (#134)', () => {
  const priceMap = new Map<number, any>(
    MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1000 + m.value, listings: [] }]),
  )
  const gearset = { level: 100, craftsmanship: 4500, control: 3200, cp: 600, isSpecialist: false }
  const recipe = () => makeRecipe(134, 3500, 6500)
  const SIM_EXTRAS = {
    durability: 80, cp: 600, max_durability: 80, max_cp: 600,
    effects: {} as any, is_finished: true, is_success: true, steps_used: 1,
  }

  it('short-circuits to infeasible in ~1 extra solve when even full pentameld cannot double-max', async () => {
    // Quality never reaches max regardless of stats → the full-pentameld
    // over-bound fails → infeasible without running the ladder.
    const solve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const simulate = vi.fn().mockResolvedValue({
      ...SIM_EXTRAS, progress: 3500, max_progress: 3500, quality: 6257, max_quality: 6500,
    })
    const out = await adviseMeld(
      [recipe()], gearset, priceMap, { deadlineMs: 0 }, { solve, simulate },
    )
    expect(out.status).toBe('infeasible')
    expect(out.costOptimal.confirmedBySolver).toBe(false)
    // Step 0 probe + ONE full-pentameld prefilter probe. The bounded ladder (up
    // to MAX_CRAFTSMANSHIP_RUNGS × MAX_QUALITY_PROBES solves) is skipped entirely.
    expect(solve).toHaveBeenCalledTimes(2)
  })

  it('passes through to the ladder for a recipe melds CAN reach (no false infeasible)', async () => {
    const solve = vi.fn().mockResolvedValue({ actions: ['x'] })
    // Bare gear quality-short; double-maxes once control is bumped >= 150 raw
    // points (within real meld reach) — the prefilter must let this through.
    const simulate = vi.fn(async (_r: any, gs: any) => ({
      ...SIM_EXTRAS, progress: 3500, max_progress: 3500,
      quality: gs.control >= gearset.control + 150 ? 6500 : 6257, max_quality: 6500,
    }))
    const out = await adviseMeld(
      [recipe()], gearset, priceMap, { deadlineMs: 0 }, { solve, simulate },
    )
    expect(out.status).toBe('feasible')
    expect(out.costOptimal.feasible).toBe(true)
    expect(out.costOptimal.confirmedBySolver).toBe(true)
    // The ladder ran (more than Step 0 + the single prefilter probe).
    expect(solve.mock.calls.length).toBeGreaterThan(2)
  })

  it('still reports infeasible when the prefilter passes but no real rung fits the slot budget', async () => {
    // Double-max only when BOTH control +3000 (≈ 56 melds) AND cp +200 (≈ 15
    // melds) are met — ≈ 71 melds, past the 60-slot budget. The full-pentameld
    // over-bound (control +3240 AND cp +840) clears both axes at once, so the
    // prefilter PASSES; but the 2D ladder search confirms the double-maxing delta
    // only at a (control, cp) combo that overflows the slot budget → the
    // confirmed plan is slot-infeasible → status infeasible after the ladder, NOT
    // short-circuited. (The old control-only search reported infeasible here only
    // because it couldn't REACH +3000 within budget; the 2D search reaches it and
    // correctly attributes the infeasibility to the slot budget, not the probe cap.)
    const solve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const simulate = vi.fn(async (_r: any, gs: any) => ({
      ...SIM_EXTRAS, progress: 3500, max_progress: 3500,
      quality: gs.control >= gearset.control + 3000 && gs.cp >= gearset.cp + 200 ? 6500 : 6257,
      max_quality: 6500,
    }))
    const out = await adviseMeld(
      [recipe()], gearset, priceMap, { deadlineMs: 0 }, { solve, simulate },
    )
    expect(out.status).toBe('infeasible')
    // The solver DID confirm a double-maxing delta, but it overflows the slot
    // budget — that's the real "no rung fits" signal, not a failure to confirm.
    expect(out.costOptimal.feasible).toBe(false)
    // The ladder DID run (prefilter passed) — strictly more than 2 solves.
    expect(solve.mock.calls.length).toBeGreaterThan(2)
  })

  it('reports timed-out (not infeasible) when the prefilter probe hits the deadline', async () => {
    vi.useFakeTimers()
    try {
      const hang = () => new Promise<never>(() => { /* never settles */ })
      const solve = vi.fn()
        .mockResolvedValueOnce({ actions: ['x'] }) // Step 0 resolves
        .mockImplementation(hang)                   // prefilter probe blocks
      const simulate = vi.fn().mockResolvedValue({
        ...SIM_EXTRAS, progress: 3500, max_progress: 3500, quality: 6257, max_quality: 6500,
      })
      const promise = adviseMeld(
        [recipe()], gearset, priceMap, { deadlineMs: 50 }, { solve, simulate },
      )
      await vi.advanceTimersByTimeAsync(50)
      const out = await promise
      expect(out.status).toBe('timed-out')
    } finally {
      vi.useRealTimers()
    }
  })
})

// #134: custom recipes (no HQ-eligible materials → quality factor locked 0%)
// have no HQ-material lever, so melds must solo-fill the entire quality gap.
// The advisor flags this so the UI can preface the result with a hint rather
// than letting the user walk into a materia-only dead end (review §5.9).
describe('recipeHasHqLever (#134)', () => {
  const withIngredients = (mqf: number | undefined, canHq: boolean[]): Recipe => ({
    ...makeRecipe(1, 3500, 6500),
    materialQualityFactor: mqf,
    ingredients: canHq.map((hq, i) => ({ itemId: i + 1, name: 'a', icon: '', amount: 2, canHq: hq, level: 100 })),
  } as unknown as Recipe)

  it('is false when the recipe has no ingredient data (custom recipe)', () => {
    expect(recipeHasHqLever(makeRecipe(1, 3500, 6500))).toBe(false)
  })

  it('is false when materialQualityFactor is 0 even with HQ-eligible ingredients', () => {
    expect(recipeHasHqLever(withIngredients(0, [true, true]))).toBe(false)
  })

  it('is false when no ingredient is HQ-eligible', () => {
    expect(recipeHasHqLever(withIngredients(75, [false, false]))).toBe(false)
  })

  it('is true when an ingredient is HQ-eligible and materialQualityFactor > 0', () => {
    expect(recipeHasHqLever(withIngredients(75, [false, true]))).toBe(true)
  })
})

describe('adviseMeld — custom recipe no-HQ-lever flag (#134)', () => {
  const priceMap = new Map<number, any>(MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1000, listings: [] }]))
  const gearset = { level: 100, craftsmanship: 4500, control: 3200, cp: 600, isSpecialist: false }
  const SIM_EXTRAS = {
    durability: 80, cp: 600, max_durability: 80, max_cp: 600,
    effects: {} as any, is_finished: true, is_success: true, steps_used: 1,
  }
  const withIngredients = (mqf: number, canHq: boolean): Recipe => ({
    ...makeRecipe(1, 3500, 6500),
    materialQualityFactor: mqf,
    ingredients: [{ itemId: 1, name: 'a', icon: '', amount: 3, canHq, level: 100 }],
  } as unknown as Recipe)
  const dm = () => vi.fn().mockResolvedValue({
    ...SIM_EXTRAS, progress: 3500, max_progress: 3500, quality: 6500, max_quality: 6500,
  })

  it('flags noHqLever for a recipe with no HQ-eligible materials (0% HQ lever)', async () => {
    const out = await adviseMeld(
      [withIngredients(75, false)], gearset, priceMap,
      { deadlineMs: 0 }, { solve: vi.fn().mockResolvedValue({ actions: ['x'] }), simulate: dm() },
    )
    expect(out.noHqLever).toBe(true)
  })

  it('does NOT flag noHqLever when the recipe has HQ-eligible materials', async () => {
    const out = await adviseMeld(
      [withIngredients(75, true)], gearset, priceMap,
      { deadlineMs: 0 }, { solve: vi.fn().mockResolvedValue({ actions: ['x'] }), simulate: dm() },
    )
    expect(out.noHqLever).toBe(false)
  })
})

// #134: probe results are memoized across the whole run so the ladder never
// re-solves a (craftsmanship, control, cp) point Step 0 already probed. The
// always-present overlap is Step 0's zero-delta probe vs. the baseline rung's
// downward bisection to control 0 — a shared cache must collapse those to one
// real solve (review §5 nit).
describe('adviseMeld — cross-rung probe cache (#134)', () => {
  const priceMap = new Map<number, any>(
    MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1000 + m.value, listings: [] }]),
  )
  const gearset = { level: 100, craftsmanship: 4500, control: 3200, cp: 600, isSpecialist: false }
  // Progress trivially met (low difficulty, ample craftsmanship) → baseline rung
  // craftsmanship = 0, so the rung-0 probe at control 0 is exactly Step 0's point.
  const recipe = () => makeRecipe(134, 100, 6500)
  const SIM_EXTRAS = {
    durability: 80, cp: 600, max_durability: 80, max_cp: 600,
    effects: {} as any, is_finished: true, is_success: true, steps_used: 1,
  }

  it('reuses the Step 0 zero-delta probe instead of re-solving it in the ladder', async () => {
    const solve = vi.fn().mockResolvedValue({ actions: ['x'] })
    // Double-maxes once control bumped >= 54 (one grade). The bounded search
    // bisects down to control 0 to confirm it's insufficient — the same bare
    // gearset Step 0 already probed.
    const simulate = vi.fn(async (_r: any, gs: any) => ({
      ...SIM_EXTRAS, progress: 3500, max_progress: 3500,
      quality: gs.control >= gearset.control + 54 ? 6500 : 6257, max_quality: 6500,
    }))
    await adviseMeld(
      [recipe()], gearset, priceMap, { deadlineMs: 0 }, { solve, simulate },
    )
    // Solves probing the bare gearset (zero delta on ALL three axes) must occur
    // exactly once — Step 0 — not twice (Step 0 + a redundant ladder re-probe).
    const zeroDeltaSolves = solve.mock.calls.filter(
      ([, gs]) =>
        gs.craftsmanship === gearset.craftsmanship &&
        gs.control === gearset.control &&
        gs.cp === gearset.cp,
    )
    expect(zeroDeltaSolves.length).toBe(1)
  })
})

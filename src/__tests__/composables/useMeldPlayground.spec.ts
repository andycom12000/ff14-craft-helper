import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMeldPlayground } from '@/composables/useMeldPlayground'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { MeldAdvice } from '@/services/meld-advisor'
import type { SolverResultWithTiming, SimulateResult } from '@/solver/raphael'

// The forward playground runs the REAL forward primitives (criterion 4). We mock
// the solver/api façade so the composable's solve cadence + HQ判定 can be driven
// deterministically without bootstrapping WASM.
vi.mock('@/solver/api', () => ({
  solveCraftForRecipe: vi.fn(),
  simulateCraftForRecipe: vi.fn(),
}))

const { solveCraftForRecipe, simulateCraftForRecipe } = await import('@/solver/api')

const stubRecipe = {
  id: 1,
  name: 'Test',
  job: 'CRP',
  canHq: true,
  recipeLevelTable: { difficulty: 6000, quality: 12000, durability: 80 },
} as unknown as Recipe

const stubGearset: GearsetStats = {
  level: 100,
  craftsmanship: 4000,
  control: 3900,
  cp: 600,
  isSpecialist: false,
}

function solverResult(): SolverResultWithTiming {
  return { actions: ['MuscleMemory', 'CarefulSynthesis'], progress: 0, quality: 0, steps: 2 }
}

function simResult(doubleMax: boolean): SimulateResult {
  return {
    progress: doubleMax ? 6000 : 6000,
    quality: doubleMax ? 12000 : 8000,
    durability: 10,
    cp: 50,
    max_progress: 6000,
    max_quality: 12000,
    max_durability: 80,
    max_cp: 600,
    effects: {
      inner_quiet: 0, waste_not: 0, innovation: 0, veneration: 0,
      great_strides: 0, muscle_memory: 0, manipulation: 0,
      trained_perfection_available: false, trained_perfection_active: false,
      heart_and_soul_available: false, heart_and_soul_active: false,
      quick_innovation_available: false,
    },
    is_finished: true,
    is_success: doubleMax,
    steps_used: 2,
  }
}

const reverseAdvice: MeldAdvice = {
  costOptimal: {
    feasible: true,
    // grade-12 control = 54 each; 8 placed melds → 432 control
    deltaStats: { craftsmanship: 0, control: 432, cp: 0 },
    steps: [
      { stat: 'control', grade: 12, placedCount: 8, expectedCount: 8, unitPrice: 8000, subtotal: 64000 },
    ],
    totalGil: 64000,
    confirmedBySolver: true,
  },
  bis: {
    feasible: true,
    deltaStats: { craftsmanship: 0, control: 0, cp: 0 },
    steps: [],
    totalGil: 0,
    confirmedBySolver: false,
  },
  gapGil: 0,
  alreadyMeetsThreshold: false,
  hqSufficient: false,
  rankedByCount: false,
}

describe('useMeldPlayground', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(solveCraftForRecipe).mockResolvedValue(solverResult())
    vi.mocked(simulateCraftForRecipe).mockResolvedValue(simResult(true))
  })

  it('starts idle with no selections and a zero delta', () => {
    const pg = useMeldPlayground(() => stubRecipe, () => stubGearset)
    expect(pg.selections.value).toEqual([])
    expect(pg.deltaStats.value).toEqual({ craftsmanship: 0, control: 0, cp: 0 })
    expect(pg.verdict.value).toBe('idle')
  })

  it('a selection of grade/count produces the matching raw stat delta', () => {
    const pg = useMeldPlayground(() => stubRecipe, () => stubGearset)
    pg.setSelection('control', 12, 4)
    // grade-12 control materia = 54 each → 4 × 54 = 216
    expect(pg.deltaStats.value).toEqual({ craftsmanship: 0, control: 216, cp: 0 })
  })

  it('loadFromReverse seeds selections from costOptimal steps and reproduces its delta', () => {
    const pg = useMeldPlayground(() => stubRecipe, () => stubGearset)
    pg.loadFromReverse(reverseAdvice)
    // one selection: 8 × control grade 12
    expect(pg.selections.value).toEqual([{ stat: 'control', grade: 12, count: 8 }])
    expect(pg.deltaStats.value).toEqual(reverseAdvice.costOptimal.deltaStats)
  })

  it('runForwardCheck feeds the bumped gearset to the real solver and sets the HQ verdict', async () => {
    const pg = useMeldPlayground(() => stubRecipe, () => stubGearset)
    pg.setSelection('control', 12, 8)
    await pg.runForwardCheck()
    // solver was called with the gearset bumped by the playground delta
    const callArg = vi.mocked(solveCraftForRecipe).mock.calls[0][1]
    expect(callArg.control).toBe(stubGearset.control + 8 * 54)
    expect(pg.verdict.value).toBe('can-hq')
  })

  it('verdict flips to cannot-hq when the forward sim does not double-max', async () => {
    vi.mocked(simulateCraftForRecipe).mockResolvedValue(simResult(false))
    const pg = useMeldPlayground(() => stubRecipe, () => stubGearset)
    pg.setSelection('control', 12, 1)
    await pg.runForwardCheck()
    expect(pg.verdict.value).toBe('cannot-hq')
  })

  it('criterion 6: load reverse → tweak grade/count → HQ判定 flips', async () => {
    // Reverse suggestion (8 control) double-maxes; trimming it down does not.
    vi.mocked(simulateCraftForRecipe).mockImplementation(async (_r, gearset) => {
      // double-max only when the bumped control reaches the reverse threshold
      const reaches = gearset.control >= stubGearset.control + 8 * 54
      return simResult(reaches)
    })

    const pg = useMeldPlayground(() => stubRecipe, () => stubGearset)
    pg.loadFromReverse(reverseAdvice)
    await pg.runForwardCheck()
    expect(pg.verdict.value).toBe('can-hq')

    // User tweaks: fewer melds than the optimum → should no longer HQ.
    pg.setSelection('control', 12, 3)
    // tweaking without recompute marks the verdict stale (existing cadence)
    expect(pg.verdict.value).toBe('stale')
    await pg.runForwardCheck()
    expect(pg.verdict.value).toBe('cannot-hq')
  })

  it('setSelection after a check marks the verdict stale awaiting recompute', async () => {
    const pg = useMeldPlayground(() => stubRecipe, () => stubGearset)
    pg.setSelection('control', 12, 8)
    await pg.runForwardCheck()
    expect(pg.verdict.value).toBe('can-hq')
    pg.setSelection('control', 12, 9)
    expect(pg.verdict.value).toBe('stale')
  })

  it('a newer runForwardCheck discards a slower stale response', async () => {
    let resolveFirst!: (v: SimulateResult) => void
    vi.mocked(simulateCraftForRecipe)
      .mockImplementationOnce(() => new Promise<SimulateResult>((res) => { resolveFirst = res }))
      .mockResolvedValue(simResult(false))

    const pg = useMeldPlayground(() => stubRecipe, () => stubGearset)
    pg.setSelection('control', 12, 8)
    const first = pg.runForwardCheck()
    // let the first check advance past its (immediate) solve into the hanging sim
    await Promise.resolve()
    await Promise.resolve()
    pg.setSelection('control', 12, 1)
    const second = pg.runForwardCheck()
    // unblock the first (stale) call AFTER the second is queued
    resolveFirst(simResult(true))
    await first
    await second
    // The newer (cannot-hq) result must win, not the stale double-max.
    expect(pg.verdict.value).toBe('cannot-hq')
  })

  it('clear resets selections and verdict', async () => {
    const pg = useMeldPlayground(() => stubRecipe, () => stubGearset)
    pg.setSelection('control', 12, 8)
    await pg.runForwardCheck()
    pg.clear()
    expect(pg.selections.value).toEqual([])
    expect(pg.deltaStats.value).toEqual({ craftsmanship: 0, control: 0, cp: 0 })
    expect(pg.verdict.value).toBe('idle')
  })

  it('setSelection with count 0 removes that stat/grade row', () => {
    const pg = useMeldPlayground(() => stubRecipe, () => stubGearset)
    pg.setSelection('control', 12, 4)
    pg.setSelection('control', 12, 0)
    expect(pg.selections.value).toEqual([])
    expect(pg.deltaStats.value.control).toBe(0)
  })
})

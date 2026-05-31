import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MeldPlaygroundCard from '@/components/MeldPlaygroundCard.vue'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { MeldAdvice } from '@/services/meld-advisor'
import type { SolverResultWithTiming, SimulateResult } from '@/solver/raphael'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

// The card runs the REAL forward primitives; mock the façade for determinism.
vi.mock('@/solver/api', () => ({
  solveCraftForRecipe: vi.fn(),
  simulateCraftForRecipe: vi.fn(),
}))

const { solveCraftForRecipe, simulateCraftForRecipe } = await import('@/solver/api')

const recipe = {
  id: 1,
  name: 'Test',
  job: 'CRP',
  canHq: true,
  recipeLevelTable: { difficulty: 6000, quality: 12000, durability: 80 },
} as unknown as Recipe

const gearset: GearsetStats = {
  level: 100,
  craftsmanship: 4000,
  control: 3900,
  cp: 600,
  isSpecialist: false,
}

function solverResult(): SolverResultWithTiming {
  return { actions: ['MuscleMemory'], progress: 0, quality: 0, steps: 1 }
}

function simResult(doubleMax: boolean): SimulateResult {
  return {
    progress: 6000,
    quality: doubleMax ? 12000 : 8000,
    durability: 10, cp: 50,
    max_progress: 6000, max_quality: 12000, max_durability: 80, max_cp: 600,
    effects: {
      inner_quiet: 0, waste_not: 0, innovation: 0, veneration: 0,
      great_strides: 0, muscle_memory: 0, manipulation: 0,
      trained_perfection_available: false, trained_perfection_active: false,
      heart_and_soul_available: false, heart_and_soul_active: false,
      quick_innovation_available: false,
    },
    is_finished: true, is_success: doubleMax, steps_used: 1,
  }
}

const reverseAdvice: MeldAdvice = {
  costOptimal: {
    feasible: true,
    deltaStats: { craftsmanship: 0, control: 432, cp: 0 },
    steps: [
      { stat: 'control', grade: 12, placedCount: 8, expectedCount: 8, unitPrice: 8000, subtotal: 64000 },
    ],
    totalGil: 64000,
    confirmedBySolver: true,
  },
  bis: { feasible: true, deltaStats: { craftsmanship: 0, control: 0, cp: 0 }, steps: [], totalGil: 0, confirmedBySolver: false },
  gapGil: 0,
  alreadyMeetsThreshold: false,
  hqSufficient: false,
  rankedByCount: false,
}

function mountCard(props: Record<string, unknown> = {}) {
  return mount(MeldPlaygroundCard, {
    props: { recipe, gearset, advice: reverseAdvice, ...props },
  })
}

describe('MeldPlaygroundCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(solveCraftForRecipe).mockResolvedValue(solverResult())
    vi.mocked(simulateCraftForRecipe).mockResolvedValue(simResult(true))
  })

  it('renders a per-stat materia grade/count picker', () => {
    const w = mountCard()
    expect(w.find('[data-test="meld-row-craftsmanship"]').exists()).toBe(true)
    expect(w.find('[data-test="meld-row-control"]').exists()).toBe(true)
    expect(w.find('[data-test="meld-row-cp"]').exists()).toBe(true)
  })

  it('placing melds shows the resulting (bumped) gear stats live', async () => {
    const w = mountCard()
    const countInput = w.find('[data-test="count-control"]')
    await countInput.setValue('4')
    // 4 × grade-12 control (54) = 216 → 3900 + 216 = 4,116 (locale-formatted)
    expect(w.find('[data-test="stat-control"]').text().replace(/,/g, '')).toContain('4116')
  })

  it('one-click load from reverse seeds the picker (criterion 2)', async () => {
    const w = mountCard()
    await w.find('[data-test="load-reverse"]').trigger('click')
    // control count input reflects the 8 placed melds from the reverse plan
    const countInput = w.find('[data-test="count-control"]').element as HTMLInputElement
    expect(countInput.value).toBe('8')
    expect(w.find('[data-test="stat-control"]').text().replace(/,/g, '')).toContain(String(3900 + 432))
  })

  it('criterion 6: load reverse → tweak grade/count → HQ判定 flips', async () => {
    // double-max only when bumped control reaches the reverse threshold (8 melds)
    vi.mocked(simulateCraftForRecipe).mockImplementation(async (_r, g) => {
      return simResult(g.control >= gearset.control + 8 * 54)
    })
    const w = mountCard()

    await w.find('[data-test="load-reverse"]').trigger('click')
    await w.find('[data-test="run-check"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="verdict"]').text()).toMatch(/保證 HQ|可 HQ|HQ/)
    expect(w.find('[data-test="verdict"]').classes()).toContain('verdict-can')

    // tweak DOWN to 3 melds → should no longer HQ
    await w.find('[data-test="count-control"]').setValue('3')
    // before recompute, the prior verdict is marked stale (existing cadence)
    expect(w.find('[data-test="verdict"]').classes()).toContain('verdict-stale')
    await w.find('[data-test="run-check"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="verdict"]').classes()).toContain('verdict-cannot')
  })

  it('apply emits the session-override delta (criterion 3 — not written to gearset)', async () => {
    const w = mountCard()
    await w.find('[data-test="load-reverse"]').trigger('click')
    await w.find('[data-test="apply-override"]').trigger('click')
    expect(w.emitted('apply')?.[0]).toEqual([{ craftsmanship: 0, control: 432, cp: 0 }])
  })

  it('clear resets the picker and verdict', async () => {
    const w = mountCard()
    await w.find('[data-test="load-reverse"]').trigger('click')
    await w.find('[data-test="clear"]').trigger('click')
    const countInput = w.find('[data-test="count-control"]').element as HTMLInputElement
    expect(countInput.value).toBe('0')
  })
})

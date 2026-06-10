import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MeldPlaygroundCard from '@/components/MeldPlaygroundCard.vue'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { MeldAdvice } from '@/services/meld-advisor'
import type { SolverResultWithTiming, SimulateResult } from '@/solver/raphael'
import { MAX_MELD_COUNT } from '@/engine/materia'

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
  status: 'feasible',
  costOptimal: {
    feasible: true,
    deltaStats: { craftsmanship: 0, control: 432, cp: 0 },
    steps: [
      { stat: 'control', grade: 12, placedCount: 8, expectedCount: 8, unitPrice: 8000, subtotal: 64000 },
    ],
    totalGil: 64000,
    confirmedBySolver: true,
  },
  alreadyMeetsThreshold: false,
  hqSufficient: false,
  rankedByCount: false,
  noHqLever: false,
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

  it('passes the host buffs through to the forward check (premise parity with the reverse advisor)', async () => {
    const buffs = {
      food: { itemId: 1, name: '測試餐', craftsmanshipPct: 0, craftsmanshipMax: 0, controlPct: 10, controlMax: 90, cpPct: 0, cpMax: 0 } as any,
      medicine: null,
    }
    const w = mountCard({ buffs })
    await w.find('[data-test="count-control"]').setValue('2')
    await w.find('[data-test="run-check"]').trigger('click')
    await flushPromises()
    expect(vi.mocked(solveCraftForRecipe).mock.calls[0][2]).toMatchObject({ buffs })
  })

  // #133: a non-feasible (unconfirmed) advice must NOT be loadable — seeding the
  // playground from an unconfirmed plan would present it as a real starting point.
  it('#133: load-reverse is disabled when the advice status is not feasible', () => {
    const infeasible: MeldAdvice = { ...reverseAdvice, status: 'infeasible' }
    const w = mountCard({ advice: infeasible })
    const btn = w.find('[data-test="load-reverse"]').element as HTMLButtonElement
    expect(btn.disabled).toBe(true)
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

  // #141 AC2: a physically-impossible count (e.g. 999 melds) must not slip through
  // to a can-hq / override emit. The input is capped at the total slot budget.
  it('#141 AC2: count is capped at the physical slot maximum', async () => {
    const w = mountCard()
    const input = w.find('[data-test="count-control"]')
    expect((input.element as HTMLInputElement).max).toBe(String(MAX_MELD_COUNT))
    await input.setValue('999')
    expect(
      (w.find('[data-test="count-control"]').element as HTMLInputElement).value,
    ).toBe(String(MAX_MELD_COUNT))
  })

  // #141 AC4: only the host shows the single "已套用模擬鑲嵌" toast; the card
  // must not double it.
  it('#141 AC4: apply does not raise its own success toast (host owns it)', async () => {
    const { ElMessage } = await import('element-plus')
    const w = mountCard()
    await w.find('[data-test="load-reverse"]').trigger('click')
    vi.mocked(ElMessage.success).mockClear() // drop the load-reverse toast
    await w.find('[data-test="apply-override"]').trigger('click')
    expect(w.emitted('apply')).toBeTruthy()
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  // #141 AC3: clearing the playground also revokes any override it applied, so the
  // host drops the chip instead of stranding a phantom +Δ.
  it('#141 AC3: clear emits clear-override', async () => {
    const w = mountCard()
    await w.find('[data-test="load-reverse"]').trigger('click')
    await w.find('[data-test="clear"]').trigger('click')
    expect(w.emitted('clear-override')).toBeTruthy()
  })

  // #141 AC3: in-place undo — the card itself can revoke the applied override,
  // not only the distant FoodMedicine chip ✕.
  it('#141 AC3: an in-place undo appears while an override is active and emits clear-override', async () => {
    const w = mountCard({ overrideActive: true })
    const undo = w.find('[data-test="undo-override"]')
    expect(undo.exists()).toBe(true)
    await undo.trigger('click')
    expect(w.emitted('clear-override')).toBeTruthy()
  })

  it('#141 AC3: no in-place undo when no override is active', () => {
    const w = mountCard({ overrideActive: false })
    expect(w.find('[data-test="undo-override"]').exists()).toBe(false)
  })

  // #129 tweak B: the forward playground sat permanently expanded at the bottom
  // of the Step 2 cascade, burying it below a long advisor card. Collapse it by
  // default behind a toggle so its entry point is reachable without scrolling.
  // v-show hides via inline `display: none`; this test-utils build's isVisible()
  // ignores that, so assert the rendered style directly (the real browser hides).
  const hidden = (w: ReturnType<typeof mountCard>) =>
    (w.find('[data-test="mpg-body"]').attributes('style') ?? '').includes('display: none')

  it('#129 B: the forward picker is collapsed by default and a toggle reveals it', async () => {
    const w = mountCard()
    const toggle = w.find('[data-test="pg-toggle"]')
    expect(toggle.exists()).toBe(true)
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(hidden(w)).toBe(true)

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(hidden(w)).toBe(false)
  })

  it('#129 B: loading the reverse suggestion auto-expands the picker', async () => {
    const w = mountCard()
    expect(hidden(w)).toBe(true)
    await w.find('[data-test="load-reverse"]').trigger('click')
    expect(hidden(w)).toBe(false)
  })

  it('#129 B: an active override keeps the picker open so the applied state is visible', () => {
    const w = mountCard({ overrideActive: true })
    expect(hidden(w)).toBe(false)
  })

  // Code-review (PR #158): when live state (override / selections) pins the picker
  // open, the toggle can't collapse it (by design — collapsing must never hide
  // live state). So the toggle must read as inert, not a clickable no-op.
  it('#129 B: the toggle is disabled while live state pins the picker open', () => {
    const w = mountCard({ overrideActive: true })
    const toggle = w.find('[data-test="pg-toggle"]')
    expect((toggle.element as HTMLButtonElement).disabled).toBe(true)
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })

  it('#129 B: the toggle round-trips open→closed when nothing pins it open', async () => {
    const w = mountCard({ advice: null })
    const toggle = w.find('[data-test="pg-toggle"]')
    expect(hidden(w)).toBe(true)
    await toggle.trigger('click')
    expect(hidden(w)).toBe(false)
    await toggle.trigger('click')
    expect(hidden(w)).toBe(true) // must be able to collapse again
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { MeldAdvice } from '@/services/meld-advisor'

// --- Mocks ---------------------------------------------------------------
// useSimulator imports the ElMessage CSS side-effect at module scope, which
// the node/happy-dom test runner can't resolve as a raw .css file. Stub it.
vi.mock('element-plus/es/components/message/style/css', () => ({}))
// ElMessage itself is a UI side-effect; stub so handlers don't blow up.
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

// syncFromStores writes to localStorage / analytics; stub it out.
vi.mock('@/utils/user-properties', () => ({ syncFromStores: vi.fn() }))
vi.mock('@/utils/analytics', () => ({ trackEvent: vi.fn() }))

// The WASM worker is never needed (actions stay empty), but stub to be safe.
vi.mock('@/solver/worker', () => ({
  waitForWasm: vi.fn().mockResolvedValue(undefined),
  simulateCraftDetail: vi.fn().mockResolvedValue({ steps: [] }),
}))
vi.mock('@/api/xivapi', () => ({
  getRecipe: vi.fn(),
  findRecipesByItemName: vi.fn(),
}))

// useMeldAdvisor — inject a controllable advice ref so handleApplyMeld can read
// the cost-optimal steps for the chip label.
const adviceRef = ref<MeldAdvice | 'loading' | 'stale' | 'no-market' | null>(null)
const markStaleMock = vi.fn()
const runAdvisorMock = vi.fn()
vi.mock('@/composables/useMeldAdvisor', () => ({
  useMeldAdvisor: () => ({
    advice: adviceRef,
    runAdvisor: runAdvisorMock,
    markStale: markStaleMock,
  }),
}))

import { useSimulator } from '@/composables/useSimulator'
import { useRecipeStore, type Recipe } from '@/stores/recipe'
import { useGearsetsStore } from '@/stores/gearsets'
import { useSettingsStore } from '@/stores/settings'

const RECIPE: Recipe = {
  id: 1, itemId: 100, name: 'Parity', icon: '', job: 'CRP',
  level: 90, stars: 0, canHq: true, materialQualityFactor: 75, amountResult: 1,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
    durability: 80, suggestedCraftsmanship: 0,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 80,
  },
}

const ADVICE: MeldAdvice = {
  status: 'feasible',
  alreadyMeetsThreshold: false,
  hqSufficient: false,
  rankedByCount: false,
  noHqLever: false,
  costOptimal: {
    feasible: true,
    deltaStats: { craftsmanship: 0, control: 432, cp: 0 },
    steps: [{ stat: 'control', grade: 12, placedCount: 8, expectedCount: 8, unitPrice: 8000, subtotal: 64000 }],
    totalGil: 64000, confirmedBySolver: true,
  },
}

function seedCrpGearset() {
  const gearsets = useGearsetsStore()
  gearsets.updateGearset('CRP', { level: 100, craftsmanship: 4000, control: 3800, cp: 600 })
  return gearsets
}

describe('useSimulator — session-only meld override (Slice C)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    adviceRef.value = null
    markStaleMock.mockClear()
    runAdvisorMock.mockClear()
  })

  // #136: the ride-along advisor must solve on the screen's effectiveStats — so
  // onSolveComplete hands it the active food/medicine buffs captured from the
  // FoodMedicine card.
  it('#136: onSolveComplete forwards the active food/medicine buffs to the advisor', () => {
    seedCrpGearset()
    useRecipeStore().setRecipe(RECIPE)
    useSettingsStore().meldAdvice = true // opt in so the ride-along advisor runs
    const sim = useSimulator()
    const food = { id: 1, name: 'f', control: { percent: 5, max: 100 } }

    sim.onBuffsUpdate({ food, medicine: null })
    runAdvisorMock.mockClear()
    sim.onSolveComplete({ actions: ['x'] })

    expect(runAdvisorMock).toHaveBeenCalledWith(
      RECIPE, expect.anything(), expect.any(Number), { food, medicine: null },
    )
  })

  // Meld advice is opt-in (settings.meldAdvice, default OFF): a plain craft must
  // not trigger the ride-along meld solver.
  it('onSolveComplete does NOT run the advisor when meldAdvice is off (default)', () => {
    seedCrpGearset()
    useRecipeStore().setRecipe(RECIPE)
    const sim = useSimulator()
    runAdvisorMock.mockClear()

    sim.onSolveComplete({ actions: ['x'] })

    expect(runAdvisorMock).not.toHaveBeenCalled()
  })

  // Toggling meldAdvice ON after a solve (it was off during the solve) runs the
  // advisor once for the current result so the card populates without a re-solve.
  it('turning meldAdvice on after a solve runs the advisor for the current result', async () => {
    seedCrpGearset()
    useRecipeStore().setRecipe(RECIPE)
    const settings = useSettingsStore()
    const sim = useSimulator()

    sim.onSolveComplete({ actions: ['x'] }) // off → no run
    expect(runAdvisorMock).not.toHaveBeenCalled()

    settings.meldAdvice = true
    await nextTick()

    expect(runAdvisorMock).toHaveBeenCalled()
  })

  // #136: changing food/medicine after a solve shifts the solve basis, so the
  // prior advice must go stale (same contract as meldOverride in #137).
  it('#136: changing the active buffs marks prior advice stale', async () => {
    seedCrpGearset()
    useRecipeStore().setRecipe(RECIPE)
    adviceRef.value = ADVICE
    const sim = useSimulator()
    markStaleMock.mockClear()

    sim.onBuffsUpdate({ food: { id: 1, name: 'f', control: { percent: 5, max: 100 } }, medicine: null })
    await nextTick()

    expect(markStaleMock).toHaveBeenCalled()
  })

  // #137: applying a meld only changes the session meldOverride (folded into
  // effectiveStats), not the gearset — so unless meldOverride is watched, the
  // advisor card keeps showing the pre-apply numbers until a manual re-solve.
  it('applying a meld marks the advice stale so the card stops showing pre-apply numbers (#137)', async () => {
    seedCrpGearset()
    const recipeStore = useRecipeStore()
    recipeStore.setRecipe(RECIPE)
    adviceRef.value = ADVICE

    const sim = useSimulator()
    markStaleMock.mockClear() // ignore any stale marks during setup wiring

    sim.handleApplyMeld({ craftsmanship: 0, control: 432, cp: 0 })
    await nextTick()

    expect(markStaleMock).toHaveBeenCalled()
  })

  it('handleApplyMeld sets a session override and does NOT mutate the gearset store', () => {
    const gearsets = seedCrpGearset()
    const recipeStore = useRecipeStore()
    recipeStore.setRecipe(RECIPE)
    adviceRef.value = ADVICE

    const sim = useSimulator()
    const before = { ...gearsets.gearsets.CRP }

    sim.handleApplyMeld({ craftsmanship: 0, control: 432, cp: 0 })

    expect(sim.meldOverride.value).toEqual({ craftsmanship: 0, control: 432, cp: 0 })
    // chip label built from the advice's cost-optimal steps
    expect(sim.meldOverrideLabel.value).toBe('8 顆 加工魔晶石Ⅻ')
    // gearset store untouched
    expect(gearsets.gearsets.CRP).toEqual(before)
  })

  it('clearMeldOverride resets both refs', () => {
    seedCrpGearset()
    useRecipeStore().setRecipe(RECIPE)
    adviceRef.value = ADVICE
    const sim = useSimulator()

    sim.handleApplyMeld({ craftsmanship: 0, control: 432, cp: 0 })
    expect(sim.meldOverride.value).not.toBeNull()

    sim.clearMeldOverride()
    expect(sim.meldOverride.value).toBeNull()
    expect(sim.meldOverrideLabel.value).toBeNull()
  })

  it('switching recipe resets the override', async () => {
    seedCrpGearset()
    const recipeStore = useRecipeStore()
    recipeStore.setRecipe(RECIPE)
    adviceRef.value = ADVICE
    const sim = useSimulator()

    sim.handleApplyMeld({ craftsmanship: 0, control: 432, cp: 0 })
    expect(sim.meldOverride.value).not.toBeNull()

    // switch to a different recipe id → the watcher fires
    recipeStore.setRecipe({ ...RECIPE, id: 2 })
    await Promise.resolve()
    expect(sim.meldOverride.value).toBeNull()
    expect(sim.meldOverrideLabel.value).toBeNull()
  })

  it("handleSaveMeldToGearset('this') writes base+Δ to that job and clears the override", () => {
    const gearsets = seedCrpGearset()
    useRecipeStore().setRecipe(RECIPE)
    adviceRef.value = ADVICE
    const sim = useSimulator()

    sim.handleApplyMeld({ craftsmanship: 10, control: 432, cp: 5 })
    sim.handleSaveMeldToGearset('this')

    expect(gearsets.gearsets.CRP.craftsmanship).toBe(4010)
    expect(gearsets.gearsets.CRP.control).toBe(4232)
    expect(gearsets.gearsets.CRP.cp).toBe(605)
    expect(sim.meldOverride.value).toBeNull()
  })

  it("handleSaveMeldToGearset('all') adds the delta to every job and clears", () => {
    const gearsets = useGearsetsStore()
    // distinct per-job raw stats to prove the delta is added, not overwritten
    gearsets.updateGearset('CRP', { level: 100, craftsmanship: 4000, control: 3800, cp: 600 })
    gearsets.updateGearset('BSM', { level: 100, craftsmanship: 1000, control: 900, cp: 500 })
    useRecipeStore().setRecipe(RECIPE)
    adviceRef.value = ADVICE
    const sim = useSimulator()

    sim.handleApplyMeld({ craftsmanship: 0, control: 432, cp: 0 })
    sim.handleSaveMeldToGearset('all')

    expect(gearsets.gearsets.CRP.control).toBe(4232)
    expect(gearsets.gearsets.BSM.control).toBe(1332)
    // raw craftsmanship preserved per-job (delta was 0 for craftsmanship)
    expect(gearsets.gearsets.CRP.craftsmanship).toBe(4000)
    expect(gearsets.gearsets.BSM.craftsmanship).toBe(1000)
    expect(sim.meldOverride.value).toBeNull()
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
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
vi.mock('@/composables/useMeldAdvisor', () => ({
  useMeldAdvisor: () => ({
    advice: adviceRef,
    runAdvisor: vi.fn(),
    markStale: vi.fn(),
  }),
}))

import { useSimulator } from '@/composables/useSimulator'
import { useRecipeStore, type Recipe } from '@/stores/recipe'
import { useGearsetsStore } from '@/stores/gearsets'

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
  alreadyMeetsThreshold: false,
  hqSufficient: false,
  rankedByCount: false,
  costOptimal: {
    feasible: true,
    deltaStats: { craftsmanship: 0, control: 432, cp: 0 },
    steps: [{ stat: 'control', grade: 12, placedCount: 8, expectedCount: 8, unitPrice: 8000, subtotal: 64000 }],
    totalGil: 64000, confirmedBySolver: true,
  },
  bis: { feasible: true, deltaStats: { craftsmanship: 0, control: 0, cp: 0 }, steps: [], totalGil: 0, confirmedBySolver: false },
  gapGil: 0,
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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMeldAdvisor } from '@/composables/useMeldAdvisor'
import type { MeldAdvice } from '@/services/meld-advisor'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

// Mock the heavy async dependencies
vi.mock('@/api/universalis', () => ({
  fetchMateriaPriceMap: vi.fn().mockResolvedValue(new Map()),
}))

vi.mock('@/services/meld-advisor', () => ({
  adviseMeld: vi.fn(),
}))

vi.mock('@/engine/materia', () => ({
  BIS_REFERENCE: { craftsmanship: 4785, control: 4758, cp: 646 },
}))

const { fetchMateriaPriceMap } = await import('@/api/universalis')
const { adviseMeld } = await import('@/services/meld-advisor')

const stubRecipe = { id: 1, name: 'Test', job: 'CRP' } as unknown as Recipe
const stubGearset: GearsetStats = {
  level: 100,
  craftsmanship: 4000,
  control: 3900,
  cp: 600,
  specialist: false,
}

const stubAdvice: MeldAdvice = {
  costOptimal: {
    feasible: true,
    deltaStats: { craftsmanship: 0, control: 0, cp: 0 },
    steps: [],
    totalGil: 0,
    confirmedBySolver: true,
  },
  bis: {
    feasible: true,
    deltaStats: { craftsmanship: 785, control: 858, cp: 46 },
    steps: [],
    totalGil: 100000,
    confirmedBySolver: false,
  },
  gapGil: 100000,
  alreadyMeetsThreshold: true,
}

describe('useMeldAdvisor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adviseMeld).mockResolvedValue(stubAdvice)
  })

  it('starts with null advice', () => {
    const { advice } = useMeldAdvisor(() => 'Carbuncle')
    expect(advice.value).toBeNull()
  })

  it('markStale turns a result object to "stale"', async () => {
    const { advice, runAdvisor, markStale } = useMeldAdvisor(() => 'Carbuncle')
    await runAdvisor(stubRecipe, stubGearset, 0)
    expect(typeof advice.value).toBe('object')
    markStale()
    expect(advice.value).toBe('stale')
  })

  it('markStale does nothing when advice is null', () => {
    const { advice, markStale } = useMeldAdvisor(() => 'Carbuncle')
    markStale()
    expect(advice.value).toBeNull()
  })

  it('markStale does nothing when advice is "loading"', async () => {
    const { advice, runAdvisor, markStale } = useMeldAdvisor(() => 'Carbuncle')
    // Make the promise hang so advice stays "loading"
    vi.mocked(fetchMateriaPriceMap).mockImplementation(
      () => new Promise(() => {}),
    )
    void runAdvisor(stubRecipe, stubGearset, 0)
    expect(advice.value).toBe('loading')
    markStale()
    expect(advice.value).toBe('loading')
  })

  it('second runAdvisor call cancels the first', async () => {
    // First call hangs
    let resolveFirst!: () => void
    vi.mocked(fetchMateriaPriceMap).mockImplementationOnce(
      () => new Promise<Map<number, never>>((res) => { resolveFirst = () => res(new Map()) }),
    )
    // Second call resolves immediately
    vi.mocked(fetchMateriaPriceMap).mockResolvedValueOnce(new Map())

    const { advice, runAdvisor } = useMeldAdvisor(() => 'Carbuncle')
    const first = runAdvisor(stubRecipe, stubGearset, 0)
    // Kick off second before first resolves
    const second = runAdvisor(stubRecipe, stubGearset, 0)
    // Now unblock first
    resolveFirst()
    await first
    await second
    // Result should be the outcome of the second call (stub advice), not null from first being cancelled
    expect(advice.value).toEqual(stubAdvice)
    // adviseMeld should have been called exactly once (for the second run — the
    // first was cancelled after fetchMateriaPriceMap)
    expect(vi.mocked(adviseMeld)).toHaveBeenCalledTimes(1)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMeldAdvisor } from '@/composables/useMeldAdvisor'
import type { MeldAdvice } from '@/services/meld-advisor'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { MarketData } from '@/api/universalis'

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
  isSpecialist: false,
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
  hqSufficient: true,
  rankedByCount: false,
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

  // #135: no market server must NOT hard-block before the engine. The advisor
  // runs with an empty price map so adviseMeld degrades to the count-ranked
  // fallback (ADR-0002), instead of short-circuiting to the 'no-market' state.
  it('with no market server, runs the engine with an empty price map instead of hard-blocking (#135)', async () => {
    const rankedAdvice: MeldAdvice = {
      ...stubAdvice,
      alreadyMeetsThreshold: false,
      hqSufficient: false,
      rankedByCount: true,
    }
    vi.mocked(adviseMeld).mockResolvedValue(rankedAdvice)

    const { advice, runAdvisor } = useMeldAdvisor(() => '') // no server selected
    await runAdvisor(stubRecipe, stubGearset, 0)

    // Did NOT short-circuit to the no-market hard block.
    expect(advice.value).not.toBe('no-market')
    // The engine ran exactly once, with an empty price map (count-ranked path).
    expect(vi.mocked(adviseMeld)).toHaveBeenCalledTimes(1)
    const priceMapArg = vi.mocked(adviseMeld).mock.calls[0][2]
    expect(priceMapArg instanceof Map).toBe(true)
    expect(priceMapArg.size).toBe(0)
    // No fetch is attempted without a server.
    expect(vi.mocked(fetchMateriaPriceMap)).not.toHaveBeenCalled()
    expect(advice.value).toEqual(rankedAdvice)
  })

  // #135: with a server, behaviour is unchanged — fetch the price map and cost
  // the plan by gil.
  it('with a market server, fetches the price map and costs by gil (#135 — server branch unchanged)', async () => {
    // clearAllMocks() does not restore mockImplementation, so re-assert the
    // default resolving fetch (a prior test leaves a hanging implementation).
    vi.mocked(fetchMateriaPriceMap).mockResolvedValue(new Map())
    const { runAdvisor } = useMeldAdvisor(() => 'Gilgamesh')
    await runAdvisor(stubRecipe, stubGearset, 0)

    expect(vi.mocked(fetchMateriaPriceMap)).toHaveBeenCalledWith('Gilgamesh')
    expect(vi.mocked(adviseMeld)).toHaveBeenCalledTimes(1)
    // The price map handed to the engine is the one fetched for the server.
    const fetched = await vi.mocked(fetchMateriaPriceMap).mock.results[0].value
    expect(vi.mocked(adviseMeld).mock.calls[0][2]).toBe(fetched)
  })

  it('second runAdvisor call cancels the first', async () => {
    // First call hangs
    let resolveFirst!: () => void
    vi.mocked(fetchMateriaPriceMap).mockImplementationOnce(
      () => new Promise<Map<number, MarketData>>((res) => { resolveFirst = () => res(new Map()) }),
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

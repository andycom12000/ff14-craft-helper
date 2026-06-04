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
  status: 'feasible',
  costOptimal: {
    feasible: true,
    deltaStats: { craftsmanship: 0, control: 0, cp: 0 },
    steps: [],
    totalGil: 0,
    confirmedBySolver: true,
  },
  alreadyMeetsThreshold: true,
  hqSufficient: true,
  rankedByCount: false,
  noHqLever: false,
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

  // #136: the advisor must solve on the SAME effectiveStats the screen uses, so
  // runAdvisor threads the active food/medicine buffs straight into adviseMeld
  // (the engine then folds them after Soul, per ADR-0001).
  it('#136: forwards the active food/medicine buffs to adviseMeld', async () => {
    const buffs = {
      food: { id: 36060, name: '高山茶', craftsmanship: { percent: 5, max: 200 } },
      medicine: null,
    }
    const { runAdvisor } = useMeldAdvisor(() => 'Carbuncle')
    await runAdvisor(stubRecipe, stubGearset, 0, buffs)
    expect(vi.mocked(adviseMeld).mock.calls[0][3]).toMatchObject({ buffs })
  })

  it('#136: omitting buffs leaves adviseMeld buff-free (parity with pre-#136)', async () => {
    const { runAdvisor } = useMeldAdvisor(() => 'Carbuncle')
    await runAdvisor(stubRecipe, stubGearset, 0)
    expect(vi.mocked(adviseMeld).mock.calls[0][3].buffs).toBeUndefined()
  })

  // #132: the run is abortable. runAdvisor threads an AbortSignal into adviseMeld
  // so a superseded/cancelled run truly tears down its in-flight WASM solve (the
  // worker slot is freed), not just cooperatively ignored on return.
  it('#132: forwards an AbortSignal to adviseMeld', async () => {
    const { runAdvisor } = useMeldAdvisor(() => 'Carbuncle')
    await runAdvisor(stubRecipe, stubGearset, 0)
    const opts = vi.mocked(adviseMeld).mock.calls[0][3]
    expect(opts.signal).toBeInstanceOf(AbortSignal)
  })

  it('#132: cancel() aborts the in-flight signal and clears advice to null', async () => {
    let captured: AbortSignal | undefined
    vi.mocked(adviseMeld).mockImplementation((_r, _g, _p, opts: any) => {
      captured = opts.signal
      return new Promise(() => { /* hang */ })
    })
    const { advice, runAdvisor, cancel } = useMeldAdvisor(() => '') // empty world → straight to adviseMeld
    void runAdvisor(stubRecipe, stubGearset, 0)
    await Promise.resolve()
    expect(captured).toBeInstanceOf(AbortSignal)
    expect(captured!.aborted).toBe(false)
    expect(advice.value).toBe('loading')

    cancel()
    expect(captured!.aborted).toBe(true)
    expect(advice.value).toBeNull()
  })

  it('#132: a second runAdvisor aborts the first run\'s signal', async () => {
    const signals: AbortSignal[] = []
    vi.mocked(adviseMeld).mockImplementation((_r, _g, _p, opts: any) => {
      signals.push(opts.signal)
      return new Promise(() => { /* hang */ })
    })
    const { runAdvisor } = useMeldAdvisor(() => '')
    void runAdvisor(stubRecipe, stubGearset, 0)
    await Promise.resolve()
    void runAdvisor(stubRecipe, stubGearset, 0)
    await Promise.resolve()

    expect(signals).toHaveLength(2)
    expect(signals[0].aborted).toBe(true)  // superseded
    expect(signals[1].aborted).toBe(false)
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

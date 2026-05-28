import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { aggregateByWorld, getMarketData, fetchMateriaPriceMap } from '@/api/universalis'
import type { MarketListing } from '@/api/universalis'
import { MATERIA_GRADES } from '@/engine/materia'
import { trackEvent } from '@/utils/analytics'

vi.mock('@/utils/analytics', () => ({
  trackEvent: vi.fn(),
  trackError: vi.fn(),
}))

function makeListing(overrides: Partial<MarketListing>): MarketListing {
  return {
    pricePerUnit: 100,
    quantity: 1,
    total: 100,
    hq: false,
    worldName: '巴哈姆特',
    lastReviewTime: 1700000000,
    ...overrides,
  }
}

describe('aggregateByWorld', () => {
  it('groups listings by world and computes min/avg prices', () => {
    const listings: MarketListing[] = [
      makeListing({ pricePerUnit: 500, worldName: '巴哈姆特', hq: false }),
      makeListing({ pricePerUnit: 600, worldName: '巴哈姆特', hq: false }),
      makeListing({ pricePerUnit: 800, worldName: '巴哈姆特', hq: true }),
      makeListing({ pricePerUnit: 400, worldName: '伊弗利特', hq: false }),
    ]

    const result = aggregateByWorld(listings)

    expect(result).toHaveLength(2)
    // Sorted by NQ min price ascending — 伊弗利特 (400) first
    expect(result[0].worldName).toBe('伊弗利特')
    expect(result[0].minPriceNQ).toBe(400)

    expect(result[1].worldName).toBe('巴哈姆特')
    expect(result[1].minPriceNQ).toBe(500)
    expect(result[1].avgPriceNQ).toBe(550)
    expect(result[1].minPriceHQ).toBe(800)
  })

  it('returns empty array for empty listings', () => {
    expect(aggregateByWorld([])).toEqual([])
  })

  it('handles world with only HQ listings', () => {
    const listings: MarketListing[] = [
      makeListing({ pricePerUnit: 900, worldName: '鳳凰', hq: true }),
    ]

    const result = aggregateByWorld(listings)

    expect(result).toHaveLength(1)
    expect(result[0].minPriceNQ).toBe(0)
    expect(result[0].minPriceHQ).toBe(900)
  })
})

describe('universalis_fetch tracking', () => {
  beforeEach(() => {
    vi.mocked(trackEvent).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('emits universalis_fetch with ok=true on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ itemID: 5057, listings: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await getMarketData('Tonberry', 5057)

    expect(trackEvent).toHaveBeenCalledWith(
      'universalis_fetch',
      expect.objectContaining({
        server: 'Tonberry',
        item_count: 1,
        ok: true,
        status: 200,
      }),
    )
    const call = vi.mocked(trackEvent).mock.calls[0][1]!
    expect(typeof call.duration_ms).toBe('number')
  })

  it('emits universalis_fetch with ok=false on HTTP error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getMarketData('Tonberry', 5057)).rejects.toThrow()

    expect(trackEvent).toHaveBeenCalledWith(
      'universalis_fetch',
      expect.objectContaining({ ok: false, status: 404, server: 'Tonberry' }),
    )
  })
})

describe('fetchUniversalis retry on transient failures', () => {
  beforeEach(() => {
    vi.mocked(trackEvent).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retries on TypeError (network/CORS) and succeeds on second attempt', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ itemID: 5057, listings: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getMarketData('Tonberry', 5057)
    expect(result).toMatchObject({ itemID: 5057 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries on 5xx response and succeeds on retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ itemID: 5057, listings: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getMarketData('Tonberry', 5057)
    expect(result).toMatchObject({ itemID: 5057 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry on 4xx client error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getMarketData('Tonberry', 5057)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up after max retries (3 attempts) on persistent TypeError', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getMarketData('Tonberry', 5057)).rejects.toThrow(/Failed to fetch/)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('fetchMateriaPriceMap', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a Map keyed by every materia itemId', async () => {
    // Build a fake Universalis multi-item response: { items: { [id]: MarketData } }
    const fakeItems: Record<string, object> = {}
    for (const m of MATERIA_GRADES) {
      fakeItems[String(m.itemId)] = {
        itemID: m.itemId,
        lastUploadTime: 0,
        currentAveragePrice: 0,
        currentAveragePriceNQ: 0,
        currentAveragePriceHQ: 0,
        minPriceNQ: 1000,
        minPriceHQ: 1200,
        listings: [],
        recentHistory: [],
      }
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: fakeItems }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const map = await fetchMateriaPriceMap('Tonberry')

    expect(map).toBeInstanceOf(Map)
    for (const m of MATERIA_GRADES) {
      expect(map.has(m.itemId)).toBe(true)
    }
  })

  it('calls Universalis with all materia item IDs in one request', async () => {
    const fakeItems: Record<string, object> = {}
    for (const m of MATERIA_GRADES) {
      fakeItems[String(m.itemId)] = { itemID: m.itemId, listings: [] }
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: fakeItems }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await fetchMateriaPriceMap('Chocobo')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calledUrl: string = fetchMock.mock.calls[0][0]
    // URL should contain the world name
    expect(calledUrl).toContain('Chocobo')
    // URL should include at least one materia item ID
    expect(calledUrl).toContain(String(MATERIA_GRADES[0].itemId))
  })
})

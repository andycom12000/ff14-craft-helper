import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock garland-core (the source of truth for localized names) so the tests
// can focus on zone-meta's xivapi map-search wiring + cache behavior.
// ---------------------------------------------------------------------------

const { fakeLocationNames, fakeNpcNames } = vi.hoisted(() => ({
  fakeLocationNames: {
    146: { en: 'Lower La Noscea', ja: 'ラノシア低地', 'zh-CN': '拉诺西亚低地', 'zh-TW': '拉諾西亞低地' },
    153: { en: 'Eastern La Noscea', ja: '東ラノシア', 'zh-CN': '东拉诺西亚', 'zh-TW': '東拉諾西亞' },
    155: { en: 'Western La Noscea', ja: '西ラノシア', 'zh-CN': '西拉诺西亚', 'zh-TW': '西拉諾西亞' },
  } as Record<number, Record<string, string>>,
  fakeNpcNames: {
    1001: {
      en: 'Eastern La Noscea Merchant',
      ja: '東ラノシア商人',
      'zh-CN': '东拉诺西亚商人',
      'zh-TW': '東拉諾西亞商人',
    },
  } as Record<number, Record<string, string>>,
}))

vi.mock('@/services/garland-core', () => ({
  loadAllLocationNames: vi.fn(async () => {}),
  getLocationName: vi.fn(
    (zoneId: number, locale: string) =>
      fakeLocationNames[zoneId]?.[locale] ?? null,
  ),
  fetchNpcNameBulkGarland: vi.fn(async (ids: number[]) => {
    const m = new Map<number, Map<string, string>>()
    for (const id of ids) {
      const data = fakeNpcNames[id]
      if (!data) continue
      const inner = new Map<string, string>()
      for (const [k, v] of Object.entries(data)) inner.set(k, v)
      m.set(id, inner)
    }
    return m
  }),
  getNpcNameSync: vi.fn(
    (npcId: number, locale: string) =>
      fakeNpcNames[npcId]?.[locale] ?? null,
  ),
}))

// Re-import after mock for direct spy access in tests below.
import * as garlandCore from '@/services/garland-core'
const loadAllLocationNames = garlandCore.loadAllLocationNames as ReturnType<typeof vi.fn>
const fetchNpcNameBulkGarland = garlandCore.fetchNpcNameBulkGarland as ReturnType<typeof vi.fn>

import {
  fetchZoneMetaBulk,
  getZoneMetaSync,
  fetchNpcNameBulk,
  getNpcNameSync,
  __clearCache,
} from '@/services/zone-meta'

// ---------------------------------------------------------------------------
// Mock fetch helper — only the Map search URL is used directly by zone-meta.
// ---------------------------------------------------------------------------

const PATTERN_MAP_SEARCH = /\/search\?sheets=Map/

const fakeMapSearchResponse = {
  results: [
    { fields: { Id: 'r1f1/00', SizeFactor: 200, PlaceName: { value: 146 } } },
    { fields: { Id: 'r1f2/00', SizeFactor: 200, PlaceName: { value: 153 } } },
    { fields: { Id: 'r1f3/00', SizeFactor: 200, PlaceName: { value: 155 } } },
  ],
}

function mockMapSearch(body: unknown) {
  return vi.fn(async (url: string) => {
    if (PATTERN_MAP_SEARCH.test(url)) {
      return { ok: true, json: async () => body } as unknown as Response
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
  })
}

beforeEach(() => {
  __clearCache()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// fetchZoneMetaBulk
// ---------------------------------------------------------------------------

describe('fetchZoneMetaBulk', () => {
  it('issues exactly one Map-search fetch for N zoneIds (names come from garland-core)', async () => {
    const fetchSpy = mockMapSearch(fakeMapSearchResponse)
    vi.stubGlobal('fetch', fetchSpy)

    await fetchZoneMetaBulk([146, 153, 155])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(loadAllLocationNames).toHaveBeenCalled()
  })

  it('second call with same ids does not trigger additional fetches', async () => {
    const fetchSpy = mockMapSearch(fakeMapSearchResponse)
    vi.stubGlobal('fetch', fetchSpy)

    await fetchZoneMetaBulk([146, 153, 155])
    const callsAfterFirst = fetchSpy.mock.calls.length

    await fetchZoneMetaBulk([146, 153, 155])
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst)
  })

  it('populates zoneNameByLocale for every supported locale via garland-core', async () => {
    const fetchSpy = mockMapSearch(fakeMapSearchResponse)
    vi.stubGlobal('fetch', fetchSpy)

    await fetchZoneMetaBulk([146])
    const meta = getZoneMetaSync(146)
    expect(meta).not.toBeNull()
    expect(meta!.zoneNameByLocale.get('en')).toBe('Lower La Noscea')
    expect(meta!.zoneNameByLocale.get('ja')).toBe('ラノシア低地')
    expect(meta!.zoneNameByLocale.get('zh-CN')).toBe('拉诺西亚低地')
    expect(meta!.zoneNameByLocale.get('zh-TW')).toBe('拉諾西亞低地')
  })

  it('concurrent calls for same ids share one in-flight promise', async () => {
    const fetchSpy = mockMapSearch(fakeMapSearchResponse)
    vi.stubGlobal('fetch', fetchSpy)

    await Promise.all([fetchZoneMetaBulk([146]), fetchZoneMetaBulk([146])])

    // Map search fires exactly once even though two callers asked for it.
    const mapSearchCalls = fetchSpy.mock.calls.filter((c) =>
      PATTERN_MAP_SEARCH.test(c[0] as string),
    )
    expect(mapSearchCalls.length).toBe(1)
  })

  it('builds mapAssetUrl from Map.Id via buildMapAssetUrl', async () => {
    const fetchSpy = mockMapSearch({
      results: [
        { fields: { Id: 'r1f1/00', SizeFactor: 200, PlaceName: { value: 146 } } },
      ],
    })
    vi.stubGlobal('fetch', fetchSpy)

    await fetchZoneMetaBulk([146])
    const meta = getZoneMetaSync(146)
    expect(meta).not.toBeNull()
    expect(meta!.mapAssetUrl).toBe('ui/map/r1f1/00/r1f100_m.tex')
  })

  it('does not throw when fetch errors; subsequent successful call populates cache', async () => {
    const failFetch = vi.fn(async () => {
      throw new Error('network error')
    })
    vi.stubGlobal('fetch', failFetch)
    await expect(fetchZoneMetaBulk([146])).resolves.toBeDefined()
    __clearCache()

    const successFetch = mockMapSearch(fakeMapSearchResponse)
    vi.stubGlobal('fetch', successFetch)
    await fetchZoneMetaBulk([146])
    const meta = getZoneMetaSync(146)
    expect(meta).not.toBeNull()
    expect(meta!.zoneNameByLocale.get('en')).toBe('Lower La Noscea')
  })

  it('does not cache empty entries from failed fetches — retry succeeds', async () => {
    // First call: garland-core mock still returns names so the entry IS cached
    // (we have at least the name). To simulate "no useful data at all", swap
    // the location-name mock to return null and fetch fails.
    const failFetch = vi.fn(async () => {
      throw new Error('network error')
    })
    vi.stubGlobal('fetch', failFetch)
    // Override location-name mock to also return null so nothing is cacheable.
    const garlandMod = await import('@/services/garland-core')
    const getLocationName = garlandMod.getLocationName as unknown as ReturnType<typeof vi.fn>
    getLocationName.mockReturnValueOnce(null)
    getLocationName.mockReturnValueOnce(null)
    getLocationName.mockReturnValueOnce(null)
    getLocationName.mockReturnValueOnce(null)

    await fetchZoneMetaBulk([999])
    expect(getZoneMetaSync(999)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// fetchNpcNameBulk — thin pass-through to garland-core's bulk fetcher.
// ---------------------------------------------------------------------------

describe('fetchNpcNameBulk', () => {
  it('delegates to garland-core and returns the same shape', async () => {
    const result = await fetchNpcNameBulk([1001])
    expect(fetchNpcNameBulkGarland).toHaveBeenCalledWith([1001])
    expect(result.size).toBe(1)
    const m = result.get(1001)!
    expect(m.get('en')).toBe('Eastern La Noscea Merchant')
    expect(m.get('zh-TW')).toBe('東拉諾西亞商人')
  })

  it('getNpcNameSync re-exports the garland-core lookup', () => {
    expect(getNpcNameSync(1001, 'en')).toBe('Eastern La Noscea Merchant')
    expect(getNpcNameSync(1001, 'zh-TW')).toBe('東拉諾西亞商人')
    expect(getNpcNameSync(9999, 'en')).toBeNull()
  })
})

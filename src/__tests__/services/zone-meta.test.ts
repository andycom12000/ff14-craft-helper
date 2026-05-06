import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  fetchZoneMetaBulk,
  getZoneMetaSync,
  fetchNpcNameBulk,
  getNpcNameSync,
  __clearCache,
} from '@/services/zone-meta'

// ---------------------------------------------------------------------------
// Mock helper
// ---------------------------------------------------------------------------

const mockResponses = (
  responses: Array<{ pattern: string | RegExp; body: unknown }>,
) => {
  return vi.fn(async (url: string) => {
    for (const r of responses) {
      const matches =
        typeof r.pattern === 'string'
          ? url.includes(r.pattern)
          : r.pattern.test(url)
      if (matches)
        return { ok: true, json: async () => r.body } as unknown as Response
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
  })
}

// Unambiguous patterns:
//   PlaceName sheet:  .../sheet/PlaceName?rows=...
//   Map search:       .../search?sheets=Map&query=...
// We use regex to avoid the ambiguity of the string 'PlaceName' appearing
// in both the PlaceName sheet URL AND the Map search query string.
const PATTERN_PLACE_NAME = /\/sheet\/PlaceName/
const PATTERN_MAP_SEARCH = /\/search\?sheets=Map/
const PATTERN_NPC = /\/sheet\/ENpcResident/

// ---------------------------------------------------------------------------
// Shared fake API responses
// ---------------------------------------------------------------------------

const fakePlaceNameResponse = {
  rows: [
    {
      row_id: 146,
      fields: {
        Name: '拉诺西亚低地',
        Name_chs: '拉诺西亚低地',
        Name_en: 'Lower La Noscea',
        Name_ja: 'ラノシア低地',
      },
    },
    {
      row_id: 153,
      fields: {
        Name: '东拉诺西亚',
        Name_chs: '东拉诺西亚',
        Name_en: 'Eastern La Noscea',
        Name_ja: '東ラノシア',
      },
    },
    {
      row_id: 155,
      fields: {
        Name: '西拉诺西亚',
        Name_chs: '西拉诺西亚',
        Name_en: 'Western La Noscea',
        Name_ja: '西ラノシア',
      },
    },
  ],
}

const fakeMapSearchResponse = {
  results: [
    {
      fields: {
        Id: 'r1f1/00',
        SizeFactor: 200,
        PlaceName: { value: 146 },
      },
    },
    {
      fields: {
        Id: 'r1f2/00',
        SizeFactor: 200,
        PlaceName: { value: 153 },
      },
    },
    {
      fields: {
        Id: 'r1f3/00',
        SizeFactor: 200,
        PlaceName: { value: 155 },
      },
    },
  ],
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  __clearCache()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Test 1: at most 2 fetches for N zoneIds
// ---------------------------------------------------------------------------

describe('fetchZoneMetaBulk', () => {
  it('issues at most 2 fetches for N zoneIds (PlaceName + Map search)', async () => {
    const fetchSpy = mockResponses([
      { pattern: PATTERN_PLACE_NAME, body: fakePlaceNameResponse },
      { pattern: PATTERN_MAP_SEARCH, body: fakeMapSearchResponse },
    ])
    vi.stubGlobal('fetch', fetchSpy)

    await fetchZoneMetaBulk([146, 153, 155])

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  // -------------------------------------------------------------------------
  // Test 2: cache — second call with same ids does no extra fetch
  // -------------------------------------------------------------------------

  it('second call with same ids does not trigger additional fetches', async () => {
    const fetchSpy = mockResponses([
      { pattern: PATTERN_PLACE_NAME, body: fakePlaceNameResponse },
      { pattern: PATTERN_MAP_SEARCH, body: fakeMapSearchResponse },
    ])
    vi.stubGlobal('fetch', fetchSpy)

    await fetchZoneMetaBulk([146, 153, 155])
    const callCountAfterFirst = fetchSpy.mock.calls.length

    await fetchZoneMetaBulk([146, 153, 155])
    expect(fetchSpy.mock.calls.length).toBe(callCountAfterFirst)
  })

  // -------------------------------------------------------------------------
  // Test 3: zh-TW is sToT-converted from Name_chs
  // -------------------------------------------------------------------------

  it('zh-TW locale is sToT-converted from Name_chs', async () => {
    // '拉诺西亚低地' → sToT converts '诺'→'諾', '亚'→'亞'
    const fetchSpy = mockResponses([
      {
        pattern: PATTERN_PLACE_NAME,
        body: {
          rows: [
            {
              row_id: 146,
              fields: {
                Name: '拉诺西亚低地',
                Name_chs: '拉诺西亚低地',
                Name_en: 'Lower La Noscea',
                Name_ja: 'ラノシア低地',
              },
            },
          ],
        },
      },
      { pattern: PATTERN_MAP_SEARCH, body: { results: [] } },
    ])
    vi.stubGlobal('fetch', fetchSpy)

    await fetchZoneMetaBulk([146])
    const meta = getZoneMetaSync(146)
    expect(meta).not.toBeNull()

    const zhTw = meta!.zoneNameByLocale.get('zh-TW')
    expect(zhTw).toBeDefined()
    // '诺' → '諾' is in the s2t map
    expect(zhTw).toContain('諾')
    // '亚' → '亞' is in the s2t map
    expect(zhTw).toContain('亞')
  })

  // -------------------------------------------------------------------------
  // Test 4: inflight dedupe — concurrent calls share one network round-trip
  // -------------------------------------------------------------------------

  it('concurrent calls for same ids share one in-flight promise (at most 2 fetches total)', async () => {
    const fetchSpy = mockResponses([
      { pattern: PATTERN_PLACE_NAME, body: fakePlaceNameResponse },
      { pattern: PATTERN_MAP_SEARCH, body: fakeMapSearchResponse },
    ])
    vi.stubGlobal('fetch', fetchSpy)

    // Fire two concurrent calls with the same ID set.
    await Promise.all([
      fetchZoneMetaBulk([146]),
      fetchZoneMetaBulk([146]),
    ])

    // Both PlaceName and Map fetch should each be called exactly once.
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  // -------------------------------------------------------------------------
  // Test 5: mapAssetUrl built via buildMapAssetUrl
  // -------------------------------------------------------------------------

  it('builds mapAssetUrl from Map.Id via buildMapAssetUrl', async () => {
    const fetchSpy = mockResponses([
      {
        pattern: PATTERN_PLACE_NAME,
        body: {
          rows: [
            {
              row_id: 146,
              fields: {
                Name: '拉诺西亚低地',
                Name_chs: '拉诺西亚低地',
                Name_en: 'Lower La Noscea',
                Name_ja: 'ラノシア低地',
              },
            },
          ],
        },
      },
      {
        pattern: PATTERN_MAP_SEARCH,
        body: {
          results: [
            {
              fields: {
                Id: 'r1f1/00',
                SizeFactor: 200,
                PlaceName: { value: 146 },
              },
            },
          ],
        },
      },
    ])
    vi.stubGlobal('fetch', fetchSpy)

    await fetchZoneMetaBulk([146])
    const meta = getZoneMetaSync(146)
    expect(meta).not.toBeNull()
    // buildMapAssetUrl('r1f1/00') → 'ui/map/r1f1/00/r1f100_m.tex'
    expect(meta!.mapAssetUrl).toBe('ui/map/r1f1/00/r1f100_m.tex')
  })

  // -------------------------------------------------------------------------
  // Test 6: failure tolerance — fetch throws, no reject; clear + retry works
  // -------------------------------------------------------------------------

  it('does not throw when fetch errors; subsequent successful call populates cache', async () => {
    // First call: both fetches throw.
    const failFetch = vi.fn(async (_url: string) => {
      throw new Error('network error')
    })
    vi.stubGlobal('fetch', failFetch)

    // Should not throw.
    await expect(fetchZoneMetaBulk([146])).resolves.toBeDefined()

    // Clear cache so the next call will re-fetch (simulating retry after recovery).
    __clearCache()

    // Second call: fetch succeeds.
    const successFetch = mockResponses([
      {
        pattern: PATTERN_PLACE_NAME,
        body: {
          rows: [
            {
              row_id: 146,
              fields: {
                Name: '拉诺西亚低地',
                Name_chs: '拉诺西亚低地',
                Name_en: 'Lower La Noscea',
                Name_ja: 'ラノシア低地',
              },
            },
          ],
        },
      },
      {
        pattern: PATTERN_MAP_SEARCH,
        body: { results: [] },
      },
    ])
    vi.stubGlobal('fetch', successFetch)

    await fetchZoneMetaBulk([146])
    const meta = getZoneMetaSync(146)
    expect(meta).not.toBeNull()
    expect(meta!.zoneNameByLocale.get('en')).toBe('Lower La Noscea')
  })

  it('does not cache empty entries from failed fetches — retry succeeds', async () => {
    // First call: both fetches throw
    const failFetch = vi.fn(async (_url: string) => {
      throw new Error('network error')
    })
    vi.stubGlobal('fetch', failFetch)

    await fetchZoneMetaBulk([146])
    expect(getZoneMetaSync(146)).toBeNull() // not cached

    // Second call: fetch succeeds
    const successFetch = mockResponses([
      {
        pattern: PATTERN_PLACE_NAME,
        body: {
          rows: [
            {
              row_id: 146,
              fields: {
                Name: '拉诺西亚低地',
                Name_chs: '拉诺西亚低地',
                Name_en: 'Lower La Noscea',
                Name_ja: 'ラノシア低地',
              },
            },
          ],
        },
      },
      {
        pattern: PATTERN_MAP_SEARCH,
        body: {
          results: [
            {
              fields: {
                Id: 'r1f1/00',
                SizeFactor: 100,
                PlaceName: { value: 146 },
              },
            },
          ],
        },
      },
    ])
    vi.stubGlobal('fetch', successFetch)

    await fetchZoneMetaBulk([146])
    expect(getZoneMetaSync(146)).not.toBeNull()
    expect(getZoneMetaSync(146)?.zoneNameByLocale.get('en')).toBe(
      'Lower La Noscea',
    )
  })
})

// ---------------------------------------------------------------------------
// Test 7: fetchNpcNameBulk returns localized names
// ---------------------------------------------------------------------------

describe('fetchNpcNameBulk', () => {
  it('returns localized NPC names and getNpcNameSync works for zh-TW after sToT', async () => {
    // Use a name that contains characters present in the s2t map.
    // '东部林地商人' — '东'→'東', '业'→'業' in s2t map.
    // Using '东拉诺西亚商人' so '东'→'東', '诺'→'諾', '亚'→'亞' are all converted.
    const fakeNpcResponse = {
      rows: [
        {
          row_id: 1001,
          fields: {
            Singular: '东拉诺西亚商人',
            Singular_chs: '东拉诺西亚商人',
            Singular_en: 'Eastern La Noscea Merchant',
            Singular_ja: '東ラノシア商人',
          },
        },
      ],
    }

    const fetchSpy = mockResponses([
      { pattern: PATTERN_NPC, body: fakeNpcResponse },
    ])
    vi.stubGlobal('fetch', fetchSpy)

    const result = await fetchNpcNameBulk([1001])
    expect(result.size).toBe(1)

    const localeMap = result.get(1001)
    expect(localeMap).toBeDefined()
    expect(localeMap!.get('en')).toBe('Eastern La Noscea Merchant')
    expect(localeMap!.get('ja')).toBe('東ラノシア商人')
    expect(localeMap!.get('zh-CN')).toBe('东拉诺西亚商人')

    // zh-TW: sToT('东拉诺西亚商人') — '东'→'東', '诺'→'諾', '亚'→'亞'
    const zhTw = localeMap!.get('zh-TW')
    expect(zhTw).toBeDefined()
    expect(zhTw).toContain('東')
    expect(zhTw).toContain('諾')

    // getNpcNameSync should also work after the fetch.
    expect(getNpcNameSync(1001, 'en')).toBe('Eastern La Noscea Merchant')
    expect(getNpcNameSync(1001, 'zh-TW')).toContain('東')
    expect(getNpcNameSync(9999, 'en')).toBeNull()
  })
})

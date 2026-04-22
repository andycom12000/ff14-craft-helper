import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchAllTimedNodes } from '@/api/garland'
import { setupLocalDataMocks, resetLocalDataMocks, fixtures } from '@/__tests__/fixtures/load'
import { __resetForTesting, setLocale } from '@/services/local-data-source'

// Build an items override that adds item 5395 (雲杉原木 / Spruce Log) to each
// locale fixture so that local-data-source.getItem can resolve it.
function itemsWithSpruce() {
  const base = fixtures.items as Record<string, { schemaVersion: number; items: unknown[] }>
  const append = (locale: string, name: string): { schemaVersion: number; items: unknown[] } => ({
    schemaVersion: 1,
    items: [...base[locale].items, [5395, name, 58, 1, 23010]],
  })
  return {
    'zh-TW': append('zh-TW', '雲杉原木'),
    'zh-CN': append('zh-CN', '云杉原木'),
    en: append('en', 'Spruce Log'),
    ja: append('ja', 'トウヒ材'),
  }
}

describe('fetchAllTimedNodes', () => {
  beforeEach(async () => {
    __resetForTesting()
    await setLocale('zh-TW')
  })

  afterEach(() => {
    resetLocalDataMocks()
    vi.restoreAllMocks()
    __resetForTesting()
  })

  it('fetches and filters timed nodes from Garland Browse API', async () => {
    const mockBrowseData = [
      { i: 1, n: 'Test Location', l: 90, t: 0, z: 100, s: 3, lt: 'Unspoiled', ti: [2, 14] },
      { i: 2, n: 'Normal Node', l: 50, t: 1, z: 101, s: 1 },
      { i: 3, n: 'Legend Spot', l: 100, t: 2, z: 102, s: 4, lt: 'Legendary', ti: [0, 12] },
    ]

    const localFetch = setupLocalDataMocks()

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const u = typeof input === 'string' ? input : input.toString()
        if (u.includes('garlandtools')) {
          return Promise.resolve(
            new Response(JSON.stringify({ browse: mockBrowseData }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          )
        }
        if (u.startsWith('/data/') || u.includes('/data/')) {
          return localFetch(input)
        }
        // XIVAPI calls (PlaceName / Map) → fail so resolveNodeDetails degrades gracefully.
        return Promise.resolve(new Response(null, { status: 503 }))
      }),
    )

    const nodes = await fetchAllTimedNodes()
    expect(nodes).toHaveLength(2)
    expect(nodes[0].nodeType).toBe('Unspoiled')
    expect(nodes[0].gatheringClass).toBe('MIN')
    expect(nodes[0].spawnTimes).toEqual([2, 14])
    expect(nodes[1].nodeType).toBe('Legendary')
    expect(nodes[1].gatheringClass).toBe('BTN')
  })

  it('returns empty array on fetch error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network'))),
    )
    const nodes = await fetchAllTimedNodes()
    expect(nodes).toEqual([])
  })

  it('enriches nodes via Garland detail + local-data zh-TW item names', async () => {
    const mockBrowseData = [
      { i: 211, n: 'Test Location', l: 90, t: 0, z: 100, s: 3, lt: 'Unspoiled', ti: [2, 14] },
    ]

    // Supply local-data fixtures with item 5395 so getItem(5395, 'zh-TW') resolves.
    const localFetch = setupLocalDataMocks({ items: itemsWithSpruce() })

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const u = typeof input === 'string' ? input : input.toString()

        // Local data URLs → fixture
        if (u.startsWith('/data/') || u.includes('/data/')) {
          return localFetch(input)
        }

        // Garland browse
        if (u.includes('browse')) {
          return Promise.resolve(
            new Response(JSON.stringify({ browse: mockBrowseData }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          )
        }

        // Garland per-node detail
        if (u.includes('doc/node/en/2/211')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                node: { id: 211, items: [{ id: 5395 }], coords: [29.17, 12.79], zoneid: 63 },
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
          )
        }

        // XIVAPI PlaceName → chs name (converted to Traditional by sToT)
        if (u.includes('sheet/PlaceName')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                rows: [{ row_id: 63, fields: { Name: '库尔札斯中央高地' } }],
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            ),
          )
        }

        // XIVAPI Map search → no map asset, exercise graceful fallback
        return Promise.resolve(new Response(null, { status: 404 }))
      }),
    )

    const nodes = await fetchAllTimedNodes()
    expect(nodes).toHaveLength(1)
    expect(nodes[0].itemId).toBe(5395)
    expect(nodes[0].itemName).toBe('雲杉原木')
    expect(nodes[0].coords).toEqual({ x: 29.17, y: 12.79 })
    expect(nodes[0].zone).toBe('庫爾札斯中央高地')
  })
})

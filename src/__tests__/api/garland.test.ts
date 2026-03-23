import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchAllTimedNodes } from '@/api/garland'

describe('fetchAllTimedNodes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches and filters timed nodes from Garland Browse API', async () => {
    const mockBrowseData = [
      { i: 1, n: 'Test Location', l: 90, t: 0, z: 100, s: 3, lt: 'Unspoiled', ti: [2, 14] },
      { i: 2, n: 'Normal Node', l: 50, t: 1, z: 101, s: 1 },
      { i: 3, n: 'Legend Spot', l: 100, t: 2, z: 102, s: 4, lt: 'Legendary', ti: [0, 12] },
    ]

    vi.mocked(globalThis.fetch).mockImplementation((url: any) => {
      const u = typeof url === 'string' ? url : url.toString()
      if (u.includes('garlandtools')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ browse: mockBrowseData }) } as Response)
      }
      // Return failure for XIVAPI calls so resolveNodeDetails falls back gracefully
      return Promise.resolve({ ok: false } as Response)
    })

    const nodes = await fetchAllTimedNodes()
    expect(nodes).toHaveLength(2)
    expect(nodes[0].nodeType).toBe('Unspoiled')
    expect(nodes[0].gatheringClass).toBe('MIN')
    expect(nodes[0].spawnTimes).toEqual([2, 14])
    expect(nodes[1].nodeType).toBe('Legendary')
    expect(nodes[1].gatheringClass).toBe('BTN')
  })

  it('returns empty array on fetch error', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('network'))
    const nodes = await fetchAllTimedNodes()
    expect(nodes).toEqual([])
  })

  it('enriches nodes via Garland detail + tnze zh-TW item names', async () => {
    const mockBrowseData = [
      { i: 211, n: 'Test Location', l: 90, t: 0, z: 100, s: 3, lt: 'Unspoiled', ti: [2, 14] },
    ]

    vi.mocked(globalThis.fetch).mockImplementation((url: any) => {
      const u = typeof url === 'string' ? url : url.toString()
      if (u.includes('browse')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ browse: mockBrowseData }) } as Response)
      }
      if (u.includes('doc/node/en/2/211')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          node: { id: 211, items: [{ id: 5395 }], coords: [29.17, 12.79], zoneid: 63 }
        }) } as Response)
      }
      if (u.includes('tnze.yyyy.games') && u.includes('item_id=5395')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ name: '雲杉原木' }) } as Response)
      }
      if (u.includes('sheet/PlaceName')) {
        // XIVAPI returns Simplified Chinese; sToT converts to Traditional
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [{
          row_id: 63,
          fields: { Name: '库尔札斯中央高地' }
        }]}) } as Response)
      }
      return Promise.resolve({ ok: false } as Response)
    })

    const nodes = await fetchAllTimedNodes()
    expect(nodes).toHaveLength(1)
    expect(nodes[0].itemId).toBe(5395)
    expect(nodes[0].itemName).toBe('雲杉原木')
    expect(nodes[0].coords).toEqual({ x: 29.17, y: 12.79 })
    expect(nodes[0].zone).toBe('庫爾札斯中央高地')
  })
})

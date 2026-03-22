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
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockBrowseData) } as Response)
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

  it('enriches nodes with XIVAPI data when available', async () => {
    const mockBrowseData = [
      { i: 1, n: 'Test Location', l: 90, t: 0, z: 100, s: 3, lt: 'Unspoiled', ti: [2, 14] },
    ]

    vi.mocked(globalThis.fetch).mockImplementation((url: any) => {
      const u = typeof url === 'string' ? url : url.toString()
      if (u.includes('garlandtools')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockBrowseData) } as Response)
      }
      if (u.includes('GatheringPoint?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [{
          row_id: 1,
          fields: {
            GatheringPointBase: { row_id: 100 },
            TerritoryType: { row_id: 200 },
          }
        }]}) } as Response)
      }
      if (u.includes('GatheringPointBase?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [{
          row_id: 100,
          fields: { 'Item[0]': { row_id: 5001 } }
        }]}) } as Response)
      }
      if (u.includes('sheet/Item?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [{
          row_id: 5001,
          fields: { Name: '暗物質礦' }
        }]}) } as Response)
      }
      if (u.includes('TerritoryType?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ rows: [{
          row_id: 200,
          fields: {
            Map: { row_id: 50 },
            PlaceName: { fields: { Name: '薩納蘭高地' } }
          }
        }]}) } as Response)
      }
      return Promise.resolve({ ok: false } as Response)
    })

    const nodes = await fetchAllTimedNodes()
    expect(nodes).toHaveLength(1)
    expect(nodes[0].itemId).toBe(5001)
    expect(nodes[0].itemName).toBe('暗物質礦')
    expect(nodes[0].zone).toBe('薩納蘭高地')
    expect(nodes[0].mapId).toBe(50)
  })
})

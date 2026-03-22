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

    const garlandResp = { ok: true, json: () => Promise.resolve(mockBrowseData) }
    vi.mocked(globalThis.fetch).mockResolvedValue(garlandResp as Response)

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
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  parseGarlandLocations,
  fetchItemLocations,
  fetchItemLocationsBatch,
  __clearCache,
  type GarlandItemDocument,
} from '@/services/item-locations'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  __clearCache()
  vi.restoreAllMocks()
})

const doc = (
  item: GarlandItemDocument['item'],
  partials: GarlandItemDocument['partials'],
): GarlandItemDocument => ({ item, partials })

function makeOkFetch(body: unknown) {
  return vi.fn(async (_url: string) => ({
    ok: true,
    json: async () => body,
  })) as unknown as typeof fetch
}

function makeFailFetch() {
  return vi.fn(async (_url: string) => {
    throw new Error('network error')
  }) as unknown as typeof fetch
}

function makeNonOkFetch() {
  return vi.fn(async (_url: string) => ({
    ok: false,
    status: 404,
    json: async () => ({}),
  })) as unknown as typeof fetch
}

// ---------------------------------------------------------------------------
// parseGarlandLocations — pure parser tests (Cases 1–5)
// ---------------------------------------------------------------------------

describe('parseGarlandLocations', () => {
  // Case 1: Extracts NPC vendors from item.vendors with matching partial
  it('extracts NPC vendors with coords and price from matching partials', () => {
    const result = parseGarlandLocations(
      doc(
        { id: 100, vendors: [1001, 1002], price: 213 },
        [
          {
            type: 'npc',
            id: '1001',
            obj: { n: 'Merchant A', c: [30.2, 31.5], z: 146 },
          },
          {
            type: 'npc',
            id: '1002',
            obj: { n: 'Merchant B', c: [21.0, 23.0], z: 153 },
          },
        ],
      ),
    )
    expect(result.npcVendors).toHaveLength(2)
    expect(result.npcVendors[0]).toEqual({
      npcId: 1001,
      zoneId: 146,
      x: 30.2,
      y: 31.5,
      price: 213,
    })
    expect(result.npcVendors[1]).toEqual({
      npcId: 1002,
      zoneId: 153,
      x: 21.0,
      y: 23.0,
      price: 213,
    })
    expect(result.gatherNodes).toHaveLength(0)
  })

  // Case 2: Extracts gather nodes (MIN) from item.nodes with type classified
  it('extracts gather nodes from item.nodes and classifies MIN (t<=1)', () => {
    const result = parseGarlandLocations(
      doc(
        { id: 200, nodes: [501, 502] },
        [
          {
            type: 'node',
            id: '501',
            obj: { t: 0, l: 38, c: [15.0, 20.0], z: 155 },
          },
          {
            type: 'node',
            id: '502',
            obj: { t: 1, l: 40, c: [17.0, 22.0], z: 155 },
          },
        ],
      ),
    )
    expect(result.gatherNodes).toHaveLength(2)
    expect(result.gatherNodes[0]).toEqual({
      nodeId: 501,
      type: 'MIN',
      level: 38,
      zoneId: 155,
      x: 15.0,
      y: 20.0,
    })
    expect(result.gatherNodes[1]).toEqual({
      nodeId: 502,
      type: 'MIN',
      level: 40,
      zoneId: 155,
      x: 17.0,
      y: 22.0,
    })
    expect(result.npcVendors).toHaveLength(0)
  })

  // Case 3: Classifies BTN (t=2,3) and FSH (t>=4) correctly
  it('classifies BTN (t=2,3) and FSH (t>=4) node types', () => {
    const result = parseGarlandLocations(
      doc(
        { id: 300, nodes: [601], fishingSpots: [602, 603], spearfishingSpots: [604] },
        [
          {
            type: 'node',
            id: '601',
            obj: { t: 2, l: 35, c: [10.0, 11.0], z: 200 },
          },
          {
            type: 'node',
            id: '602',
            obj: { t: 4, l: 0, c: [12.0, 13.0], z: 200 },
          },
          {
            type: 'node',
            id: '603',
            obj: { t: 3, l: 28, c: [14.0, 15.0], z: 201 },
          },
          {
            type: 'node',
            id: '604',
            obj: { t: 7, l: 60, c: [16.0, 17.0], z: 202 },
          },
        ],
      ),
    )
    expect(result.gatherNodes).toHaveLength(4)
    expect(result.gatherNodes[0].type).toBe('BTN') // t=2
    expect(result.gatherNodes[1].type).toBe('FSH') // t=4
    expect(result.gatherNodes[2].type).toBe('BTN') // t=3
    expect(result.gatherNodes[3].type).toBe('FSH') // t=7
  })

  // Case 4: Drops vendor/node partials missing zoneId or coords
  it('drops vendor partials missing zoneId or coords', () => {
    const result = parseGarlandLocations(
      doc(
        { id: 400, vendors: [1, 2, 3], nodes: [10, 11] },
        [
          // vendor 1: missing coords → dropped
          { type: 'npc', id: '1', obj: { n: 'A', z: 146 } },
          // vendor 2: missing zone → dropped
          { type: 'npc', id: '2', obj: { n: 'B', c: [5.0, 6.0] } },
          // vendor 3: both present → kept
          { type: 'npc', id: '3', obj: { n: 'C', c: [7.0, 8.0], z: 153 } },
          // node 10: missing coords → dropped
          { type: 'node', id: '10', obj: { t: 0, l: 10, z: 155 } },
          // node 11: both present → kept
          { type: 'node', id: '11', obj: { t: 1, l: 20, c: [9.0, 9.0], z: 155 } },
        ],
      ),
    )
    expect(result.npcVendors).toHaveLength(1)
    expect(result.npcVendors[0].npcId).toBe(3)
    expect(result.gatherNodes).toHaveLength(1)
    expect(result.gatherNodes[0].nodeId).toBe(11)
  })

  // Case 5: Returns empty arrays when item has no sources
  it('returns empty arrays when item has no vendors, nodes, or fishingSpots', () => {
    const emptyDoc = parseGarlandLocations(doc({ id: 999 }, []))
    expect(emptyDoc.npcVendors).toHaveLength(0)
    expect(emptyDoc.gatherNodes).toHaveLength(0)

    // Also when item is undefined entirely
    const noItemDoc = parseGarlandLocations({ partials: [] })
    expect(noItemDoc.npcVendors).toHaveLength(0)
    expect(noItemDoc.gatherNodes).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// fetchItemLocations / fetchItemLocationsBatch — network wrapper tests (Cases 6–10)
// ---------------------------------------------------------------------------

describe('fetchItemLocations / fetchItemLocationsBatch', () => {
  const fakeDoc: GarlandItemDocument = {
    item: { id: 42, vendors: [999], price: 100 },
    partials: [
      { type: 'npc', id: '999', obj: { n: 'Test NPC', c: [10.0, 20.0], z: 146 } },
    ],
  }

  // Case 6: Inflight dedupe — concurrent same-id requests share one fetch
  it('concurrent requests for the same itemId share one in-flight fetch', async () => {
    const fetchSpy = makeOkFetch(fakeDoc)
    vi.stubGlobal('fetch', fetchSpy)

    const [r1, r2] = await Promise.all([
      fetchItemLocations(42),
      fetchItemLocations(42),
    ])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(r1).toEqual(r2)
    expect(r1.npcVendors).toHaveLength(1)
  })

  // Case 7: LRU eviction — after 501 unique IDs, the first one is evicted
  it('evicts the LRU entry when cache exceeds 500 items (first id re-fetches)', async () => {
    let callCount = 0
    const fetchSpy = vi.fn(async (_url: string) => {
      callCount++
      return {
        ok: true,
        json: async () => fakeDoc,
      }
    })
    vi.stubGlobal('fetch', fetchSpy)

    // Fill cache to exactly 500 entries: ids 1..500
    for (let i = 1; i <= 500; i++) {
      await fetchItemLocations(i)
    }
    expect(callCount).toBe(500)

    // Access id 1 now — it's the LRU candidate. Then add id 501, which should
    // evict the oldest (id 1 is NOT recently accessed since we accessed 1..500 in order).
    // Actually after filling 1..500, id 1 is at the front (LRU).
    // Adding 501 should evict id 1.
    await fetchItemLocations(501)
    expect(callCount).toBe(501)

    // Now id 1 should have been evicted — re-fetching it triggers a new network call.
    await fetchItemLocations(1)
    expect(callCount).toBe(502)
  })

  // Case 8: Failed fetch does NOT cache — next call retries and succeeds
  it('does not cache on fetch failure; subsequent call retries and returns data', async () => {
    const failFetch = makeFailFetch()
    vi.stubGlobal('fetch', failFetch)

    const result1 = await fetchItemLocations(42)
    expect(result1).toEqual({ npcVendors: [], gatherNodes: [] })

    // Restore with a working fetch
    const successFetch = makeOkFetch(fakeDoc)
    vi.stubGlobal('fetch', successFetch)

    const result2 = await fetchItemLocations(42)
    expect(result2.npcVendors).toHaveLength(1)
    expect(result2.npcVendors[0].npcId).toBe(999)
  })

  // Case 9: Batch concurrency is respected (at most `concurrency` parallel fetches)
  it('fetchItemLocationsBatch limits concurrency', async () => {
    let activeFetches = 0
    let maxActiveFetches = 0

    const concurrencyFetch = vi.fn(async (_url: string) => {
      activeFetches++
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches)
      // small async tick to allow other promises to pile up
      await new Promise((resolve) => setTimeout(resolve, 0))
      activeFetches--
      return { ok: true, json: async () => fakeDoc }
    })
    vi.stubGlobal('fetch', concurrencyFetch)

    const ids = Array.from({ length: 20 }, (_, i) => i + 1)
    await fetchItemLocationsBatch(ids, 4)

    // maxActiveFetches should never exceed concurrency=4
    expect(maxActiveFetches).toBeLessThanOrEqual(4)
    expect(concurrencyFetch).toHaveBeenCalledTimes(20)
  })

  // Case 10: Batch deduplicates input IDs before fetching
  it('fetchItemLocationsBatch deduplicates input ids', async () => {
    const fetchSpy = makeOkFetch(fakeDoc)
    vi.stubGlobal('fetch', fetchSpy)

    const results = await fetchItemLocationsBatch([1, 2, 1, 3, 2], 6)

    // Only 3 unique IDs should be fetched
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    // Results map has all unique IDs
    expect(results.size).toBe(3)
    expect(results.has(1)).toBe(true)
    expect(results.has(2)).toBe(true)
    expect(results.has(3)).toBe(true)
  })
})

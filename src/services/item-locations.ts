/**
 * item-locations.ts — garlandtools item location data: NPC vendors + gather nodes.
 *
 * Fetches the same garlandtools per-item endpoint as item-acquisition.ts but
 * parses the fuller "partials" payload to extract exact coordinates and zone IDs
 * needed by the BOM route planner.
 *
 * Failure mode is strict-but-silent: if the lookup fails, we return empty arrays
 * and do NOT cache (so the next call retries).
 *
 * LRU: 500-entry cap tracked via an accessOrder array (MRU at back, evict front).
 */

export interface ItemLocations {
  npcVendors: Array<{ npcId: number; zoneId: number; x: number; y: number; price?: number }>
  gatherNodes: Array<{
    nodeId: number
    type: 'MIN' | 'BTN' | 'FSH'
    level: number
    zoneId: number
    x: number
    y: number
  }>
}

export interface GarlandItemDocument {
  item?: {
    id: number
    vendors?: number[]
    nodes?: number[]
    fishingSpots?: number[]
    spearfishingSpots?: number[]
    price?: number
  }
  partials?: Array<{
    type: string
    id: string
    obj: { n?: string; c?: [number, number]; z?: number; l?: number; t?: number }
  }>
}

// ---------------------------------------------------------------------------
// LRU cache state
// ---------------------------------------------------------------------------

const LRU_CAP = 500
const cache = new Map<number, ItemLocations>()
/** IDs in order of last access; MRU is at the end. */
const accessOrder: number[] = []
const inflight = new Map<number, Promise<ItemLocations>>()

const GARLAND_ITEM = 'https://garlandtools.org/db/doc/item/en/3'

// ---------------------------------------------------------------------------
// LRU helpers
// ---------------------------------------------------------------------------

function lruTouch(itemId: number): void {
  const idx = accessOrder.indexOf(itemId)
  if (idx !== -1) accessOrder.splice(idx, 1)
  accessOrder.push(itemId)
}

function lruSet(itemId: number, locations: ItemLocations): void {
  if (cache.has(itemId)) {
    // Update existing entry and move to MRU.
    cache.set(itemId, locations)
    lruTouch(itemId)
    return
  }
  cache.set(itemId, locations)
  accessOrder.push(itemId)
  // Evict LRU entry when over cap.
  if (cache.size > LRU_CAP) {
    const evict = accessOrder.shift()!
    cache.delete(evict)
  }
}

function lruGet(itemId: number): ItemLocations | undefined {
  const value = cache.get(itemId)
  if (value !== undefined) lruTouch(itemId)
  return value
}

// ---------------------------------------------------------------------------
// Parser (pure function — no network, no side effects)
// ---------------------------------------------------------------------------

function nodeType(t: number | undefined): 'MIN' | 'BTN' | 'FSH' {
  if (t === undefined) return 'MIN'
  if (t <= 1) return 'MIN'
  if (t <= 3) return 'BTN'
  return 'FSH'
}

export function parseGarlandLocations(doc: GarlandItemDocument): ItemLocations {
  const item = doc.item
  if (!item) return { npcVendors: [], gatherNodes: [] }

  const partials = doc.partials ?? []

  // Build fast lookup: type → id → partial obj
  function findPartial(type: string, id: number) {
    return partials.find(
      (p) => p.type === type && Number(p.id) === id,
    )
  }

  // --- NPC vendors ---
  const npcVendors: ItemLocations['npcVendors'] = []
  for (const vendorId of item.vendors ?? []) {
    const partial = findPartial('npc', vendorId)
    if (!partial) continue
    const { c, z } = partial.obj
    if (!c || z === undefined) continue
    const entry: ItemLocations['npcVendors'][number] = {
      npcId: vendorId,
      zoneId: z,
      x: c[0],
      y: c[1],
    }
    if (typeof item.price === 'number' && item.price > 0) {
      entry.price = item.price
    }
    npcVendors.push(entry)
  }

  // --- Gather nodes (nodes + fishingSpots + spearfishingSpots) ---
  const nodeIds = [
    ...(item.nodes ?? []),
    ...(item.fishingSpots ?? []),
    ...(item.spearfishingSpots ?? []),
  ]
  const gatherNodes: ItemLocations['gatherNodes'] = []
  for (const nodeId of nodeIds) {
    const partial = findPartial('node', nodeId)
    if (!partial) continue
    const { c, z, l, t } = partial.obj
    if (!c || z === undefined) continue
    gatherNodes.push({
      nodeId,
      type: nodeType(t),
      level: l ?? 0,
      zoneId: z,
      x: c[0],
      y: c[1],
    })
  }

  return { npcVendors, gatherNodes }
}

// ---------------------------------------------------------------------------
// Network wrapper
// ---------------------------------------------------------------------------

export async function fetchItemLocations(itemId: number): Promise<ItemLocations> {
  const cached = lruGet(itemId)
  if (cached !== undefined) return cached

  if (inflight.has(itemId)) return inflight.get(itemId)!

  const promise = (async () => {
    try {
      const resp = await fetch(`${GARLAND_ITEM}/${itemId}.json`)
      if (!resp.ok) return { npcVendors: [], gatherNodes: [] }
      const data: GarlandItemDocument = await resp.json()
      const result = parseGarlandLocations(data)
      lruSet(itemId, result)
      return result
    } catch {
      // Do NOT cache on failure so the next call retries.
      return { npcVendors: [], gatherNodes: [] }
    } finally {
      inflight.delete(itemId)
    }
  })()

  inflight.set(itemId, promise)
  return promise
}

/**
 * Fetch locations for many items concurrently. Deduplicates input IDs and uses
 * a small worker pool (matching fetchItemAcquisitionBatch's style).
 */
export async function fetchItemLocationsBatch(
  itemIds: number[],
  concurrency = 6,
): Promise<Map<number, ItemLocations>> {
  const results = new Map<number, ItemLocations>()
  const queue = [...new Set(itemIds)]
  async function worker() {
    while (queue.length > 0) {
      const id = queue.shift()!
      const locations = await fetchItemLocations(id)
      results.set(id, locations)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  return results
}

// ---------------------------------------------------------------------------
// __clearCache — for tests only
// ---------------------------------------------------------------------------

export function __clearCache(): void {
  cache.clear()
  accessOrder.length = 0
  inflight.clear()
}

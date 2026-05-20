/**
 * Per-item acquisition availability — used by the BOM decision table to
 * hide chips that don't actually apply (e.g., a non-gatherable item should
 * not offer "自採"). Sourced from garlandtools' per-item endpoint.
 *
 * Failure mode is permissive: if the lookup fails or a field is missing,
 * we fall back to "show the chip" rather than risk hiding a valid option.
 */

export interface ItemAcquisition {
  canMarket: boolean
  canGather: boolean
  canNpc: boolean
  /** Gil price at the cheapest NPC vendor, when canNpc. null otherwise. */
  npcPrice: number | null
}

const PERMISSIVE: ItemAcquisition = {
  canMarket: true,
  canGather: true,
  canNpc: true,
  npcPrice: null,
}

const cache = new Map<number, ItemAcquisition>()
const inflight = new Map<number, Promise<ItemAcquisition>>()

const GARLAND_ITEM = 'https://garlandtools.org/db/doc/item/en/3'

export interface GarlandItemDetail {
  item?: {
    tradeable?: 0 | 1
    nodes?: number[]
    fish?: unknown[]
    fishingSpots?: number[]
    spearfishingSpots?: number[]
    vendors?: unknown[]
    tradeShops?: unknown[]
    voyages?: unknown[]
    /** NPC vendor sale price in gil. Garlandtools surfaces this at top level. */
    price?: number
  }
}

export function deriveAcquisition(detail: GarlandItemDetail): ItemAcquisition {
  const item = detail.item ?? {}
  const canMarket = item.tradeable !== 0
  const canGather =
    (Array.isArray(item.nodes) && item.nodes.length > 0) ||
    (Array.isArray(item.fish) && item.fish.length > 0) ||
    (Array.isArray(item.fishingSpots) && item.fishingSpots.length > 0) ||
    (Array.isArray(item.spearfishingSpots) && item.spearfishingSpots.length > 0)
  // Only `vendors` represent NPCs selling for gil. `tradeShops` cost tokens
  // (scrips, tomestones, …) and garlandtools' top-level `item.price` is the
  // gil-sale price — unrelated to a trade-shop's token cost. Mixing them in
  // surfaces phantom gil prices in BOM NPC mode.
  // `price === 99999` is garlandtools' sentinel for "no real NPC gil price"
  // (e.g., itemId 44144 佩魯佩魯棉線 ships as tradeShops-only with price=99999).
  const hasGilVendor = Array.isArray(item.vendors) && item.vendors.length > 0
  const npcPrice =
    hasGilVendor &&
    typeof item.price === 'number' &&
    item.price > 0 &&
    item.price < 99999
      ? item.price
      : null
  const canNpc = npcPrice !== null
  return { canMarket, canGather, canNpc, npcPrice }
}

export async function fetchItemAcquisition(itemId: number): Promise<ItemAcquisition> {
  if (cache.has(itemId)) return cache.get(itemId)!
  if (inflight.has(itemId)) return inflight.get(itemId)!
  const promise = (async () => {
    try {
      const resp = await fetch(`${GARLAND_ITEM}/${itemId}.json`)
      if (!resp.ok) return PERMISSIVE
      const data: GarlandItemDetail = await resp.json()
      const result = deriveAcquisition(data)
      cache.set(itemId, result)
      return result
    } catch {
      return PERMISSIVE
    } finally {
      inflight.delete(itemId)
    }
  })()
  inflight.set(itemId, promise)
  return promise
}

/**
 * Fetch acquisition info for many items concurrently. Garlandtools is a
 * static-cached CDN so a small worker pool is plenty; we don't need to
 * burst 60 requests at once.
 */
export async function fetchItemAcquisitionBatch(
  itemIds: number[],
  concurrency = 6,
): Promise<Map<number, ItemAcquisition>> {
  const results = new Map<number, ItemAcquisition>()
  const queue = [...new Set(itemIds)]
  async function worker() {
    while (queue.length > 0) {
      const id = queue.shift()!
      const info = await fetchItemAcquisition(id)
      results.set(id, info)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  return results
}

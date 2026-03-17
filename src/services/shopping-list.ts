import type { MarketListing } from '@/api/universalis'

export interface MaterialBase {
  itemId: number
  name: string
  icon: string
  amount: number
}

export interface MaterialWithPrice extends MaterialBase {
  type: 'nq' | 'hq' | 'craft'
  unitPrice: number
  server?: string
  isFinishedProduct?: boolean
  craftCostComparison?: { craftCost: number; buyPrice: number }
}

export interface CrystalSummary {
  itemId: number
  name: string
  amount: number
}

export interface ServerGroup {
  server: string
  items: MaterialWithPrice[]
  subtotal: number
}

const CRYSTAL_THRESHOLD = 20

export function separateCrystals<T extends MaterialBase>(materials: T[]): {
  crystals: CrystalSummary[]
  nonCrystals: T[]
} {
  const crystals: CrystalSummary[] = []
  const nonCrystals: T[] = []

  for (const m of materials) {
    if (m.itemId < CRYSTAL_THRESHOLD) {
      crystals.push({ itemId: m.itemId, name: m.name, amount: m.amount })
    } else {
      nonCrystals.push(m)
    }
  }
  return { crystals, nonCrystals }
}

export function groupByServer(materials: MaterialWithPrice[]): ServerGroup[] {
  const groups = new Map<string, MaterialWithPrice[]>()

  for (const m of materials) {
    const server = m.server ?? 'Unknown'
    if (!groups.has(server)) groups.set(server, [])
    groups.get(server)!.push(m)
  }

  return Array.from(groups.entries()).map(([server, items]) => ({
    server,
    items,
    subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.amount, 0),
  }))
}

export interface PurchaseResult {
  totalCost: number
  effectiveUnitPrice: number  // totalCost / neededQty
  wastedQty: number           // bought - needed
  availableQty: number        // total qty across all matching listings
  fulfilled: boolean          // availableQty >= neededQty
}

/**
 * Find the cheapest way to buy `neededQty` items from market listings.
 * Each listing must be bought in full (whole-stack purchase).
 *
 * Strategy: enumerate all subsets of listings (via bitmask for small N,
 * fallback to greedy-by-total-cost for large N) and pick the subset
 * with total qty >= neededQty and minimum total cost.
 */
export function calculateBestPurchase(
  listings: MarketListing[],
  neededQty: number,
  hq: boolean,
): PurchaseResult {
  const filtered = listings.filter(l => l.hq === hq)
  const availableQty = filtered.reduce((sum, l) => sum + l.quantity, 0)

  if (filtered.length === 0) {
    return { totalCost: 0, effectiveUnitPrice: 0, wastedQty: 0, availableQty: 0, fulfilled: false }
  }

  if (availableQty < neededQty) {
    // Can't fulfill — return best effort cost (buy everything available)
    const totalCost = filtered.reduce((sum, l) => sum + l.total, 0)
    return {
      totalCost,
      effectiveUnitPrice: availableQty > 0 ? Math.round(totalCost / availableQty) : 0,
      wastedQty: 0,
      availableQty,
      fulfilled: false,
    }
  }

  // Sort by total cost ascending for greedy fallback
  const sorted = [...filtered].sort((a, b) => a.total - b.total)

  // Pre-filter dominated listings: remove any listing where another listing
  // has both lower cost AND higher-or-equal quantity (strictly better)
  const pruned = sorted.filter((a, i) =>
    !sorted.some((b, j) => j !== i && b.total <= a.total && b.quantity >= a.quantity && (b.total < a.total || b.quantity > a.quantity)),
  )

  // For small listing counts (<=20), use bitmask enumeration for optimal result
  if (pruned.length <= 20) {
    let bestCost = Infinity
    let bestQty = 0
    const n = pruned.length

    for (let mask = 1; mask < (1 << n); mask++) {
      let qty = 0
      let cost = 0
      for (let j = 0; j < n; j++) {
        if (mask & (1 << j)) {
          qty += pruned[j].quantity
          cost += pruned[j].total
        }
      }
      if (qty >= neededQty && cost < bestCost) {
        bestCost = cost
        bestQty = qty
      }
    }

    return {
      totalCost: bestCost,
      effectiveUnitPrice: Math.round(bestCost / neededQty),
      wastedQty: bestQty - neededQty,
      availableQty,
      fulfilled: true,
    }
  }

  // Fallback for large N: greedy by total cost ascending
  // Pick cheapest listings until we meet the needed quantity
  let totalCost = 0
  let totalQty = 0
  for (const l of sorted) {
    totalCost += l.total
    totalQty += l.quantity
    if (totalQty >= neededQty) break
  }

  return {
    totalCost,
    effectiveUnitPrice: Math.round(totalCost / neededQty),
    wastedQty: totalQty - neededQty,
    availableQty,
    fulfilled: true,
  }
}

export function aggregateMaterials(
  materialsArrays: MaterialBase[][],
): MaterialBase[] {
  const map = new Map<number, MaterialBase>()
  for (const materials of materialsArrays) {
    for (const m of materials) {
      const existing = map.get(m.itemId)
      if (existing) {
        existing.amount += m.amount
      } else {
        map.set(m.itemId, { ...m })
      }
    }
  }
  return Array.from(map.values())
}

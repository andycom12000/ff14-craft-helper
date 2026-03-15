import { describe, it, expect } from 'vitest'
import {
  separateCrystals,
  groupByServer,
  aggregateMaterials,
  calculateBestPurchase,
  type MaterialWithPrice,
} from '@/services/shopping-list'
import type { MarketListing } from '@/api/universalis'

describe('separateCrystals', () => {
  it('separates items with itemId < 20 as crystals', () => {
    const materials = [
      { itemId: 2, name: '火之水晶', icon: '', amount: 30 },
      { itemId: 100, name: '完全木材', icon: '', amount: 5 },
      { itemId: 8, name: '風之碎晶', icon: '', amount: 20 },
    ]
    const { crystals, nonCrystals } = separateCrystals(materials)
    expect(crystals).toHaveLength(2)
    expect(nonCrystals).toHaveLength(1)
    expect(nonCrystals[0].name).toBe('完全木材')
  })

  it('handles empty input', () => {
    const { crystals, nonCrystals } = separateCrystals([])
    expect(crystals).toHaveLength(0)
    expect(nonCrystals).toHaveLength(0)
  })
})

describe('groupByServer', () => {
  it('groups materials by their cheapest server', () => {
    const materials: MaterialWithPrice[] = [
      { itemId: 100, name: 'A', icon: '', amount: 5, type: 'nq', unitPrice: 1000, server: 'Chocobo' },
      { itemId: 200, name: 'B', icon: '', amount: 3, type: 'hq', unitPrice: 2000, server: 'Tonberry' },
      { itemId: 300, name: 'C', icon: '', amount: 2, type: 'nq', unitPrice: 500, server: 'Chocobo' },
    ]
    const groups = groupByServer(materials)
    expect(groups).toHaveLength(2)

    const chocobo = groups.find(g => g.server === 'Chocobo')!
    expect(chocobo.items).toHaveLength(2)
    expect(chocobo.subtotal).toBe(5 * 1000 + 2 * 500)

    const tonberry = groups.find(g => g.server === 'Tonberry')!
    expect(tonberry.items).toHaveLength(1)
    expect(tonberry.subtotal).toBe(3 * 2000)
  })
})

function listing(qty: number, price: number, hq = false, world = 'Chocobo'): MarketListing {
  return { quantity: qty, pricePerUnit: price, total: qty * price, hq, worldName: world, lastReviewTime: 0 }
}

describe('calculateBestPurchase', () => {
  it('picks a single cheap listing that covers the need', () => {
    const listings = [
      listing(10, 80),   // 10個 @ 80 → total 800
      listing(99, 50),   // 99個 @ 50 → total 4950 (cheaper per unit but huge waste)
    ]
    const result = calculateBestPurchase(listings, 5, false)
    // Should pick the 10-qty listing: 10×80=800, not 99×50=4950
    expect(result.totalCost).toBe(800)
    expect(result.wastedQty).toBe(5)
    expect(result.fulfilled).toBe(true)
  })

  it('picks the cheapest total even if unit price is higher', () => {
    const listings = [
      listing(99, 10),   // 99×10 = 990
      listing(5, 100),   // 5×100 = 500
    ]
    const result = calculateBestPurchase(listings, 5, false)
    expect(result.totalCost).toBe(500)
  })

  it('combines multiple listings when single ones are not enough', () => {
    const listings = [
      listing(3, 90),    // 3×90 = 270
      listing(2, 100),   // 2×100 = 200
      listing(99, 50),   // 99×50 = 4950
    ]
    // Need 5: best is 3@90 + 2@100 = 470, not 99@50=4950
    const result = calculateBestPurchase(listings, 5, false)
    expect(result.totalCost).toBe(470)
    expect(result.wastedQty).toBe(0)
    expect(result.fulfilled).toBe(true)
  })

  it('filters by hq flag', () => {
    const listings = [
      listing(5, 50, false),  // NQ
      listing(5, 200, true),  // HQ
    ]
    const nqResult = calculateBestPurchase(listings, 3, false)
    expect(nqResult.totalCost).toBe(5 * 50) // must buy full listing of 5

    const hqResult = calculateBestPurchase(listings, 3, true)
    expect(hqResult.totalCost).toBe(5 * 200)
  })

  it('returns unfulfilled when no listings available', () => {
    const result = calculateBestPurchase([], 5, false)
    expect(result.fulfilled).toBe(false)
    expect(result.totalCost).toBe(0)
  })

  it('returns unfulfilled when total available < needed', () => {
    const listings = [
      listing(2, 100),
      listing(1, 150),
    ]
    // Total available = 3, need 5
    // Best we can do is buy all 3 listings = 2×100 + 1×150 = 350
    const result = calculateBestPurchase(listings, 5, false)
    expect(result.fulfilled).toBe(false)
    expect(result.availableQty).toBe(3)
  })

  it('prefers exact-fit listings over cheaper but wasteful ones', () => {
    const listings = [
      listing(5, 120),   // exact fit: 5×120 = 600
      listing(99, 10),   // cheapest per unit but: 99×10 = 990
    ]
    const result = calculateBestPurchase(listings, 5, false)
    expect(result.totalCost).toBe(600)
  })
})

describe('aggregateMaterials', () => {
  it('deduplicates and sums amounts by itemId', () => {
    const result = aggregateMaterials([
      [
        { itemId: 100, name: 'A', icon: '', amount: 5 },
        { itemId: 200, name: 'B', icon: '', amount: 3 },
      ],
      [
        { itemId: 100, name: 'A', icon: '', amount: 2 },
      ],
    ])
    expect(result).toHaveLength(2)
    const a = result.find(m => m.itemId === 100)!
    expect(a.amount).toBe(7)
  })
})

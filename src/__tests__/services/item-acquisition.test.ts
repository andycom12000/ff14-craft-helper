import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  deriveAcquisition,
  fetchItemAcquisition,
  type GarlandItemDetail,
} from '@/services/item-acquisition'

function detail(item: NonNullable<GarlandItemDetail['item']>): GarlandItemDetail {
  return { item }
}

describe('deriveAcquisition', () => {
  it('marks tradeable items as canMarket', () => {
    expect(deriveAcquisition(detail({ tradeable: 1 })).canMarket).toBe(true)
  })

  it('marks tradeable=0 items as not canMarket', () => {
    expect(deriveAcquisition(detail({ tradeable: 0 })).canMarket).toBe(false)
  })

  it('treats missing tradeable field as marketable', () => {
    expect(deriveAcquisition(detail({})).canMarket).toBe(true)
  })

  it('detects gathering nodes (mining/botany)', () => {
    expect(deriveAcquisition(detail({ nodes: [1, 2] })).canGather).toBe(true)
  })

  it('detects fishing-only items', () => {
    expect(deriveAcquisition(detail({ fishingSpots: [1] })).canGather).toBe(true)
    expect(deriveAcquisition(detail({ fish: [{}] })).canGather).toBe(true)
  })

  it('detects spearfishing items', () => {
    expect(deriveAcquisition(detail({ spearfishingSpots: [1] })).canGather).toBe(true)
  })

  it('treats no gather sources as not gatherable', () => {
    expect(deriveAcquisition(detail({})).canGather).toBe(false)
    expect(deriveAcquisition(detail({ nodes: [], fishingSpots: [] })).canGather).toBe(false)
  })

  it('treats vendor + gil price as canNpc with npcPrice', () => {
    const r = deriveAcquisition(detail({ vendors: [{}], price: 42 }))
    expect(r.canNpc).toBe(true)
    expect(r.npcPrice).toBe(42)
  })

  it('treats vendor without gil price as NOT canNpc (likely trade-shop tokens)', () => {
    const r = deriveAcquisition(detail({ vendors: [{}] }))
    expect(r.canNpc).toBe(false)
    expect(r.npcPrice).toBeNull()
  })

  it('treats price=0 as no NPC sale', () => {
    const r = deriveAcquisition(detail({ vendors: [{}], price: 0 }))
    expect(r.canNpc).toBe(false)
    expect(r.npcPrice).toBeNull()
  })

  it('treats trade-shop-only items as NOT canNpc (token exchange, not gil)', () => {
    // Trade shops use tokens (scrips, tomestones, etc.), not gil. Garlandtools'
    // top-level item.price is the NPC gil-sale price and is unrelated to the
    // trade-shop cost — falling back to it falsely shows a gil price.
    const r = deriveAcquisition(detail({ tradeShops: [{}], price: 100 }))
    expect(r.canNpc).toBe(false)
    expect(r.npcPrice).toBeNull()
  })

  it('treats price=99999 as a placeholder, not a real NPC price', () => {
    // Real-world repro: itemId 44144 (佩魯佩魯棉線) returns
    // { tradeShops: [...], price: 99999 } — 99999 is garlandtools' sentinel
    // for "no real NPC gil price", not an actual sale price.
    const r = deriveAcquisition(detail({ vendors: [{}], price: 99999 }))
    expect(r.canNpc).toBe(false)
    expect(r.npcPrice).toBeNull()
  })

  it('佩魯佩魯棉線 fixture: tradeShops + price=99999 → no NPC gil', () => {
    const r = deriveAcquisition(detail({ tradeShops: [{}, {}], price: 99999 }))
    expect(r.canNpc).toBe(false)
    expect(r.npcPrice).toBeNull()
  })

  it('returns all-false when item is empty', () => {
    const r = deriveAcquisition(detail({}))
    expect(r).toEqual({
      canMarket: true,
      canGather: false,
      canNpc: false,
      npcPrice: null,
    })
  })
})

describe('fetchItemAcquisition', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('short-circuits non-positive itemIds (placeholder -1) to PERMISSIVE without a network call', async () => {
    // Regression for issue #90 bug 2 follow-up: BomView.fetchAcquisitionAvailability
    // is called with flatMaterials' itemIds, which can include the company-craft
    // meta target's -1. The Garlandtools endpoint 404s on /-1.json — defensive
    // short-circuit avoids the wasted request + console error.
    const result = await fetchItemAcquisition(-1)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result).toEqual({
      canMarket: true,
      canGather: true,
      canNpc: true,
      npcPrice: null,
    })
  })

  it('also short-circuits itemId=0', async () => {
    const result = await fetchItemAcquisition(0)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.canMarket).toBe(true)
  })
})

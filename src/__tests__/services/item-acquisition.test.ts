import { describe, it, expect } from 'vitest'
import {
  deriveAcquisition,
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

  it('treats trade-shops the same as vendors', () => {
    const r = deriveAcquisition(detail({ tradeShops: [{}], price: 100 }))
    expect(r.canNpc).toBe(true)
    expect(r.npcPrice).toBe(100)
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

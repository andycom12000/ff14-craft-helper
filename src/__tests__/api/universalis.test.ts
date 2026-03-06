import { describe, it, expect } from 'vitest'
import { aggregateByWorld } from '@/api/universalis'
import type { MarketListing } from '@/api/universalis'

function makeListing(overrides: Partial<MarketListing>): MarketListing {
  return {
    pricePerUnit: 100,
    quantity: 1,
    total: 100,
    hq: false,
    worldName: '巴哈姆特',
    lastReviewTime: 1700000000,
    ...overrides,
  }
}

describe('aggregateByWorld', () => {
  it('groups listings by world and computes min/avg prices', () => {
    const listings: MarketListing[] = [
      makeListing({ pricePerUnit: 500, worldName: '巴哈姆特', hq: false }),
      makeListing({ pricePerUnit: 600, worldName: '巴哈姆特', hq: false }),
      makeListing({ pricePerUnit: 800, worldName: '巴哈姆特', hq: true }),
      makeListing({ pricePerUnit: 400, worldName: '伊弗利特', hq: false }),
    ]

    const result = aggregateByWorld(listings)

    expect(result).toHaveLength(2)
    // Sorted by NQ min price ascending — 伊弗利特 (400) first
    expect(result[0].worldName).toBe('伊弗利特')
    expect(result[0].minPriceNQ).toBe(400)

    expect(result[1].worldName).toBe('巴哈姆特')
    expect(result[1].minPriceNQ).toBe(500)
    expect(result[1].avgPriceNQ).toBe(550)
    expect(result[1].minPriceHQ).toBe(800)
  })

  it('returns empty array for empty listings', () => {
    expect(aggregateByWorld([])).toEqual([])
  })

  it('handles world with only HQ listings', () => {
    const listings: MarketListing[] = [
      makeListing({ pricePerUnit: 900, worldName: '鳳凰', hq: true }),
    ]

    const result = aggregateByWorld(listings)

    expect(result).toHaveLength(1)
    expect(result[0].minPriceNQ).toBe(0)
    expect(result[0].minPriceHQ).toBe(900)
  })
})

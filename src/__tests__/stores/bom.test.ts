import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBomStore, getPrice } from '@/stores/bom'
import { useSettingsStore } from '@/stores/settings'
import type { PriceInfo } from '@/stores/bom'

const mockPrice: PriceInfo = {
  itemId: 1,
  minPrice: 500,
  avgPrice: 600,
  hqMinPrice: 800,
  hqAvgPrice: 900,
  lastUpdated: 1700000000,
}

describe('getPrice', () => {
  it('returns NQ min price for nq mode', () => {
    expect(getPrice(mockPrice, 'nq')).toBe(500)
  })

  it('returns HQ min price for hq mode', () => {
    expect(getPrice(mockPrice, 'hq')).toBe(800)
  })

  it('returns min of NQ and HQ for minOf mode', () => {
    expect(getPrice(mockPrice, 'minOf')).toBe(500)
  })

  it('minOf ignores zero values', () => {
    const priceNoNQ: PriceInfo = { ...mockPrice, minPrice: 0 }
    expect(getPrice(priceNoNQ, 'minOf')).toBe(800)

    const priceNoHQ: PriceInfo = { ...mockPrice, hqMinPrice: 0 }
    expect(getPrice(priceNoHQ, 'minOf')).toBe(500)
  })

  it('minOf returns 0 when both are zero', () => {
    const priceZero: PriceInfo = { ...mockPrice, minPrice: 0, hqMinPrice: 0 }
    expect(getPrice(priceZero, 'minOf')).toBe(0)
  })
})

describe('useBomStore.totalCost', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('computes total cost using priceDisplayMode', () => {
    const bomStore = useBomStore()
    const settingsStore = useSettingsStore()

    bomStore.flatMaterials = [
      { itemId: 1, name: 'A', icon: '', totalAmount: 10, isRaw: true },
      { itemId: 2, name: 'B', icon: '', totalAmount: 5, isRaw: true },
    ]
    bomStore.prices = new Map([
      [1, { itemId: 1, minPrice: 100, avgPrice: 110, hqMinPrice: 200, hqAvgPrice: 210, lastUpdated: 0 }],
      [2, { itemId: 2, minPrice: 50, avgPrice: 60, hqMinPrice: 80, hqAvgPrice: 90, lastUpdated: 0 }],
    ])

    settingsStore.priceDisplayMode = 'nq'
    expect(bomStore.totalCost).toBe(100 * 10 + 50 * 5) // 1250

    settingsStore.priceDisplayMode = 'hq'
    expect(bomStore.totalCost).toBe(200 * 10 + 80 * 5) // 2400
  })
})

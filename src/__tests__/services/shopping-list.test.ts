import { describe, it, expect } from 'vitest'
import {
  separateCrystals,
  groupByServer,
  aggregateMaterials,
  type MaterialWithPrice,
} from '@/services/shopping-list'

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

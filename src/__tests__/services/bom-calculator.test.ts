import { describe, it, expect } from 'vitest'
import { flattenMaterialTree, getCraftingOrder } from '@/services/bom-calculator'
import type { MaterialNode } from '@/stores/bom'

describe('flattenMaterialTree', () => {
  it('flattens nested tree and deduplicates by itemId', () => {
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 10,
        children: [
          { itemId: 1, name: 'Iron Ore', icon: '', amount: 3 },
          { itemId: 2, name: 'Coal', icon: '', amount: 2 },
        ],
      },
      {
        itemId: 200, name: 'Product B', icon: '', amount: 2, recipeId: 20,
        children: [
          { itemId: 1, name: 'Iron Ore', icon: '', amount: 5 },
        ],
      },
    ]

    const flat = flattenMaterialTree(tree)
    const ironOre = flat.find(m => m.itemId === 1)

    expect(ironOre).toBeDefined()
    expect(ironOre!.totalAmount).toBe(8) // 3 + 5 deduplicated
    expect(ironOre!.isRaw).toBe(true)
  })

  it('marks craftable intermediates as non-raw', () => {
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 10,
        children: [
          { itemId: 50, name: 'Intermediate', icon: '', amount: 2, recipeId: 5, children: [
            { itemId: 1, name: 'Raw', icon: '', amount: 4 },
          ]},
        ],
      },
    ]

    const flat = flattenMaterialTree(tree)
    const intermediate = flat.find(m => m.itemId === 50)
    const raw = flat.find(m => m.itemId === 1)

    expect(intermediate!.isRaw).toBe(false)
    expect(raw!.isRaw).toBe(true)
  })
})

describe('getCraftingOrder', () => {
  it('returns items in bottom-up order (raw first, products last)', () => {
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 10,
        children: [
          { itemId: 1, name: 'Raw A', icon: '', amount: 3 },
          { itemId: 2, name: 'Raw B', icon: '', amount: 2 },
        ],
      },
    ]

    const order = getCraftingOrder(tree)
    const names = order.map(o => o.name)

    expect(names.indexOf('Raw A')).toBeLessThan(names.indexOf('Product'))
    expect(names.indexOf('Raw B')).toBeLessThan(names.indexOf('Product'))
  })
})

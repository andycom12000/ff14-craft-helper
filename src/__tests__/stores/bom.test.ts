import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { useBomStore, getPrice } from '@/stores/bom'
import { useSettingsStore } from '@/stores/settings'
import type { PriceInfo, MaterialNode } from '@/stores/bom'

vi.mock('@/api/universalis', () => ({
  getAggregatedPrices: vi.fn(),
  getMarketDataByDC: vi.fn(),
  aggregateByWorld: vi.fn(),
}))
import {
  getAggregatedPrices,
  getMarketDataByDC,
  aggregateByWorld,
} from '@/api/universalis'

function priceInfo(itemId: number, nq: number, hq = nq): PriceInfo {
  return {
    itemId,
    minPrice: nq,
    avgPrice: nq,
    hqMinPrice: hq,
    hqAvgPrice: hq,
    lastUpdated: 0,
  }
}

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

/**
 * Tree shape used across the next describe blocks:
 *
 *   target (id=100, recipeId=1, amount=2, craftable)
 *     ├── child A (id=10, recipeId=2, amount=4, craftable — half intermediate)
 *     │     ├── leaf A1 (id=200, raw, amount=8)
 *     │     └── leaf A2 (id=201, raw, amount=4)
 *     └── leaf B   (id=202, raw, amount=6)
 */
function makeTree(): MaterialNode[] {
  const leafA1: MaterialNode = { itemId: 200, name: 'A1', icon: '', amount: 8 }
  const leafA2: MaterialNode = { itemId: 201, name: 'A2', icon: '', amount: 4 }
  const leafB: MaterialNode = { itemId: 202, name: 'B', icon: '', amount: 6 }
  const childA: MaterialNode = {
    itemId: 10,
    name: 'Half',
    icon: '',
    amount: 4,
    recipeId: 2,
    children: [leafA1, leafA2],
  }
  const target: MaterialNode = {
    itemId: 100,
    name: 'Target',
    icon: '',
    amount: 2,
    recipeId: 1,
    children: [childA, leafB],
  }
  return [target]
}

describe('useBomStore.setAcquisitionMode', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('writes mode for raw items', () => {
    const bom = useBomStore()
    bom.setAcquisitionMode(200, 'gather')
    expect(bom.getEffectiveMode(200)).toBe('gather')
  })

  it('falls through to market when no mode is set', () => {
    const bom = useBomStore()
    expect(bom.getEffectiveMode(999)).toBe('market')
  })

  it('returns "craft" for an expanded craftable regardless of stored mode', () => {
    const bom = useBomStore()
    bom.materialTree = makeTree()
    // node 10 is a craftable intermediate, expanded by default (no collapsed)
    expect(bom.getEffectiveMode(10)).toBe('craft')
  })

  it('switching a craftable to market collapses the node', () => {
    const bom = useBomStore()
    bom.materialTree = makeTree()
    bom.setAcquisitionMode(10, 'market')
    expect(bom.getEffectiveMode(10)).toBe('market')
    expect(bom.findNode(10)?.collapsed).toBe(true)
  })

  it('switching a collapsed craftable back to craft un-collapses', () => {
    const bom = useBomStore()
    bom.materialTree = makeTree()
    bom.setAcquisitionMode(10, 'market')
    bom.setAcquisitionMode(10, 'craft')
    expect(bom.getEffectiveMode(10)).toBe('craft')
    expect(bom.findNode(10)?.collapsed).toBe(false)
  })

  it('rejects "craft" on a non-craftable item', () => {
    const bom = useBomStore()
    bom.materialTree = makeTree()
    bom.setAcquisitionMode(200, 'craft')
    // mode shouldn't flip to craft for a leaf
    expect(bom.getEffectiveMode(200)).toBe('market')
  })
})

describe('useBomStore.applyOptimalDefaults', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const settings = useSettingsStore()
    settings.priceDisplayMode = 'nq'
  })

  it('picks market when its cost beats craft and NPC for a craftable', () => {
    const bom = useBomStore()
    bom.targets = [{ itemId: 100, recipeId: 1, name: 'Target', icon: '', quantity: 2 }]
    bom.materialTree = makeTree()
    // children's market prices total: leafA1 8×5 + leafA2 4×5 = 60. childA market 4×10 = 40.
    // childA market (40) < its craft cost (60). Default should pick market.
    bom.prices = new Map([
      [10, priceInfo(10, 10)],
      [200, priceInfo(200, 5)],
      [201, priceInfo(201, 5)],
      [202, priceInfo(202, 3)],
    ])
    bom.applyOptimalDefaults()
    expect(bom.getEffectiveMode(10)).toBe('market')
    // Leaves stay market (default cheapest with no NPC alternative)
    expect(bom.getEffectiveMode(202)).toBe('market')
  })

  it('keeps craftable on craft when craft cost is cheapest', () => {
    const bom = useBomStore()
    bom.targets = [{ itemId: 100, recipeId: 1, name: 'Target', icon: '', quantity: 2 }]
    bom.materialTree = makeTree()
    // childA market 100; craft cost = 8×1 + 4×1 = 12. Should stay craft.
    bom.prices = new Map([
      [10, priceInfo(10, 100)],
      [200, priceInfo(200, 1)],
      [201, priceInfo(201, 1)],
      [202, priceInfo(202, 1)],
    ])
    bom.applyOptimalDefaults()
    expect(bom.getEffectiveMode(10)).toBe('craft')
    expect(bom.findNode(10)?.collapsed).toBeFalsy()
  })

  it('picks NPC when it is cheaper than market', () => {
    const bom = useBomStore()
    bom.targets = [{ itemId: 100, recipeId: 1, name: 'Target', icon: '', quantity: 2 }]
    bom.materialTree = makeTree()
    bom.prices = new Map([
      [10, priceInfo(10, 50)],
      [200, priceInfo(200, 5)],
      [201, priceInfo(201, 5)],
      [202, priceInfo(202, 100)], // expensive on market
    ])
    bom.acquisitionAvailability = new Map([
      [202, { canMarket: true, canGather: false, canNpc: true, npcPrice: 8 }], // NPC much cheaper
    ])
    bom.applyOptimalDefaults()
    expect(bom.getEffectiveMode(202)).toBe('npc')
  })

  it('targets always stay on craft', () => {
    const bom = useBomStore()
    bom.targets = [{ itemId: 100, recipeId: 1, name: 'Target', icon: '', quantity: 2 }]
    bom.materialTree = makeTree()
    bom.prices = new Map([
      [100, priceInfo(100, 1)], // target market is dirt-cheap
      [10, priceInfo(10, 100)],
      [200, priceInfo(200, 100)],
      [201, priceInfo(201, 100)],
      [202, priceInfo(202, 100)],
    ])
    bom.applyOptimalDefaults()
    // target (100) is craftable + in target list — should stay craft
    expect(bom.getEffectiveMode(100)).toBe('craft')
  })

  it('does not pick NPC when no npcPrice is known (Infinity guard)', () => {
    const bom = useBomStore()
    bom.targets = [{ itemId: 100, recipeId: 1, name: 'Target', icon: '', quantity: 2 }]
    bom.materialTree = makeTree()
    bom.prices = new Map([[202, priceInfo(202, 50)]])
    bom.acquisitionAvailability = new Map([
      [202, { canMarket: true, canGather: false, canNpc: false, npcPrice: null }],
    ])
    bom.applyOptimalDefaults()
    expect(bom.getEffectiveMode(202)).toBe('market')
  })

  it('falls back to market when no price data is available', () => {
    const bom = useBomStore()
    bom.targets = [{ itemId: 100, recipeId: 1, name: 'Target', icon: '', quantity: 2 }]
    bom.materialTree = makeTree()
    // No prices at all
    bom.applyOptimalDefaults()
    // Should not throw; mode defaults to market for raw leaves
    expect(bom.getEffectiveMode(202)).toBe('market')
  })

  it('non-craftable target picks the cheapest of {market, npc} (not forced craft)', () => {
    const bom = useBomStore()
    // Single non-craftable target — recipeId null, no children in the tree.
    bom.targets = [{ itemId: 500, recipeId: null, name: 'Housing Item', icon: '', quantity: 1 }]
    bom.materialTree = [
      { itemId: 500, name: 'Housing Item', icon: '', amount: 1 },
    ]
    bom.prices = new Map([[500, priceInfo(500, 9999)]]) // expensive on market
    bom.acquisitionAvailability = new Map([
      [500, { canMarket: true, canGather: false, canNpc: true, npcPrice: 100 }],
    ])
    bom.applyOptimalDefaults()
    // NPC is much cheaper → mode flips even though item is in target list
    expect(bom.getEffectiveMode(500)).toBe('npc')
  })
})

describe('useBomStore.fetchPrices', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // fetchPrices now short-circuits when neither server nor data-center is
    // set (avoids producing a `v2//ids` URL that 404s). Give the tests a
    // valid scope so they exercise the success/failure paths instead.
    const settings = useSettingsStore()
    settings.server = 'TestServer'
    vi.mocked(getAggregatedPrices).mockReset()
  })

  it('marks every requested id as ok on success', async () => {
    vi.mocked(getAggregatedPrices).mockResolvedValue(
      new Map([
        [
          200,
          {
            minPriceNQ: 5,
            currentAveragePriceNQ: 5,
            minPriceHQ: 0,
            currentAveragePriceHQ: 0,
            lastUploadTime: 0,
          },
        ],
      ]) as unknown as Awaited<ReturnType<typeof getAggregatedPrices>>,
    )
    const bom = useBomStore()
    const r = await bom.fetchPrices([200, 201])
    expect(r.ok).toBe(true)
    expect(bom.priceFetchStatus.get(200)).toBe('ok')
    // id with no listings still flips to 'ok' — empty result is "no data", not failure
    expect(bom.priceFetchStatus.get(201)).toBe('ok')
  })

  it('marks every requested id as failed when fetch throws', async () => {
    vi.mocked(getAggregatedPrices).mockRejectedValue(new Error('network'))
    const bom = useBomStore()
    const r = await bom.fetchPrices([200, 201])
    expect(r.ok).toBe(false)
    expect(bom.priceFetchStatus.get(200)).toBe('failed')
    expect(bom.priceFetchStatus.get(201)).toBe('failed')
  })

  it('failedPriceCount only counts flat materials', async () => {
    vi.mocked(getAggregatedPrices).mockRejectedValue(new Error('network'))
    const bom = useBomStore()
    bom.flatMaterials = [
      { itemId: 200, name: 'A', icon: '', totalAmount: 1, isRaw: true },
      { itemId: 201, name: 'B', icon: '', totalAmount: 1, isRaw: true },
    ]
    await bom.fetchPrices([200, 201, 999]) // 999 isn't in flatMaterials
    expect(bom.failedPriceCount).toBe(2)
  })

  it('isPriceFetching tracks per-id during the request', async () => {
    let resolve: ((v: Awaited<ReturnType<typeof getAggregatedPrices>>) => void) | null = null
    vi.mocked(getAggregatedPrices).mockImplementation(
      () => new Promise((r) => { resolve = r as never }),
    )
    const bom = useBomStore()
    const promise = bom.fetchPrices([200])
    expect(bom.isPriceFetching(200)).toBe(true)
    resolve!(new Map() as never)
    await promise
    expect(bom.isPriceFetching(200)).toBe(false)
  })

  it('a successful retry of one id flips its failed status to ok', async () => {
    vi.mocked(getAggregatedPrices).mockRejectedValueOnce(new Error('network'))
    const bom = useBomStore()
    await bom.fetchPrices([200])
    expect(bom.priceFetchStatus.get(200)).toBe('failed')

    vi.mocked(getAggregatedPrices).mockResolvedValueOnce(
      new Map() as unknown as Awaited<ReturnType<typeof getAggregatedPrices>>,
    )
    await bom.fetchPrices([200])
    expect(bom.priceFetchStatus.get(200)).toBe('ok')
  })
})

describe('targetDefaultMode persistence', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('defaults to "craft" when LS is empty', () => {
    const bom = useBomStore()
    expect(bom.targetDefaultMode).toBe('craft')
  })

  it('reads "market" from existing bom-route-prefs LS entry', () => {
    localStorage.setItem('bom-route-prefs', JSON.stringify({
      optimizeBy: 'gil',
      targetDefaultMode: 'market',
    }))
    setActivePinia(createPinia())
    const bom = useBomStore()
    expect(bom.targetDefaultMode).toBe('market')
  })

  it('persists changes via setTargetDefaultMode', () => {
    const bom = useBomStore()
    bom.setTargetDefaultMode('market')
    const raw = JSON.parse(localStorage.getItem('bom-route-prefs')!)
    expect(raw.targetDefaultMode).toBe('market')
    expect(raw.optimizeBy).toBe('gil')
  })

  it('falls back to "craft" for invalid LS values', () => {
    localStorage.setItem('bom-route-prefs', JSON.stringify({ targetDefaultMode: 'lol' }))
    setActivePinia(createPinia())
    const bom = useBomStore()
    expect(bom.targetDefaultMode).toBe('craft')
  })
})

describe('crossWorldBestPriceMap state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('initializes empty', () => {
    const bom = useBomStore()
    expect(bom.crossWorldBestPriceMap.size).toBe(0)
    expect(bom.crossWorldFetchStatus.size).toBe(0)
    expect(bom.fetchingCrossWorldIds.size).toBe(0)
  })

  it('exposes CrossWorldBest entries with worldName + minPrice + fetchedAt', () => {
    const bom = useBomStore()
    bom.crossWorldBestPriceMap.set(123, {
      worldName: 'Tonberry',
      minPrice: 1500,
      fetchedAt: Date.now(),
    })
    const entry = bom.crossWorldBestPriceMap.get(123)
    expect(entry?.worldName).toBe('Tonberry')
    expect(entry?.minPrice).toBe(1500)
  })
})

describe('applyTargetDefault', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('craft mode: keeps craftable targets expanded', () => {
    const bom = useBomStore()
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
        children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
      },
    ]
    bom.materialTree = tree
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.setTargetDefaultMode('craft')
    bom.applyTargetDefault()
    expect(tree[0].collapsed).toBeFalsy()
    expect(bom.getEffectiveMode(100)).toBe('craft')
  })

  it('market mode: collapses untouched craftable targets', () => {
    const bom = useBomStore()
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
        children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
      },
    ]
    bom.materialTree = tree
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.setTargetDefaultMode('market')
    bom.applyTargetDefault()
    expect(tree[0].collapsed).toBe(true)
    expect(bom.getEffectiveMode(100)).toBe('market')
  })

  it('market mode: leaves user-touched targets alone', () => {
    const bom = useBomStore()
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
        children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
      },
    ]
    bom.materialTree = tree
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.setAcquisitionMode(100, 'craft', true)
    bom.setTargetDefaultMode('market')
    bom.applyTargetDefault()
    expect(tree[0].collapsed).toBeFalsy()
    expect(bom.getEffectiveMode(100)).toBe('craft')
  })

  it('non-craftable targets are unaffected by targetDefaultMode', () => {
    const bom = useBomStore()
    const tree: MaterialNode[] = [
      { itemId: 200, name: 'npc-only', icon: '', amount: 1 },
    ]
    bom.materialTree = tree
    bom.targets = [{ itemId: 200, recipeId: null, name: 'npc-only', icon: '', quantity: 1 }]
    bom.setTargetDefaultMode('market')
    bom.applyTargetDefault()
    expect(bom.getEffectiveMode(200)).toBe('market')
  })
})

describe('fetchCrossWorldBestForTargets', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.mocked(getMarketDataByDC).mockReset()
    vi.mocked(aggregateByWorld).mockReset()
  })

  it('writes the cheapest world (incl. home) into crossWorldBestPriceMap', async () => {
    vi.mocked(getMarketDataByDC).mockResolvedValue({ listings: [] } as never)
    vi.mocked(aggregateByWorld).mockReturnValue([
      { worldName: 'Tonberry', minPriceNQ: 1500, minPriceHQ: 0, avgPriceNQ: 1600, avgPriceHQ: 0, lastUploadTime: 0, listingCount: 1 },
      { worldName: 'Mandragora', minPriceNQ: 2000, minPriceHQ: 0, avgPriceNQ: 2100, avgPriceHQ: 0, lastUploadTime: 0, listingCount: 1 },
    ])
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.dataCenter = 'Materia'
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]

    await bom.fetchCrossWorldBestForTargets()

    const entry = bom.crossWorldBestPriceMap.get(100)
    expect(entry?.worldName).toBe('Tonberry')
    expect(entry?.minPrice).toBe(1500)
    expect(bom.crossWorldFetchStatus.get(100)).toBe('ok')
  })

  it('marks status="ok" but writes no entry when no NQ listings exist', async () => {
    vi.mocked(getMarketDataByDC).mockResolvedValue({ listings: [] } as never)
    vi.mocked(aggregateByWorld).mockReturnValue([
      { worldName: 'Mandragora', minPriceNQ: 0, minPriceHQ: 0, avgPriceNQ: 0, avgPriceHQ: 0, lastUploadTime: 0, listingCount: 0 },
    ])
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.dataCenter = 'Materia'
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]

    await bom.fetchCrossWorldBestForTargets()

    expect(bom.crossWorldBestPriceMap.has(100)).toBe(false)
    expect(bom.crossWorldFetchStatus.get(100)).toBe('ok')
  })

  it('marks status="failed" on API error', async () => {
    vi.mocked(getMarketDataByDC).mockRejectedValue(new Error('boom'))
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.dataCenter = 'Materia'
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]

    await bom.fetchCrossWorldBestForTargets()

    expect(bom.crossWorldFetchStatus.get(100)).toBe('failed')
    expect(bom.crossWorldBestPriceMap.has(100)).toBe(false)
  })

  it('skips items already in the cache', async () => {
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.dataCenter = 'Materia'
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.crossWorldBestPriceMap.set(100, { worldName: 'Tonberry', minPrice: 1500, fetchedAt: 1 })

    await bom.fetchCrossWorldBestForTargets()

    expect(vi.mocked(getMarketDataByDC)).not.toHaveBeenCalled()
  })

  it('retryCrossWorldFetch clears status and refetches a single item', async () => {
    vi.mocked(getMarketDataByDC).mockResolvedValue({ listings: [] } as never)
    vi.mocked(aggregateByWorld).mockReturnValue([
      { worldName: 'Tonberry', minPriceNQ: 1500, minPriceHQ: 0, avgPriceNQ: 1600, avgPriceHQ: 0, lastUploadTime: 0, listingCount: 1 },
    ])
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.dataCenter = 'Materia'
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.crossWorldFetchStatus.set(100, 'failed')

    await bom.retryCrossWorldFetch(100)

    expect(bom.crossWorldBestPriceMap.get(100)?.minPrice).toBe(1500)
    expect(bom.crossWorldFetchStatus.get(100)).toBe('ok')
  })
})

describe('effectiveGrandTotalBreakdown', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('home === crossWorldBest in craft mode (no swap)', () => {
    const bom = useBomStore()
    bom.flatMaterials = [{ itemId: 50, name: 'c', icon: '', totalAmount: 5, isRaw: true }]
    bom.prices.set(50, priceInfo(50, 100))
    const breakdown = bom.effectiveGrandTotalBreakdown
    expect(breakdown.home).toBe(500)
    expect(breakdown.crossWorldBest).toBe(500)
    expect(breakdown.savings).toBe(0)
  })

  it('market mode: swaps craftable target price to crossWorldBest', () => {
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.crossServer = true
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 2 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 2, recipeId: 9001, collapsed: true,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.flatMaterials = [{ itemId: 100, name: 't', icon: '', totalAmount: 2, isRaw: true }]
    bom.prices.set(100, priceInfo(100, 1000))
    bom.crossWorldBestPriceMap.set(100, {
      worldName: 'Tonberry', minPrice: 800, fetchedAt: 1,
    })
    bom.setTargetDefaultMode('market')

    const breakdown = bom.effectiveGrandTotalBreakdown
    expect(breakdown.home).toBe(2000)
    expect(breakdown.crossWorldBest).toBe(1600)
    expect(breakdown.savings).toBe(400)
  })

  it('falls back to home price when crossWorldBestPriceMap entry missing', () => {
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.crossServer = true
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001, collapsed: true,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.flatMaterials = [{ itemId: 100, name: 't', icon: '', totalAmount: 1, isRaw: true }]
    bom.prices.set(100, priceInfo(100, 1000))
    bom.setTargetDefaultMode('market')

    const breakdown = bom.effectiveGrandTotalBreakdown
    expect(breakdown.home).toBe(1000)
    expect(breakdown.crossWorldBest).toBe(1000)
    expect(breakdown.savings).toBe(0)
  })

  it('savings clamps to 0 when home < crossWorldBest (defensive)', () => {
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.crossServer = true
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001, collapsed: true,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.flatMaterials = [{ itemId: 100, name: 't', icon: '', totalAmount: 1, isRaw: true }]
    bom.prices.set(100, priceInfo(100, 500))
    bom.crossWorldBestPriceMap.set(100, {
      worldName: 'Tonberry', minPrice: 800, fetchedAt: 1,
    })
    bom.setTargetDefaultMode('market')

    expect(bom.effectiveGrandTotalBreakdown.savings).toBe(0)
  })
})

describe('cross-world reactivity', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.mocked(getMarketDataByDC).mockReset()
    vi.mocked(aggregateByWorld).mockReset()
  })

  it('clears crossWorldBestPriceMap when dataCenter changes', async () => {
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.dataCenter = 'Materia'
    bom.crossWorldBestPriceMap.set(100, { worldName: 'Tonberry', minPrice: 1500, fetchedAt: 1 })

    settings.dataCenter = 'Mana'
    await flushPromises()

    expect(bom.crossWorldBestPriceMap.has(100)).toBe(false)
  })

  it('keeps crossWorldBestPriceMap when crossServer flips off', async () => {
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.crossServer = true
    bom.crossWorldBestPriceMap.set(100, { worldName: 'Tonberry', minPrice: 1500, fetchedAt: 1 })

    settings.crossServer = false
    await flushPromises()

    expect(bom.crossWorldBestPriceMap.has(100)).toBe(true)
  })

  it('triggers fetch when targets change while in market mode + crossServer', async () => {
    vi.mocked(getMarketDataByDC).mockResolvedValue({ listings: [] } as never)
    vi.mocked(aggregateByWorld).mockReturnValue([
      { worldName: 'Tonberry', minPriceNQ: 1500, minPriceHQ: 0, avgPriceNQ: 1600, avgPriceHQ: 0, lastUploadTime: 0, listingCount: 1 },
    ])
    const bom = useBomStore()
    const settings = useSettingsStore()
    settings.crossServer = true
    settings.dataCenter = 'Materia'
    bom.setTargetDefaultMode('market')

    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    await flushPromises()

    expect(vi.mocked(getMarketDataByDC)).toHaveBeenCalled()
    expect(bom.crossWorldBestPriceMap.get(100)?.minPrice).toBe(1500)
  })
})

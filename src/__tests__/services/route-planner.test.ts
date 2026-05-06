import { describe, it, expect } from 'vitest'
import {
  sortRoute,
  type RouteInput,
  type AetheryteInfo,
  type RouteRow,
  type ChosenSource,
} from '@/services/route-planner'

// ── Fixture helpers ───────────────────────────────────────────────────────────

const aether = (overrides: Partial<AetheryteInfo> = {}): AetheryteInfo =>
  ({ name: 'A', x: 0, y: 0, tpCostBase: 100, ...overrides })

const baseInput = (overrides: Partial<RouteInput> = {}): RouteInput => ({
  rows: [],
  aetherytes: new Map(),
  optimizeBy: 'gil',
  excluded: new Set(),
  ...overrides,
})

const src = (overrides: Partial<ChosenSource>): ChosenSource => ({
  zoneId: 1,
  x: 10,
  y: 10,
  ...overrides,
})

const npcRow = (itemId: number, sources: RouteRow['sources'], qty = 1): RouteRow =>
  ({ itemId, mode: 'npc', qty, sources })

const gatherRow = (itemId: number, sources: RouteRow['sources'], qty = 1): RouteRow =>
  ({ itemId, mode: 'gather', qty, sources })

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sortRoute', () => {
  // ── Case 1: Empty input ────────────────────────────────────────────────────

  it('returns empty groups for empty input', () => {
    const result = sortRoute(baseInput())
    expect(result.groups).toEqual([])
    expect(result.totalTpCost).toBe(0)
    expect(result.totalHops).toBe(0)
  })

  // ── Case 2: Filter crystals (itemId < 20) and excluded ids ────────────────

  it('filters crystals (itemId < 20) and excluded items', () => {
    const result = sortRoute(baseInput({
      rows: [
        npcRow(5, [src({ zoneId: 1, itemPrice: 10 })]),    // crystal — removed
        npcRow(100, [src({ zoneId: 1, itemPrice: 10 })]), // excluded — removed
        npcRow(200, [src({ zoneId: 1, itemPrice: 10 })]), // kept
      ],
      excluded: new Set([100]),
    }))
    expect(result.groups.flatMap(g => g.rows).map(r => r.itemId)).toEqual([200])
    expect(result.groups).toHaveLength(1)
  })

  // ── Case 3: Pass 1 picks cheapest source by gil ───────────────────────────

  it('Pass 1: picks cheapest source by gil cost (price*qty + tpCost)', () => {
    // Zone 10: cost = 5*1 + 100 = 105
    // Zone 20: cost = 3*1 + 200 = 203  ← more expensive overall
    const aetherytes = new Map([
      [10, [aether({ name: 'A10', x: 0, y: 0, tpCostBase: 100 })]],
      [20, [aether({ name: 'A20', x: 0, y: 0, tpCostBase: 200 })]],
    ])
    const result = sortRoute(baseInput({
      rows: [
        npcRow(50, [
          src({ zoneId: 10, itemPrice: 5 }),
          src({ zoneId: 20, itemPrice: 3 }),
        ]),
      ],
      aetherytes,
    }))
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].zoneId).toBe(10)
  })

  // ── Case 4: Tie-break gather → nodeLevel ASC ──────────────────────────────

  it('Tie-break (gather): picks source with lower nodeLevel', () => {
    // Both zones have tpCost=0 (no aetherytes) and no itemPrice (0)
    // Zone 1 nodeLevel=50, Zone 2 nodeLevel=30 → Zone 2 wins
    const result = sortRoute(baseInput({
      rows: [
        gatherRow(50, [
          src({ zoneId: 1, nodeLevel: 50 }),
          src({ zoneId: 2, nodeLevel: 30 }),
        ]),
      ],
    }))
    expect(result.groups[0].zoneId).toBe(2)
  })

  // ── Case 5: Tie-break npc → vendorName alphabetical ──────────────────────

  it('Tie-break (npc): picks source with alphabetically earlier vendorName', () => {
    // Both zones tpCost=0, same itemPrice=10
    // Zone 1 vendorName='Alpha Vendor', Zone 2 vendorName='Zeta Vendor' → Zone 1 wins
    const result = sortRoute(baseInput({
      rows: [
        npcRow(50, [
          src({ zoneId: 2, itemPrice: 10, vendorName: 'Zeta Vendor' }),
          src({ zoneId: 1, itemPrice: 10, vendorName: 'Alpha Vendor' }),
        ]),
      ],
    }))
    expect(result.groups[0].zoneId).toBe(1)
  })

  // ── Case 6: Pick nearest aetheryte by centroid ────────────────────────────

  it('picks aetheryte nearest to centroid of all zone stops', () => {
    // Zone 1 has stops at (10,10) and (20,20); centroid = (15,15)
    // Near=(15,15) dist=0; Far=(100,100) dist≈120 → Near wins
    const aetherytes = new Map([
      [1, [
        aether({ name: 'Near', x: 15, y: 15, tpCostBase: 100 }),
        aether({ name: 'Far', x: 100, y: 100, tpCostBase: 100 }),
      ]],
    ])
    const result = sortRoute(baseInput({
      rows: [
        npcRow(50, [src({ zoneId: 1, x: 10, y: 10 })]),
        npcRow(51, [src({ zoneId: 1, x: 20, y: 20 })]),
      ],
      aetherytes,
    }))
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].aetheryte?.name).toBe('Near')
  })

  // ── Case 7: Within-zone sort by distance from aetheryte ──────────────────

  it('assigns orderInZone by distance from aetheryte ASC', () => {
    // Aetheryte at (0,0); stops: item50 at (5,0) dist=5, item51 at (20,0) dist=20, item52 at (10,0) dist=10
    // Expected orderInZone: item50=1, item52=2, item51=3
    const aetherytes = new Map([
      [1, [aether({ name: 'Origin', x: 0, y: 0, tpCostBase: 100 })]],
    ])
    const result = sortRoute(baseInput({
      rows: [
        npcRow(50, [src({ zoneId: 1, x: 5, y: 0 })]),
        npcRow(51, [src({ zoneId: 1, x: 20, y: 0 })]),
        npcRow(52, [src({ zoneId: 1, x: 10, y: 0 })]),
      ],
      aetherytes,
    }))
    const group = result.groups[0]
    const sorted = group.rows.slice().sort((a, b) => a.orderInZone - b.orderInZone)
    expect(sorted.map(r => r.itemId)).toEqual([50, 52, 51])
  })

  // ── Case 8: Between-zone sort by tpCost ASC ──────────────────────────────

  it('orders zones by tpCost ASC (most expensive zone last)', () => {
    const aetherytes = new Map([
      [1, [aether({ name: 'A1', x: 0, y: 0, tpCostBase: 213 })]],
      [2, [aether({ name: 'A2', x: 0, y: 0, tpCostBase: 213 })]],
      [3, [aether({ name: 'A3', x: 0, y: 0, tpCostBase: 425 })]],
    ])
    const result = sortRoute(baseInput({
      rows: [
        npcRow(50, [src({ zoneId: 3 })]),
        npcRow(51, [src({ zoneId: 1 })]),
        npcRow(52, [src({ zoneId: 2 })]),
      ],
      aetherytes,
    }))
    const tpCosts = result.groups.map(g => g.tpCost)
    // Zone 3 (425G) must be last
    expect(tpCosts[tpCosts.length - 1]).toBe(425)
    // First two must be 213G each
    expect(tpCosts[0]).toBe(213)
    expect(tpCosts[1]).toBe(213)
  })

  // ── Case 9: Null aetheryte zone sorts last + tpCost=0 ────────────────────

  it('zones with no known aetheryte sort last and have tpCost=0', () => {
    const aetherytes = new Map([
      [1, [aether({ name: 'A1', x: 0, y: 0, tpCostBase: 100 })]],
      // Zone 99 is intentionally absent from the map
    ])
    const result = sortRoute(baseInput({
      rows: [
        npcRow(50, [src({ zoneId: 99, x: 5, y: 5 })]),
        npcRow(51, [src({ zoneId: 1, x: 5, y: 5 })]),
      ],
      aetherytes,
    }))
    expect(result.groups).toHaveLength(2)
    const last = result.groups[result.groups.length - 1]
    expect(last.zoneId).toBe(99)
    expect(last.aetheryte).toBeNull()
    expect(last.tpCost).toBe(0)
  })

  // ── Case 10: Pass 2 consolidates row into popular zone ───────────────────

  it('Pass 2 (hop mode): moves a lone-zone row into an already-visited zone', () => {
    // item 50: primary=zone 2 (cheaper by gil), alt=zone 1 at same price
    // Zone 1 already has items 51 and 52
    // In hop mode: item 50 should consolidate into zone 1 (removes zone 2)
    const aetherytes = new Map([
      [1, [aether({ name: 'A1', x: 0, y: 0, tpCostBase: 100 })]],
      [2, [aether({ name: 'A2', x: 0, y: 0, tpCostBase: 100 })]],
    ])
    const result = sortRoute(baseInput({
      rows: [
        npcRow(50, [
          src({ zoneId: 2, itemPrice: 10 }), // same tpCost as zone 1, same price
          src({ zoneId: 1, itemPrice: 10 }), // alt in popular zone
        ]),
        npcRow(51, [src({ zoneId: 1, itemPrice: 5 })]),
        npcRow(52, [src({ zoneId: 1, itemPrice: 5 })]),
      ],
      aetherytes,
      optimizeBy: 'hop',
    }))
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].zoneId).toBe(1)
    expect(result.totalHops).toBe(1)
  })

  // ── Case 11: Pass 2 respects 30% gil cap ─────────────────────────────────

  it('Pass 2 (hop mode): does NOT move row when alt source exceeds 30% gil increase', () => {
    // item 50 current: zone 2, price=10 → costOf = 10*1 + 100 = 110
    // item 50 alt:     zone 1, price=50 → costOf = 50*1 + 100 = 150
    // gilDelta = 40; gilDelta / costOf(current) = 40/110 ≈ 36% > 30% → do NOT move
    const aetherytes = new Map([
      [1, [aether({ name: 'A1', x: 0, y: 0, tpCostBase: 100 })]],
      [2, [aether({ name: 'A2', x: 0, y: 0, tpCostBase: 100 })]],
    ])
    const result = sortRoute(baseInput({
      rows: [
        npcRow(50, [
          src({ zoneId: 2, itemPrice: 10 }),  // primary
          src({ zoneId: 1, itemPrice: 50 }),  // alt: 50+100=150; delta=40; 40/110≈36% > 30%
        ]),
        npcRow(51, [src({ zoneId: 1, itemPrice: 5 })]),
        npcRow(52, [src({ zoneId: 1, itemPrice: 5 })]),
      ],
      aetherytes,
      optimizeBy: 'hop',
    }))
    // Zone 2 must remain (item 50 was NOT moved)
    expect(result.groups).toHaveLength(2)
  })

  // ── Case 12: Pass 2 NOT triggered when optimizeBy='gil' ──────────────────

  it('Pass 2 is skipped entirely when optimizeBy is "gil"', () => {
    // Same consolidatable fixture as case 10, but in gil mode
    const aetherytes = new Map([
      [1, [aether({ name: 'A1', x: 0, y: 0, tpCostBase: 100 })]],
      [2, [aether({ name: 'A2', x: 0, y: 0, tpCostBase: 100 })]],
    ])
    const result = sortRoute(baseInput({
      rows: [
        npcRow(50, [
          src({ zoneId: 2, itemPrice: 10 }),
          src({ zoneId: 1, itemPrice: 10 }),
        ]),
        npcRow(51, [src({ zoneId: 1, itemPrice: 5 })]),
        npcRow(52, [src({ zoneId: 1, itemPrice: 5 })]),
      ],
      aetherytes,
      optimizeBy: 'gil',
    }))
    // No Pass 2 → 2 zones remain (item 50 stays in zone 2 or 1 based on tie-break, plus zone 1)
    expect(result.groups).toHaveLength(2)
  })

  // ── Case 13: Hero marking — largest group by row count ───────────────────

  it('marks the group with the most rows as hero', () => {
    const aetherytes = new Map([
      [1, [aether({ name: 'A1', x: 0, y: 0, tpCostBase: 100 })]],
      [2, [aether({ name: 'A2', x: 0, y: 0, tpCostBase: 100 })]],
      [3, [aether({ name: 'A3', x: 0, y: 0, tpCostBase: 100 })]],
    ])
    const result = sortRoute(baseInput({
      rows: [
        // Zone 1: 4 rows
        npcRow(50, [src({ zoneId: 1, itemPrice: 1 })]),
        npcRow(51, [src({ zoneId: 1, itemPrice: 1 })]),
        npcRow(52, [src({ zoneId: 1, itemPrice: 1 })]),
        npcRow(53, [src({ zoneId: 1, itemPrice: 1 })]),
        // Zone 2: 2 rows
        npcRow(60, [src({ zoneId: 2, itemPrice: 1 })]),
        npcRow(61, [src({ zoneId: 2, itemPrice: 1 })]),
        // Zone 3: 1 row
        npcRow(70, [src({ zoneId: 3, itemPrice: 1 })]),
      ],
      aetherytes,
    }))
    expect(result.groups.length).toBeGreaterThanOrEqual(2)
    const heroGroup = result.groups.find(g => g.isHero === true)
    expect(heroGroup).toBeDefined()
    expect(heroGroup?.zoneId).toBe(1)
  })

  // ── Case 14: Hero marking — ties broken by total gil ─────────────────────

  it('breaks hero ties (equal row count) by total estimated gil (itemPrice * qty)', () => {
    const aetherytes = new Map([
      [1, [aether({ name: 'A1', x: 0, y: 0, tpCostBase: 100 })]],
      [2, [aether({ name: 'A2', x: 0, y: 0, tpCostBase: 100 })]],
    ])
    const result = sortRoute(baseInput({
      rows: [
        // Zone 1: 2 rows, total gil = 5+5 = 10
        npcRow(50, [src({ zoneId: 1, itemPrice: 5 })]),
        npcRow(51, [src({ zoneId: 1, itemPrice: 5 })]),
        // Zone 2: 2 rows, total gil = 20+20 = 40 → wins hero
        npcRow(60, [src({ zoneId: 2, itemPrice: 20 })]),
        npcRow(61, [src({ zoneId: 2, itemPrice: 20 })]),
      ],
      aetherytes,
    }))
    const heroGroup = result.groups.find(g => g.isHero === true)
    expect(heroGroup?.zoneId).toBe(2)
  })

  // ── Case 15: Single group → no hero ──────────────────────────────────────

  it('does not mark hero when there is only one group', () => {
    const aetherytes = new Map([
      [1, [aether({ name: 'A1', x: 0, y: 0, tpCostBase: 100 })]],
    ])
    const result = sortRoute(baseInput({
      rows: [
        npcRow(50, [src({ zoneId: 1, itemPrice: 10 })]),
        npcRow(51, [src({ zoneId: 1, itemPrice: 20 })]),
      ],
      aetherytes,
    }))
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].isHero).toBeFalsy()
  })
})

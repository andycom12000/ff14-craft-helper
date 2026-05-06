/**
 * route-planner.ts — pure-function greedy heuristic for BOM acquisition route planning.
 *
 * Algorithm: §7.1 of 2026-05-06-bom-acquisition-locations-and-route-planner-design.md
 * No global state, no Date.now(), no Math.random().
 */

// ── Type definitions ──────────────────────────────────────────────────────────

export type RouteMode = 'npc' | 'gather'

export interface ChosenSource {
  zoneId: number
  x: number
  y: number
  vendorName?: string
  nodeLevel?: number
  itemPrice?: number
}

export interface RouteRow {
  itemId: number
  mode: RouteMode
  qty: number
  sources: ChosenSource[]
}

export interface AetheryteInfo {
  name: string
  x: number
  y: number
  tpCostBase: number
}

export interface Group {
  zoneId: number
  aetheryte: AetheryteInfo | null
  tpCost: number
  rows: Array<{ itemId: number; source: ChosenSource; orderInZone: number }>
  isHero?: boolean
}

export interface RouteInput {
  rows: RouteRow[]
  aetherytes: Map<number, AetheryteInfo[]>
  optimizeBy: 'gil' | 'hop'
  excluded: Set<number>
}

export interface RouteOutput {
  groups: Group[]
  totalTpCost: number
  totalHops: number // = groups.length
}

// ── Internal types ────────────────────────────────────────────────────────────

interface Assignment {
  source: ChosenSource
  row: RouteRow
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Cheapest aetheryte tpCostBase for a zone, or 0 if zone not in map. */
function tpCostOf(zoneId: number, aetherytes: Map<number, AetheryteInfo[]>): number {
  const list = aetherytes.get(zoneId)
  if (!list || list.length === 0) return 0
  return Math.min(...list.map(a => a.tpCostBase))
}

/** Full gil cost of a source for a given qty. */
function costOf(source: ChosenSource, qty: number, aetherytes: Map<number, AetheryteInfo[]>): number {
  return (source.itemPrice ?? 0) * qty + tpCostOf(source.zoneId, aetherytes)
}

/** Euclidean distance between two points. */
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

/**
 * Pass 1: for a single row, pick its primary source using the gil minimisation rule.
 *
 * Tie-break rules (when gil costs are equal):
 *   gather → nodeLevel ASC, then tpCost ASC
 *   npc    → vendorName lexicographic ASC, then tpCost ASC
 */
function pickPrimarySource(
  row: RouteRow,
  aetherytes: Map<number, AetheryteInfo[]>,
): ChosenSource {
  const { sources, mode, qty } = row
  if (sources.length === 0) {
    throw new Error(`Route row for itemId ${row.itemId} has no sources`)
  }

  let best = sources[0]
  let bestCost = costOf(best, qty, aetherytes)

  for (let i = 1; i < sources.length; i++) {
    const s = sources[i]
    const c = costOf(s, qty, aetherytes)

    if (c < bestCost) {
      best = s
      bestCost = c
      continue
    }

    if (c === bestCost) {
      if (mode === 'gather') {
        const sLevel = s.nodeLevel ?? 0
        const bestLevel = best.nodeLevel ?? 0
        if (sLevel < bestLevel) {
          best = s
          continue
        }
        if (sLevel === bestLevel) {
          if (tpCostOf(s.zoneId, aetherytes) < tpCostOf(best.zoneId, aetherytes)) {
            best = s
          }
        }
      } else {
        // npc: vendorName alphabetical ASC
        const sName = s.vendorName ?? ''
        const bestName = best.vendorName ?? ''
        if (sName < bestName) {
          best = s
          continue
        }
        if (sName === bestName) {
          if (tpCostOf(s.zoneId, aetherytes) < tpCostOf(best.zoneId, aetherytes)) {
            best = s
          }
        }
      }
    }
  }

  return best
}

/**
 * Pass 2: hop consolidation.
 *
 * Mutates `assignments` in place. Tries to reduce zone count by moving
 * lone-zone rows into zones that already have other rows, provided the
 * gil increase is <= 30% of the current cost.
 *
 * Terminates when no improvement is possible in a full pass (while-improved loop).
 */
function runPass2(
  assignments: Map<number, Assignment>,
  aetherytes: Map<number, AetheryteInfo[]>,
): void {
  let improved = true

  while (improved) {
    improved = false

    // Rebuild zone counts
    const zoneCounts = new Map<number, number>()
    for (const { source } of assignments.values()) {
      const z = source.zoneId
      zoneCounts.set(z, (zoneCounts.get(z) ?? 0) + 1)
    }

    // Sort rows by number of alternative sources DESC
    const sortedItemIds = [...assignments.keys()].sort((a, b) => {
      const aLen = assignments.get(a)!.row.sources.length
      const bLen = assignments.get(b)!.row.sources.length
      return bLen - aLen
    })

    for (const itemId of sortedItemIds) {
      const entry = assignments.get(itemId)!
      const currentZone = entry.source.zoneId
      const currentCount = zoneCounts.get(currentZone) ?? 0

      // Only consider moving if this row is the sole occupant of its zone
      if (currentCount > 1) continue

      const currentCost = costOf(entry.source, entry.row.qty, aetherytes)

      for (const alt of entry.row.sources) {
        if (alt.zoneId === currentZone) continue
        if ((zoneCounts.get(alt.zoneId) ?? 0) < 1) continue

        const altCost = costOf(alt, entry.row.qty, aetherytes)
        const gilDelta = altCost - currentCost

        // Accept if gilDelta / costOf(current) <= 0.30
        // If current cost is 0, only accept if there's no extra cost (delta <= 0)
        const fraction =
          currentCost === 0
            ? gilDelta <= 0
              ? 0
              : Infinity
            : gilDelta / currentCost

        if (fraction <= 0.30) {
          // Update zone counts and move the assignment
          zoneCounts.set(currentZone, (zoneCounts.get(currentZone) ?? 1) - 1)
          zoneCounts.set(alt.zoneId, (zoneCounts.get(alt.zoneId) ?? 0) + 1)
          assignments.set(itemId, { source: alt, row: entry.row })
          improved = true
          break
        }
      }
    }
  }
}

/**
 * Pick the aetheryte closest to the centroid of all stops in a zone.
 * Returns null if zone is not in the aetherytes map.
 */
function pickNearestAetheryte(
  stops: Array<{ x: number; y: number }>,
  zoneId: number,
  aetherytes: Map<number, AetheryteInfo[]>,
): AetheryteInfo | null {
  const list = aetherytes.get(zoneId)
  if (!list || list.length === 0) return null

  const cx = stops.reduce((sum, s) => sum + s.x, 0) / stops.length
  const cy = stops.reduce((sum, s) => sum + s.y, 0) / stops.length

  let best = list[0]
  let bestDist = dist(cx, cy, best.x, best.y)

  for (let i = 1; i < list.length; i++) {
    const d = dist(cx, cy, list[i].x, list[i].y)
    if (d < bestDist) {
      best = list[i]
      bestDist = d
    }
  }

  return best
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * sortRoute — pure function, no side effects.
 *
 * Implements the greedy route planning algorithm (§7.1):
 * 1. Filter crystals + excluded
 * 2. Pass 1: pick primary source per row (min gil cost)
 * 3. Pass 2 (hop mode only): consolidate lone zones into popular ones
 * 4. Pick nearest aetheryte per zone
 * 5. Order stops within zone by distance from aetheryte
 * 6. Order zones by tpCost ASC; null-aetheryte zones last
 * 7. Mark hero group (largest, tie-broken by total gil)
 */
export function sortRoute(input: RouteInput): RouteOutput {
  const { rows, aetherytes, optimizeBy, excluded } = input

  // Step 1: Filter — remove crystals (itemId < 20) and excluded ids
  const filtered = rows.filter(r => r.itemId >= 20 && !excluded.has(r.itemId))

  if (filtered.length === 0) {
    return { groups: [], totalTpCost: 0, totalHops: 0 }
  }

  // Step 2: Pass 1 — pick primary source for each row
  const assignments = new Map<number, Assignment>()
  for (const row of filtered) {
    const source = pickPrimarySource(row, aetherytes)
    assignments.set(row.itemId, { source, row })
  }

  // Step 3: Pass 2 — hop consolidation (only if optimizeBy === 'hop')
  if (optimizeBy === 'hop') {
    runPass2(assignments, aetherytes)
  }

  // Step 4: Group by zone
  const zoneMap = new Map<number, Array<{ itemId: number; source: ChosenSource; qty: number }>>()
  for (const [itemId, { source, row }] of assignments) {
    const zoneId = source.zoneId
    if (!zoneMap.has(zoneId)) zoneMap.set(zoneId, [])
    zoneMap.get(zoneId)!.push({ itemId, source, qty: row.qty })
  }

  // Steps 5 & 6: Build groups with aetheryte selection and within-zone ordering
  const groups: Group[] = []
  for (const [zoneId, stops] of zoneMap) {
    const aetheryte = pickNearestAetheryte(
      stops.map(s => ({ x: s.source.x, y: s.source.y })),
      zoneId,
      aetherytes,
    )
    const tpCost = aetheryte?.tpCostBase ?? 0

    // Sort stops by distance from chosen aetheryte (null aetheryte → all distance=0, stable sort)
    const ax = aetheryte?.x ?? 0
    const ay = aetheryte?.y ?? 0
    const sortedStops = stops.slice().sort((a, b) =>
      dist(ax, ay, a.source.x, a.source.y) - dist(ax, ay, b.source.x, b.source.y),
    )

    const groupRows = sortedStops.map((stop, idx) => ({
      itemId: stop.itemId,
      source: stop.source,
      orderInZone: idx + 1,
    }))

    groups.push({ zoneId, aetheryte, tpCost, rows: groupRows })
  }

  // Step 7: Sort zones — tpCost ASC; null-aetheryte zones last
  groups.sort((a, b) => {
    const aNull = a.aetheryte === null
    const bNull = b.aetheryte === null
    if (aNull && bNull) return 0
    if (aNull) return 1
    if (bNull) return -1
    return a.tpCost - b.tpCost
  })

  // Step 8: Mark hero (only when groups.length >= 2)
  if (groups.length >= 2) {
    // Build qty lookup from assignments
    const qtyMap = new Map<number, number>()
    for (const [itemId, { row }] of assignments) {
      qtyMap.set(itemId, row.qty)
    }

    let heroIdx = 0
    let heroRowCount = -1
    let heroGil = -1

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      const rowCount = g.rows.length
      const totalGil = g.rows.reduce((sum, r) => {
        const qty = qtyMap.get(r.itemId) ?? 1
        return sum + (r.source.itemPrice ?? 0) * qty
      }, 0)

      if (
        rowCount > heroRowCount ||
        (rowCount === heroRowCount && totalGil > heroGil)
      ) {
        heroIdx = i
        heroRowCount = rowCount
        heroGil = totalGil
      }
    }

    groups[heroIdx].isHero = true
  }

  const totalTpCost = groups.reduce((sum, g) => sum + g.tpCost, 0)

  return {
    groups,
    totalTpCost,
    totalHops: groups.length,
  }
}

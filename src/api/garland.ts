import { XIVAPI_SHEET_BASE, fetchSheetFields } from '@/api/xivapi'

const GARLAND_BROWSE = 'https://garlandtools.org/db/doc/browse/en/2/node.json'

export interface GatheringNode {
  id: number
  itemId: number
  itemName: string
  level: number
  stars: number
  gatheringClass: 'MIN' | 'BTN'
  nodeType: 'Unspoiled' | 'Legendary' | 'Ephemeral' | 'Concealed'
  zone: string
  coords: { x: number; y: number }
  spawnTimes: number[]
  duration: number
  mapId: number
  rawCoords: { x: number; y: number }
}

interface GarlandBrowseEntry {
  i: number
  n: string
  l: number
  t: number
  z: number
  s: number
  lt?: string
  ti?: number[]
}

function classFromType(t: number): 'MIN' | 'BTN' {
  return t <= 1 ? 'MIN' : 'BTN'
}

function durationFromType(lt: string): number {
  return lt === 'Ephemeral' ? 240 : 120
}

export async function resolveNodeDetails(nodes: GatheringNode[]): Promise<GatheringNode[]> {
  if (nodes.length === 0) return nodes

  try {
    const nodeIds = nodes.map((n) => n.id)

    // Step 1: Query GatheringPoint for baseId and territoryId
    const gpUrl = `${XIVAPI_SHEET_BASE}/sheet/GatheringPoint?rows=${nodeIds.join(',')}&fields=GatheringPointBase,TerritoryType`
    const gpResp = await fetch(gpUrl)
    if (!gpResp.ok) return nodes
    const gpData = await gpResp.json()

    const baseIds = new Set<number>()
    const territoryIds = new Set<number>()
    const nodeToBase = new Map<number, number>()
    const nodeToTerritory = new Map<number, number>()
    for (const row of gpData.rows) {
      const baseId = row.fields?.GatheringPointBase?.row_id
      const terrId = row.fields?.TerritoryType?.row_id
      if (baseId) { nodeToBase.set(row.row_id, baseId); baseIds.add(baseId) }
      if (terrId) { nodeToTerritory.set(row.row_id, terrId); territoryIds.add(terrId) }
    }

    // Steps 2 & 4: GatheringPointBase + TerritoryType in parallel
    const gpbUrl = `${XIVAPI_SHEET_BASE}/sheet/GatheringPointBase?rows=${[...baseIds].join(',')}&fields=Item[0],Item[1],Item[2],Item[3],Item[4],Item[5],Item[6],Item[7]`
    const ttUrl = `${XIVAPI_SHEET_BASE}/sheet/TerritoryType?rows=${[...territoryIds].join(',')}&fields=Map,PlaceName`

    const [gpbResp, ttResp] = await Promise.all([fetch(gpbUrl), fetch(ttUrl)])
    const gpbData = gpbResp.ok ? await gpbResp.json() : { rows: [] }

    const baseToItems = new Map<number, number[]>()
    for (const row of gpbData.rows) {
      const items: number[] = []
      for (let i = 0; i < 8; i++) {
        const itemId = row.fields?.[`Item[${i}]`]?.row_id
        if (itemId && itemId > 0) items.push(itemId)
      }
      baseToItems.set(row.row_id, items)
    }

    // Step 3: Item names (depends on step 2)
    const allItemIds = new Set<number>()
    baseToItems.forEach((items) => items.forEach((id) => allItemIds.add(id)))
    const nameFields = await fetchSheetFields<{ Name: string }>('Item', [...allItemIds], 'Name')

    const ttData = ttResp.ok ? await ttResp.json() : { rows: [] }

    const territoryToMap = new Map<number, number>()
    const territoryToPlace = new Map<number, string>()
    for (const row of ttData.rows) {
      const mapId = row.fields?.Map?.row_id
      const placeName = row.fields?.PlaceName?.fields?.Name
      if (mapId) territoryToMap.set(row.row_id, mapId)
      if (placeName) territoryToPlace.set(row.row_id, placeName)
    }

    // Enrich nodes
    return nodes.map((node) => {
      const baseId = nodeToBase.get(node.id)
      const terrId = nodeToTerritory.get(node.id)
      const items = baseId ? baseToItems.get(baseId) ?? [] : []
      const firstItemId = items[0] ?? 0

      return {
        ...node,
        itemId: firstItemId,
        itemName: nameFields.get(firstItemId)?.Name ?? node.itemName,
        zone: terrId ? territoryToPlace.get(terrId) ?? node.zone : node.zone,
        mapId: terrId ? territoryToMap.get(terrId) ?? 0 : 0,
      }
    })
  } catch (error) {
    console.error('[API] resolveNodeDetails error:', error)
    return nodes
  }
}

export async function fetchAllTimedNodes(): Promise<GatheringNode[]> {
  try {
    const resp = await fetch(GARLAND_BROWSE)
    if (!resp.ok) throw new Error(`Garland API failed: ${resp.status}`)
    const raw = await resp.json()
    const data: GarlandBrowseEntry[] = Array.isArray(raw) ? raw : raw.browse ?? []

    const timedEntries = data.filter((e) => e.lt && e.ti && e.ti.length > 0)

    const basicNodes = timedEntries.map((e) => ({
      id: e.i,
      itemId: 0,
      itemName: e.n,
      level: e.l,
      stars: e.s > 2 ? e.s - 2 : 0,
      gatheringClass: classFromType(e.t),
      nodeType: e.lt as GatheringNode['nodeType'],
      zone: e.n,
      coords: { x: 0, y: 0 },
      spawnTimes: e.ti!,
      duration: durationFromType(e.lt!),
      mapId: 0,
      rawCoords: { x: 0, y: 0 },
    }))

    return resolveNodeDetails(basicNodes)
  } catch (error) {
    console.error('[API] fetchAllTimedNodes error:', error)
    return []
  }
}

import { XIVAPI_SHEET_BASE, fetchSheetFields } from '@/api/xivapi'
import { sToT } from '@/utils/s2t'

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
  mapAssetPath: string
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

const GARLAND_NODE = 'https://garlandtools.org/db/doc/node/en/2'

interface GarlandNodeDetail {
  node: {
    id: number
    items?: { id: number }[]
    coords?: [number, number]
    zoneid?: number
  }
}

async function fetchNodeBatch(ids: number[]): Promise<Map<number, GarlandNodeDetail['node']>> {
  const map = new Map<number, GarlandNodeDetail['node']>()
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const resp = await fetch(`${GARLAND_NODE}/${id}.json`)
      if (!resp.ok) return null
      const data: GarlandNodeDetail = await resp.json()
      return data.node
    }),
  )
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      map.set(r.value.id, r.value)
    }
  }
  return map
}

export async function resolveNodeDetails(nodes: GatheringNode[]): Promise<GatheringNode[]> {
  if (nodes.length === 0) return nodes

  try {
    // Fetch detailed node data from Garland in batches of 30
    const BATCH_SIZE = 30
    const detailMap = new Map<number, GarlandNodeDetail['node']>()
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE).map((n) => n.id)
      const results = await fetchNodeBatch(batch)
      results.forEach((v, k) => detailMap.set(k, v))
    }

    // Collect all item IDs for name resolution
    const allItemIds = new Set<number>()
    for (const detail of detailMap.values()) {
      if (detail.items) {
        for (const item of detail.items) {
          if (item.id > 0) allItemIds.add(item.id)
        }
      }
    }

    // Fetch item names from tnze zh-TW API (Traditional Chinese)
    // and zone names from XIVAPI chs + simplified-to-traditional conversion
    const TNZE_BASE = 'https://tnze.yyyy.games/api/datasource/zh-TW'
    const itemNames = new Map<number, string>()
    const itemBatch = [...allItemIds]
    const ITEM_BATCH_SIZE = 30
    for (let i = 0; i < itemBatch.length; i += ITEM_BATCH_SIZE) {
      const batch = itemBatch.slice(i, i + ITEM_BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async (id) => {
          const resp = await fetch(`${TNZE_BASE}/item_info?item_id=${id}`)
          if (!resp.ok) return null
          const data = await resp.json()
          return { id, name: data.name as string }
        }),
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          itemNames.set(r.value.id, r.value.name)
        }
      }
    }

    // Fetch zone names + mapId from XIVAPI
    // Garland zoneid = PlaceName ID (NOT TerritoryType ID)
    const zoneIds = new Set<number>()
    for (const detail of detailMap.values()) {
      if (detail.zoneid) zoneIds.add(detail.zoneid)
    }
    // Zone names from PlaceName sheet (chs → convert to Traditional)
    const zoneFieldsChs = await fetchSheetFields<{ Name: string }>('PlaceName', [...zoneIds], 'Name')

    // Map asset paths via XIVAPI search: Map sheet where PlaceName = zoneid
    // Map.Id is a string like "r1f1/00", asset URL = ui/map/{folder}/{sub}/{folder}{sub}_m.tex
    const zoneToMapAssetPath = new Map<number, string>()
    const mapSearchResults = await Promise.allSettled(
      [...zoneIds].map(async (zid) => {
        const resp = await fetch(`${XIVAPI_SHEET_BASE}/search?sheets=Map&query=PlaceName=${zid}&fields=Id`)
        if (!resp.ok) return null
        const data = await resp.json()
        const mapStringId = data.results?.[0]?.fields?.Id as string | undefined
        if (!mapStringId) return null
        // "r1f1/00" → folder="r1f1", sub="00" → asset path "ui/map/r1f1/00/r1f100_m.tex"
        const [folder, sub] = mapStringId.split('/')
        const assetPath = `ui/map/${folder}/${sub}/${folder}${sub}_m.tex`
        return { zoneId: zid, assetPath }
      }),
    )
    for (const r of mapSearchResults) {
      if (r.status === 'fulfilled' && r.value) {
        zoneToMapAssetPath.set(r.value.zoneId, r.value.assetPath)
      }
    }

    // Enrich nodes
    return nodes.map((node) => {
      const detail = detailMap.get(node.id)
      if (!detail) return node

      const firstItemId = detail.items?.[0]?.id ?? 0
      const coords = detail.coords ?? [0, 0]
      const zoneNameChs = detail.zoneid ? zoneFieldsChs.get(detail.zoneid)?.Name : undefined
      const mapAssetPath = detail.zoneid ? zoneToMapAssetPath.get(detail.zoneid) ?? '' : ''

      return {
        ...node,
        itemId: firstItemId,
        itemName: itemNames.get(firstItemId) ?? node.itemName,
        coords: { x: coords[0], y: coords[1] },
        zone: zoneNameChs ? sToT(zoneNameChs) : node.zone,
        mapAssetPath,
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
      mapAssetPath: '',
      rawCoords: { x: 0, y: 0 },
    }))

    return resolveNodeDetails(basicNodes)
  } catch (error) {
    console.error('[API] fetchAllTimedNodes error:', error)
    return []
  }
}

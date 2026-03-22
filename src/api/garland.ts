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

export async function fetchAllTimedNodes(): Promise<GatheringNode[]> {
  try {
    const resp = await fetch(GARLAND_BROWSE)
    if (!resp.ok) throw new Error(`Garland API failed: ${resp.status}`)
    const data: GarlandBrowseEntry[] = await resp.json()

    const timedEntries = data.filter((e) => e.lt && e.ti && e.ti.length > 0)

    return timedEntries.map((e) => ({
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
  } catch (error) {
    console.error('[API] fetchAllTimedNodes error:', error)
    return []
  }
}

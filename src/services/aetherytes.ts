/**
 * aetherytes.ts — shared loader for the static aetheryte name + coords table.
 *
 * Used by:
 * - BOM route planner (sorting / map markers)
 * - Batch NPC purchase candidates (`/tp` command in shopping list rows)
 *
 * Data is single-locale (zh-TW). FFXIV's client accepts zh-TW aetheryte strings
 * regardless of the player's UI locale, so we don't need a per-locale variant.
 */

export interface AetheryteInfo {
  name: string
  x: number
  y: number
  tpCostBase?: number
}

interface AetherytesData {
  schema: number
  zones: Record<string, { zoneName?: string; aetherytes: AetheryteInfo[] }>
}

let _cache: AetherytesData | null = null
let _inflight: Promise<AetherytesData> | null = null

export async function loadAetherytes(): Promise<AetherytesData> {
  if (_cache) return _cache
  if (_inflight) return _inflight
  _inflight = (async () => {
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}data/aetherytes.json`)
      if (!resp.ok) throw new Error(`aetherytes.json HTTP ${resp.status}`)
      const data = (await resp.json()) as AetherytesData
      _cache = data
      return data
    } finally {
      _inflight = null
    }
  })()
  return _inflight
}

/**
 * First aetheryte for a zone (matches BOM's selection rule — the data file's
 * primary entry per zone is the canonical one).
 */
export function getFirstAetheryte(
  data: AetherytesData,
  zoneId: number,
): AetheryteInfo | null {
  const zone = data.zones[String(zoneId)]
  if (!zone?.aetherytes?.length) return null
  return zone.aetherytes[0]
}

/**
 * Aetheryte closest to the given point in the same zone. Falls back to the
 * first aetheryte when no coords are provided.
 */
export function getNearestAetheryte(
  data: AetherytesData,
  zoneId: number,
  x: number,
  y: number,
): AetheryteInfo | null {
  const zone = data.zones[String(zoneId)]
  if (!zone?.aetherytes?.length) return null
  let best = zone.aetherytes[0]
  let bestDist = (best.x - x) ** 2 + (best.y - y) ** 2
  for (let i = 1; i < zone.aetherytes.length; i++) {
    const a = zone.aetherytes[i]
    const d = (a.x - x) ** 2 + (a.y - y) ** 2
    if (d < bestDist) { best = a; bestDist = d }
  }
  return best
}

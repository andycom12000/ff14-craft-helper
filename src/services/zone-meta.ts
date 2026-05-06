/**
 * zone-meta.ts — bulk xivapi metadata for zones and NPCs.
 *
 * Fetches PlaceName + Map sheet data in at most 2 round-trips for any number
 * of zone IDs (one per sheet). Results are stored in module-level Maps for
 * the lifetime of the page session; no LRU (zone/NPC id sets are bounded).
 *
 * Map sheet rows are discovered via a single search query:
 *   /api/search?sheets=Map&query=PlaceName=146,153,…
 * This collapses the N+1 per-zone searches in garland.ts into one call.
 */

import { XIVAPI_SHEET_BASE } from '@/api/xivapi'
import { sToT } from '@/utils/s2t'
import { buildMapAssetUrl } from '@/utils/map-coords'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Locale = 'zh-TW' | 'zh-CN' | 'en' | 'ja'

export interface ZoneMeta {
  zoneNameByLocale: Map<Locale, string>
  mapAssetUrl: string
  sizeFactor: number
}

// ---------------------------------------------------------------------------
// Module-level caches (page-session lifetime, no LRU)
// ---------------------------------------------------------------------------

const zoneCache = new Map<number, ZoneMeta>()
const npcCache = new Map<number, Map<Locale, string>>()

// Inflight-dedupe: keyed by sorted comma-joined id list.
const zoneInflight = new Map<string, Promise<Map<number, ZoneMeta>>>()
const npcInflight = new Map<string, Promise<Map<number, Map<Locale, string>>>>()

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function inflightKey(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join(',')
}

interface PlaceNameFields {
  Name?: string
  Name_chs?: string
  Name_en?: string
  Name_ja?: string
}

interface MapSearchFields {
  Id?: string
  SizeFactor?: number
  'PlaceName.Id'?: number
}

interface NpcFields {
  Singular?: string
  Singular_chs?: string
  Singular_en?: string
  Singular_ja?: string
}

// ---------------------------------------------------------------------------
// fetchZoneMetaBulk
// ---------------------------------------------------------------------------

/**
 * Fetch zone metadata for a list of zone IDs (= PlaceName row IDs).
 * Issues at most 2 network requests regardless of the number of IDs:
 *   1. Sheet/PlaceName bulk rows → locale names
 *   2. Search/Map with comma-separated filter → map asset + sizeFactor
 *      (e.g., query=PlaceName=146,153,155)
 *
 * Results are cached; repeat calls with already-cached IDs skip network.
 * Concurrent calls with the same ID set share one in-flight Promise.
 * Only entries with at least one populated locale name or map asset are cached,
 * ensuring failed partial fetches don't prevent retries.
 */
export async function fetchZoneMetaBulk(
  zoneIds: number[],
): Promise<Map<number, ZoneMeta>> {
  // Dedupe and filter out already-cached.
  const uncached = [...new Set(zoneIds)].filter((id) => !zoneCache.has(id))

  // Return immediately if everything is already in cache.
  if (uncached.length === 0) {
    const result = new Map<number, ZoneMeta>()
    for (const id of zoneIds) {
      const m = zoneCache.get(id)
      if (m) result.set(id, m)
    }
    return result
  }

  const key = inflightKey(uncached)

  // Return existing in-flight promise if one is already running for this key.
  const existing = zoneInflight.get(key)
  if (existing) {
    await existing
    // After the in-flight resolves, build result from cache.
    const result = new Map<number, ZoneMeta>()
    for (const id of zoneIds) {
      const m = zoneCache.get(id)
      if (m) result.set(id, m)
    }
    return result
  }

  const promise = _doFetchZoneMeta(uncached)
  zoneInflight.set(key, promise)

  try {
    await promise
  } finally {
    zoneInflight.delete(key)
  }

  // Collect result from cache (may be partial if some fetches failed).
  const result = new Map<number, ZoneMeta>()
  for (const id of zoneIds) {
    const m = zoneCache.get(id)
    if (m) result.set(id, m)
  }
  return result
}

async function _doFetchZoneMeta(ids: number[]): Promise<Map<number, ZoneMeta>> {
  // Temporary holders while we assemble ZoneMeta.
  const namesByZone = new Map<number, Map<Locale, string>>()
  const mapInfoByZone = new Map<number, { mapAssetUrl: string; sizeFactor: number }>()

  // --- Fetch 1: PlaceName sheet (bulk) ------------------------------------
  try {
    const url =
      `${XIVAPI_SHEET_BASE}/sheet/PlaceName` +
      `?rows=${ids.join(',')}` +
      `&fields=Name,Name_chs,Name_en,Name_ja`
    const resp = await fetch(url)
    if (resp.ok) {
      const data = await resp.json()
      for (const row of data.rows ?? []) {
        const f = row.fields as PlaceNameFields
        const localeMap = new Map<Locale, string>()
        if (f.Name) localeMap.set('zh-CN', f.Name)
        if (f.Name_chs) localeMap.set('zh-TW', sToT(f.Name_chs))
        if (f.Name_en) localeMap.set('en', f.Name_en)
        if (f.Name_ja) localeMap.set('ja', f.Name_ja)
        // Fallback: if no chs, derive zh-TW from zh-CN via sToT.
        if (!localeMap.has('zh-TW') && f.Name) {
          localeMap.set('zh-TW', sToT(f.Name))
        }
        namesByZone.set(row.row_id as number, localeMap)
      }
    } else {
      console.error('[zone-meta] PlaceName fetch failed:', resp.status)
    }
  } catch (err) {
    console.error('[zone-meta] PlaceName fetch error:', err)
  }

  // --- Fetch 2: Map sheet via search (single query, OR across zone IDs) ---
  // xivapi search supports OR via comma-separated values:
  //   query=PlaceName=146,153,155
  // This fetches one row per (PlaceName, Map) pair in a single round-trip.
  try {
    // xivapi search OR-joins terms with whitespace (URL-encoded as `+`),
    // not commas — `PlaceName=A,PlaceName=B` returns HTTP 400 while
    // `PlaceName=A+PlaceName=B` returns matching rows for both ids.
    const queryParts = ids.map((id) => `PlaceName=${id}`).join('+')
    const url =
      `${XIVAPI_SHEET_BASE}/search` +
      `?sheets=Map` +
      `&query=${queryParts}` +
      `&fields=Id,SizeFactor,PlaceName.Id`
    const resp = await fetch(url)
    if (resp.ok) {
      const data = await resp.json()
      for (const result of data.results ?? []) {
        const f = result.fields as MapSearchFields
        const placeNameId = f['PlaceName.Id']
        const mapStringId = f.Id
        const sizeFactor = f.SizeFactor ?? 100
        if (placeNameId != null && mapStringId) {
          mapInfoByZone.set(placeNameId, {
            mapAssetUrl: buildMapAssetUrl(mapStringId),
            sizeFactor,
          })
        }
      }
    } else {
      console.error('[zone-meta] Map search fetch failed:', resp.status)
    }
  } catch (err) {
    console.error('[zone-meta] Map search fetch error:', err)
  }

  // Merge and populate cache.
  // Only cache entries with at least one useful piece of data (locale name or map asset).
  // This prevents empty entries from failed fetches from clogging the cache.
  const result = new Map<number, ZoneMeta>()
  for (const id of ids) {
    const localeMap = namesByZone.get(id) ?? new Map<Locale, string>()
    const mapInfo = mapInfoByZone.get(id) ?? { mapAssetUrl: '', sizeFactor: 100 }
    const meta: ZoneMeta = {
      zoneNameByLocale: localeMap,
      mapAssetUrl: mapInfo.mapAssetUrl,
      sizeFactor: mapInfo.sizeFactor,
    }
    // Only cache if we got at least one useful piece of data.
    const hasData = localeMap.size > 0 || mapInfo.mapAssetUrl.length > 0
    if (hasData) {
      zoneCache.set(id, meta)
      result.set(id, meta)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// getZoneMetaSync
// ---------------------------------------------------------------------------

/** Returns cached ZoneMeta for a zone, or null if not yet fetched. */
export function getZoneMetaSync(zoneId: number): ZoneMeta | null {
  return zoneCache.get(zoneId) ?? null
}

// ---------------------------------------------------------------------------
// fetchNpcNameBulk
// ---------------------------------------------------------------------------

/**
 * Fetch NPC names for a list of ENpcResident row IDs.
 * Issues one fetch against Sheet/ENpcResident in bulk.
 * Results are cached at module level.
 */
export async function fetchNpcNameBulk(
  npcIds: number[],
): Promise<Map<number, Map<Locale, string>>> {
  const uncached = [...new Set(npcIds)].filter((id) => !npcCache.has(id))

  if (uncached.length === 0) {
    const result = new Map<number, Map<Locale, string>>()
    for (const id of npcIds) {
      const m = npcCache.get(id)
      if (m) result.set(id, m)
    }
    return result
  }

  const key = inflightKey(uncached)

  const existing = npcInflight.get(key)
  if (existing) {
    await existing
    const result = new Map<number, Map<Locale, string>>()
    for (const id of npcIds) {
      const m = npcCache.get(id)
      if (m) result.set(id, m)
    }
    return result
  }

  const promise = _doFetchNpcNames(uncached)
  npcInflight.set(key, promise)

  try {
    await promise
  } finally {
    npcInflight.delete(key)
  }

  const result = new Map<number, Map<Locale, string>>()
  for (const id of npcIds) {
    const m = npcCache.get(id)
    if (m) result.set(id, m)
  }
  return result
}

async function _doFetchNpcNames(
  ids: number[],
): Promise<Map<number, Map<Locale, string>>> {
  const result = new Map<number, Map<Locale, string>>()
  try {
    const url =
      `${XIVAPI_SHEET_BASE}/sheet/ENpcResident` +
      `?rows=${ids.join(',')}` +
      `&fields=Singular,Singular_chs,Singular_en,Singular_ja`
    const resp = await fetch(url)
    if (!resp.ok) {
      console.error('[zone-meta] ENpcResident fetch failed:', resp.status)
      return result
    }
    const data = await resp.json()
    for (const row of data.rows ?? []) {
      const f = row.fields as NpcFields
      const localeMap = new Map<Locale, string>()
      if (f.Singular) localeMap.set('zh-CN', f.Singular)
      if (f.Singular_chs) localeMap.set('zh-TW', sToT(f.Singular_chs))
      if (f.Singular_en) localeMap.set('en', f.Singular_en)
      if (f.Singular_ja) localeMap.set('ja', f.Singular_ja)
      // Fallback: derive zh-TW from zh-CN via sToT.
      if (!localeMap.has('zh-TW') && f.Singular) {
        localeMap.set('zh-TW', sToT(f.Singular))
      }
      // Only cache if we got at least one locale name.
      if (localeMap.size > 0) {
        npcCache.set(row.row_id as number, localeMap)
        result.set(row.row_id as number, localeMap)
      }
    }
  } catch (err) {
    console.error('[zone-meta] ENpcResident fetch error:', err)
  }
  return result
}

// ---------------------------------------------------------------------------
// getNpcNameSync
// ---------------------------------------------------------------------------

/** Returns a cached NPC name for a given locale, or null if not yet fetched. */
export function getNpcNameSync(npcId: number, locale: Locale): string | null {
  return npcCache.get(npcId)?.get(locale) ?? null
}

// ---------------------------------------------------------------------------
// __clearCache — for tests only
// ---------------------------------------------------------------------------

export function __clearCache(): void {
  zoneCache.clear()
  npcCache.clear()
  zoneInflight.clear()
  npcInflight.clear()
}

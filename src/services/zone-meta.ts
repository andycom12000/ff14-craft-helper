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
import { buildMapAssetUrl } from '@/utils/map-coords'
import {
  loadAllLocationNames,
  getLocationName,
  fetchNpcNameBulkGarland,
  getNpcNameSync as gtGetNpcNameSync,
} from '@/services/garland-core'

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

// Inflight-dedupe: keyed by sorted comma-joined id list.
const zoneInflight = new Map<string, Promise<Map<number, ZoneMeta>>>()

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function inflightKey(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join(',')
}

interface MapSearchFields {
  Id?: string
  SizeFactor?: number
  /**
   * xivapi v1 returns the PlaceName link as a nested object, not a dotted
   * field. Field shape: `{ value, sheet: 'PlaceName', row_id, fields }`.
   * The dotted form `PlaceName.Id` we tried first does not exist on the
   * payload — that's why every minimap lookup was silently dropping.
   */
  PlaceName?: { value?: number; row_id?: number }
  /**
   * Sub-instance PlaceName id. Zero on the canonical overworld map; non-zero
   * for duty / instance / housing-ward variants that share the parent
   * PlaceName id. We pick the row with the lowest sub so the player sees
   * the open-world map, not a random instance.
   */
  PlaceNameSub?: { value?: number; row_id?: number }
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

  // --- Fetch 1: garland-core for multilingual location names. xivapi v1 ---
  // doesn't ship Chinese localizations for PlaceName, so we use garland's
  // multi-locale core data dump and read names by id.
  await loadAllLocationNames()
  for (const id of ids) {
    const localeMap = new Map<Locale, string>()
    const en = getLocationName(id, 'en')
    const ja = getLocationName(id, 'ja')
    const cn = getLocationName(id, 'zh-CN')
    const tw = getLocationName(id, 'zh-TW')
    if (en) localeMap.set('en', en)
    if (ja) localeMap.set('ja', ja)
    if (cn) localeMap.set('zh-CN', cn)
    if (tw) localeMap.set('zh-TW', tw)
    if (localeMap.size > 0) namesByZone.set(id, localeMap)
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
      `&fields=Id,SizeFactor,PlaceName.Id,PlaceNameSub.Id`
    const resp = await fetch(url)
    if (resp.ok) {
      const data = await resp.json()
      // A single PlaceName id can match multiple Map rows — the canonical
      // overworld map (PlaceNameSub == 0) plus any duty / instance / housing
      // variants. Pick the row with the lowest PlaceNameSub for each id;
      // ties broken by encounter order. Without this, e.g. East Shroud
      // (PlaceName=55) returned both `f1f2/00 sub=0` and `f1e6/00 sub=112`
      // and the loop's last-write-wins assigned the wrong texture.
      const bestSubByZone = new Map<number, number>()
      for (const result of data.results ?? []) {
        const f = result.fields as MapSearchFields
        const placeNameId = f.PlaceName?.value ?? f.PlaceName?.row_id
        const mapStringId = f.Id
        const sub = f.PlaceNameSub?.value ?? f.PlaceNameSub?.row_id ?? 0
        const sizeFactor = f.SizeFactor ?? 100
        if (placeNameId == null || !mapStringId) continue
        const prevBest = bestSubByZone.get(placeNameId)
        if (prevBest !== undefined && prevBest <= sub) continue
        bestSubByZone.set(placeNameId, sub)
        mapInfoByZone.set(placeNameId, {
          mapAssetUrl: buildMapAssetUrl(mapStringId),
          sizeFactor,
        })
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
// fetchNpcNameBulk — thin wrapper around the multilingual garland source.
// xivapi v1 doesn't ship Chinese NPC localizations either, so we delegate.
// ---------------------------------------------------------------------------

export async function fetchNpcNameBulk(
  npcIds: number[],
): Promise<Map<number, Map<Locale, string>>> {
  return fetchNpcNameBulkGarland(npcIds)
}

// ---------------------------------------------------------------------------
// getNpcNameSync — re-export (single source of truth lives in garland-core)
// ---------------------------------------------------------------------------

export function getNpcNameSync(npcId: number, locale: Locale): string | null {
  return gtGetNpcNameSync(npcId, locale)
}

// ---------------------------------------------------------------------------
// __clearCache — for tests only
// ---------------------------------------------------------------------------

export function __clearCache(): void {
  zoneCache.clear()
  zoneInflight.clear()
}

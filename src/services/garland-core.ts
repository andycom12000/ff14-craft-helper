/**
 * garland-core.ts — multilingual location-name lookup via garlandtools.
 *
 * xivapi v1 only ships English / Japanese names for PlaceName, so we can't
 * use it for zh-CN / zh-TW. garlandtools serves a per-locale `core/data.json`
 * whose `locationIndex` maps PlaceName.Id → localized zone name. The id
 * space matches xivapi's PlaceName.Id (verified: 29 = Limsa Lominsa Lower
 * Decks in both).
 *
 * Endpoints:
 *   - en, ja: https://garlandtools.org/db/doc/core/<lang>/3/data.json
 *   - zh-CN, zh-TW: https://www.garlandtools.cn/db/doc/core/chs/3/data.json
 *     (zh-TW is derived from chs via the existing sToT s→t converter,
 *      because garland doesn't host a tc-specific core dump.)
 */

import { sToT } from '@/utils/s2t'

const GT_ORG = 'https://garlandtools.org'
const GT_CN = 'https://www.garlandtools.cn'

type CoreLang = 'en' | 'ja' | 'chs'

interface CoreData {
  locationIndex?: Record<string, { id: number; name: string }>
}

const coreCache = new Map<CoreLang, Map<number, string>>()
const coreInflight = new Map<CoreLang, Promise<void>>()

async function loadOneCore(lang: CoreLang): Promise<void> {
  if (coreCache.has(lang)) return
  const existing = coreInflight.get(lang)
  if (existing) return existing
  const host = lang === 'chs' ? GT_CN : GT_ORG
  const promise = (async () => {
    try {
      const r = await fetch(`${host}/db/doc/core/${lang}/3/data.json`)
      if (!r.ok) {
        coreCache.set(lang, new Map())
        return
      }
      const data = (await r.json()) as CoreData
      const map = new Map<number, string>()
      for (const [k, v] of Object.entries(data.locationIndex ?? {})) {
        if (v?.name) map.set(Number(k), v.name)
      }
      coreCache.set(lang, map)
    } catch {
      coreCache.set(lang, new Map())
    } finally {
      coreInflight.delete(lang)
    }
  })()
  coreInflight.set(lang, promise)
  return promise
}

/**
 * Pre-load every locale we render names in. Cheap (~200 KB compressed per
 * locale, cached by the browser, deduped by inflight Promise).
 */
export async function loadAllLocationNames(): Promise<void> {
  await Promise.all([loadOneCore('en'), loadOneCore('ja'), loadOneCore('chs')])
}

export type LocationLocale = 'en' | 'ja' | 'zh-CN' | 'zh-TW'

export function getLocationName(zoneId: number, locale: LocationLocale): string | null {
  switch (locale) {
    case 'en':
      return coreCache.get('en')?.get(zoneId) ?? null
    case 'ja':
      return coreCache.get('ja')?.get(zoneId) ?? null
    case 'zh-CN':
      return coreCache.get('chs')?.get(zoneId) ?? null
    case 'zh-TW': {
      const chs = coreCache.get('chs')?.get(zoneId)
      return chs ? sToT(chs) : null
    }
  }
}

// ---------------------------------------------------------------------------
// NPC names — multilingual via garland.cn's npc/<id>.json endpoint.
// Returns a doc shaped roughly like:
//   { npc: { id, name (chs), tc: { name }, en: { name }, ja: { name } } }
// One fetch per NPC (LRU + inflight dedupe), worker-pooled by the bulk caller.
// ---------------------------------------------------------------------------

const GARLAND_NPC = `${GT_CN}/db/doc/npc/chs/2`
const NPC_LRU_CAP = 500

const npcCache = new Map<number, Map<LocationLocale, string>>()
const npcAccessOrder: number[] = []
const npcInflight = new Map<number, Promise<Map<LocationLocale, string>>>()

interface GarlandNpcDoc {
  npc?: {
    id: number
    name?: string
    tc?: { name?: string }
    en?: { name?: string }
    ja?: { name?: string }
  }
}

function npcLruTouch(id: number): void {
  const idx = npcAccessOrder.indexOf(id)
  if (idx !== -1) npcAccessOrder.splice(idx, 1)
  npcAccessOrder.push(id)
}

function npcLruSet(id: number, names: Map<LocationLocale, string>): void {
  if (npcCache.has(id)) {
    npcCache.set(id, names)
    npcLruTouch(id)
    return
  }
  npcCache.set(id, names)
  npcAccessOrder.push(id)
  if (npcCache.size > NPC_LRU_CAP) {
    const evict = npcAccessOrder.shift()
    if (evict !== undefined) npcCache.delete(evict)
  }
}

async function fetchOneNpc(id: number): Promise<Map<LocationLocale, string>> {
  const cached = npcCache.get(id)
  if (cached) {
    npcLruTouch(id)
    return cached
  }
  const existing = npcInflight.get(id)
  if (existing) return existing

  const promise = (async () => {
    try {
      const r = await fetch(`${GARLAND_NPC}/${id}.json`)
      if (!r.ok) return new Map<LocationLocale, string>()
      const data = (await r.json()) as GarlandNpcDoc
      const npc = data.npc
      if (!npc) return new Map<LocationLocale, string>()
      const m = new Map<LocationLocale, string>()
      if (npc.name) {
        m.set('zh-CN', npc.name)
        // Default tc to sToT if no explicit `tc.name` is provided on this row.
        m.set('zh-TW', sToT(npc.name))
      }
      // Prefer the official tc translation when garland has one — overrides
      // the sToT-derived fallback above.
      if (npc.tc?.name) m.set('zh-TW', npc.tc.name)
      if (npc.en?.name) m.set('en', npc.en.name)
      if (npc.ja?.name) m.set('ja', npc.ja.name)
      // Only cache when we actually got a name, so empty-fetch retries don't
      // poison the cache.
      if (m.size > 0) npcLruSet(id, m)
      return m
    } catch {
      return new Map<LocationLocale, string>()
    } finally {
      npcInflight.delete(id)
    }
  })()
  npcInflight.set(id, promise)
  return promise
}

/**
 * Fetch NPC names in bulk. Worker-pooled to keep the garland CDN happy.
 */
export async function fetchNpcNameBulkGarland(
  npcIds: number[],
  concurrency = 6,
): Promise<Map<number, Map<LocationLocale, string>>> {
  const queue = [...new Set(npcIds)].filter((id) => !npcCache.has(id))

  async function worker() {
    while (queue.length > 0) {
      const id = queue.shift()!
      await fetchOneNpc(id)
    }
  }
  const n = Math.min(concurrency, queue.length)
  if (n > 0) {
    await Promise.all(Array.from({ length: n }, worker))
  }

  const result = new Map<number, Map<LocationLocale, string>>()
  for (const id of npcIds) {
    const m = npcCache.get(id)
    if (m) result.set(id, m)
  }
  return result
}

export function getNpcNameSync(npcId: number, locale: LocationLocale): string | null {
  return npcCache.get(npcId)?.get(locale) ?? null
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

export function __clearCache(): void {
  coreCache.clear()
  coreInflight.clear()
  npcCache.clear()
  npcAccessOrder.length = 0
  npcInflight.clear()
}

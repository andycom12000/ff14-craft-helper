import { reactive, ref } from 'vue'
import { CRAFT_TYPE_TO_JOB } from '@/utils/jobs'
import type {
  Locale,
  ItemRecord,
  RecipeRecord,
  RltRecord,
  Manifest,
  RecipeSearchResult,
  ItemTuple,
  ItemsFile,
} from './local-data-source.types'
import { LOCALES, DEFAULT_LOCALE } from './local-data-source.types'

export * from './local-data-source.types'

const LOCALE_STORAGE_KEY = 'ffxiv-craft-helper:locale'
const SEARCH_LIMIT = 50

// ---------------- Locale state ----------------

function readInitialLocale(): Locale {
  try {
    const stored = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY)
    if (stored && (LOCALES as readonly string[]).includes(stored)) {
      return stored as Locale
    }
  } catch {
    // ignore localStorage errors (e.g. SSR / blocked)
  }
  return DEFAULT_LOCALE
}

let currentLocale: Locale = readInitialLocale()
const localeListeners = new Set<(locale: Locale) => void>()

export function getLocale(): Locale {
  return currentLocale
}

export async function setLocale(locale: Locale): Promise<void> {
  if (!(LOCALES as readonly string[]).includes(locale)) {
    throw new Error(`Invalid locale: ${locale}`)
  }
  if (locale === currentLocale) return
  currentLocale = locale
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // ignore
  }
  // Kick off the items fetch for the new locale so downstream sync getters
  // (getItemSync / useItemName) see real names instead of falling back to
  // whichever locale was active when the record was cached.
  void loadItems(locale).catch(() => {
    // swallow — loadItems already nukes its promise cache on reject; the
    // next read will retry. Failing here silently keeps setLocale non-throwing.
  })
  for (const cb of localeListeners) {
    try {
      cb(locale)
    } catch {
      // isolate listener errors
    }
  }
}

export function onLocaleChange(cb: (locale: Locale) => void): () => void {
  localeListeners.add(cb)
  return () => {
    localeListeners.delete(cb)
  }
}

// ---------------- Loading state (reactive) ----------------

export const loadingState: Record<Locale, { recipes: boolean; items: boolean; rlt: boolean }> =
  reactive({
    'zh-TW': { recipes: false, items: false, rlt: false },
    'zh-CN': { recipes: false, items: false, rlt: false },
    en: { recipes: false, items: false, rlt: false },
    ja: { recipes: false, items: false, rlt: false },
  })

// Reactive signal bumped every time an items map is (re)populated for any
// locale. `useItemName` reads this so its computed re-runs when a newly
// fetched locale's cache becomes available — `getItemSync` is not reactive
// on its own.
export const itemsCacheVersion = ref(0)

function setGlobalFlag(key: 'recipes' | 'rlt', value: boolean): void {
  for (const loc of LOCALES) {
    loadingState[loc][key] = value
  }
}

// ---------------- Loader caches ----------------

let recipesPromise: Promise<RecipeRecord[]> | null = null
let rltPromise: Promise<Map<number, RltRecord>> | null = null
let manifestPromise: Promise<Manifest> | null = null
const itemsPromises = new Map<Locale, Promise<Map<number, ItemRecord>>>()
const itemsCache = new Map<Locale, Map<number, ItemRecord>>()

// Vite base path (e.g. '/ff14-craft-helper/' for GH Pages, '/' for plain host).
// Fallback to '/' for non-Vite contexts (node tests stub globalThis.fetch anyway).
const BASE_URL: string =
  (typeof import.meta !== 'undefined' && (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL) || '/'

function dataUrl(path: string): string {
  const trimmed = path.startsWith('/') ? path.slice(1) : path
  return BASE_URL.endsWith('/') ? BASE_URL + trimmed : BASE_URL + '/' + trimmed
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

export async function loadRecipes(): Promise<RecipeRecord[]> {
  if (recipesPromise) return recipesPromise
  setGlobalFlag('recipes', true)
  recipesPromise = (async () => {
    try {
      const data = await fetchJson<RecipeRecord[]>(dataUrl('/data/recipes.json'))
      return data
    } finally {
      setGlobalFlag('recipes', false)
    }
  })()
  // If the promise rejects, clear the cache so callers can retry.
  recipesPromise.catch(() => {
    recipesPromise = null
  })
  return recipesPromise
}

type RltFileArray = {
  schemaVersion: 1
  rlt: Array<RltRecord & { rlv: number }>
}
type RltFileObject = {
  schemaVersion: 1
  rlt: Record<string, RltRecord>
}
type RltFile = RltFileArray | RltFileObject

export async function loadRlt(): Promise<Map<number, RltRecord>> {
  if (rltPromise) return rltPromise
  setGlobalFlag('rlt', true)
  rltPromise = (async () => {
    try {
      const data = await fetchJson<RltFile>(dataUrl('/data/rlt.json'))
      if (data.schemaVersion !== 1) {
        throw new Error(`rlt.json: unsupported schemaVersion ${(data as { schemaVersion?: number }).schemaVersion}`)
      }
      const map = new Map<number, RltRecord>()
      if (Array.isArray(data.rlt)) {
        for (const entry of data.rlt) {
          const { rlv, ...rest } = entry
          map.set(rlv, rest as RltRecord)
        }
      } else {
        for (const [key, value] of Object.entries(data.rlt)) {
          map.set(Number(key), value)
        }
      }
      return map
    } finally {
      setGlobalFlag('rlt', false)
    }
  })()
  rltPromise.catch(() => {
    rltPromise = null
  })
  return rltPromise
}

export async function loadItems(locale?: Locale): Promise<Map<number, ItemRecord>> {
  const loc = locale ?? getLocale()
  const cached = itemsPromises.get(loc)
  if (cached) return cached
  loadingState[loc].items = true
  const promise = (async () => {
    try {
      const data = await fetchJson<ItemsFile>(dataUrl(`/data/items/${loc}.json`))
      if (data.schemaVersion !== 1) {
        throw new Error(`items/${loc}.json: unsupported schemaVersion ${(data as { schemaVersion?: number }).schemaVersion}`)
      }
      const map = new Map<number, ItemRecord>()
      for (const tuple of data.items as ItemTuple[]) {
        const [id, name, level, canBeHq, iconId] = tuple
        map.set(id, {
          name,
          level,
          canBeHq: canBeHq === 1,
          iconId,
        })
      }
      itemsCache.set(loc, map)
      itemsCacheVersion.value++
      return map
    } finally {
      loadingState[loc].items = false
    }
  })()
  itemsPromises.set(loc, promise)
  promise.catch(() => {
    itemsPromises.delete(loc)
    itemsCache.delete(loc)
  })
  return promise
}

export async function loadManifest(): Promise<Manifest> {
  if (manifestPromise) return manifestPromise
  manifestPromise = (async () => {
    const data = await fetchJson<Manifest>(dataUrl('/data/manifest.json'))
    if (data.schemaVersion !== 1) {
      throw new Error(`manifest.json: unsupported schemaVersion ${(data as { schemaVersion?: number }).schemaVersion}`)
    }
    return data
  })()
  manifestPromise.catch(() => {
    manifestPromise = null
  })
  return manifestPromise
}

// ---------------- Accessors ----------------

export async function getItem(id: number, locale?: Locale): Promise<ItemRecord | undefined> {
  const loc = locale ?? getLocale()
  const items = await loadItems(loc)
  const found = items.get(id)
  if (found) return found
  if (loc !== 'zh-TW') {
    const fallback = await loadItems('zh-TW')
    return fallback.get(id)
  }
  return undefined
}

export function getItemSync(id: number, locale?: Locale): ItemRecord | undefined {
  const loc = locale ?? getLocale()
  const map = itemsCache.get(loc)
  return map?.get(id)
}

export async function getRecipe(id: number): Promise<RecipeRecord | undefined> {
  const recipes = await loadRecipes()
  return recipes.find((r) => r.id === id)
}

export async function getRlt(rlv: number): Promise<RltRecord | undefined> {
  const rlt = await loadRlt()
  return rlt.get(rlv)
}

// ---------------- Search ----------------

function normalize(s: string): string {
  return s.normalize('NFKC').toLowerCase().trim()
}

interface Candidate {
  itemId: number
  name: string
  startsWith: boolean
  level: number
}

export async function searchRecipesByName(
  query: string,
  locale?: Locale,
): Promise<RecipeSearchResult[]> {
  const q = normalize(query)
  if (!q) return []

  const loc = locale ?? getLocale()
  const [items, recipes] = await Promise.all([loadItems(loc), loadRecipes()])

  const maxCandidates = SEARCH_LIMIT * 3
  const candidates: Candidate[] = []

  for (const [id, item] of items) {
    const normName = normalize(item.name)
    const starts = normName.startsWith(q)
    const includes = !starts && normName.includes(q)
    if (!starts && !includes) continue
    candidates.push({ itemId: id, name: item.name, startsWith: starts, level: item.level })
    if (candidates.length >= maxCandidates) break
  }

  candidates.sort((a, b) => {
    if (a.startsWith !== b.startsWith) return a.startsWith ? -1 : 1
    return b.level - a.level
  })

  // Build an index from itemResult → recipes
  const recipesByResult = new Map<number, RecipeRecord[]>()
  for (const r of recipes) {
    const arr = recipesByResult.get(r.itemResult)
    if (arr) arr.push(r)
    else recipesByResult.set(r.itemResult, [r])
  }

  const results: RecipeSearchResult[] = []
  for (const cand of candidates) {
    const rs = recipesByResult.get(cand.itemId)
    if (!rs || rs.length === 0) continue
    for (const recipe of rs) {
      results.push({
        id: recipe.id,
        itemId: cand.itemId,
        name: cand.name,
        job: CRAFT_TYPE_TO_JOB[recipe.craftType] ?? 'CRP',
        rlv: recipe.rlv,
        canHq: recipe.canHq,
        materialQualityFactor: recipe.materialQualityFactor,
      })
      if (results.length >= SEARCH_LIMIT) break
    }
    if (results.length >= SEARCH_LIMIT) break
  }

  // Ensure rlt is loaded so downstream callers of getRlt() don't pay the cost
  // (spec hint: "Load rlt for each emitted recipe"). We load once then return.
  if (results.length > 0) {
    await loadRlt()
  }

  return results.slice(0, SEARCH_LIMIT)
}

// ---------------- Test-only helpers ----------------

/** @internal test-only: reset all module state */
export function __resetForTesting(): void {
  recipesPromise = null
  rltPromise = null
  manifestPromise = null
  itemsPromises.clear()
  itemsCache.clear()
  localeListeners.clear()
  try {
    globalThis.localStorage?.removeItem(LOCALE_STORAGE_KEY)
  } catch {
    // ignore
  }
  currentLocale = DEFAULT_LOCALE
  for (const loc of LOCALES) {
    loadingState[loc].recipes = false
    loadingState[loc].items = false
    loadingState[loc].rlt = false
  }
}

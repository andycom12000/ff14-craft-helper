import { vi } from 'vitest'
import recipesMin from './recipes-min.json'
import rltMin from './rlt-min.json'
import manifestMin from './manifest-min.json'
import itemsZhTwMin from './items-zh-TW-min.json'
import itemsZhCnMin from './items-zh-CN-min.json'
import itemsEnMin from './items-en-min.json'
import itemsJaMin from './items-ja-min.json'

export const fixtures = {
  recipes: recipesMin,
  rlt: rltMin,
  manifest: manifestMin,
  items: {
    'zh-TW': itemsZhTwMin,
    'zh-CN': itemsZhCnMin,
    en: itemsEnMin,
    ja: itemsJaMin,
  } as Record<string, unknown>,
}

export interface LocalDataMockOverrides {
  recipes?: unknown
  rlt?: unknown
  manifest?: unknown
  items?: Record<string, unknown>
}

function makeResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export function setupLocalDataMocks(overrides: LocalDataMockOverrides = {}) {
  const merged = {
    recipes: overrides.recipes ?? fixtures.recipes,
    rlt: overrides.rlt ?? fixtures.rlt,
    manifest: overrides.manifest ?? fixtures.manifest,
    items: { ...fixtures.items, ...(overrides.items ?? {}) },
  }

  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.endsWith('/data/recipes.json')) return makeResponse(merged.recipes)
    if (url.endsWith('/data/rlt.json')) return makeResponse(merged.rlt)
    if (url.endsWith('/data/manifest.json')) return makeResponse(merged.manifest)
    const itemsMatch = url.match(/\/data\/items\/(.+?)\.json$/)
    if (itemsMatch) {
      const locale = itemsMatch[1]
      if (locale in merged.items) return makeResponse(merged.items[locale])
      return new Response(null, { status: 404 })
    }
    return new Response(null, { status: 404 })
  })

  vi.stubGlobal('fetch', impl)
  return impl
}

export function resetLocalDataMocks() {
  vi.unstubAllGlobals()
}

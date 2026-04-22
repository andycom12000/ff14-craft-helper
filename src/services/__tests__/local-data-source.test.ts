import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { ItemTuple } from '../local-data-source.types'

// -------- Inline fixtures --------

function makeItemsFile(items: ItemTuple[]) {
  return { schemaVersion: 1, items }
}

const ITEMS_ZH_TW: ItemTuple[] = [
  [5057, '黑鐵錠', 11, 1, 20001],
  [5058, '銅錠', 6, 1, 20002],
  [5059, '亞麻布', 13, 1, 20003],
]

const ITEMS_EN: ItemTuple[] = [
  [5057, 'Iron Ingot', 11, 1, 20001],
  // Note: 5058 intentionally missing from EN to test fallback
  [5059, 'Linen', 13, 1, 20003],
]

const RECIPES = [
  {
    id: 101,
    itemResult: 5057,
    amountResult: 1,
    craftType: 1, // BSM
    rlv: 11,
    canHq: true,
    materialQualityFactor: 50,
    difficultyFactor: 100,
    qualityFactor: 100,
    durabilityFactor: 100,
    ingredients: [[5058, 2]],
  },
  {
    id: 102,
    itemResult: 5057,
    amountResult: 1,
    craftType: 2, // ARM
    rlv: 11,
    canHq: true,
    materialQualityFactor: 50,
    difficultyFactor: 100,
    qualityFactor: 100,
    durabilityFactor: 100,
    ingredients: [[5058, 2]],
  },
  {
    id: 103,
    itemResult: 5059,
    amountResult: 1,
    craftType: 5, // WVR
    rlv: 13,
    canHq: true,
    materialQualityFactor: 50,
    difficultyFactor: 100,
    qualityFactor: 100,
    durabilityFactor: 100,
    ingredients: [],
  },
]

const RLT = {
  schemaVersion: 1,
  rlt: [
    {
      rlv: 11,
      classJobLevel: 11,
      difficulty: 31,
      quality: 352,
      durability: 60,
      suggestedCraftsmanship: 22,
      progressDivider: 50,
      qualityDivider: 30,
      progressModifier: 100,
      qualityModifier: 100,
      conditionsFlag: 15,
    },
    {
      rlv: 13,
      classJobLevel: 13,
      difficulty: 35,
      quality: 400,
      durability: 60,
      suggestedCraftsmanship: 28,
      progressDivider: 50,
      qualityDivider: 30,
      progressModifier: 100,
      qualityModifier: 100,
      conditionsFlag: 15,
    },
  ],
}

const MANIFEST_GOOD = {
  schemaVersion: 1,
  buildTime: '2026-04-22T00:00:00Z',
  locales: ['zh-TW', 'zh-CN', 'en', 'ja'],
  defaultLocale: 'zh-TW',
  sources: {
    'zh-TW': { repo: 'test', commit: 'abc' },
    'zh-CN': { repo: 'test', commit: 'abc' },
    en: { repo: 'test', commit: 'abc' },
    ja: { repo: 'test', commit: 'abc' },
  },
}

// -------- Fetch mock helper --------

interface FetchPlan {
  recipes?: unknown
  rlt?: unknown
  manifest?: unknown
  items?: Partial<Record<string, unknown>>
  // If a value is undefined, default fixture is used
}

function makeFetchMock(plan: FetchPlan = {}) {
  const counts = new Map<string, number>()
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    counts.set(url, (counts.get(url) ?? 0) + 1)

    let body: unknown
    if (url.endsWith('/data/recipes.json')) {
      body = plan.recipes ?? RECIPES
    } else if (url.endsWith('/data/rlt.json')) {
      body = plan.rlt ?? RLT
    } else if (url.endsWith('/data/manifest.json')) {
      body = plan.manifest ?? MANIFEST_GOOD
    } else {
      const m = url.match(/\/data\/items\/([^/]+)\.json$/)
      if (m) {
        const loc = m[1]
        const override = plan.items?.[loc]
        if (override !== undefined) {
          body = override
        } else if (loc === 'zh-TW') {
          body = makeItemsFile(ITEMS_ZH_TW)
        } else if (loc === 'en') {
          body = makeItemsFile(ITEMS_EN)
        } else if (loc === 'zh-CN' || loc === 'ja') {
          body = makeItemsFile(ITEMS_ZH_TW)
        } else {
          return new Response('not found', { status: 404 })
        }
      } else {
        return new Response('not found', { status: 404 })
      }
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return { impl, counts }
}

// Each test freshly imports the module so caches reset
async function freshModule() {
  vi.resetModules()
  return await import('../local-data-source')
}

beforeEach(() => {
  globalThis.localStorage?.clear?.()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('local-data-source: locale state', () => {
  it('defaults to zh-TW when nothing in localStorage', async () => {
    const mod = await freshModule()
    expect(mod.getLocale()).toBe('zh-TW')
  })

  it('reads locale from localStorage on init', async () => {
    globalThis.localStorage.setItem('ffxiv-craft-helper:locale', 'en')
    const mod = await freshModule()
    expect(mod.getLocale()).toBe('en')
  })

  it('falls back to default when localStorage has junk', async () => {
    globalThis.localStorage.setItem('ffxiv-craft-helper:locale', 'fr')
    const mod = await freshModule()
    expect(mod.getLocale()).toBe('zh-TW')
  })

  it('setLocale persists & notifies listeners', async () => {
    const mod = await freshModule()
    const received: string[] = []
    const unsub = mod.onLocaleChange((l) => received.push(l))
    await mod.setLocale('ja')
    expect(mod.getLocale()).toBe('ja')
    expect(globalThis.localStorage.getItem('ffxiv-craft-helper:locale')).toBe('ja')
    expect(received).toEqual(['ja'])
    unsub()
    await mod.setLocale('en')
    expect(received).toEqual(['ja']) // still only one; unsubscribed
  })
})

describe('local-data-source: loaders memoize', () => {
  it('loadRecipes concurrent & sequential calls share one fetch', async () => {
    const mod = await freshModule()
    const { impl, counts } = makeFetchMock()
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    const [a, b] = await Promise.all([mod.loadRecipes(), mod.loadRecipes()])
    const c = await mod.loadRecipes()

    expect(a).toBe(b)
    expect(a).toBe(c)
    expect(counts.get('/data/recipes.json')).toBe(1)
  })

  it('loadRlt memoizes and builds Map<rlv, rlt>', async () => {
    const mod = await freshModule()
    const { impl, counts } = makeFetchMock()
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    const r1 = await mod.loadRlt()
    const r2 = await mod.loadRlt()
    expect(r1).toBe(r2)
    expect(counts.get('/data/rlt.json')).toBe(1)
    expect(r1.get(11)?.classJobLevel).toBe(11)
    expect(r1.get(13)?.difficulty).toBe(35)
  })

  it('loadRlt accepts object shape too', async () => {
    const mod = await freshModule()
    const { impl } = makeFetchMock({
      rlt: {
        schemaVersion: 1,
        rlt: {
          '11': {
            classJobLevel: 11,
            difficulty: 31,
            quality: 352,
            durability: 60,
            suggestedCraftsmanship: 22,
            progressDivider: 50,
            qualityDivider: 30,
            progressModifier: 100,
            qualityModifier: 100,
            conditionsFlag: 15,
          },
        },
      },
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)
    const r = await mod.loadRlt()
    expect(r.get(11)?.classJobLevel).toBe(11)
  })

  it('loadItems memoizes per locale', async () => {
    const mod = await freshModule()
    const { impl, counts } = makeFetchMock()
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    await mod.loadItems('zh-TW')
    await mod.loadItems('zh-TW')
    await mod.loadItems('en')
    await mod.loadItems('en')

    expect(counts.get('/data/items/zh-TW.json')).toBe(1)
    expect(counts.get('/data/items/en.json')).toBe(1)
  })

  it('loadItems produces ItemRecord with canBeHq boolean', async () => {
    const mod = await freshModule()
    const { impl } = makeFetchMock()
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    const items = await mod.loadItems('en')
    const iron = items.get(5057)
    expect(iron?.name).toBe('Iron Ingot')
    expect(iron?.canBeHq).toBe(true)
    expect(iron?.level).toBe(11)
  })

  it('loadManifest throws on schemaVersion mismatch', async () => {
    const mod = await freshModule()
    const { impl } = makeFetchMock({
      manifest: { ...MANIFEST_GOOD, schemaVersion: 2 },
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    await expect(mod.loadManifest()).rejects.toThrow(/schemaVersion/)
  })

  it('loadRlt throws on schemaVersion mismatch', async () => {
    const mod = await freshModule()
    const { impl } = makeFetchMock({
      rlt: { schemaVersion: 2, rlt: [] },
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    await expect(mod.loadRlt()).rejects.toThrow(/schemaVersion/)
  })
})

describe('local-data-source: accessors', () => {
  it('getItem returns locale-specific name', async () => {
    const mod = await freshModule()
    const { impl } = makeFetchMock()
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    const zh = await mod.getItem(5057, 'zh-TW')
    const en = await mod.getItem(5057, 'en')
    expect(zh?.name).toBe('黑鐵錠')
    expect(en?.name).toBe('Iron Ingot')
  })

  it('getItem falls back to zh-TW if missing in target locale', async () => {
    const mod = await freshModule()
    const { impl } = makeFetchMock()
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    // 5058 is missing in EN fixture but present in zh-TW
    const item = await mod.getItem(5058, 'en')
    expect(item?.name).toBe('銅錠')
  })

  it('getItem returns undefined when missing everywhere', async () => {
    const mod = await freshModule()
    const { impl } = makeFetchMock()
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    const item = await mod.getItem(99999, 'en')
    expect(item).toBeUndefined()
  })

  it('getItemSync returns undefined before load, record after', async () => {
    const mod = await freshModule()
    const { impl } = makeFetchMock()
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    expect(mod.getItemSync(5057, 'zh-TW')).toBeUndefined()
    await mod.loadItems('zh-TW')
    expect(mod.getItemSync(5057, 'zh-TW')?.name).toBe('黑鐵錠')
    // A different locale not pre-loaded stays undefined
    expect(mod.getItemSync(5057, 'en')).toBeUndefined()
  })

  it('getRecipe / getRlt resolve through loaders', async () => {
    const mod = await freshModule()
    const { impl } = makeFetchMock()
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    const recipe = await mod.getRecipe(101)
    expect(recipe?.itemResult).toBe(5057)
    const rlt = await mod.getRlt(11)
    expect(rlt?.classJobLevel).toBe(11)
  })
})

describe('local-data-source: searchRecipesByName', () => {
  it('returns [] for empty / whitespace query', async () => {
    const mod = await freshModule()
    const { impl } = makeFetchMock()
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    expect(await mod.searchRecipesByName('', 'zh-TW')).toEqual([])
    expect(await mod.searchRecipesByName('   ', 'zh-TW')).toEqual([])
  })

  it('finds recipes by item name startsWith', async () => {
    const mod = await freshModule()
    const { impl } = makeFetchMock()
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    const results = await mod.searchRecipesByName('黑鐵', 'zh-TW')
    // Two recipes point to 5057 (黑鐵錠)
    expect(results).toHaveLength(2)
    const ids = results.map((r) => r.id).sort()
    expect(ids).toEqual([101, 102])
    expect(results[0].name).toBe('黑鐵錠')
    expect(results[0].itemId).toBe(5057)
    expect(results.find((r) => r.id === 101)?.job).toBe('BSM')
    expect(results.find((r) => r.id === 102)?.job).toBe('ARM')
  })

  it('NFKC normalizes full-width to half-width', async () => {
    const mod = await freshModule()
    const { impl } = makeFetchMock({
      items: {
        en: makeItemsFile([
          [7001, 'ABC Widget', 10, 1, 1],
          [7002, 'xyz Gadget', 10, 1, 2],
        ]),
      },
      recipes: [
        {
          id: 901,
          itemResult: 7001,
          amountResult: 1,
          craftType: 0,
          rlv: 10,
          canHq: true,
          materialQualityFactor: 50,
          difficultyFactor: 100,
          qualityFactor: 100,
          durabilityFactor: 100,
          ingredients: [],
        },
      ],
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    // full-width "ABC" should normalize and match "ABC"
    const results = await mod.searchRecipesByName('ＡＢＣ', 'en')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(901)
  })

  it('ranks startsWith before includes', async () => {
    const mod = await freshModule()
    const { impl } = makeFetchMock({
      items: {
        en: makeItemsFile([
          [8001, 'foo-bar', 50, 1, 1], // includes "bar"
          [8002, 'bar-baz', 40, 1, 2], // startsWith "bar"
        ]),
      },
      recipes: [
        {
          id: 801,
          itemResult: 8001,
          amountResult: 1,
          craftType: 0,
          rlv: 10,
          canHq: true,
          materialQualityFactor: 50,
          difficultyFactor: 100,
          qualityFactor: 100,
          durabilityFactor: 100,
          ingredients: [],
        },
        {
          id: 802,
          itemResult: 8002,
          amountResult: 1,
          craftType: 0,
          rlv: 10,
          canHq: true,
          materialQualityFactor: 50,
          difficultyFactor: 100,
          qualityFactor: 100,
          durabilityFactor: 100,
          ingredients: [],
        },
      ],
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    const results = await mod.searchRecipesByName('bar', 'en')
    expect(results).toHaveLength(2)
    expect(results[0].id).toBe(802) // startsWith wins
    expect(results[1].id).toBe(801)
  })

  it('caps results at 50', async () => {
    const mod = await freshModule()
    const items: ItemTuple[] = []
    const recipes: unknown[] = []
    // 80 items all starting with "ore", 80 recipes
    for (let i = 0; i < 80; i++) {
      const id = 10000 + i
      items.push([id, `ore-${i}`, 50 - i, 1, 1])
      recipes.push({
        id: 50000 + i,
        itemResult: id,
        amountResult: 1,
        craftType: 0,
        rlv: 11,
        canHq: true,
        materialQualityFactor: 50,
        difficultyFactor: 100,
        qualityFactor: 100,
        durabilityFactor: 100,
        ingredients: [],
      })
    }
    const { impl } = makeFetchMock({
      items: { en: makeItemsFile(items) },
      recipes,
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(impl)

    const results = await mod.searchRecipesByName('ore', 'en')
    expect(results.length).toBeLessThanOrEqual(50)
    expect(results.length).toBe(50)
  })
})

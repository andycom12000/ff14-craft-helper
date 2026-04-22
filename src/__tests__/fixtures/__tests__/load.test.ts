import { afterEach, describe, expect, it } from 'vitest'
import { fixtures, resetLocalDataMocks, setupLocalDataMocks } from '../load'

describe('fixture loader', () => {
  afterEach(() => {
    resetLocalDataMocks()
  })

  it('serves recipes fixture via fetch', async () => {
    setupLocalDataMocks()
    const res = await fetch('/data/recipes.json')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual(fixtures.recipes)
    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(3)
  })

  it('serves zh-TW items fixture via fetch', async () => {
    setupLocalDataMocks()
    const res = await fetch('/data/items/zh-TW.json')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual(fixtures.items['zh-TW'])
  })

  it('serves en items fixture via fetch', async () => {
    setupLocalDataMocks()
    const res = await fetch('/data/items/en.json')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual(fixtures.items.en)
  })

  it('serves rlt and manifest fixtures via fetch', async () => {
    setupLocalDataMocks()
    const rlt = await (await fetch('/data/rlt.json')).json()
    const manifest = await (await fetch('/data/manifest.json')).json()
    expect(rlt).toEqual(fixtures.rlt)
    expect(manifest).toEqual(fixtures.manifest)
  })

  it('returns 404 for unknown locale', async () => {
    setupLocalDataMocks()
    const res = await fetch('/data/items/unknown.json')
    expect(res.status).toBe(404)
  })

  it('returns 404 for unknown data path', async () => {
    setupLocalDataMocks()
    const res = await fetch('/data/does-not-exist.json')
    expect(res.status).toBe(404)
  })

  it('honors recipes override', async () => {
    setupLocalDataMocks({ recipes: [] })
    const res = await fetch('/data/recipes.json')
    const data = await res.json()
    expect(data).toEqual([])
  })

  it('honors items override merged with defaults', async () => {
    const customEn = { schemaVersion: 1, items: [[9999, 'Custom Item', 1, 0, 20000]] }
    setupLocalDataMocks({ items: { en: customEn } })
    const enRes = await (await fetch('/data/items/en.json')).json()
    expect(enRes).toEqual(customEn)
    // Other locales still served from defaults
    const zhTw = await (await fetch('/data/items/zh-TW.json')).json()
    expect(zhTw).toEqual(fixtures.items['zh-TW'])
  })

  it('resetLocalDataMocks unstubs fetch', async () => {
    setupLocalDataMocks()
    const stubbed = await fetch('/data/recipes.json')
    expect(stubbed.status).toBe(200)
    resetLocalDataMocks()
    // After unstub, fetching a relative path should no longer produce our stubbed 200
    // In vitest/jsdom env fetch may be undefined or throw — either way, it's no longer our stub
    let stillStubbed = false
    try {
      const r = await fetch('/data/recipes.json')
      // If native fetch resolves it won't be our exact shape — check it's not the stub response
      const body = await r.json().catch(() => null)
      stillStubbed = Array.isArray(body) && body.length === 3 && body[0]?.id === 1001
    }
    catch {
      stillStubbed = false
    }
    expect(stillStubbed).toBe(false)
  })
})

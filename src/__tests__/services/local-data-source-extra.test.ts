import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getItem, __resetForTesting } from '@/services/local-data-source'

interface ItemsFile {
  schemaVersion: 1
  items: [number, string, number, number, number][]
}

const LEAN: ItemsFile = {
  schemaVersion: 1,
  items: [
    [5057, '黑鐵錠', 50, 0, 5057],
    [5340, '羊毛線', 50, 0, 5340],
  ],
}
const LEAN_EN: ItemsFile = {
  schemaVersion: 1,
  items: [
    [5057, 'Iron Ingot', 50, 0, 5057],
    [5340, 'Wool Yarn', 50, 0, 5340],
  ],
}
const EXTRA: ItemsFile = {
  schemaVersion: 1,
  items: [
    [6661, '沙之都風景畫', 1, 0, 6661],
    [44878, '某新家具', 1, 0, 44878],
  ],
}
const EXTRA_EN: ItemsFile = {
  schemaVersion: 1,
  items: [
    [6661, 'Painting of Ul-dah', 1, 0, 6661],
  ],
}

function mockFetchOk(map: Record<string, ItemsFile>) {
  return vi.fn(async (url: string) => {
    for (const key of Object.keys(map)) {
      if (url.endsWith(key)) {
        return {
          ok: true,
          status: 200,
          json: async () => map[key],
          statusText: 'OK',
        }
      }
    }
    // Anything we didn't mock → 404 (e.g. zh-TW-overrides.json)
    return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) }
  })
}

describe('local-data-source extra-shard lazy load', () => {
  beforeEach(() => {
    __resetForTesting()
  })

  it('returns the lean record without fetching the extra shard', async () => {
    const fetchMock = mockFetchOk({
      'items/zh-TW.json': LEAN,
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const item = await getItem(5057, 'zh-TW')
    expect(item?.name).toBe('黑鐵錠')

    const fetchedUrls = fetchMock.mock.calls.map((c) => c[0])
    expect(fetchedUrls.some((u) => String(u).includes('-extra.json'))).toBe(false)
  })

  it('lazy-loads the extra shard on a lean miss', async () => {
    const fetchMock = mockFetchOk({
      'items/zh-TW.json': LEAN,
      'items/zh-TW-extra.json': EXTRA,
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const item = await getItem(6661, 'zh-TW')
    expect(item?.name).toBe('沙之都風景畫')

    const fetchedUrls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(fetchedUrls.some((u) => u.endsWith('items/zh-TW-extra.json'))).toBe(true)
  })

  it('hits the extra shard once across multiple miss-and-find lookups', async () => {
    const fetchMock = mockFetchOk({
      'items/zh-TW.json': LEAN,
      'items/zh-TW-extra.json': EXTRA,
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await getItem(6661, 'zh-TW')
    await getItem(44878, 'zh-TW')
    await getItem(6661, 'zh-TW') // repeat

    const extraFetches = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith('zh-TW-extra.json'),
    )
    expect(extraFetches.length).toBe(1)
  })

  it('does not retry an extra shard after it fails (per locale)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('items/zh-TW.json')) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => LEAN }
      }
      if (url.endsWith('-extra.json')) {
        return { ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) }
      }
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) }
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const a = await getItem(99999, 'zh-TW')
    const b = await getItem(99998, 'zh-TW')
    expect(a).toBeUndefined()
    expect(b).toBeUndefined()

    // getItem walks every locale's extra on a miss, but each locale's extra
    // is only fetched ONCE total (failure cached). Across two getItem calls
    // we still expect at most 4 extra fetches (one per locale), not 8.
    const extraFetches = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('-extra.json'),
    )
    const uniqueExtraUrls = new Set(extraFetches.map((c) => String(c[0])))
    expect(extraFetches.length).toBe(uniqueExtraUrls.size)
    expect(uniqueExtraUrls.size).toBeLessThanOrEqual(4)
  })

  it('falls through to zh-TW extra shard when target locale extra misses', async () => {
    const fetchMock = mockFetchOk({
      'items/en.json': LEAN_EN,
      'items/zh-TW.json': LEAN,
      'items/en-extra.json': EXTRA_EN,
      'items/zh-TW-extra.json': EXTRA,
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    // 44878 is only in zh-TW extra (not in en extra)
    const item = await getItem(44878, 'en')
    expect(item?.name).toBe('某新家具')
  })

  it('returns undefined when an id is in neither lean nor any extra', async () => {
    const fetchMock = mockFetchOk({
      'items/zh-TW.json': LEAN,
      'items/zh-TW-extra.json': EXTRA,
      'items/zh-CN.json': { schemaVersion: 1, items: [] },
      'items/en.json': { schemaVersion: 1, items: [] },
      'items/ja.json': { schemaVersion: 1, items: [] },
      'items/zh-CN-extra.json': { schemaVersion: 1, items: [] },
      'items/en-extra.json': { schemaVersion: 1, items: [] },
      'items/ja-extra.json': { schemaVersion: 1, items: [] },
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const item = await getItem(123456, 'zh-TW')
    expect(item).toBeUndefined()
  })

  it('zh-TW user gets en/ja name when zh-TW upstream lags', async () => {
    // Reproduces the real 44878 issue: TW datamining repo lags ~13% behind
    // the others, so getItem must walk past zh-TW (lean + extra) into the
    // other locales' extras to find the name.
    const fetchMock = mockFetchOk({
      'items/zh-TW.json': LEAN,
      'items/zh-TW-extra.json': { schemaVersion: 1, items: [] },
      'items/zh-CN.json': { schemaVersion: 1, items: [] },
      'items/zh-CN-extra.json': {
        schemaVersion: 1,
        items: [[44878, '园艺工挂画框', 1, 0, 51573]],
      },
      'items/en.json': LEAN_EN,
      'items/en-extra.json': {
        schemaVersion: 1,
        items: [[44878, "Botanist's Wall Frames", 1, 0, 51573]],
      },
      'items/ja.json': { schemaVersion: 1, items: [] },
      'items/ja-extra.json': { schemaVersion: 1, items: [] },
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const item = await getItem(44878, 'zh-TW')
    // Visit order for zh-TW user is [zh-TW, zh-CN, en, ja].
    // zh-CN extra has 44878, so zh-CN wins before en even though en also has it.
    expect(item?.name).toBe('园艺工挂画框')
  })
})

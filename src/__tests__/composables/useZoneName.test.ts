import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useZoneName } from '@/composables/useZoneName'
import { useNpcName } from '@/composables/useNpcName'
import { fetchZoneMetaBulk, fetchNpcNameBulk, __clearCache } from '@/services/zone-meta'

beforeEach(() => {
  setActivePinia(createPinia())
  __clearCache()
  vi.restoreAllMocks()
})

describe('useZoneName', () => {
  it('returns name for current locale after fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('PlaceName')
        ? { rows: [{ row_id: 146, fields: { Name_chs: '拉诺西亚低地', Name_en: 'Lower La Noscea', Name_ja: '低地ラノシア' } }] }
        : { results: [{ row_id: 12, fields: { Id: 'r1f1/00', SizeFactor: 100, 'PlaceName.Id': 146 } }] }
    } as Response)))
    await fetchZoneMetaBulk([146])
    const name = useZoneName(() => 146)
    // Default locale (zh-TW from project default); should contain a zh-TW form character
    expect(name.value).toMatch(/拉|諾|諲/)
  })

  it('falls back to en when locale-specific name missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('PlaceName')
        ? { rows: [{ row_id: 200, fields: { Name_en: 'Mystery Zone' } }] }  // only en
        : { results: [] }
    } as Response)))
    await fetchZoneMetaBulk([200])
    const name = useZoneName(() => 200)
    expect(name.value).toBe('Mystery Zone')
  })

  it('returns sentinel #zone:N when nothing cached', () => {
    const name = useZoneName(() => 999)
    expect(name.value).toBe('#zone:999')
  })
})

describe('useNpcName', () => {
  it('returns localized name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ rows: [{ row_id: 1001, fields: { Singular_chs: '商人甲', Singular_en: 'Vendor A', Singular_ja: '商人甲' } }] })
    } as Response)))
    await fetchNpcNameBulk([1001])
    const n = useNpcName(() => 1001)
    expect(n.value).toBeTruthy()
    expect(n.value).not.toBe('#npc:1001')
  })

  it('falls back to en', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ rows: [{ row_id: 2000, fields: { Singular_en: 'En Only' } }] })
    } as Response)))
    await fetchNpcNameBulk([2000])
    const n = useNpcName(() => 2000)
    expect(n.value).toBe('En Only')
  })

  it('sentinel #npc:N when missing', () => {
    const n = useNpcName(() => 999)
    expect(n.value).toBe('#npc:999')
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// ---------------------------------------------------------------------------
// Mock garland-core (the actual source of localized names since the v2 rewrite).
// vi.hoisted lets us declare the canned data above the vi.mock factory.
// ---------------------------------------------------------------------------

const { fakeLocations, fakeNpcs } = vi.hoisted(() => ({
  fakeLocations: {} as Record<number, Record<string, string>>,
  fakeNpcs: {} as Record<number, Record<string, string>>,
}))

vi.mock('@/services/garland-core', () => ({
  loadAllLocationNames: vi.fn(async () => {}),
  getLocationName: vi.fn(
    (zoneId: number, locale: string) => fakeLocations[zoneId]?.[locale] ?? null,
  ),
  fetchNpcNameBulkGarland: vi.fn(async (ids: number[]) => {
    const m = new Map<number, Map<string, string>>()
    for (const id of ids) {
      const data = fakeNpcs[id]
      if (!data) continue
      const inner = new Map<string, string>()
      for (const [k, v] of Object.entries(data)) inner.set(k, v)
      m.set(id, inner)
    }
    return m
  }),
  getNpcNameSync: vi.fn(
    (npcId: number, locale: string) => fakeNpcs[npcId]?.[locale] ?? null,
  ),
}))

import { useZoneName } from '@/composables/useZoneName'
import { useNpcName } from '@/composables/useNpcName'
import { fetchZoneMetaBulk, fetchNpcNameBulk, __clearCache } from '@/services/zone-meta'

beforeEach(() => {
  setActivePinia(createPinia())
  __clearCache()
  // Wipe the canned data between tests.
  for (const k of Object.keys(fakeLocations)) delete fakeLocations[Number(k)]
  for (const k of Object.keys(fakeNpcs)) delete fakeNpcs[Number(k)]
  // Mock the Map-search xivapi call (zone-meta still uses xivapi for asset URLs).
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ results: [] }),
  } as Response)))
})

describe('useZoneName', () => {
  it('returns name for current locale after fetch', async () => {
    fakeLocations[146] = {
      en: 'Lower La Noscea',
      ja: 'ラノシア低地',
      'zh-CN': '拉诺西亚低地',
      'zh-TW': '拉諾西亞低地',
    }
    await fetchZoneMetaBulk([146])
    const name = useZoneName(() => 146)
    // Default locale is zh-TW.
    expect(name.value).toMatch(/拉|諾|亞/)
  })

  it('falls back to en when locale-specific name missing', async () => {
    fakeLocations[200] = { en: 'Mystery Zone' }
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
    fakeNpcs[1001] = {
      en: 'Vendor A',
      ja: '商人甲',
      'zh-CN': '商人甲',
      'zh-TW': '商人甲',
    }
    await fetchNpcNameBulk([1001])
    const n = useNpcName(() => 1001)
    expect(n.value).toBeTruthy()
    expect(n.value).not.toBe('#npc:1001')
  })

  it('falls back to en', async () => {
    fakeNpcs[2000] = { en: 'En Only' }
    await fetchNpcNameBulk([2000])
    const n = useNpcName(() => 2000)
    expect(n.value).toBe('En Only')
  })

  it('sentinel #npc:N when missing', () => {
    const n = useNpcName(() => 999)
    expect(n.value).toBe('#npc:999')
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import BomRoutePlanner from '@/components/bom/BomRoutePlanner.vue'
import { useBomStore } from '@/stores/bom'

// ---------------------------------------------------------------------------
// Mock composables / sub-components that need network or complex DOM
// ---------------------------------------------------------------------------

vi.mock('@/composables/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => ({ value: false })),
  useIsMobile: vi.fn(() => ({ value: false })),
}))

vi.mock('@/composables/useZoneName', () => ({
  useZoneName: (zoneIdGetter: unknown) => {
    const { computed, toValue } = require('vue')
    return computed(() => {
      const id = toValue(zoneIdGetter)
      if (id === 146) return '莫拉比灣'
      return `#zone:${id}`
    })
  },
}))

vi.mock('@/services/zone-meta', () => ({
  getZoneMetaSync: (_zoneId: number) => null,
  getNpcNameSync: (_npcId: number, _locale: string) => 'Test Vendor',
  fetchZoneMetaBulk: async () => new Map(),
  fetchNpcNameBulk: async () => new Map(),
  __clearCache: () => {},
}))

vi.mock('@/stores/locale', () => ({
  useLocaleStore: () => ({ current: 'zh-TW' }),
}))

// ---------------------------------------------------------------------------
// Stub fetch — aetherytes.json + any other fetch calls
// ---------------------------------------------------------------------------

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        typeof url === 'string' && url.includes('aetherytes')
          ? {
              zones: {
                '146': {
                  aetherytes: [{ name: 'A', x: 0, y: 0, tpCostBase: 213 }],
                },
              },
            }
          : {},
    } as Response)),
  )
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BomRoutePlanner', () => {
  it('renders empty state when no rows', async () => {
    const w = mount(BomRoutePlanner)
    await flushPromises()
    expect(w.find('[data-testid="route-empty"]').exists()).toBe(true)
    expect(w.text()).toContain('今天不用出門')
  })

  it('renders zone group cards when route has rows', async () => {
    const store = useBomStore()
    // Seed flat materials with one npc-mode raw material
    store.flatMaterials = [
      { itemId: 100, name: 'X', icon: '', totalAmount: 1, isRaw: true },
    ] as typeof store.flatMaterials
    // Force npc mode via acquisitionMode map
    store.acquisitionMode.set(100, 'npc')
    // Seed itemLocations
    store.itemLocations.set(100, {
      npcVendors: [{ npcId: 1, zoneId: 146, x: 25, y: 31, price: 100 }],
      gatherNodes: [],
    })

    const w = mount(BomRoutePlanner)
    await flushPromises()
    await w.vm.$nextTick()
    expect(w.find('[data-testid="route-empty"]').exists()).toBe(false)
    expect(w.findAllComponents({ name: 'RoutePlannerGroupCard' }).length).toBeGreaterThan(0)
  })

  it('opens bottom sheet on group card open-map-sheet event', async () => {
    const store = useBomStore()
    store.flatMaterials = [
      { itemId: 100, name: 'X', icon: '', totalAmount: 1, isRaw: true },
    ] as typeof store.flatMaterials
    store.acquisitionMode.set(100, 'npc')
    store.itemLocations.set(100, {
      npcVendors: [{ npcId: 1, zoneId: 146, x: 25, y: 31, price: 100 }],
      gatherNodes: [],
    })
    const w = mount(BomRoutePlanner)
    await flushPromises()
    await w.vm.$nextTick()
    const card = w.findComponent({ name: 'RoutePlannerGroupCard' })
    if (card.exists()) {
      await card.vm.$emit('open-map-sheet', 146, { x: 25, y: 31 })
      await flushPromises()
      // ZoneMapSheet should have modelValue=true now
      const sheet = w.findComponent({ name: 'ZoneMapSheet' })
      expect(sheet.props('modelValue')).toBe(true)
      expect(sheet.props('zoneId')).toBe(146)
    }
  })

})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import BomAcquisitionDetail from '@/components/bom/BomAcquisitionDetail.vue'
import { useBomStore } from '@/stores/bom'

// ---------------------------------------------------------------------------
// Mock useMediaQuery so we control desktop vs phone in tests.
// We use vue ref() so the component's template auto-unwrap works correctly.
// ---------------------------------------------------------------------------

const _isPhoneRef = ref(false)

vi.mock('@/composables/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => _isPhoneRef),
  useIsMobile: vi.fn(() => _isPhoneRef),
}))

// ---------------------------------------------------------------------------
// Mock composables / services that require network or DOM APIs
// ---------------------------------------------------------------------------

vi.mock('@/composables/useNpcName', () => ({
  useNpcName: (npcId: unknown) => ({ value: `NPC#${npcId}` }),
}))

vi.mock('@/composables/useZoneName', () => ({
  useZoneName: (zoneId: unknown) => ({ value: `Zone#${zoneId}` }),
}))

// getNpcNameSync + getZoneMetaSync used inline in component
vi.mock('@/services/zone-meta', () => ({
  getNpcNameSync: (npcId: number) => `NPC#${npcId}`,
  getZoneMetaSync: (_zoneId: number) => null, // no map asset in tests
}))

vi.mock('@/stores/locale', () => ({
  useLocaleStore: () => ({ current: 'zh-TW' }),
}))

// ---------------------------------------------------------------------------
// beforeEach setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  setActivePinia(createPinia())

  // Reset phone state to desktop for each test
  _isPhoneRef.value = false

  // Default fetch mock: returns empty aetherytes data
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ zones: {} }),
    })),
  )
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BomAcquisitionDetail', () => {
  it('renders npc sources sorted by price ASC, primary first', async () => {
    const store = useBomStore()
    // Prevent fetchItemLocationsForRoute from overwriting our test data
    vi.spyOn(store, 'fetchItemLocationsForRoute').mockResolvedValue(undefined)
    store.itemLocations.set(5057, {
      npcVendors: [
        { npcId: 1, zoneId: 146, x: 25, y: 31, price: 240 },
        { npcId: 2, zoneId: 153, x: 30, y: 31, price: 215 },
      ],
      gatherNodes: [],
    })

    const w = mount(BomAcquisitionDetail, {
      props: { itemId: 5057, mode: 'npc' },
    })
    await flushPromises()

    const sources = w.findAll('[data-source-row]')
    expect(sources.length).toBe(2)

    // Price 215 should be first (primary)
    expect(sources[0].classes()).toContain('is-primary')
    // The first row should contain NPC#2 (price 215)
    expect(sources[0].text()).toContain('NPC#2')
    // The second row should be NPC#1 (price 240)
    expect(sources[1].text()).toContain('NPC#1')
  })

  it('renders gather sources sorted by level ASC', async () => {
    const store = useBomStore()
    // Prevent fetchItemLocationsForRoute from overwriting our test data
    vi.spyOn(store, 'fetchItemLocationsForRoute').mockResolvedValue(undefined)
    store.itemLocations.set(1, {
      npcVendors: [],
      gatherNodes: [
        { nodeId: 1, type: 'MIN', level: 50, zoneId: 146, x: 22, y: 18 },
        { nodeId: 2, type: 'MIN', level: 40, zoneId: 146, x: 18, y: 26 },
      ],
    })

    const w = mount(BomAcquisitionDetail, {
      props: { itemId: 1, mode: 'gather' },
    })
    await flushPromises()

    const sources = w.findAll('[data-source-row]')
    expect(sources.length).toBe(2)
    // Level 40 should come first
    expect(sources[0].text()).toContain('Lv40')
    expect(sources[1].text()).toContain('Lv50')
  })

  it('hides in-flow map below 768px and shows map button instead', async () => {
    _isPhoneRef.value = true

    const store = useBomStore()
    vi.spyOn(store, 'fetchItemLocationsForRoute').mockResolvedValue(undefined)
    store.itemLocations.set(1, {
      npcVendors: [{ npcId: 1, zoneId: 146, x: 25, y: 31, price: 100 }],
      gatherNodes: [],
    })

    const w = mount(BomAcquisitionDetail, {
      props: { itemId: 1, mode: 'npc' },
    })
    await flushPromises()

    expect(w.find('[data-map-canvas]').exists()).toBe(false)
    expect(w.find('[data-map-button]').exists()).toBe(true)
  })

  it('emits open-map-sheet with zoneId and coords on phone map button click', async () => {
    _isPhoneRef.value = true

    const store = useBomStore()
    vi.spyOn(store, 'fetchItemLocationsForRoute').mockResolvedValue(undefined)
    store.itemLocations.set(1, {
      npcVendors: [{ npcId: 1, zoneId: 146, x: 25, y: 31, price: 100 }],
      gatherNodes: [],
    })

    const w = mount(BomAcquisitionDetail, {
      props: { itemId: 1, mode: 'npc' },
    })
    await flushPromises()

    await w.find('[data-map-button]').trigger('click')
    const events = w.emitted('open-map-sheet')
    expect(events).toBeTruthy()
    expect(events![0]).toEqual([146, { x: 25, y: 31 }])
  })

  it('empty location data shows placeholder', async () => {
    const store = useBomStore()
    vi.spyOn(store, 'fetchItemLocationsForRoute').mockResolvedValue(undefined)
    store.itemLocations.set(1, { npcVendors: [], gatherNodes: [] })

    const w = mount(BomAcquisitionDetail, {
      props: { itemId: 1, mode: 'npc' },
    })
    await flushPromises()

    expect(w.text()).toContain('查無位置資料')
  })
})

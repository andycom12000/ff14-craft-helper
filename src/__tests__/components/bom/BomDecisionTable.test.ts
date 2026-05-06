import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import BomDecisionTable from '@/components/bom/BomDecisionTable.vue'
import { useBomStore } from '@/stores/bom'
import type { FlatMaterial, MaterialNode } from '@/stores/bom'

// ---------------------------------------------------------------------------
// Stubs / mocks for components that require network or DOM APIs
// ---------------------------------------------------------------------------

// Must return a real Vue ref so template auto-unwrap works correctly.
const _isMobileRef = ref(false)

vi.mock('@/composables/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => _isMobileRef),
  useIsMobile: vi.fn(() => _isMobileRef),
}))

vi.mock('@/components/common/ItemName.vue', () => ({
  default: { template: '<span />' },
}))

vi.mock('@/components/common/GilDisplay.vue', () => ({
  default: { template: '<span />' },
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({ priceDisplayMode: 'min' }),
}))

vi.mock('@/composables/useZoneName', () => ({
  useZoneName: () => ({ value: 'TestZone' }),
}))

vi.mock('@/services/zone-meta', () => ({
  getZoneMetaSync: () => null,
  getNpcNameSync: () => 'TestNpc',
}))

vi.mock('@/stores/locale', () => ({
  useLocaleStore: () => ({ current: 'zh-TW' }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTable(bom: ReturnType<typeof useBomStore>, itemId: number) {
  const material: FlatMaterial = {
    itemId,
    name: 'Iron Ore',
    icon: '',
    totalAmount: 3,
    depth: 1,
    recipeId: null,
  }
  const node: MaterialNode = {
    itemId,
    name: 'Iron Ore',
    icon: '',
    amount: 3,
    recipeId: null,
    children: [],
    depth: 1,
    collapsed: false,
  }
  vi.spyOn(bom, 'isCraftableInTree').mockReturnValue(false)
  vi.spyOn(bom, 'findNode').mockReturnValue(null)

  return mount(BomDecisionTable, {
    props: {
      materials: [material],
      materialTree: [node],
      targetItemIds: [],
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BomDecisionTable — BomAcquisitionDetail panel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    _isMobileRef.value = false

    // Stub fetch for BomAcquisitionDetail + ZoneMapSheet
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ zones: {} }),
      } as Response)),
    )
  })

  it('does NOT render BomAcquisitionDetail when row is collapsed', async () => {
    const bom = useBomStore()
    const ITEM = 999
    bom.acquisitionMode.set(ITEM, 'npc')
    bom.acquisitionMode = new Map(bom.acquisitionMode)

    const w = makeTable(bom, ITEM)
    await flushPromises()

    expect(w.find('[data-bom-acquisition-detail]').exists()).toBe(false)
  })

  it('renders BomAcquisitionDetail when npc row is expanded', async () => {
    const bom = useBomStore()
    const ITEM = 999
    bom.acquisitionMode.set(ITEM, 'npc')
    bom.acquisitionMode = new Map(bom.acquisitionMode)
    bom.toggleRowExpanded(ITEM)

    const w = makeTable(bom, ITEM)
    await flushPromises()

    expect(w.find('[data-bom-acquisition-detail]').exists()).toBe(true)
  })

  it('renders BomAcquisitionDetail when gather row is expanded', async () => {
    const bom = useBomStore()
    const ITEM = 998
    bom.acquisitionMode.set(ITEM, 'gather')
    bom.acquisitionMode = new Map(bom.acquisitionMode)
    bom.toggleRowExpanded(ITEM)

    const w = makeTable(bom, ITEM)
    await flushPromises()

    expect(w.find('[data-bom-acquisition-detail]').exists()).toBe(true)
  })
})

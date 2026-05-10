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
    isRaw: true,
  }
  const node: MaterialNode = {
    itemId,
    name: 'Iron Ore',
    icon: '',
    amount: 3,
    children: [],
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

describe('BomDecisionTable — target row unlock', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    _isMobileRef.value = false
  })

  it('does not lock craftable target rows (immutable=false)', async () => {
    const bom = useBomStore()
    const ITEM = 100
    const targetNode: MaterialNode = {
      itemId: ITEM,
      name: 'Target Item',
      icon: '',
      amount: 1,
      recipeId: 9001,
      children: [{ itemId: 50, name: 'Mat', icon: '', amount: 1 }],
      collapsed: false,
    }
    vi.spyOn(bom, 'isCraftableInTree').mockReturnValue(true)
    vi.spyOn(bom, 'findNode').mockReturnValue(targetNode)

    const w = mount(BomDecisionTable, {
      props: {
        materials: [],
        materialTree: [targetNode],
        targetItemIds: [ITEM],
      },
    })
    await flushPromises()

    const decisionRow = w.findComponent({ name: 'BomDecisionRow' })
    expect(decisionRow.exists()).toBe(true)
    expect(decisionRow.props('immutable')).toBe(false)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import RoutePlannerGroupCard from '@/components/bom/RoutePlannerGroupCard.vue'
import { useBomStore } from '@/stores/bom'
import type { Group } from '@/services/route-planner'

// ---------------------------------------------------------------------------
// Shared phone ref — controlled per-test
// ---------------------------------------------------------------------------

const _isPhoneRef = ref(false)

vi.mock('@/composables/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => _isPhoneRef),
  useIsMobile: vi.fn(() => _isPhoneRef),
}))

// ---------------------------------------------------------------------------
// Stable mocks for name resolution + zone-meta
// ---------------------------------------------------------------------------

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
  getZoneMetaSync: (_zoneId: number) => null, // no map in tests
  getNpcNameSync: (npcId: number) => `NPC#${npcId}`,
}))

vi.mock('@/stores/locale', () => ({
  useLocaleStore: () => ({ current: 'zh-TW' }),
}))

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

const baseGroup = (overrides: Partial<Group> = {}): Group => ({
  zoneId: 146,
  aetheryte: { name: '莫拉比', x: 28, y: 33, tpCostBase: 213 },
  tpCost: 213,
  rows: [
    {
      itemId: 100,
      source: { zoneId: 146, x: 25, y: 31, itemPrice: 215, vendorName: 'Vendor A' },
      orderInZone: 1,
    },
    {
      itemId: 200,
      source: { zoneId: 146, x: 22, y: 18, nodeLevel: 45 },
      orderInZone: 2,
    },
  ],
  ...overrides,
})

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  setActivePinia(createPinia())
  _isPhoneRef.value = false
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RoutePlannerGroupCard', () => {
  it('renders zone header with aetheryte chip and count', () => {
    const w = mount(RoutePlannerGroupCard, { props: { group: baseGroup() } })
    // Zone name resolved via mock
    expect(w.text()).toContain('莫拉比灣')
    // Aetheryte name + tpCost
    expect(w.text()).toContain('莫拉比')
    expect(w.text()).toContain('213')
  })

  it('renders ?G when aetheryte is null', () => {
    const w = mount(RoutePlannerGroupCard, {
      props: { group: baseGroup({ aetheryte: null, tpCost: 0 }) },
    })
    expect(w.text()).toContain('?G')
  })

  it('applies hero variant when group.isHero === true', () => {
    const w = mount(RoutePlannerGroupCard, {
      props: { group: baseGroup({ isHero: true }) },
    })
    expect(w.classes()).toContain('is-hero')
  })

  it('toggles checked on row checkbox click', async () => {
    const store = useBomStore()
    const w = mount(RoutePlannerGroupCard, { props: { group: baseGroup() } })
    const checkbox = w.find('[data-testid="row-checkbox-100"]')
    await checkbox.trigger('click')
    expect(store.routeViewSession.checked.has(100)).toBe(true)
  })

  it('toggles collapsed on header click', async () => {
    const store = useBomStore()
    const w = mount(RoutePlannerGroupCard, { props: { group: baseGroup() } })
    expect(store.routeViewSession.collapsedGroups.has(146)).toBe(false)
    await w.find('[data-testid="group-header"]').trigger('click')
    expect(store.routeViewSession.collapsedGroups.has(146)).toBe(true)
  })

  it('emits open-map-sheet when phone map button clicked', async () => {
    _isPhoneRef.value = true
    const w = mount(RoutePlannerGroupCard, { props: { group: baseGroup() } })
    await w.vm.$nextTick()
    const btn = w.find('[data-testid="row-map-btn-100"]')
    await btn.trigger('click')
    expect(w.emitted('open-map-sheet')).toBeTruthy()
    expect(w.emitted('open-map-sheet')![0]).toEqual([146, { x: 25, y: 31 }])
  })

  it('checked row has is-checked class for strikethrough', async () => {
    const store = useBomStore()
    store.toggleChecked(100)
    const w = mount(RoutePlannerGroupCard, { props: { group: baseGroup() } })
    expect(w.find('[data-testid="row-100"]').classes()).toContain('is-checked')
  })

  it('body is hidden when group is collapsed', async () => {
    const store = useBomStore()
    const w = mount(RoutePlannerGroupCard, { props: { group: baseGroup() } })
    // Initially not collapsed
    expect(w.find('.rpgc__body').exists()).toBe(true)
    // Toggle collapse
    store.toggleGroupCollapsed(146)
    await w.vm.$nextTick()
    expect(w.find('.rpgc__body').exists()).toBe(false)
  })
})

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

// ---------------------------------------------------------------------------
// Default props helper — supplies the required stop/timeline metadata.
// ---------------------------------------------------------------------------

function makeProps(groupOverrides: Partial<Group> = {}, propOverrides: {
  stopNumber?: number
  totalStops?: number
  nextZoneId?: number | null
} = {}) {
  return {
    group: baseGroup(groupOverrides),
    stopNumber: propOverrides.stopNumber ?? 1,
    totalStops: propOverrides.totalStops ?? 3,
    nextZoneId: propOverrides.nextZoneId === undefined ? 999 : propOverrides.nextZoneId,
  }
}

describe('RoutePlannerGroupCard', () => {
  it('renders zone header with aetheryte chip and count', () => {
    const w = mount(RoutePlannerGroupCard, { props: makeProps() })
    // Zone name resolved via mock
    expect(w.text()).toContain('莫拉比灣')
    // Aetheryte name + tpCost
    expect(w.text()).toContain('莫拉比')
    expect(w.text()).toContain('213')
  })

  it('renders ?G when aetheryte is null', () => {
    const w = mount(RoutePlannerGroupCard, {
      props: makeProps({ aetheryte: null, tpCost: 0 }),
    })
    expect(w.text()).toContain('?G')
  })

  it('renders the stop-number badge zero-padded so the timeline reads consistently', () => {
    const w = mount(RoutePlannerGroupCard, {
      props: makeProps({}, { stopNumber: 3, totalStops: 12 }),
    })
    expect(w.find('.rpgc__stop-num').text()).toBe('03')
  })

  it('shows the next-stop hint when a nextZoneId is provided', () => {
    const w = mount(RoutePlannerGroupCard, {
      props: makeProps({}, { stopNumber: 1, totalStops: 3, nextZoneId: 146 }),
    })
    const next = w.find('.rpgc__next')
    expect(next.exists()).toBe(true)
    expect(next.text()).toContain('下一站')
    expect(next.text()).toContain('莫拉比灣')
  })

  it('shows the "收工" finish line on the last stop instead of a next-stop hint', () => {
    const w = mount(RoutePlannerGroupCard, {
      props: makeProps({}, { stopNumber: 3, totalStops: 3, nextZoneId: null }),
    })
    expect(w.find('.rpgc__next').classes()).toContain('rpgc__next--last')
    expect(w.text()).toContain('收工')
    expect(w.text()).not.toContain('下一站')
  })

  it('does not paint a brighter background on hero groups so the timeline rhythm stays even', () => {
    const w = mount(RoutePlannerGroupCard, {
      props: makeProps({ isHero: true }),
    })
    expect(w.classes()).not.toContain('is-hero')
  })

  it('toggles checked on row checkbox click', async () => {
    const store = useBomStore()
    const w = mount(RoutePlannerGroupCard, { props: makeProps() })
    const checkbox = w.find('[data-testid="row-checkbox-100"]')
    await checkbox.trigger('click')
    expect(store.routeViewSession.checked.has(100)).toBe(true)
  })

  it('toggles collapsed on header click', async () => {
    const store = useBomStore()
    const w = mount(RoutePlannerGroupCard, { props: makeProps() })
    expect(store.routeViewSession.collapsedGroups.has(146)).toBe(false)
    await w.find('[data-testid="group-header"]').trigger('click')
    expect(store.routeViewSession.collapsedGroups.has(146)).toBe(true)
  })

  it('emits open-map-sheet when phone map button clicked', async () => {
    _isPhoneRef.value = true
    const w = mount(RoutePlannerGroupCard, { props: makeProps() })
    await w.vm.$nextTick()
    const btn = w.find('[data-testid="row-map-btn-100"]')
    await btn.trigger('click')
    expect(w.emitted('open-map-sheet')).toBeTruthy()
    expect(w.emitted('open-map-sheet')![0]).toEqual([146, { x: 25, y: 31 }])
  })

  it('checked row has is-checked class for strikethrough', async () => {
    const store = useBomStore()
    store.toggleChecked(100)
    const w = mount(RoutePlannerGroupCard, { props: makeProps() })
    expect(w.find('[data-testid="row-100"]').classes()).toContain('is-checked')
  })

  it('body is hidden when group is collapsed', async () => {
    const store = useBomStore()
    const w = mount(RoutePlannerGroupCard, { props: makeProps() })
    // Initially not collapsed
    expect(w.find('.rpgc__body').exists()).toBe(true)
    // Toggle collapse
    store.toggleGroupCollapsed(146)
    await w.vm.$nextTick()
    expect(w.find('.rpgc__body').exists()).toBe(false)
  })
})

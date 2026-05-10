import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import BomDecisionRow from '@/components/bom/BomDecisionRow.vue'
import { useBomStore } from '@/stores/bom'

// ---------------------------------------------------------------------------
// Stub child components that require network or complex DOM
// ---------------------------------------------------------------------------

vi.mock('@/components/common/ItemName.vue', () => ({
  default: { template: '<span />' },
}))
vi.mock('@/components/common/GilDisplay.vue', () => ({
  default: { template: '<span />' },
}))

// Stub useSettingsStore — shared mutable state so tests can set crossServer / server.
const _settingsState = {
  priceDisplayMode: 'min' as 'nq' | 'hq' | 'minOf' | 'min',
  crossServer: false,
  server: '',
  dataCenter: '',
}
vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => _settingsState,
}))

// ---------------------------------------------------------------------------
// Helper: default props for a non-craftable material row
// ---------------------------------------------------------------------------

function makeProps(overrides: Partial<{
  itemId: number
  name: string
  icon: string
  amount: number
  isCraftable: boolean
  isTarget: boolean
  immutable: boolean
}> = {}) {
  return {
    itemId: overrides.itemId ?? 100,
    name: overrides.name ?? 'Iron Ore',
    icon: overrides.icon ?? '',
    amount: overrides.amount ?? 5,
    isCraftable: overrides.isCraftable ?? false,
    isTarget: overrides.isTarget,
    immutable: overrides.immutable,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BomDecisionRow — isRowToggleable', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('IS toggleable when mode is market (default) so the user can drill into the cross-world price table', () => {
    const w = mount(BomDecisionRow, { props: makeProps() })
    expect(w.find('.dec-row').classes()).toContain('is-row-toggleable')
  })

  it('is NOT toggleable for craft mode when isCraftable=false', async () => {
    const bom = useBomStore()
    bom.acquisitionMode.set(100, 'craft')
    bom.acquisitionMode = new Map(bom.acquisitionMode)
    const w = mount(BomDecisionRow, { props: makeProps({ isCraftable: false }) })
    await w.vm.$nextTick()
    expect(w.find('.dec-row').classes()).not.toContain('is-row-toggleable')
  })

  it('is toggleable when mode is npc', async () => {
    const bom = useBomStore()
    bom.acquisitionMode.set(100, 'npc')
    // Force reactivity
    bom.acquisitionMode = new Map(bom.acquisitionMode)

    const w = mount(BomDecisionRow, { props: makeProps({ isCraftable: false }) })
    await w.vm.$nextTick()
    expect(w.find('.dec-row').classes()).toContain('is-row-toggleable')
  })

  it('is toggleable when mode is gather', async () => {
    const bom = useBomStore()
    bom.acquisitionMode.set(100, 'gather')
    bom.acquisitionMode = new Map(bom.acquisitionMode)

    const w = mount(BomDecisionRow, { props: makeProps({ isCraftable: false }) })
    await w.vm.$nextTick()
    expect(w.find('.dec-row').classes()).toContain('is-row-toggleable')
  })

  it('is NOT toggleable for npc when immutable=true', async () => {
    const bom = useBomStore()
    bom.acquisitionMode.set(100, 'npc')
    bom.acquisitionMode = new Map(bom.acquisitionMode)

    const w = mount(BomDecisionRow, { props: makeProps({ isCraftable: false, immutable: true }) })
    await w.vm.$nextTick()
    expect(w.find('.dec-row').classes()).not.toContain('is-row-toggleable')
  })

  it('uses generalized aria-label (詳細) for npc mode', async () => {
    const bom = useBomStore()
    bom.acquisitionMode.set(100, 'npc')
    bom.acquisitionMode = new Map(bom.acquisitionMode)

    const w = mount(BomDecisionRow, { props: makeProps({ name: 'TestItem', isCraftable: false }) })
    await w.vm.$nextTick()
    const row = w.find('.dec-row')
    expect(row.attributes('aria-label')).toContain('詳細')
    expect(row.attributes('aria-label')).not.toContain('子配方')
  })

  it('clicking a toggleable npc row expands it', async () => {
    const bom = useBomStore()
    bom.acquisitionMode.set(100, 'npc')
    bom.acquisitionMode = new Map(bom.acquisitionMode)

    const w = mount(BomDecisionRow, { props: makeProps({ isCraftable: false }) })
    await w.vm.$nextTick()
    expect(bom.isRowExpanded(100)).toBe(false)
    await w.find('.dec-row').trigger('click')
    expect(bom.isRowExpanded(100)).toBe(true)
  })
})

describe('BomDecisionRow — target market-mode visuals', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    _settingsState.crossServer = false
    _settingsState.server = ''
  })

  it('renders cross-world server pill when target is in market mode', async () => {
    const bom = useBomStore()
    _settingsState.crossServer = true
    _settingsState.server = 'Tonberry'
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001, collapsed: true,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.crossWorldBestPriceMap.set(100, { worldName: 'Mandragora', minPrice: 800, fetchedAt: 1 })
    bom.setTargetDefaultMode('market')

    const w = mount(BomDecisionRow, { props: makeProps({ itemId: 100, isCraftable: true, isTarget: true }) })
    await w.vm.$nextTick()

    const pill = w.find('[data-testid="cross-world-pill"]')
    expect(pill.exists()).toBe(true)
    expect(pill.text()).toContain('Mandragora')
    expect(pill.classes()).not.toContain('is-home')
  })

  it('marks pill as home when home server is the cheapest', async () => {
    const bom = useBomStore()
    _settingsState.crossServer = true
    _settingsState.server = 'Tonberry'
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001, collapsed: true,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.crossWorldBestPriceMap.set(100, { worldName: 'Tonberry', minPrice: 800, fetchedAt: 1 })
    bom.setTargetDefaultMode('market')

    const w = mount(BomDecisionRow, { props: makeProps({ itemId: 100, isCraftable: true, isTarget: true }) })
    await w.vm.$nextTick()

    const pill = w.find('[data-testid="cross-world-pill"]')
    expect(pill.classes()).toContain('is-home')
  })

  it('shows retry chip on fetch failure', async () => {
    const bom = useBomStore()
    _settingsState.crossServer = true
    bom.targets = [{ itemId: 100, recipeId: 9001, name: 't', icon: '', quantity: 1 }]
    bom.materialTree = [{
      itemId: 100, name: 't', icon: '', amount: 1, recipeId: 9001, collapsed: true,
      children: [{ itemId: 50, name: 'c', icon: '', amount: 1 }],
    }]
    bom.crossWorldFetchStatus.set(100, 'failed')
    bom.setTargetDefaultMode('market')

    const w = mount(BomDecisionRow, { props: makeProps({ itemId: 100, isCraftable: true, isTarget: true }) })
    await w.vm.$nextTick()

    const retry = w.find('[data-testid="cross-world-retry"]')
    expect(retry.exists()).toBe(true)
  })
})

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

// Stub useSettingsStore
vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({ priceDisplayMode: 'min' }),
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
  immutable: boolean
}> = {}) {
  return {
    itemId: overrides.itemId ?? 100,
    name: overrides.name ?? 'Iron Ore',
    icon: overrides.icon ?? '',
    amount: overrides.amount ?? 5,
    isCraftable: overrides.isCraftable ?? false,
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

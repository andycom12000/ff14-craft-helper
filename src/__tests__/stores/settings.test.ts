import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '@/stores/settings'

describe('useSettingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults server/dataCenter/region to empty strings (for onboarding gate)', () => {
    const store = useSettingsStore()

    expect(store.server).toBe('')
    expect(store.dataCenter).toBe('')
    expect(store.region).toBe('')
  })

  it('defaults priceDisplayMode to minOf', () => {
    const store = useSettingsStore()

    expect(store.priceDisplayMode).toBe('minOf')
  })

  it('has default batch settings', () => {
    const store = useSettingsStore()
    expect(store.crossServer).toBe(false)
    expect(store.recursivePricing).toBe(true)
    expect(store.maxRecursionDepth).toBe(2)
    expect(store.exceptionStrategy).toBe('skip')
  })

  it('allows updating all settings', () => {
    const store = useSettingsStore()

    store.server = '伊弗利特'
    store.dataCenter = '陸行鳥'
    store.region = '繁中服'
    store.priceDisplayMode = 'hq'

    expect(store.server).toBe('伊弗利特')
    expect(store.priceDisplayMode).toBe('hq')
  })
})

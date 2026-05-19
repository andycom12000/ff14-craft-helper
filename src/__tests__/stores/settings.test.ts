import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/analytics', () => ({ trackEvent: vi.fn() }))
vi.mock('@/utils/user-properties', () => ({ syncFromStores: vi.fn() }))
import { trackEvent } from '@/utils/analytics'
import { useSettingsStore } from '@/stores/settings'

describe('useSettingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(trackEvent).mockClear()
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
    expect(store.crossServer).toBe(true)
    expect(store.recursivePricing).toBe(true)
    expect(store.maxRecursionDepth).toBe(2)
    expect(store.exceptionStrategy).toBe('buy')
  })

  it('setter mutates the underlying ref', () => {
    const store = useSettingsStore()
    store.setServer('伊弗利特')
    store.setPriceDisplayMode('hq')
    expect(store.server).toBe('伊弗利特')
    expect(store.priceDisplayMode).toBe('hq')
  })

  it('setter emits settings_change', () => {
    const store = useSettingsStore()
    store.setRegion('繁中服')
    expect(trackEvent).toHaveBeenCalledWith('settings_change', {
      key: 'region',
      prev: '',
      value: '繁中服',
    })
  })

  it('setter is a no-op when value is unchanged', () => {
    const store = useSettingsStore()
    store.setServer('')
    expect(trackEvent).not.toHaveBeenCalled()
  })
})

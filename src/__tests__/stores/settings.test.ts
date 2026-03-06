import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '@/stores/settings'

describe('useSettingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('has correct TW server defaults', () => {
    const store = useSettingsStore()

    expect(store.server).toBe('巴哈姆特')
    expect(store.dataCenter).toBe('陸行鳥')
    expect(store.region).toBe('繁中服')
  })

  it('defaults priceDisplayMode to nq', () => {
    const store = useSettingsStore()

    expect(store.priceDisplayMode).toBe('nq')
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

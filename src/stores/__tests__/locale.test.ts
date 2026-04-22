import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/local-data-source', () => ({
  getLocale: vi.fn(),
  setLocale: vi.fn().mockResolvedValue(undefined),
  onLocaleChange: vi.fn(() => () => {}),
}))

import * as localDataSource from '@/services/local-data-source'

const STORAGE_KEY = 'ffxiv-craft-helper:locale'

async function importFreshStore() {
  vi.resetModules()
  const mod = await import('@/stores/locale')
  return mod.useLocaleStore
}

describe('useLocaleStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('defaults to zh-TW when localStorage is empty', async () => {
    const useLocaleStore = await importFreshStore()
    setActivePinia(createPinia())
    const store = useLocaleStore()
    expect(store.current).toBe('zh-TW')
  })

  it('reads the initial value from localStorage', async () => {
    localStorage.setItem(STORAGE_KEY, 'zh-CN')
    const useLocaleStore = await importFreshStore()
    setActivePinia(createPinia())
    const store = useLocaleStore()
    expect(store.current).toBe('zh-CN')
  })

  it('falls back to zh-TW when localStorage contains an invalid value', async () => {
    localStorage.setItem(STORAGE_KEY, 'xx-YY')
    const useLocaleStore = await importFreshStore()
    setActivePinia(createPinia())
    const store = useLocaleStore()
    expect(store.current).toBe('zh-TW')
  })

  it('setLocale updates current, writes localStorage, and calls localDataSource.setLocale', async () => {
    const useLocaleStore = await importFreshStore()
    setActivePinia(createPinia())
    const store = useLocaleStore()

    await store.setLocale('ja')

    expect(store.current).toBe('ja')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('ja')
    expect(localDataSource.setLocale).toHaveBeenCalledWith('ja')
  })

  it('ignores invalid locale values passed to setLocale', async () => {
    const useLocaleStore = await importFreshStore()
    setActivePinia(createPinia())
    const store = useLocaleStore()

    const before = store.current
    await store.setLocale('fr' as unknown as 'ja')

    expect(store.current).toBe(before)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(localDataSource.setLocale).not.toHaveBeenCalled()
  })
})

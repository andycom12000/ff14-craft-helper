import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick, effectScope } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useItemName } from '@/composables/useItemName'
import { useLocaleStore } from '@/stores/locale'
import { getItemSync } from '@/services/local-data-source'
import type { ItemRecord, Locale } from '@/services/local-data-source.types'

vi.mock('@/services/local-data-source', () => ({
  getItemSync: vi.fn(),
}))

const getItemSyncMock = getItemSync as unknown as ReturnType<typeof vi.fn>

function makeItem(name: string, overrides: Partial<ItemRecord> = {}): ItemRecord {
  return {
    name,
    level: 1,
    canBeHq: false,
    iconId: 0,
    ...overrides,
  }
}

describe('useItemName', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getItemSyncMock.mockReset()
  })

  it('returns #{id} placeholder when getItemSync returns undefined (unloaded)', () => {
    getItemSyncMock.mockReturnValue(undefined)
    const scope = effectScope()
    scope.run(() => {
      const name = useItemName(42)
      expect(name.value).toBe('#42')
    })
    scope.stop()
  })

  it('returns the item name when loaded', () => {
    getItemSyncMock.mockReturnValue(makeItem('Iron Ingot'))
    const scope = effectScope()
    scope.run(() => {
      const name = useItemName(5057)
      expect(name.value).toBe('Iron Ingot')
    })
    scope.stop()
  })

  it('re-computes when the locale store changes', async () => {
    getItemSyncMock.mockImplementation((_id: number, locale?: Locale) => {
      if (locale === 'en') return makeItem('Iron Ingot')
      if (locale === 'ja') return makeItem('アイアンインゴット')
      return makeItem('鐵錠')
    })

    const scope = effectScope()
    let nameRef: ReturnType<typeof useItemName> | undefined
    scope.run(() => {
      nameRef = useItemName(5057)
    })

    const store = useLocaleStore()
    store.current = 'en'
    await nextTick()
    expect(nameRef!.value).toBe('Iron Ingot')

    store.current = 'ja'
    await nextTick()
    expect(nameRef!.value).toBe('アイアンインゴット')

    store.current = 'zh-TW'
    await nextTick()
    expect(nameRef!.value).toBe('鐵錠')

    scope.stop()
  })

  it('passes the current locale through to getItemSync', () => {
    getItemSyncMock.mockReturnValue(makeItem('X'))
    const store = useLocaleStore()
    store.current = 'ja'

    const scope = effectScope()
    scope.run(() => {
      const name = useItemName(123)
      // force evaluation
      expect(name.value).toBe('X')
    })
    scope.stop()

    expect(getItemSyncMock).toHaveBeenCalledWith(123, 'ja')
  })

  it('accepts a plain number for itemId', () => {
    getItemSyncMock.mockReturnValue(undefined)
    const scope = effectScope()
    scope.run(() => {
      const name = useItemName(7)
      expect(name.value).toBe('#7')
    })
    scope.stop()
  })

  it('accepts a ref(number) for itemId and reacts to its changes', async () => {
    getItemSyncMock.mockImplementation((id: number) => makeItem(`item-${id}`))
    const id = ref(1)
    const scope = effectScope()
    let nameRef: ReturnType<typeof useItemName> | undefined
    scope.run(() => {
      nameRef = useItemName(id)
    })
    expect(nameRef!.value).toBe('item-1')

    id.value = 2
    await nextTick()
    expect(nameRef!.value).toBe('item-2')

    scope.stop()
  })

  it('accepts a getter function for itemId and reacts to its changes', async () => {
    getItemSyncMock.mockImplementation((id: number) => makeItem(`getter-${id}`))
    const id = ref(10)
    const scope = effectScope()
    let nameRef: ReturnType<typeof useItemName> | undefined
    scope.run(() => {
      nameRef = useItemName(() => id.value)
    })
    expect(nameRef!.value).toBe('getter-10')

    id.value = 20
    await nextTick()
    expect(nameRef!.value).toBe('getter-20')

    scope.stop()
  })

  it('falls back to #{id} when an id has no record even after locale change', async () => {
    getItemSyncMock.mockReturnValue(undefined)
    const scope = effectScope()
    let nameRef: ReturnType<typeof useItemName> | undefined
    scope.run(() => {
      nameRef = useItemName(999)
    })
    expect(nameRef!.value).toBe('#999')

    const store = useLocaleStore()
    store.current = 'en'
    await nextTick()
    expect(nameRef!.value).toBe('#999')

    scope.stop()
  })
})

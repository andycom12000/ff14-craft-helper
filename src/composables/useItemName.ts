import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { getItemSync, itemsCacheVersion } from '@/services/local-data-source'

export function useItemName(itemId: MaybeRefOrGetter<number>): ComputedRef<string> {
  const localeStore = useLocaleStore()
  return computed(() => {
    const locale = localeStore.current
    void itemsCacheVersion.value
    const id = toValue(itemId)
    const item = getItemSync(id, locale)
    return item?.name ?? `#${id}`
  })
}

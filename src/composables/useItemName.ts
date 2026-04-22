import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { getItemSync, itemsCacheVersion } from '@/services/local-data-source'

/**
 * Reactive item name lookup. Returns a computed ref that tracks both the
 * provided `itemId` (if reactive) and the current locale, yielding the item's
 * localized name when available. Falls back to `#{id}` when the item record
 * has not been loaded yet (e.g. items file for the current locale is still
 * fetching), so callers can render a stable placeholder.
 */
export function useItemName(itemId: MaybeRefOrGetter<number>): ComputedRef<string> {
  const localeStore = useLocaleStore()
  return computed(() => {
    // Track both locale AND items cache version — getItemSync reads from a
    // plain Map that isn't reactive on its own, so we need an explicit signal
    // to re-run when a locale's items file finishes loading.
    const locale = localeStore.current
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    itemsCacheVersion.value
    const id = toValue(itemId)
    const item = getItemSync(id, locale)
    return item?.name ?? `#${id}`
  })
}

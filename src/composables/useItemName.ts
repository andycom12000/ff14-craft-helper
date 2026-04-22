import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { getItemSync } from '@/services/local-data-source'

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
    // Read locale first so the computed tracks it as a dependency and
    // recomputes whenever the active locale changes.
    const locale = localeStore.current
    const id = toValue(itemId)
    const item = getItemSync(id, locale)
    return item?.name ?? `#${id}`
  })
}

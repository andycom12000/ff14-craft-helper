import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { getZoneMetaSync, type Locale } from '@/services/zone-meta'

export function useZoneName(zoneId: MaybeRefOrGetter<number>): ComputedRef<string> {
  const localeStore = useLocaleStore()
  return computed(() => {
    const locale = localeStore.current as Locale
    const id = toValue(zoneId)
    const meta = getZoneMetaSync(id)
    return meta?.zoneNameByLocale.get(locale)
        ?? meta?.zoneNameByLocale.get('en')
        ?? `#zone:${id}`
  })
}

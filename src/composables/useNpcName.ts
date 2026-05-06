import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import { getNpcNameSync, type Locale } from '@/services/zone-meta'

export function useNpcName(npcId: MaybeRefOrGetter<number>): ComputedRef<string> {
  const localeStore = useLocaleStore()
  return computed(() => {
    const locale = localeStore.current as Locale
    const id = toValue(npcId)
    return getNpcNameSync(id, locale)
        ?? getNpcNameSync(id, 'en')
        ?? `#npc:${id}`
  })
}

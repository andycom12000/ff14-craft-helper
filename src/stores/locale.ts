import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Locale } from '@/services/local-data-source.types'
import { DEFAULT_LOCALE } from '@/services/local-data-source.types'

export const useLocaleStore = defineStore('locale', () => {
  const current = ref<Locale>(DEFAULT_LOCALE)

  async function setLocale(_locale: Locale): Promise<void> {
    throw new Error('locale store stub: not implemented')
  }

  return { current, setLocale }
})

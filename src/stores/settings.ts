import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type { Locale } from '@/services/local-data-source.types'

export type PriceDisplayMode = 'nq' | 'hq' | 'minOf'

export const useSettingsStore = defineStore('settings', () => {
  const server = ref('巴哈姆特')
  const dataCenter = ref('陸行鳥')
  const region = ref('繁中服')
  const priceDisplayMode = ref<PriceDisplayMode>('minOf')
  const crossServer = ref(false)
  const recursivePricing = ref(true)
  const maxRecursionDepth = ref(2)
  const exceptionStrategy = ref<'skip' | 'buy'>('skip')
  const batchLayout = ref<'stepper' | 'classic'>('stepper')

  // Language is the single source of truth of the locale store. We expose
  // a computed proxy here so that `settingsStore.language` reads/writes stay
  // in sync with `localeStore.current` — no duplicate state to keep aligned.
  const localeStore = useLocaleStore()
  const language = computed<Locale>({
    get: () => localeStore.current,
    set: (value: Locale) => {
      void localeStore.setLocale(value)
    },
  })

  return {
    server,
    dataCenter,
    region,
    language,
    priceDisplayMode,
    crossServer,
    recursivePricing,
    maxRecursionDepth,
    exceptionStrategy,
    batchLayout,
  }
}, {
  // `language` is a computed proxy; let the locale store persist it instead.
  persist: {
    pick: [
      'server',
      'dataCenter',
      'region',
      'priceDisplayMode',
      'crossServer',
      'recursivePricing',
      'maxRecursionDepth',
      'exceptionStrategy',
      'batchLayout',
    ],
  },
})

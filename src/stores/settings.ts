import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useLocaleStore } from '@/stores/locale'
import type { Locale } from '@/services/local-data-source.types'
import { emitSettingsChange } from '@/utils/settings-change'
import { trackEvent } from '@/utils/analytics'

export type PriceDisplayMode = 'nq' | 'hq' | 'minOf'

export const useSettingsStore = defineStore('settings', () => {
  // Server defaults are intentionally empty so the onboarding panel
  // (DashboardView guard: !region && !dataCenter && !server) can trigger
  // on first use. Returning users have these restored from persisted state.
  const server = ref('')
  const dataCenter = ref('')
  const region = ref('')
  const priceDisplayMode = ref<PriceDisplayMode>('minOf')
  const crossServer = ref(true)
  const recursivePricing = ref(true)
  const maxRecursionDepth = ref(2)
  const exceptionStrategy = ref<'skip' | 'buy'>('buy')
  /**
   * Default acquisition mode for raw materials. `buy` keeps the historical
   * "always default to market" logic; `gather` flips raw rows that have a
   * known gather node to default to 自採 (cost = 0). Crystals always stay
   * market regardless of this setting.
   */
  const rawMaterialDefault = ref<'buy' | 'gather'>('buy')

  // Language is the single source of truth of the locale store. We expose
  // a computed proxy here so that `settingsStore.language` reads/writes stay
  // in sync with `localeStore.current` — no duplicate state to keep aligned.
  const localeStore = useLocaleStore()
  const language = computed<Locale>({
    get: () => localeStore.current,
    set: (value: Locale) => { void localeStore.setLocale(value) },
  })

  function setServer(v: string) {
    const prev = server.value; if (prev === v) return
    server.value = v; emitSettingsChange('server', prev, v)
  }
  function setDataCenter(v: string) {
    const prev = dataCenter.value; if (prev === v) return
    dataCenter.value = v; emitSettingsChange('data_center', prev, v)
  }
  function setRegion(v: string) {
    const prev = region.value; if (prev === v) return
    region.value = v
    emitSettingsChange('region', prev, v)
    if (prev === '' && v !== '') {
      import('@/utils/user-properties').then(({ inferMarketRegion }) => {
        trackEvent('region_resolution', {
          from_default: false,
          market_region: inferMarketRegion(v),
        })
      })
    }
    import('@/utils/user-properties').then(({ syncFromStores }) => syncFromStores())
  }
  function setPriceDisplayMode(v: PriceDisplayMode) {
    const prev = priceDisplayMode.value; if (prev === v) return
    priceDisplayMode.value = v; emitSettingsChange('price_display_mode', prev, v)
  }
  function setCrossServer(v: boolean) {
    const prev = crossServer.value; if (prev === v) return
    crossServer.value = v; emitSettingsChange('cross_server', prev, v)
  }
  function setRecursivePricing(v: boolean) {
    const prev = recursivePricing.value; if (prev === v) return
    recursivePricing.value = v; emitSettingsChange('recursive_pricing', prev, v)
  }
  function setMaxRecursionDepth(v: number) {
    const prev = maxRecursionDepth.value; if (prev === v) return
    maxRecursionDepth.value = v; emitSettingsChange('max_recursion_depth', prev, v)
  }
  function setExceptionStrategy(v: 'skip' | 'buy') {
    const prev = exceptionStrategy.value; if (prev === v) return
    exceptionStrategy.value = v; emitSettingsChange('exception_strategy', prev, v)
  }
  function setRawMaterialDefault(v: 'buy' | 'gather') {
    const prev = rawMaterialDefault.value; if (prev === v) return
    rawMaterialDefault.value = v; emitSettingsChange('raw_material_default', prev, v)
  }

  return {
    server, dataCenter, region, language, priceDisplayMode, crossServer,
    recursivePricing, maxRecursionDepth, exceptionStrategy, rawMaterialDefault,
    setServer, setDataCenter, setRegion, setPriceDisplayMode, setCrossServer,
    setRecursivePricing, setMaxRecursionDepth, setExceptionStrategy, setRawMaterialDefault,
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
      'rawMaterialDefault',
    ],
  },
})

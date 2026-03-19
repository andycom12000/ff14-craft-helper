import { defineStore } from 'pinia'
import { ref } from 'vue'

export type PriceDisplayMode = 'nq' | 'hq' | 'minOf'

export const useSettingsStore = defineStore('settings', () => {
  const server = ref('巴哈姆特')
  const dataCenter = ref('陸行鳥')
  const region = ref('繁中服')
  const language = ref('zh')
  const priceDisplayMode = ref<PriceDisplayMode>('nq')
  const crossServer = ref(false)
  const recursivePricing = ref(true)
  const maxRecursionDepth = ref(3)
  const exceptionStrategy = ref<'skip' | 'buy'>('skip')
  const batchLayout = ref<'stepper' | 'classic'>('stepper')

  return { server, dataCenter, region, language, priceDisplayMode, crossServer, recursivePricing, maxRecursionDepth, exceptionStrategy, batchLayout }
}, {
  persist: true,
})

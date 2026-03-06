import { defineStore } from 'pinia'
import { ref } from 'vue'

export type PriceDisplayMode = 'nq' | 'hq' | 'minOf'

export const useSettingsStore = defineStore('settings', () => {
  const server = ref('巴哈姆特')
  const dataCenter = ref('陸行鳥')
  const region = ref('繁中服')
  const language = ref('zh')
  const priceDisplayMode = ref<PriceDisplayMode>('nq')

  return { server, dataCenter, region, language, priceDisplayMode }
}, {
  persist: true,
})

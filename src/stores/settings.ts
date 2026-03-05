import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const server = ref('Tonberry')
  const dataCenter = ref('Elemental')
  const language = ref('zh')

  return { server, dataCenter, language }
}, {
  persist: true,
})

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Gearset {
  id: string
  name: string
  job: string
  level: number
  craftsmanship: number
  control: number
  cp: number
  createdAt: number
}

export const useGearsetsStore = defineStore('gearsets', () => {
  const gearsets = ref<Gearset[]>([])
  const activeGearsetId = ref<string | null>(null)

  const activeGearset = computed(() =>
    gearsets.value.find(g => g.id === activeGearsetId.value) ?? null
  )

  function addGearset(gearset: Omit<Gearset, 'id' | 'createdAt'>) {
    const newGearset: Gearset = {
      ...gearset,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }
    gearsets.value.push(newGearset)
    if (!activeGearsetId.value) {
      activeGearsetId.value = newGearset.id
    }
    return newGearset
  }

  function updateGearset(id: string, updates: Partial<Omit<Gearset, 'id' | 'createdAt'>>) {
    const index = gearsets.value.findIndex(g => g.id === id)
    if (index !== -1) {
      gearsets.value[index] = { ...gearsets.value[index], ...updates }
    }
  }

  function removeGearset(id: string) {
    gearsets.value = gearsets.value.filter(g => g.id !== id)
    if (activeGearsetId.value === id) {
      activeGearsetId.value = gearsets.value[0]?.id ?? null
    }
  }

  function setActive(id: string) {
    activeGearsetId.value = id
  }

  return { gearsets, activeGearsetId, activeGearset, addGearset, updateGearset, removeGearset, setActive }
}, {
  persist: true,
})

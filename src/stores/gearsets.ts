import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { JOB_NAMES } from '@/utils/jobs'

export interface GearsetStats {
  level: number
  craftsmanship: number
  control: number
  cp: number
}

export type GearsetMap = Record<string, GearsetStats>

const DEFAULT_GEARSET_STATS: GearsetStats = { level: 100, craftsmanship: 0, control: 0, cp: 0 }

function createDefaultGearsets(): GearsetMap {
  const map: GearsetMap = {}
  for (const job of Object.keys(JOB_NAMES)) {
    map[job] = { ...DEFAULT_GEARSET_STATS }
  }
  return map
}

export const useGearsetsStore = defineStore('gearsets', () => {
  const gearsets = ref<GearsetMap>(createDefaultGearsets())
  const activeJob = ref<string>(Object.keys(JOB_NAMES)[0])

  const activeGearset = computed(() => {
    const stats = gearsets.value[activeJob.value]
    if (!stats) return null
    return { job: activeJob.value, ...stats }
  })

  function updateGearset(job: string, updates: Partial<GearsetStats>) {
    if (gearsets.value[job]) {
      gearsets.value[job] = { ...gearsets.value[job], ...updates }
    }
  }

  function setActive(job: string) {
    if (gearsets.value[job]) {
      activeJob.value = job
    }
  }

  // Ensure all jobs exist (handles migration from old data)
  function ensureAllJobs() {
    for (const job of Object.keys(JOB_NAMES)) {
      if (!gearsets.value[job]) {
        gearsets.value[job] = { ...DEFAULT_GEARSET_STATS }
      }
    }
  }

  ensureAllJobs()

  return { gearsets, activeJob, activeGearset, updateGearset, setActive }
}, {
  persist: true,
})

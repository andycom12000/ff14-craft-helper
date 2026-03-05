import { defineStore } from 'pinia'
import { ref } from 'vue'
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

  function getGearsetForJob(job: string): GearsetStats | null {
    return gearsets.value[job] ?? null
  }

  function updateGearset(job: string, updates: Partial<GearsetStats>) {
    if (gearsets.value[job]) {
      gearsets.value[job] = { ...gearsets.value[job], ...updates }
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

  return { gearsets, getGearsetForJob, updateGearset }
}, {
  persist: true,
})

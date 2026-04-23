import { defineStore } from 'pinia'
import { ref } from 'vue'
import { JOB_NAMES, JOB_ABBR } from '@/utils/jobs'

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

  function getGearsetForJob(job: string): (GearsetStats & { job: string }) | null {
    if (gearsets.value[job]) return { job, ...gearsets.value[job] }
    const abbr = JOB_ABBR[job]
    if (abbr && gearsets.value[abbr]) return { job: abbr, ...gearsets.value[abbr] }
    return null
  }

  function updateGearset(job: string, updates: Partial<GearsetStats>) {
    if (gearsets.value[job]) {
      gearsets.value[job] = { ...gearsets.value[job], ...updates }
    }
  }

  function updateAllGearsets(patch: Partial<GearsetStats>) {
    const defined: Partial<GearsetStats> = {}
    for (const [key, value] of Object.entries(patch) as [keyof GearsetStats, GearsetStats[keyof GearsetStats] | undefined][]) {
      if (value !== undefined) {
        ;(defined as Record<string, unknown>)[key] = value
      }
    }
    if (Object.keys(defined).length === 0) return
    for (const job of Object.keys(gearsets.value)) {
      gearsets.value[job] = { ...gearsets.value[job], ...defined }
    }
  }

  // Migrate from old array format and ensure all jobs exist
  function ensureAllJobs() {
    if (Array.isArray(gearsets.value)) {
      const oldArray = gearsets.value as unknown as Array<{ job?: string; level?: number; craftsmanship?: number; control?: number; cp?: number }>
      const migrated = createDefaultGearsets()
      for (const entry of oldArray) {
        if (entry.job && migrated[entry.job]) {
          migrated[entry.job] = {
            ...DEFAULT_GEARSET_STATS,
            level: entry.level ?? DEFAULT_GEARSET_STATS.level,
            craftsmanship: entry.craftsmanship ?? DEFAULT_GEARSET_STATS.craftsmanship,
            control: entry.control ?? DEFAULT_GEARSET_STATS.control,
            cp: entry.cp ?? DEFAULT_GEARSET_STATS.cp,
          }
        }
      }
      gearsets.value = migrated
      return
    }
    for (const job of Object.keys(JOB_NAMES)) {
      if (!gearsets.value[job]) {
        gearsets.value[job] = { ...DEFAULT_GEARSET_STATS }
      }
    }
  }

  return { gearsets, getGearsetForJob, updateGearset, updateAllGearsets, ensureAllJobs }
}, {
  persist: {
    afterHydrate(ctx) {
      ctx.store.ensureAllJobs()
    },
  },
})

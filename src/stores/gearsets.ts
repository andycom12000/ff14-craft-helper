import { defineStore } from 'pinia'
import { ref } from 'vue'
import { JOB_NAMES, JOB_ABBR } from '@/utils/jobs'
import { trackEvent } from '@/utils/analytics'
import { syncFromStores } from '@/utils/user-properties'

export interface GearsetStats {
  level: number
  craftsmanship: number
  control: number
  cp: number
  isSpecialist: boolean
}

export type GearsetMap = Record<string, GearsetStats>

export const DEFAULT_GEARSET_STATS: GearsetStats = {
  level: 100,
  craftsmanship: 0,
  control: 0,
  cp: 0,
  isSpecialist: false,
}

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
      syncFromStores()
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
    trackEvent('gearset_apply_all', {
      fields: Object.keys(defined).join(','),
    })
    syncFromStores()
  }

  /**
   * Add a per-stat delta on top of EVERY job's existing raw gear (shared-gear
   * intent, spec Slice C 全部職業). Unlike `updateAllGearsets` — which writes the
   * SAME absolute value to every job — this preserves each job's distinct raw
   * stats and folds the meld delta on top of each.
   */
  function applyDeltaToAllGearsets(delta: { craftsmanship: number; control: number; cp: number }) {
    for (const job of Object.keys(gearsets.value)) {
      const g = gearsets.value[job]
      gearsets.value[job] = {
        ...g,
        craftsmanship: g.craftsmanship + delta.craftsmanship,
        control: g.control + delta.control,
        cp: g.cp + delta.cp,
      }
    }
    trackEvent('gearset_apply_all', { fields: 'meld_delta' })
    syncFromStores()
  }

  // Migrate from old array format and ensure all jobs exist
  function ensureAllJobs() {
    if (Array.isArray(gearsets.value)) {
      const oldArray = gearsets.value as unknown as Array<{ job?: string; level?: number; craftsmanship?: number; control?: number; cp?: number; isSpecialist?: boolean }>
      const migrated = createDefaultGearsets()
      for (const entry of oldArray) {
        if (entry.job && migrated[entry.job]) {
          migrated[entry.job] = {
            ...DEFAULT_GEARSET_STATS,
            level: entry.level ?? DEFAULT_GEARSET_STATS.level,
            craftsmanship: entry.craftsmanship ?? DEFAULT_GEARSET_STATS.craftsmanship,
            control: entry.control ?? DEFAULT_GEARSET_STATS.control,
            cp: entry.cp ?? DEFAULT_GEARSET_STATS.cp,
            isSpecialist: entry.isSpecialist ?? DEFAULT_GEARSET_STATS.isSpecialist,
          }
        }
      }
      gearsets.value = migrated
      return
    }
    for (const job of Object.keys(JOB_NAMES)) {
      if (!gearsets.value[job]) {
        gearsets.value[job] = { ...DEFAULT_GEARSET_STATS }
      } else if (typeof gearsets.value[job].isSpecialist !== 'boolean') {
        // Hydrated from a prior persisted shape that pre-dated isSpecialist —
        // backfill the missing field without disturbing existing stats.
        gearsets.value[job] = { ...gearsets.value[job], isSpecialist: false }
      }
    }
  }

  return { gearsets, getGearsetForJob, updateGearset, updateAllGearsets, applyDeltaToAllGearsets, ensureAllJobs }
}, {
  persist: {
    afterHydrate(ctx) {
      ctx.store.ensureAllJobs()
    },
  },
})

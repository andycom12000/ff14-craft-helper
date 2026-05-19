// src/composables/useGaSnapshot.ts
import { ref, computed } from 'vue'
import type { GaSnapshot } from '@/types/ga-snapshot'

const SNAPSHOT_URL_PROD = 'https://raw.githubusercontent.com/andycom12000/ff14-craft-helper/gh-data/snapshot.json'
const SNAPSHOT_URL_DEV  = `${import.meta.env.BASE_URL}data/ga-snapshot.json`

const snapshot = ref<GaSnapshot | null>(null)
const loading = ref(true)
const error = ref<Error | null>(null)

export function useGaSnapshot() {
  const staleHours = computed(() => {
    if (!snapshot.value) return 0
    const generated = new Date(snapshot.value.generatedAt).getTime()
    return Math.floor((Date.now() - generated) / 3600_000)
  })

  const isStale = computed(() => staleHours.value >= 36)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const url = import.meta.env.DEV ? SNAPSHOT_URL_DEV : SNAPSHOT_URL_PROD
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`snapshot fetch ${res.status}`)
      const json = (await res.json()) as GaSnapshot
      snapshot.value = json
    } catch (err) {
      error.value = err as Error
      snapshot.value = null
    } finally {
      loading.value = false
    }
  }

  return { snapshot, loading, error, staleHours, isStale, load }
}

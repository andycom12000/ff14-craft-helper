import { shallowRef } from 'vue'
import { adviseMeld, type MeldAdvice } from '@/services/meld-advisor'
import { fetchMateriaPriceMap } from '@/api/universalis'
import { BIS_REFERENCE } from '@/engine/materia'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

export function useMeldAdvisor(world: () => string) {
  const advice = shallowRef<MeldAdvice | 'loading' | 'stale' | null>(null)
  let cancelToken = { cancelled: false }

  async function runAdvisor(
    recipe: Recipe,
    gearset: GearsetStats,
    initialQuality: number,
  ) {
    cancelToken.cancelled = true
    const token = { cancelled: false }
    cancelToken = token
    advice.value = 'loading'
    try {
      const priceMap = await fetchMateriaPriceMap(world())
      if (token.cancelled) return
      const out = await adviseMeld(
        [recipe],
        gearset,
        priceMap,
        {
          bisReference: BIS_REFERENCE,
          initialQuality,
          isCancelled: () => token.cancelled,
        },
      )
      if (token.cancelled) return
      advice.value = out
    } catch {
      if (!token.cancelled) advice.value = null
    }
  }

  function markStale() {
    if (advice.value && typeof advice.value === 'object') advice.value = 'stale'
  }

  return { advice, runAdvisor, markStale }
}

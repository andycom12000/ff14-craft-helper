import { shallowRef } from 'vue'
import { adviseMeld, type MeldAdvice } from '@/services/meld-advisor'
import { fetchMateriaPriceMap } from '@/api/universalis'
import { BIS_REFERENCE } from '@/engine/materia'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

/** The pricing API throws this when no market server/DC is selected. */
function isNoMarketError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('尚未選擇市場伺服器')
}

export function useMeldAdvisor(world: () => string) {
  const advice = shallowRef<MeldAdvice | 'loading' | 'stale' | 'no-market' | null>(null)
  let cancelToken = { cancelled: false }

  async function runAdvisor(
    recipe: Recipe,
    gearset: GearsetStats,
    initialQuality: number,
  ) {
    cancelToken.cancelled = true
    const token = { cancelled: false }
    cancelToken = token
    // Costing a plan needs a market server. Without one, surface that
    // explicitly instead of falling back to the blank "not solved yet" state —
    // which wrongly reads as "you haven't pressed solve" when the solve did run.
    if (!world()) {
      advice.value = 'no-market'
      return
    }
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
    } catch (err) {
      console.warn('[meld-advisor] advisor run failed:', err)
      if (!token.cancelled) advice.value = isNoMarketError(err) ? 'no-market' : null
    }
  }

  function markStale() {
    if (advice.value && typeof advice.value === 'object') advice.value = 'stale'
  }

  return { advice, runAdvisor, markStale }
}

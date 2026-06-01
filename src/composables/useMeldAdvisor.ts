import { shallowRef } from 'vue'
import { adviseMeld, type MeldAdvice } from '@/services/meld-advisor'
import { fetchMateriaPriceMap } from '@/api/universalis'
import type { MarketData } from '@/api/universalis'
import { BIS_REFERENCE } from '@/engine/materia'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

/**
 * The pricing API throws this when no market server/DC is selected. Since #135
 * the no-server path no longer fetches (it runs with an empty price map), so this
 * is now a DEFENSIVE fallback: it only fires if a *truthy-but-invalid* world()
 * still drives fetchMateriaPriceMap to reject, in which case surfacing 'no-market'
 * beats dead-ending at the blank「尚未求解」hint.
 */
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
    advice.value = 'loading'
    try {
      // Costing a plan by gil needs a market server. Without one, run the engine
      // with an EMPTY price map instead of hard-blocking — adviseMeld then
      // degrades to the count-ranked fallback (ADR-0002) and the card shows the
      // 「無市場資料，依鑲嵌數量估算」hint, rather than dead-ending at no-market (#135).
      const priceMap = world()
        ? await fetchMateriaPriceMap(world())
        : new Map<number, MarketData>()
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

import { shallowRef, onScopeDispose, getCurrentScope } from 'vue'
import { adviseMeld, type MeldAdvice, type MeldAdviceProgress } from '@/services/meld-advisor'
import { fetchMateriaPriceMap } from '@/api/universalis'
import type { MarketData } from '@/api/universalis'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { FoodBuff } from '@/engine/food-medicine'

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
  // #162: live progress ticks from the in-flight adviseMeld call. Null whenever
  // no run is in flight (before start, after settle, after cancel) — purely
  // observational, mirrors `advice` for lifecycle but never itself gates any
  // decision.
  const progress = shallowRef<MeldAdviceProgress | null>(null)
  let cancelToken = { cancelled: false }
  // #132: an AbortController per run. The cooperative `cancelToken` still guards
  // post-await `advice.value` writes; the controller additionally aborts the
  // in-flight WASM solve so a superseded/cancelled run frees its worker slot
  // instead of running to completion in the background.
  let runController: AbortController | null = null

  async function runAdvisor(
    recipe: Recipe,
    gearset: GearsetStats,
    initialQuality: number,
    buffs?: { food: FoodBuff | null; medicine: FoodBuff | null },
  ) {
    cancelToken.cancelled = true
    runController?.abort()
    const token = { cancelled: false }
    cancelToken = token
    const controller = new AbortController()
    runController = controller
    advice.value = 'loading'
    progress.value = null
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
          initialQuality,
          // #136: solve on the same effectiveStats the screen uses — fold the
          // active food/medicine in (ADR-0001 order), not just raw gear + Soul.
          buffs,
          isCancelled: () => token.cancelled,
          // #132: thread the abort handle so a cancelled run terminates its
          // in-flight WASM solve (frees the worker slot), not just ignores it.
          signal: controller.signal,
          // #162: token-guarded so a superseded run's late-arriving ticks can
          // never clobber a newer run's progress.
          onProgress: (p) => {
            if (!token.cancelled) progress.value = p
          },
        },
      )
      if (token.cancelled) return
      advice.value = out
    } catch (err) {
      console.warn('[meld-advisor] advisor run failed:', err)
      if (!token.cancelled) advice.value = isNoMarketError(err) ? 'no-market' : null
    } finally {
      // Settle: clear the live progress regardless of outcome, but only for
      // THIS run — a superseded run's finally must not null out the newer
      // run's in-flight progress.
      if (!token.cancelled) progress.value = null
    }
  }

  function markStale() {
    if (advice.value && typeof advice.value === 'object') advice.value = 'stale'
  }

  /**
   * #132: user-initiated cancel (cancel button on the loading card). Aborts the
   * in-flight solve, marks the run cancelled so its post-await write is dropped,
   * and returns the card to the idle state.
   */
  function cancel() {
    cancelToken.cancelled = true
    runController?.abort()
    runController = null
    advice.value = null
    progress.value = null
  }

  // Unmount safety: tear down any in-flight solve so a navigated-away view does
  // not leave a WASM solve holding a worker slot. Guarded so calling the
  // composable outside a component scope (unit tests) doesn't warn.
  if (getCurrentScope()) {
    onScopeDispose(() => {
      cancelToken.cancelled = true
      runController?.abort()
    })
  }

  return { advice, progress, runAdvisor, markStale, cancel }
}

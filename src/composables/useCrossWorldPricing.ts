import { shallowRef, triggerRef } from 'vue'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import { getMarketDataByDC, aggregateByWorld } from '@/api/universalis'
import type { WorldPriceSummary } from '@/api/universalis'

// Module-scope singleton state — shared across components and the bom store.
// This lets the bom store's pre-fetch (fetchCrossWorldBestForTargets) seed
// the cache so BomMarketDetail's onMounted call short-circuits on the
// dedupe check instead of re-hitting Universalis.
const data = shallowRef(new Map<number, WorldPriceSummary[]>())
const loading = shallowRef(new Set<number>())

export function useCrossWorldPricing() {
  const settingsStore = useSettingsStore()

  async function loadPricing(
    itemId: number,
    itemName?: string,
    opts?: { silent?: boolean },
  ) {
    if (data.value.has(itemId) || loading.value.has(itemId)) return

    loading.value.add(itemId)
    triggerRef(loading)
    try {
      const md = await getMarketDataByDC(settingsStore.dataCenter, itemId)
      data.value.set(itemId, aggregateByWorld(md.listings))
      triggerRef(data)
    } catch {
      if (!opts?.silent) {
        ElMessage.error(`無法取得 ${itemName ?? itemId} 的跨服價格`)
      }
    } finally {
      loading.value.delete(itemId)
      triggerRef(loading)
    }
  }

  function invalidateCrossWorldCache(itemId?: number) {
    if (itemId === undefined) {
      data.value = new Map()
      triggerRef(data)
      loading.value = new Set()
      triggerRef(loading)
    } else {
      data.value.delete(itemId)
      triggerRef(data)
    }
  }

  return {
    crossWorldData: data,
    crossWorldLoading: loading,
    fetchCrossWorldData: loadPricing,
    invalidateCrossWorldCache,
  }
}

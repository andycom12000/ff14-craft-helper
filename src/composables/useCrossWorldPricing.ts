import { shallowRef, triggerRef } from 'vue'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import { getMarketDataByDC, aggregateByWorld } from '@/api/universalis'
import type { WorldPriceSummary } from '@/api/universalis'

export function useCrossWorldPricing() {
  const settingsStore = useSettingsStore()
  const data = shallowRef(new Map<number, WorldPriceSummary[]>())
  const loading = shallowRef(new Set<number>())

  async function fetch(itemId: number, itemName?: string) {
    if (data.value.has(itemId) || loading.value.has(itemId)) return

    loading.value.add(itemId)
    triggerRef(loading)
    try {
      const md = await getMarketDataByDC(settingsStore.dataCenter, itemId)
      data.value.set(itemId, aggregateByWorld(md.listings))
      triggerRef(data)
    } catch {
      ElMessage.error(`無法取得 ${itemName ?? itemId} 的跨服價格`)
    } finally {
      loading.value.delete(itemId)
      triggerRef(loading)
    }
  }

  return { crossWorldData: data, crossWorldLoading: loading, fetchCrossWorldData: fetch }
}

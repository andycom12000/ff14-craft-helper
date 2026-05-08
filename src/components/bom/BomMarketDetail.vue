<script setup lang="ts">
import { onMounted, computed } from 'vue'
import CrossWorldPriceDetail from '@/components/common/CrossWorldPriceDetail.vue'
import { useCrossWorldPricing } from '@/composables/useCrossWorldPricing'

const props = defineProps<{
  itemId: number
  itemName?: string
}>()

const { crossWorldData, crossWorldLoading, fetchCrossWorldData } = useCrossWorldPricing()

const data = computed(() => crossWorldData.value.get(props.itemId))
const loading = computed(() => crossWorldLoading.value.has(props.itemId))

const universalisUrl = computed(() => `https://universalis.app/market/${props.itemId}`)

onMounted(() => {
  void fetchCrossWorldData(props.itemId, props.itemName)
})
</script>

<template>
  <div class="bmd">
    <CrossWorldPriceDetail
      :data="data"
      :loading="loading"
      :show-listing-count="true"
      compact
    />
    <a
      class="bmd__link"
      :href="universalisUrl"
      target="_blank"
      rel="noopener noreferrer"
    >在 Universalis 開啟完整掛單列表 ↗</a>
  </div>
</template>

<style scoped>
.bmd {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px 14px;
  border-top: 1px dashed var(--app-border);
}

.bmd__link {
  align-self: flex-end;
  font-size: 12px;
  color: var(--app-craft);
  text-decoration: none;
  letter-spacing: 0.02em;
}

.bmd__link:hover {
  text-decoration: underline;
}
</style>

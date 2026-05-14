<script setup lang="ts">
import { computed } from 'vue'
import { useWorkshopProjectsStore } from '@/stores/workshop-projects'

const props = defineProps<{
  projectId: string
  phaseKey: string
  supplyIndex: number
  max: number
}>()

const store = useWorkshopProjectsStore()

const value = computed({
  get: () => store.getDelivered(props.projectId, props.phaseKey, props.supplyIndex),
  set: (v: number) => store.setDelivered(props.projectId, props.phaseKey, props.supplyIndex, v ?? 0),
})
</script>

<template>
  <span class="counter">
    <el-input-number
      v-model="value"
      :min="0"
      :max="max"
      size="small"
      class="counter-input"
    />
    <span class="max">/ {{ max }}</span>
  </span>
</template>

<style scoped>
.counter {
  display: inline-grid;
  grid-template-columns: 1fr 52px;
  align-items: center;
  gap: 8px;
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  width: 100%;
}
.counter :deep(.counter-input) {
  width: 100%;
  min-width: 0;
}
.max {
  color: var(--app-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: left;
  white-space: nowrap;
}
</style>

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
      controls-position="right"
    />
    <span class="max">/ {{ max }}</span>
  </span>
</template>

<style scoped>
.counter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'Fira Code', monospace;
}
.max {
  color: var(--app-text-muted);
  font-size: 12px;
}
</style>

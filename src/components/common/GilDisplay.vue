<script setup lang="ts">
import { computed } from 'vue'
import { formatGil } from '@/utils/format'

const props = defineProps<{
  value: number | null | undefined
  tooltip?: string
}>()

const isUnknown = computed(() => props.value == null)
const display = computed(() => (isUnknown.value ? '—' : formatGil(props.value as number)))
const tooltipText = computed(() => props.tooltip ?? '這個市場沒有這項的擺賣資料')
</script>

<template>
  <el-tooltip v-if="isUnknown" :content="tooltipText" placement="top">
    <span class="gil-display gil-display--unknown">{{ display }}</span>
  </el-tooltip>
  <span v-else class="gil-display">{{ display }}</span>
</template>

<style scoped>
.gil-display--unknown {
  color: var(--el-text-color-placeholder);
  cursor: help;
  border-bottom: 1px dashed var(--el-border-color);
}
</style>

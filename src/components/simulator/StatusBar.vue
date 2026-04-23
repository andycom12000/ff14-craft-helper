<script setup lang="ts">
import { computed } from 'vue'
import type { CraftState } from '@/engine/simulator'
import { percentOf } from '@/utils/format'

const props = defineProps<{
  craftState: CraftState | null
}>()

interface BarSpec {
  label: string
  color: string
  current: number
  max: number
}

const bars = computed<BarSpec[]>(() => {
  const s = props.craftState
  if (!s) return []
  return [
    { label: '進展', color: 'var(--app-accent)', current: s.progress, max: s.maxProgress },
    { label: '品質', color: 'var(--app-success)', current: s.quality, max: s.maxQuality },
    { label: '耐久', color: 'var(--el-color-warning)', current: s.durability, max: s.maxDurability },
    { label: 'CP', color: 'var(--el-color-info)', current: s.cp, max: s.maxCp },
  ]
})

const completionText = computed(() => {
  if (!props.craftState) return ''
  if (!props.craftState.isComplete) return '製作中'
  return props.craftState.isSuccess ? '製作成功' : '製作失敗'
})

const completionType = computed(() => {
  if (!props.craftState || !props.craftState.isComplete) return 'info'
  return props.craftState.isSuccess ? 'success' : 'error'
})
</script>

<template>
  <div class="status-bar">
    <div v-if="!craftState" class="no-state">
      <el-text type="info">尚未開始模擬</el-text>
    </div>
    <template v-else>
      <div class="status-header">
        <el-tag :type="completionType" size="small">{{ completionText }}</el-tag>
        <el-text size="small" type="info">步數: {{ craftState.step }}</el-text>
      </div>

      <div v-for="bar in bars" :key="bar.label" class="bar-row">
        <span class="bar-label">{{ bar.label }}</span>
        <el-progress
          :percentage="percentOf(bar.current, bar.max)"
          :stroke-width="18"
          :color="bar.color"
          :text-inside="true"
          :format="() => `${bar.current} / ${bar.max}`"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.status-bar {
  padding: 12px;
}

.no-state {
  text-align: center;
  padding: 20px 0;
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.bar-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  gap: 12px;
}

.bar-label {
  width: 40px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 500;
  text-align: right;
}

.bar-row .el-progress {
  flex: 1;
}
</style>

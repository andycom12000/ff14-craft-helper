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
  // Muted variants — chroma trimmed so 4 stacked bars don't compete
  return [
    { label: '進展', color: 'oklch(0.62 0.12 65)', current: s.progress, max: s.maxProgress },
    { label: '品質', color: 'oklch(0.55 0.10 145)', current: s.quality, max: s.maxQuality },
    { label: '耐久', color: 'oklch(0.58 0.12 45)', current: s.durability, max: s.maxDurability },
    { label: 'CP', color: 'oklch(0.55 0.05 230)', current: s.cp, max: s.maxCp },
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
        <div class="bar-track">
          <el-progress
            :percentage="percentOf(bar.current, bar.max)"
            :stroke-width="14"
            :color="bar.color"
            :show-text="false"
            :aria-label="`${bar.label} ${bar.current} / ${bar.max}`"
          />
        </div>
        <span class="bar-value">{{ bar.current }} / {{ bar.max }}</span>
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
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  margin-bottom: 8px;
  gap: 10px;
}

.bar-label {
  font-size: 13px;
  font-weight: 500;
  text-align: right;
}

.bar-track {
  min-width: 0;
}

.bar-value {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--app-text-muted);
  white-space: nowrap;
  text-align: right;
  min-width: 60px;
}

/* On narrow phones, stack the numeric readout below the bar so long values
 * (e.g. 8838 / 8500) are never squeezed. */
@media (max-width: 480px) {
  .bar-row {
    grid-template-columns: 40px 1fr;
    row-gap: 2px;
  }

  .bar-value {
    grid-column: 2 / 3;
    text-align: left;
    min-width: 0;
  }
}
</style>

<script setup lang="ts">
import { useBatchStore } from '@/stores/batch'
import { computed } from 'vue'

const batchStore = useBatchStore()

const PHASE_RANGES: Record<string, [number, number]> = {
  solving: [0, 85],
  pricing: [85, 90],
  'evaluating-buffs': [90, 93],
  'evaluating-self-craft': [93, 95],
  aggregating: [95, 99],
  done: [100, 100],
}

const percentage = computed(() => {
  const p = batchStore.progress
  if (p.phase === 'idle' || p.phase === 'done') return p.phase === 'done' ? 100 : 0

  const range = PHASE_RANGES[p.phase]
  if (!range) return 0
  const [start, end] = range

  if (p.phase === 'solving' && p.total > 0) {
    const completedPortion = (p.current - 1) / p.total
    const currentPortion = (p.solverPercent / 100) / p.total
    return Math.round(start + (completedPortion + currentPortion) * (end - start))
  }

  if ((p.phase === 'pricing' || p.phase === 'evaluating-buffs') && p.total > 0) {
    return Math.round(start + (p.current / p.total) * (end - start))
  }

  return start
})

const statusText = computed(() => {
  const p = batchStore.progress
  switch (p.phase) {
    case 'solving':
      return `正在求解：${p.currentName}`
    case 'pricing':
      return p.total > 0 && p.current < p.total
        ? `正在查詢市場價格 (${p.current}/${p.total})...`
        : '正在查詢市場價格...'
    case 'evaluating-buffs':
      return p.total > 0
        ? `正在評估食藥組合 (${p.current}/${p.total})...`
        : '正在評估食藥組合...'
    case 'evaluating-self-craft':
      return '評估自製建議'
    case 'aggregating':
      return p.currentName || '正在整理採購清單...'
    case 'done':
      return '計算完成'
    default:
      return ''
  }
})

const showCounter = computed(() => {
  const phase = batchStore.progress.phase
  return phase === 'solving' || phase === 'evaluating-buffs'
})
</script>

<template>
  <el-card v-if="batchStore.isRunning" shadow="never" class="progress-card">
    <template #header>
      <span class="card-title">計算進度</span>
    </template>
    <div class="progress-body">
      <div class="progress-status">
        <el-text size="small" type="info">
          <strong>{{ statusText }}</strong>
        </el-text>
        <el-text v-if="showCounter" size="small" type="info">
          {{ batchStore.progress.current }} / {{ batchStore.progress.total }}
        </el-text>
      </div>
      <el-progress :percentage="percentage" :stroke-width="8" />
      <div class="progress-actions">
        <el-button size="small" @click="batchStore.cancel()">取消</el-button>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.progress-card {
  margin-bottom: 16px;
}

.progress-status {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.progress-actions {
  text-align: right;
  margin-top: 8px;
}
</style>

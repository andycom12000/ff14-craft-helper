<script setup lang="ts">
import { useBatchStore } from '@/stores/batch'
import type { BatchTargetStatus } from '@/stores/batch.types'
import { computed } from 'vue'

const batchStore = useBatchStore()

const PHASE_RANGES: Record<string, [number, number]> = {
  solving: [0, 85],
  pricing: [85, 90],
  'evaluating-buffs': [90, 93],
  'evaluating-self-craft': [93, 95],
  aggregating: [95, 99],
  'evaluating-meld': [95, 99],
  done: [100, 100],
}

const percentage = computed(() => {
  const p = batchStore.progress
  if (p.phase === 'idle' || p.phase === 'done') return p.phase === 'done' ? 100 : 0

  const range = PHASE_RANGES[p.phase]
  if (!range) return 0
  const [start, end] = range

  if (p.phase === 'solving' && p.total > 0) {
    // solverPercent is now aggregate 0-100 across all parallel solves
    return Math.max(0, Math.round(start + (p.solverPercent / 100) * (end - start)))
  }

  if (
    (p.phase === 'pricing' || p.phase === 'evaluating-buffs' || p.phase === 'evaluating-meld') &&
    p.total > 0
  ) {
    return Math.round(start + (p.completed / p.total) * (end - start))
  }

  return start
})

const statusText = computed(() => {
  const p = batchStore.progress
  switch (p.phase) {
    case 'solving':
      return `正在求解：${p.currentName}`
    case 'pricing':
      return p.total > 0 && p.completed < p.total
        ? `正在查詢市場價格 (${p.completed}/${p.total})...`
        : '正在查詢市場價格...'
    case 'evaluating-buffs':
      return p.total > 0
        ? `正在評估食藥組合 (${p.completed}/${p.total})...`
        : '正在評估食藥組合...'
    case 'evaluating-self-craft':
      return '評估自製建議'
    case 'aggregating':
      return p.currentName || '正在整理採購清單...'
    case 'evaluating-meld':
      // Counter is rendered via the shared showCounter span, so keep this a
      // plain label to avoid showing the count twice.
      return '正在評估鑲嵌建議...'
    case 'done':
      return '計算完成'
    default:
      return ''
  }
})

const showCounter = computed(() => {
  const phase = batchStore.progress.phase
  return phase === 'solving' || phase === 'evaluating-buffs' || phase === 'evaluating-meld'
})

// Honest per-target completion counter: a target only counts once it has
// actually settled (done or failed), independent of the phase-based
// `progress` estimate above which is a coarse aggregate across all targets.
const liveDone = computed(() =>
  batchStore.liveTargets.filter(t => t.state === 'done' || t.state === 'failed').length)

function targetLabel(t: BatchTargetStatus): string {
  switch (t.state) {
    case 'queued':
      return '排隊中'
    case 'solving':
      return `求解中 ${Math.round(t.percent)}%`
    case 'done':
      return t.isDoubleMax ? `完成 · ${t.steps} 步` : `完成 · ${t.steps} 步（未達雙滿）`
    case 'failed':
      return `失敗：${t.reason}`
  }
}
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
          <!-- #162: evaluating-meld's `completed` can be fractional (in-flight
               job progress) — floor for the count, keep the raw value for the
               progress bar's percentage so it climbs smoothly. -->
          {{ Math.floor(batchStore.progress.completed) }} / {{ batchStore.progress.total }}
        </el-text>
      </div>
      <el-progress :percentage="percentage" :stroke-width="8" />
      <div v-if="batchStore.liveTargets.length > 0" class="live-target-list" data-test="live-target-list">
        <div class="live-target-counter">已完成 {{ liveDone }} / {{ batchStore.liveTargets.length }}</div>
        <div
          v-for="(t, i) in batchStore.liveTargets"
          :key="i"
          class="live-target-row"
          :data-state="t.state"
        >
          <span class="live-target-name">{{ batchStore.liveTargetNames[i] ?? `#${i + 1}` }}</span>
          <span class="live-target-status">{{ targetLabel(t) }}</span>
        </div>
      </div>
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
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.progress-actions {
  text-align: right;
  margin-top: 8px;
}

.live-target-list {
  margin-top: 12px;
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px 10px;
  background: var(--el-fill-color-blank);
}

.live-target-counter {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.live-target-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.live-target-row:first-of-type {
  border-top: none;
}

.live-target-name {
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.live-target-status {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

.live-target-row[data-state='done'] .live-target-status {
  color: var(--el-color-success);
}

.live-target-row[data-state='failed'] .live-target-status {
  color: var(--el-color-danger);
}
</style>

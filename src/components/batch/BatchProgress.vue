<script setup lang="ts">
import { useBatchStore } from '@/stores/batch'
import { computed } from 'vue'

const batchStore = useBatchStore()

const percentage = computed(() => {
  const p = batchStore.progress
  if (p.total === 0) return 0
  if (p.phase === 'pricing') return 95
  if (p.phase === 'done') return 100
  const completedPortion = (p.current - 1) / p.total
  const currentPortion = (p.solverPercent / 100) / p.total
  return Math.min(95, Math.round((completedPortion + currentPortion) * 100))
})

const statusText = computed(() => {
  const p = batchStore.progress
  if (p.phase === 'pricing') return '正在查價...'
  if (p.phase === 'done') return '計算完成'
  return `正在求解：${p.currentName}`
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
        <el-text size="small" type="info">
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

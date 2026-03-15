<script setup lang="ts">
import { useBatchStore } from '@/stores/batch'
import { computed } from 'vue'

const batchStore = useBatchStore()

const percentage = computed(() => {
  const p = batchStore.progress
  if (p.total === 0) return 0
  if (p.phase === 'pricing') return 95
  if (p.phase === 'done') return 100
  // Fine-grained: completed recipes + current recipe's solver progress
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
  <el-card shadow="never" v-if="batchStore.isRunning">
    <template #header>計算進度</template>
    <div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <el-text size="small" type="info">
          <strong>{{ statusText }}</strong>
        </el-text>
        <el-text size="small" type="info">
          {{ batchStore.progress.current }} / {{ batchStore.progress.total }}
        </el-text>
      </div>
      <el-progress :percentage="percentage" :stroke-width="8" />
      <div style="text-align: right; margin-top: 8px;">
        <el-button size="small" @click="batchStore.cancel()">取消</el-button>
      </div>
    </div>
  </el-card>
</template>

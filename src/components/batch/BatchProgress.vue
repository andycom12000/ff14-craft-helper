<script setup lang="ts">
import { useBatchStore } from '@/stores/batch'
import { computed } from 'vue'

const batchStore = useBatchStore()

const percentage = computed(() => {
  if (batchStore.progress.total === 0) return 0
  return Math.round((batchStore.progress.current / batchStore.progress.total) * 100)
})
</script>

<template>
  <el-card shadow="never" v-if="batchStore.isRunning">
    <template #header>計算進度</template>
    <div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <el-text size="small" type="info">
          正在計算：<strong>{{ batchStore.progress.currentName }}</strong>
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

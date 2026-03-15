<script setup lang="ts">
import type { BatchException } from '@/stores/batch'

defineProps<{ exceptions: BatchException[] }>()
</script>

<template>
  <div>
    <div
      v-for="(exc, i) in exceptions"
      :key="i"
      style="margin-bottom: 8px; padding: 12px; border-radius: 6px;"
      :style="{
        background: exc.action === 'buy-finished' ? 'var(--el-color-warning-light-9)' : 'var(--el-color-danger-light-9)',
        border: `1px solid ${exc.action === 'buy-finished' ? 'var(--el-color-warning-light-5)' : 'var(--el-color-danger-light-5)'}`,
      }"
    >
      <div style="font-weight: 500; margin-bottom: 4px;">
        <el-text :type="exc.action === 'buy-finished' ? 'warning' : 'danger'">
          {{ exc.message }} — {{ exc.action === 'buy-finished' ? '已改為購買成品' : '已跳過' }}
        </el-text>
      </div>
      <el-text size="small" type="info">{{ exc.details }}</el-text>
      <div v-if="exc.buyPrice" style="margin-top: 6px;">
        <el-text size="small" type="warning">
          購買價：{{ exc.buyPrice.toLocaleString() }} Gil{{ exc.buyServer ? `（${exc.buyServer}）` : '' }}
        </el-text>
      </div>
    </div>
    <el-empty v-if="exceptions.length === 0" description="無例外" />
  </div>
</template>

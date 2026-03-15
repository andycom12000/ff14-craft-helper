<script setup lang="ts">
import type { BatchException } from '@/stores/batch'
import { formatGil } from '@/utils/format'

defineProps<{ exceptions: BatchException[] }>()
</script>

<template>
  <div class="exception-list">
    <div
      v-for="(exc, i) in exceptions"
      :key="i"
      class="exception-item"
      :class="exc.action === 'buy-finished' ? 'exception-item--buy' : 'exception-item--skip'"
    >
      <div class="exception-title">
        <el-text :type="exc.action === 'buy-finished' ? 'warning' : 'danger'">
          {{ exc.message }} — {{ exc.action === 'buy-finished' ? '已改為購買成品' : '已跳過' }}
        </el-text>
      </div>
      <el-text size="small" type="info">{{ exc.details }}</el-text>
      <div v-if="exc.buyPrice" class="exception-price">
        <el-text size="small" type="warning">
          購買價：{{ formatGil(exc.buyPrice) }} Gil{{ exc.buyServer ? `（${exc.buyServer}）` : '' }}
        </el-text>
      </div>
    </div>
    <el-empty v-if="exceptions.length === 0" description="無例外" />
  </div>
</template>

<style scoped>
.exception-item {
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 8px;
}

.exception-item:last-child {
  margin-bottom: 0;
}

.exception-item--skip {
  background: var(--el-color-danger-light-9);
  border: 1px solid var(--el-color-danger-light-5);
}

.exception-item--buy {
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-5);
}

.exception-title {
  font-weight: 500;
  margin-bottom: 4px;
}

.exception-price {
  margin-top: 6px;
}
</style>

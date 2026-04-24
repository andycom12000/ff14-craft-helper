<script setup lang="ts">
import { ref, computed } from 'vue'
import { WarningFilled } from '@element-plus/icons-vue'
import type { BatchException } from '@/stores/batch'
import { formatGil } from '@/utils/format'

const props = defineProps<{ exceptions: BatchException[] }>()

const expanded = ref(false)

const summary = computed(() => {
  const buyCount = props.exceptions.filter(e => e.action === 'buy-finished').length
  const skipCount = props.exceptions.filter(e => e.action === 'skipped').length
  const parts: string[] = []
  if (buyCount > 0) parts.push(`${buyCount} 項改為購買成品`)
  if (skipCount > 0) parts.push(`${skipCount} 項已跳過`)
  return parts.join('、')
})
</script>

<template>
  <div class="exception-list">
    <button
      v-if="exceptions.length > 0"
      class="exception-summary"
      @click="expanded = !expanded"
    >
      <span class="exception-summary-left">
        <el-icon class="exception-icon"><WarningFilled /></el-icon>
        <span class="exception-count">{{ summary }}</span>
      </span>
      <span class="exception-toggle">{{ expanded ? '收起' : '查看明細' }}</span>
    </button>

    <div v-if="expanded" class="exception-details">
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
    </div>
    <el-empty v-if="exceptions.length === 0" description="無例外" />
  </div>
</template>

<style scoped>
.exception-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 14px;
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-5);
  border-radius: 6px;
  cursor: pointer;
  color: var(--el-color-warning);
  font-size: 13px;
  transition: background 0.15s;
  flex-wrap: wrap;
  gap: 6px;
}

.exception-summary:hover {
  background: var(--el-color-warning-light-8);
}

.exception-summary-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.exception-icon {
  font-size: 16px;
}

.exception-count {
  font-weight: 500;
}

.exception-toggle {
  font-size: 12px;
  color: var(--el-color-warning);
  opacity: 0.8;
}

.exception-details {
  margin-top: 8px;
}

.exception-item {
  padding: 10px 12px;
  border-radius: 6px;
  margin-bottom: 6px;
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

@media (max-width: 640px) {
  .exception-summary {
    padding: 10px 12px;
    min-height: var(--touch-target-min, 44px);
    font-size: 13px;
  }

  .exception-summary-left {
    flex: 1;
    min-width: 0;
  }

  .exception-count {
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.35;
  }

  .exception-toggle {
    flex-shrink: 0;
    font-size: 12px;
    padding: 6px 4px;
  }

  .exception-item {
    padding: 10px;
    margin-bottom: 8px;
  }

  .exception-title {
    font-size: 13px;
    line-height: 1.4;
  }
}
</style>

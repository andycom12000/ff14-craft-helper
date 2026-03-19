<script setup lang="ts">
import { formatGil } from '@/utils/format'

defineProps<{
  grandTotal: number
  savingPercent: number | null
  singleServerTotal: number | null
  server: string
}>()
</script>

<template>
  <div class="cost-summary">
    <div class="cost-accent" />
    <div class="cost-body">
      <div class="cost-total">購買合計：{{ formatGil(grandTotal) }} Gil</div>
      <div v-if="savingPercent != null && savingPercent > 0" class="cost-compare">
        不跨服（{{ server }}）：{{ formatGil(singleServerTotal!) }} Gil，跨服省
        <span class="cost-saving">{{ savingPercent }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cost-summary {
  position: sticky;
  top: 80px;
  z-index: 99;
  display: flex;
  align-items: stretch;
  background: var(--el-fill-color-darker);
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 20px;
}

.cost-accent {
  width: 3px;
  flex-shrink: 0;
  border-radius: 2px;
  background: #e9c176;
  margin-right: 16px;
}

.cost-body {
  flex: 1;
}

.cost-total {
  font-size: 24px;
  font-weight: 700;
  color: #e9c176;
}

.cost-compare {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.cost-saving {
  color: var(--app-success);
  font-weight: 600;
}
</style>

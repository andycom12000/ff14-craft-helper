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
  <div class="cost-summary" role="status" aria-live="polite">
    <div class="cost-accent" aria-hidden="true" />
    <div class="cost-body">
      <div class="cost-row">
        <span class="cost-label">購買合計</span>
        <span class="cost-total">{{ formatGil(grandTotal) }} <span class="cost-unit">Gil</span></span>
      </div>
      <div v-if="savingPercent != null && savingPercent > 0" class="cost-compare">
        不跨服（{{ server }}）：{{ formatGil(singleServerTotal!) }} Gil，跨服省
        <span class="cost-saving">{{ savingPercent }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cost-summary {
  display: flex;
  align-items: stretch;
  background: var(--el-fill-color-darker);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 10px 24px -14px rgba(0, 0, 0, 0.55);
}

.cost-summary + * {
  margin-top: 16px;
}

.cost-accent {
  width: 3px;
  flex-shrink: 0;
  border-radius: 2px;
  background: var(--accent-gold);
  margin-right: 14px;
}

.cost-body {
  flex: 1;
  min-width: 0;
}

.cost-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.cost-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  letter-spacing: 0.02em;
}

.cost-total {
  font-size: clamp(17px, 1.6vw, 20px);
  font-weight: 600;
  color: var(--accent-gold);
  font-variant-numeric: tabular-nums;
}

.cost-unit {
  font-size: 0.78em;
  font-weight: 500;
  color: var(--el-text-color-regular);
  margin-left: 2px;
}

.cost-compare {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  word-break: break-word;
}

.cost-saving {
  color: var(--app-success);
  font-weight: 600;
}

@media (max-width: 768px) {
  .cost-summary {
    padding: 10px 14px;
  }
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { ElSegmented, ElProgress } from 'element-plus'

const props = defineProps<{
  optimizeBy: 'gil' | 'hop'
  progress: { done: number; total: number }
}>()

const emit = defineEmits<{
  'update:optimizeBy': [value: 'gil' | 'hop']
  'reset': []
  're-sort': []
}>()

const pct = computed(() => {
  if (props.progress.total === 0) return 0
  return Math.round((props.progress.done / props.progress.total) * 100)
})

const isComplete = computed(() => props.progress.total > 0 && props.progress.done >= props.progress.total)

function onUpdateMode(v: string | number | boolean) {
  emit('update:optimizeBy', v as 'gil' | 'hop')
}

function onReset() {
  emit('reset')
}

function onResort() {
  emit('re-sort')
}
</script>

<template>
  <div class="rpt" data-testid="route-toolbar">
    <span class="rpt__label">最佳化目標</span>
    <el-segmented
      :model-value="optimizeBy"
      @update:model-value="onUpdateMode"
      :options="[
        { label: '最少傳送費', value: 'gil' },
        { label: '最少跳點', value: 'hop' },
      ]"
      data-testid="optimize-toggle"
    />
    <el-progress
      :percentage="pct"
      :show-text="false"
      :stroke-width="6"
      class="rpt__bar"
      :class="{ 'is-complete': isComplete }"
      data-testid="progress"
    />
    <span class="rpt__count" data-testid="progress-count">{{ progress.done }} / {{ progress.total }}</span>
    <button type="button" class="rpt__btn" @click="onResort" aria-label="重新排序">🔄 重新排序</button>
    <button type="button" class="rpt__btn" @click="onReset" aria-label="重設勾選">🗑️ 重設</button>
  </div>
</template>

<style scoped>
.rpt {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: var(--app-cream-emphasis, var(--app-surface));
  border: 1px solid var(--app-border);
  border-radius: 10px;
  font-size: 12.5px;
}

.rpt__label {
  color: var(--app-text-muted);
  font-size: 11.5px;
}

.rpt__bar {
  flex: 1;
  min-width: 120px;
}

/* Force el-progress to use cocoa fill (Sunlight Spotlight Rule — no toast-gold gradient) */
.rpt__bar :deep(.el-progress-bar__inner) {
  background-color: var(--app-craft) !important;
  background-image: none !important;
}

.rpt__bar.is-complete :deep(.el-progress-bar__inner) {
  background-color: var(--app-toast-gold, oklch(0.78 0.13 75)) !important;
}

.rpt__count {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11.5px;
  color: var(--app-text-muted);
  white-space: nowrap;
  min-width: 56px;
  text-align: right;
}

.rpt__btn {
  padding: 5px 11px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-cream-surface, var(--app-surface));
  color: var(--app-text);
  font-size: 11.5px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s ease-out;
}

.rpt__btn:hover {
  background: var(--app-cream-hover, var(--app-surface-hover));
}

.rpt__btn:focus-visible {
  outline: 2px solid var(--app-toast-gold, oklch(0.78 0.13 75));
  outline-offset: 2px;
}
</style>

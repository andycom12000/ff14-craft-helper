<script setup lang="ts">
import { computed } from 'vue'
// `<el-progress>` is auto-resolved by ElementPlusResolver in vite.config.ts,
// which also injects the matching CSS bundle. The explicit
// `import { ElProgress } from 'element-plus'` we used to have here bypassed
// that — JS arrived but no CSS, so the bar rendered with no track and no
// fill (the "進度條不顯示" bug).

const props = defineProps<{
  progress: { done: number; total: number }
}>()

const emit = defineEmits<{
  'reset': []
  're-sort': []
}>()

const pct = computed(() => {
  if (props.progress.total === 0) return 0
  return Math.round((props.progress.done / props.progress.total) * 100)
})

const isComplete = computed(() => props.progress.total > 0 && props.progress.done >= props.progress.total)

function onReset() {
  emit('reset')
}

function onResort() {
  emit('re-sort')
}
</script>

<template>
  <div class="rpt" data-testid="route-toolbar">
    <span class="rpt__label">採買進度</span>
    <el-progress
      :percentage="pct"
      :stroke-width="10"
      :show-text="false"
      :status="isComplete ? 'success' : ''"
      class="rpt__bar"
      data-testid="progress"
    />
    <!-- Percentage sits between the bar and the X/Y count, both vertically
         centred with the bar. Rendered manually (instead of letting EP show
         its internal text) so the alignment is under our control. -->
    <span class="rpt__pct" data-testid="progress-pct">{{ pct }}%</span>
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
  /* Third tier of the right-column sticky stack (totals → tabs → toolbar).
   * Mirrors .bdt-head's offset on the materials tab so the wayfinding chrome
   * stays anchored across both tabs. */
  position: sticky;
  top: 120px;
  z-index: 3;
}

.rpt__label {
  color: var(--app-text-muted);
  font-size: 11.5px;
}

.rpt__bar {
  flex: 1;
  min-width: 160px;
}

/* No :deep overrides — defer to Element Plus's default progress styling
 * so this bar matches the bars in batch's TodoList, ShoppingList, and
 * BatchProgress (one consistent look across the app). The cocoa-on-cocoa
 * override that used to live here had near-zero contrast at low
 * percentages, which is why the bar appeared not to update. */

.rpt__pct {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-text);
  white-space: nowrap;
  min-width: 44px;
  text-align: center;
  /* Vertically centered with the bar via the parent's `align-items: center`. */
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

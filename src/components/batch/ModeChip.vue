<script setup lang="ts">
type Mode = 'macro' | 'quick-buy'

const props = defineProps<{ modelValue: Mode }>()
const emit = defineEmits<{
  'update:modelValue': [mode: Mode]
  change: [mode: Mode]
}>()

function pick(mode: Mode) {
  if (mode === props.modelValue) return
  emit('update:modelValue', mode)
  emit('change', mode)
}
</script>

<template>
  <div class="mode-chip" role="tablist" aria-label="計算模式">
    <button
      type="button"
      role="tab"
      class="mode-pill"
      :class="{ 'mode-pill--active': modelValue === 'macro' }"
      :aria-selected="modelValue === 'macro'"
      @click="pick('macro')"
    >
      <span class="mode-pill-icon" aria-hidden="true">⚙</span>
      巨集模式
    </button>
    <button
      type="button"
      role="tab"
      class="mode-pill"
      :class="{ 'mode-pill--active': modelValue === 'quick-buy' }"
      :aria-selected="modelValue === 'quick-buy'"
      @click="pick('quick-buy')"
    >
      <span class="mode-pill-icon" aria-hidden="true">🛒</span>
      快速購買模式
    </button>
  </div>
</template>

<style scoped>
.mode-chip {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
}

.mode-pill {
  appearance: none;
  border: none;
  background: transparent;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background-color 0.18s ease, color 0.18s ease;
  white-space: nowrap;
}

.mode-pill:hover:not(.mode-pill--active) {
  color: var(--el-text-color-primary);
  background: var(--el-fill-color);
}

.mode-pill--active {
  background: var(--accent-gold, var(--el-color-primary));
  color: var(--el-bg-color);
  box-shadow: 0 1px 3px -1px rgba(0, 0, 0, 0.35);
}

.mode-pill-icon {
  font-size: 12px;
  line-height: 1;
}

.mode-pill:focus-visible {
  outline: 2px solid var(--accent-gold, var(--el-color-primary));
  outline-offset: 2px;
}

@media (pointer: coarse) {
  .mode-pill {
    padding: 10px 18px;
    min-height: 40px;
    font-size: 14px;
  }
}
</style>

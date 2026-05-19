<script setup lang="ts">
import type { WindowKey } from '@/types/ga-snapshot'

defineProps<{ modelValue: WindowKey }>()
defineEmits<{ (e: 'update:modelValue', v: WindowKey): void }>()
const windows: Array<{ key: WindowKey, label: string }> = [
  { key: '7d',  label: '7d' },
  { key: '14d', label: '14d' },
  { key: '28d', label: '28d' },
]
</script>

<template>
  <div class="window-selector" role="tablist" aria-label="Time window">
    <button
      v-for="w in windows"
      :key="w.key"
      role="tab"
      :aria-selected="modelValue === w.key"
      :class="['win-btn', { active: modelValue === w.key }]"
      @click="$emit('update:modelValue', w.key)"
    >
      {{ w.label }}
    </button>
  </div>
</template>

<style scoped>
.window-selector {
  display: inline-flex; gap: 8px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 999px;
  margin-bottom: 32px;
}
.win-btn {
  appearance: none; border: none; background: transparent;
  color: var(--ink-muted);
  font-family: 'Fira Code', monospace;
  font-size: 12px; font-weight: 500;
  letter-spacing: 0.14em; text-transform: uppercase;
  padding: 8px 18px;
  border-radius: 999px;
  cursor: pointer;
  transition: color 160ms ease-out, background 160ms ease-out;
}
.win-btn:hover { color: var(--ink); }
.win-btn.active {
  background: var(--gold-glow); color: var(--gold);
}
</style>

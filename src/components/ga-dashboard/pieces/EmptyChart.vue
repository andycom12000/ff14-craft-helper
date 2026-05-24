<script setup lang="ts">
defineProps<{ label: string; hint?: string }>()
</script>

<template>
  <div class="empty-chart">
    <span class="ec-label">{{ label }}</span>
    <span v-if="hint" class="ec-hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
.empty-chart {
  margin: 12px 0 24px;
  /* lighter than the rich charts around it — an empty slot should recede, not
     draw more attention than the populated ones (it used to be 64px tall). */
  padding: 38px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  border: 1px dashed var(--border-soft);
  border-radius: 2px;
}
.ec-label {
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
  font-size: 15px;
  color: var(--ink-faint);
}
.ec-hint {
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
  opacity: 0.72;
}
</style>

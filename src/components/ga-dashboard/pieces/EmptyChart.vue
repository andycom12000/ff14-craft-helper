<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div class="empty-chart">
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.empty-chart {
  margin: 12px 0 28px;
  padding: 64px 24px;
  text-align: center;
  border: 1px dashed var(--border-soft);
  border-radius: 2px;
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic; font-size: 16px;
  color: var(--ink-faint);
}
</style>

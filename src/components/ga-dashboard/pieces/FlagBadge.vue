<script setup lang="ts">
// ⚑ instrumentation-pending badge (spec #194 §E6). Two states:
//   - full state (default)   — the whole chart carries an untrusted metric
//   - `partial`              — only a named field/segment is untrusted
// Copy MUST name the field per #194 decision 5 ("文案必須指名欄位") — that's
// the caller's job, this component only renders whatever text it's given.
defineProps<{ text: string; partial?: boolean }>()
</script>

<template>
  <span class="flag-badge" :class="{ partial }">{{ text }}</span>
</template>

<style scoped>
.flag-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.10em;
  padding: 2px 8px 2px 6px;
  border: 1px solid var(--warning);
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 10%, transparent);
  white-space: normal;
}
.flag-badge::before {
  content: '⚑';
  font-size: 10px;
}
/* Partial (一半可信) state — dashed border signals "this is a slice of the
   chart", not the whole thing. */
.flag-badge.partial {
  border-style: dashed;
}
</style>

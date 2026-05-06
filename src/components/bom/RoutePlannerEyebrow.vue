<script setup lang="ts">
// No props, no emits — pure presentation.
</script>

<template>
  <div class="rpe">
    <span class="rpe__label">VIII</span>
    <em class="rpe__quote">今天的烤盤 · today's bake</em>
  </div>
</template>

<style scoped>
.rpe {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 6px 0 14px;
}

.rpe__label {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.25em;
  color: var(--app-toast-gold, oklch(0.78 0.13 75));
  text-transform: uppercase;
  font-weight: 500;
}

.rpe__quote {
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
  font-size: 14px;
  color: var(--app-text-muted);
}
</style>

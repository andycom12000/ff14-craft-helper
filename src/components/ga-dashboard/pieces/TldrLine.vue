<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <p class="tldr"><span class="kicker">TL;DR</span>{{ text }}</p>
</template>

<style scoped>
.tldr {
  font-family: 'Noto Serif TC', serif;
  font-size: 16px; line-height: 1.7;
  color: var(--ink-mid);
  max-width: 78ch;
  margin: -6px 0 36px;
}
.kicker {
  display: inline-block;
  margin-right: 14px;
  padding: 3px 10px;
  background: var(--gold-glow);
  color: var(--gold);
  border-radius: 999px;
  font-family: 'Fira Code', monospace;
  font-size: 10.5px; font-weight: 500;
  letter-spacing: 0.22em; text-transform: uppercase;
  vertical-align: 2px;
}
</style>

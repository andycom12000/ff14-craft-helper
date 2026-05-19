<script setup lang="ts">
defineProps<{ num: string, title: string, aside?: string }>()
</script>

<template>
  <div class="section-head">
    <div class="section-num">{{ num }}</div>
    <h2 class="section-title">{{ title }}</h2>
    <div v-if="aside" class="section-aside">{{ aside }}</div>
  </div>
</template>

<style scoped>
.section-head {
  display: flex; align-items: baseline; gap: 20px;
  margin-bottom: 28px; padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
}
.section-num {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic; font-weight: 500;
  font-size: 42px; line-height: 1;
  color: var(--gold); min-width: 44px;
}
.section-title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 700; font-size: 26px; line-height: 1.2;
  color: var(--ink); margin: 0; flex: 1;
}
.section-aside {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic; font-size: 18px; color: var(--ink-muted);
}
</style>

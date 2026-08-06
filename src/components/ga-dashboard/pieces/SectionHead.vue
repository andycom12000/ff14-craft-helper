<script setup lang="ts">
// Layer head (Ⅰ 為什麼會亮 / Ⅱ 背景與觀測). Decorative italic serif retired
// per spec #194 §E2: `num` is 20px monospace (was 42px Cormorant Garamond
// italic), `aside` is an 11px monospace count (was 18px italic aside).
defineProps<{ num: string, title: string, aside?: string, desc?: string }>()
</script>

<template>
  <div class="section-head">
    <div class="top">
      <div class="section-num">{{ num }}</div>
      <h2 class="section-title">{{ title }}</h2>
      <div v-if="aside" class="section-aside">{{ aside }}</div>
    </div>
    <div v-if="desc" class="section-desc">{{ desc }}</div>
  </div>
</template>

<style scoped>
.section-head {
  margin-bottom: 26px; padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.top {
  display: flex; align-items: baseline; gap: 18px;
}
.section-num {
  font-family: 'Fira Code', monospace;
  font-weight: 600;
  font-size: 20px; line-height: 1;
  letter-spacing: 0.1em;
  color: var(--gold); min-width: 34px;
}
.section-title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600; font-size: 22px; line-height: 1.2;
  color: var(--ink); margin: 0; flex: 1;
}
.section-aside {
  font-family: 'Fira Code', monospace;
  font-size: 11px; letter-spacing: 0.14em; color: var(--ink-faint);
}
.section-desc {
  margin-top: 8px; margin-left: 52px;
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 13px; color: var(--ink-muted);
}
</style>

<script setup lang="ts">
// L1Item's own sub-header (rule + title + mono identifier). `aside` used to
// hold an italic Chinese prose fragment; per spec #194 §E2 it now holds a
// short monospace identifier (e.g. "A · BATCH_FAIL_RATE") — spacing to the
// previous item is owned by the parent (`L1Item`'s 46px), not by this
// component, so there's no top margin here.
defineProps<{ title: string, aside?: string }>()
</script>

<template>
  <div class="subhead">
    <div class="sub-rule" />
    <h3 class="sub-title">{{ title }}</h3>
    <div v-if="aside" class="sub-aside">{{ aside }}</div>
  </div>
</template>

<style scoped>
.subhead {
  display: flex; align-items: baseline; gap: 18px;
  margin: 0 0 14px;
}
.sub-rule {
  width: 22px; height: 1px; background: var(--gold); flex: none;
}
.sub-title {
  font-family: 'Noto Serif TC', serif; font-weight: 600;
  font-size: 17px; color: var(--ink); margin: 0;
  letter-spacing: -0.005em;
}
.sub-aside {
  font-family: 'Fira Code', monospace;
  font-size: 11px; color: var(--ink-faint);
  letter-spacing: 0.10em;
}
</style>

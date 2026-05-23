<script setup lang="ts">
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
  margin: 56px 0 18px;
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
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic; font-size: 15px; color: var(--ink-muted);
  letter-spacing: 0.01em;
}
</style>

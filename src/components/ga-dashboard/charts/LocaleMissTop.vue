<script setup lang="ts">
import { computed } from 'vue'
import { C } from '../palette'
import { fmtInt } from '../formatters'
import type { LocaleMissRow } from '@/types/ga-snapshot'

const props = defineProps<{ data: LocaleMissRow[] }>()

const max = computed(() => Math.max(...props.data.map((d) => d.occurrences), 1))

const kindColor = (kind: LocaleMissRow['kind']) => (kind === 'recipe' ? C.cocoa : C.matcha)
</script>

<template>
  <div class="locale-miss">
    <div class="row header">
      <div></div>
      <div>kind</div>
      <div>id</div>
      <div>item</div>
      <div>occurrences</div>
      <div class="right">users</div>
    </div>

    <div v-for="(it, i) in data" :key="it.kind + '-' + it.itemId" class="row item">
      <div class="rank">{{ String(i + 1).padStart(2, '0') }}</div>
      <div class="kind" :style="{ color: kindColor(it.kind) }">{{ it.kind }}</div>
      <div class="id">#{{ it.itemId }}</div>
      <div class="name">{{ it.itemName ?? '' }}</div>
      <div class="bar">
        <i :style="{ width: (it.occurrences / max) * 100 + '%' }" />
        <span>{{ fmtInt(it.occurrences) }}</span>
      </div>
      <div class="users">{{ fmtInt(it.affectedUsers) }}</div>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 34px 60px 80px 1fr 240px 90px;
  gap: 18px;
}

.header {
  padding: 4px 4px 14px;
  border-bottom: 1px solid var(--border);
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.header .right {
  text-align: right;
}

.item {
  padding: 12px 4px;
  align-items: baseline;
  border-bottom: 1px solid var(--border-soft);
  cursor: default;
}

.rank {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 18px;
  color: var(--ink-faint);
  text-align: right;
}

.kind {
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.id {
  font-family: 'Fira Code', monospace;
  font-size: 12px;
  color: var(--ink-muted);
}

.name {
  font-family: 'Noto Serif TC', serif;
  font-size: 15px;
  color: var(--ink);
}

.bar {
  position: relative;
  height: 18px;
  background: var(--surface);
  border-radius: 1px;
  overflow: hidden;
}

.bar i {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  display: block;
  background: v-bind('C.matcha');
  opacity: 0.45;
}

.bar span {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  padding-left: 10px;
  font-family: 'Fira Code', monospace;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--ink);
}

.users {
  text-align: right;
  font-family: 'Fira Code', monospace;
  font-size: 12px;
  color: var(--ink-muted);
}
</style>

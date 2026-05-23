<script setup lang="ts">
import type { MisuseRow } from '@/types/ga-snapshot'
import { fmtInt } from '../formatters'

defineProps<{ data: MisuseRow[] }>()
</script>

<template>
  <div class="misuse-tally">
    <div
      v-for="(s, i) in data"
      :key="s.type"
      class="misuse-row"
      :class="{ 'is-last': i === data.length - 1 }"
    >
      <div>
        <div class="misuse-type">{{ s.type }}</div>
        <div class="misuse-label">{{ s.label }}</div>
        <div class="misuse-gloss">{{ s.gloss }}</div>
      </div>
      <div class="misuse-metric">
        <div class="misuse-value">{{ fmtInt(s.eventCount) }}</div>
        <div class="misuse-caption">events</div>
      </div>
      <div class="misuse-metric">
        <div class="misuse-value misuse-value--mid">{{ fmtInt(s.affectedUsers) }}</div>
        <div class="misuse-caption">affected users</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.misuse-tally {
  border-top: 1px solid var(--border-soft);
  padding: 4px 0 0;
}

.misuse-row {
  display: grid;
  grid-template-columns: 1fr 130px 130px;
  gap: 28px;
  padding: 22px 4px 22px;
  align-items: baseline;
  border-bottom: 1px solid var(--border-soft);
}

.misuse-row.is-last {
  border-bottom: 0;
}

.misuse-type {
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--warning);
  margin-bottom: 6px;
}

.misuse-label {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 17px;
  color: var(--ink);
  margin-bottom: 4px;
}

.misuse-gloss {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 14.5px;
  color: var(--ink-muted);
  max-width: 54ch;
}

.misuse-metric {
  text-align: right;
}

.misuse-value {
  font-family: 'Fira Code', monospace;
  font-size: 22px;
  color: var(--ink);
  font-weight: 500;
}

.misuse-value--mid {
  color: var(--ink-mid);
}

.misuse-caption {
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin-top: 4px;
}
</style>

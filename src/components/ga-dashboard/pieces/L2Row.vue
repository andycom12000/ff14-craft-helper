<script setup lang="ts">
import FlagBadge from './FlagBadge.vue'

// One Layer II ("背景與觀測") row in the continuous report strip — text left
// (268px) / chart right (1fr) — spec #194 §E3's mirrored layout, Layer II
// half. Adjacent rows are separated by a 1px hairline only (spec §E4 "第Ⅱ層
// 報表帶內相鄰列 0"); `full` renders a single-column row for entries that
// aren't a chart at all (the BOM-page-interaction ledger row, spec §C4).
defineProps<{
  id: string
  /** Omit `title`/`ticket` for `full` rows — the ledger content in the
   *  default slot carries its own header (spec §C4 BOM ledger row). */
  title?: string
  /** The entry ticket text — "哪條待辦亮時來看這張、它回答什麼" (spec §C1). */
  ticket?: string
  flagText?: string
  flagPartial?: boolean
  /** Single-column row for entries that aren't a chart — currently only the
   *  BOM-page-interaction ledger row (spec §C4). */
  full?: boolean
}>()
</script>

<template>
  <div v-if="full" :id="id" class="l2-row full">
    <slot />
  </div>
  <div v-else :id="id" class="l2-row">
    <div class="l2-meta">
      <h3>{{ title }}</h3>
      <div class="l2-ticket">{{ ticket }}</div>
      <FlagBadge v-if="flagText" class="l2-flag" :text="flagText" :partial="flagPartial" />
    </div>
    <div class="l2-chart" :class="{ 'ga-flagged-full': flagText && !flagPartial }">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.l2-row {
  display: grid;
  grid-template-columns: 268px 1fr;
  gap: 0 32px;
  border-bottom: 1px solid var(--border-soft);
  align-items: center;
}
.l2-row.full {
  grid-template-columns: 1fr;
}
.l2-meta {
  padding: 18px 0;
}
.l2-meta h3 {
  font-family: 'Noto Serif TC', serif;
  font-size: 14.5px;
  font-weight: 600;
  margin: 0 0 5px;
  color: var(--ink);
}
.l2-ticket {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 12px;
  color: var(--ink-muted);
  line-height: 1.6;
}
.l2-flag {
  margin-top: 9px;
  white-space: normal;
}
.l2-chart {
  padding: 12px 0;
}
</style>

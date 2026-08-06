<script setup lang="ts">
import SubHead from './SubHead.vue'
import AnchorSide from './AnchorSide.vue'

// One Layer I ("為什麼會亮") item: chart left (~1030px) / anchor side right
// (300px) — spec #194 §E3's mirrored two-layer layout, Layer I half. Owns
// the 46px gap to the previous sibling (spec §E4 "第Ⅰ層 圖與圖之間 46px").
defineProps<{
  id: string
  title: string
  note: string
  boundLabel: string
  readout?: string
  readoutNote?: string
  ok?: boolean
  flagText?: string
  flagPartial?: boolean
}>()
</script>

<template>
  <div :id="id" class="l1-item">
    <SubHead :title="title" :aside="note" />
    <div class="l1-row">
      <div class="l1-chart" :class="{ 'ga-flagged-full': flagText && !flagPartial }">
        <slot />
      </div>
      <AnchorSide
        :bound-label="boundLabel"
        :readout="readout"
        :readout-note="readoutNote"
        :ok="ok"
        :flag-text="flagText"
        :flag-partial="flagPartial"
      />
    </div>
  </div>
</template>

<style scoped>
.l1-item {
  margin-top: 46px;
}
.l1-row {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 0 40px;
  align-items: start;
}
</style>

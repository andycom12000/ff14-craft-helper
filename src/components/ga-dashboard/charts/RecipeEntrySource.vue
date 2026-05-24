<script setup lang="ts">
import { computed } from 'vue'
import type { SourceRow } from '@/types/ga-snapshot'
import { C } from '../palette'
import { fmtInt, fmtPct } from '../formatters'
import { useTooltip } from '@/composables/useTooltip'

const props = defineProps<{ data: SourceRow[] }>()

const { show, move, hide } = useTooltip()

function colorForSource(source: SourceRow['source']): string {
  switch (source) {
    case 'search':
      return C.gold
    case 'queue':
      return C.cocoa
    case 'batch_target':
      return C.strawberry
    case 'bom_drilldown':
      return C.matcha
    case 'deep_link':
      return C.blueberry
    case 'company_craft':
      return C.crust
    default:
      return C.danger
  }
}

const total = computed(() => props.data.reduce((sum, x) => sum + x.eventCount, 0))

const unknown = computed(() => props.data.find((s) => s.source === 'unknown'))

const showBanner = computed(() => !!unknown.value && unknown.value.eventCount > 0)

interface Segment {
  source: SourceRow['source']
  pct: number
  color: string
  isUnknown: boolean
  baseOpacity: number
  showLabel: boolean
  pctLabel: string
}

const segments = computed<Segment[]>(() =>
  props.data.map((s) => {
    const pct = total.value > 0 ? s.eventCount / total.value : 0
    const isUnknown = s.source === 'unknown'
    return {
      source: s.source,
      pct,
      color: colorForSource(s.source),
      isUnknown,
      baseOpacity: isUnknown ? 0.85 : 0.78,
      showLabel: pct > 0.05,
      pctLabel: (pct * 100).toFixed(1) + '%',
    }
  }),
)

function segWidth(pct: number): string {
  return (pct * 100).toFixed(2) + '%'
}

function tooltipHtml(row: SourceRow, pct: number): string {
  return `
    <strong>${row.source}</strong>
    <div class="row"><span>Events</span><span>${fmtInt(row.eventCount)}</span></div>
    <div class="row"><span>Unique users</span><span>${fmtInt(row.uniqueUsers)}</span></div>
    <div class="row"><span>Share</span><span>${fmtPct(pct)}</span></div>
  `
}

function onEnter(ev: MouseEvent, row: SourceRow, seg: Segment) {
  ;(ev.currentTarget as HTMLElement).style.opacity = '1'
  show(tooltipHtml(row, seg.pct), ev)
}

function onLeave(ev: MouseEvent, seg: Segment) {
  ;(ev.currentTarget as HTMLElement).style.opacity = String(seg.baseOpacity)
  hide()
}
</script>

<template>
  <div class="entry-source">
    <!-- Anomaly banner: unknown source > 0 is an invariant violation per spec -->
    <div v-if="showBanner && unknown" class="anomaly-banner">
      <span class="anomaly-tag">異常</span>
      <span class="anomaly-text">
        有
        <strong class="anomaly-count">{{ fmtInt(unknown.eventCount) }}</strong>
        次配方開啟事件 source 解析失敗。依規格應為 0，需要追查 client side instrument。
      </span>
    </div>

    <!-- 100% stacked bar -->
    <div class="bar">
      <div
        v-for="(seg, i) in segments"
        :key="seg.source + '-' + i"
        class="seg"
        :class="{ 'seg--unknown': seg.isUnknown }"
        :style="{
          width: segWidth(seg.pct),
          background: seg.color,
          opacity: seg.baseOpacity,
        }"
        @mouseenter="onEnter($event, data[i], seg)"
        @mousemove="move($event)"
        @mouseleave="onLeave($event, seg)"
      >
        <div
          v-if="seg.showLabel"
          class="seg-label"
          :style="{ color: seg.isUnknown ? C.ink : C.bgDeep }"
        >
          {{ seg.pctLabel }}
        </div>
      </div>
    </div>

    <!-- Ledger breakdown -->
    <div class="ledger">
      <div v-for="(s, i) in data" :key="s.source" class="cell">
        <span class="swatch" :style="{ background: segments[i].color }"></span>
        <div>
          <div class="cell-label" :class="{ 'cell-label--unknown': segments[i].isUnknown }">
            {{ s.label }}
          </div>
          <div class="cell-sub">{{ s.source }} · {{ fmtInt(s.uniqueUsers) }} users</div>
        </div>
        <div class="cell-count">{{ fmtInt(s.eventCount) }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.anomaly-banner {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 10px 14px;
  margin: 0 0 16px;
  /* full hairline border + tint + leading 異常 chip carry the alert — not a
     2px side-stripe (an absolute ban; the leading chip already does the work). */
  border: 1px solid v-bind('C.danger');
  border-radius: 2px;
  background: oklch(0.68 0.2 22 / 0.1);
}

.anomaly-tag {
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: v-bind('C.danger');
  font-weight: 600;
}

.anomaly-text {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 13px;
  color: var(--ink);
}

.anomaly-count {
  font-family: 'Fira Code', monospace;
  color: v-bind('C.danger');
}

.bar {
  display: flex;
  height: 36px;
  border: 1px solid var(--border-soft);
  border-radius: 1px;
  overflow: hidden;
  margin: 4px 0 22px;
}

.seg {
  position: relative;
  cursor: pointer;
  transition: opacity 160ms ease-out;
}

.seg--unknown {
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0 4px,
    oklch(0 0 0 / 0.35) 4px 7px
  );
}

.seg-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  pointer-events: none;
}

.ledger {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px 36px;
}

.cell {
  display: grid;
  grid-template-columns: 12px 1fr auto;
  gap: 12px;
  align-items: baseline;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-soft);
}

.swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 1px;
  margin-top: 5px;
}

.cell-label {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ink);
}

.cell-label--unknown {
  color: var(--danger);
}

.cell-sub {
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  letter-spacing: 0.12em;
  color: var(--ink-faint);
  margin-top: 2px;
}

.cell-count {
  text-align: right;
  font-family: 'Fira Code', monospace;
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
}
</style>

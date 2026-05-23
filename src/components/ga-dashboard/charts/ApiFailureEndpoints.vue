<script setup lang="ts">
import { computed } from 'vue'
import type { ApiFailures, ApiFailureCell, ApiFailureEndpoint } from '@/types/ga-snapshot'
import { C } from '../palette'
import { fmtInt } from '../formatters'
import { useTooltip } from '@/composables/useTooltip'

const props = defineProps<{ data: ApiFailures }>()

const { show, move, hide } = useTooltip()

// ---------- MATRIX (left) ----------
const statuses = computed(() =>
  [...new Set(props.data.matrix.map((d) => d.status))].sort((a, b) => a - b),
)
const apis = computed(() => [...new Set(props.data.matrix.map((d) => d.api))])
const matrixMax = computed(() => Math.max(...props.data.matrix.map((d) => d.count), 0))

interface MatrixCell {
  api: ApiFailureCell['api']
  status: number
  value: number
  alpha: number
  bg: string
  border: string
  fontSize: string
  color: string
  text: string
  hoverable: boolean
}

const rows = computed<MatrixCell[][]>(() =>
  apis.value.map((api) =>
    statuses.value.map((status) => {
      const cell = props.data.matrix.find((m) => m.api === api && m.status === status)
      const value = cell ? cell.count : 0
      const alpha = matrixMax.value > 0 ? 0.08 + (value / matrixMax.value) * 0.7 : 0
      return {
        api,
        status,
        value,
        alpha,
        bg: `oklch(0.68 0.20 22 / ${alpha.toFixed(2)})`,
        border: value > 0 ? 'oklch(0.68 0.20 22 / 0.4)' : 'var(--border-soft)',
        fontSize: value > 0 ? '14px' : '11px',
        color: value > 0 ? C.ink : C.inkFaint,
        text: value > 0 ? fmtInt(value) : '·',
        hoverable: value > 0,
      }
    }),
  ),
)

const matrixGridCols = computed(
  () => `100px repeat(${statuses.value.length}, 1fr)`,
)

function statusLabel(status: number): string {
  return status === 0 ? 'network' : String(status)
}

function cellTooltipHtml(cell: MatrixCell): string {
  return `
    <strong>${cell.api} · status ${statusLabel(cell.status)}</strong>
    <div class="row"><span>Count</span><span>${fmtInt(cell.value)}</span></div>
  `
}

function onCellEnter(ev: MouseEvent, cell: MatrixCell) {
  if (!cell.hoverable) return
  show(cellTooltipHtml(cell), ev)
}

// ---------- TOP ENDPOINTS (right) ----------
const epMax = computed(() => Math.max(...props.data.topEndpoints.map((e) => e.count), 0))

function statusColor(status: number): string {
  if (status === 0) return C.warning
  if (status >= 500) return C.danger
  if (status === 429) return C.warning
  return C.danger
}

interface EndpointView {
  ep: ApiFailureEndpoint
  rank: string
  barWidth: string
  color: string
  pillLabel: string
}

const endpoints = computed<EndpointView[]>(() =>
  props.data.topEndpoints.map((ep, i) => ({
    ep,
    rank: String(i + 1).padStart(2, '0'),
    barWidth: epMax.value > 0 ? (ep.count / epMax.value) * 100 + '%' : '0%',
    color: statusColor(ep.status),
    pillLabel: ep.status === 0 ? 'network' : String(ep.status),
  })),
)
</script>

<template>
  <div class="api-failures">
    <!-- ---------- MATRIX (left) ---------- -->
    <div class="matrix-wrap">
      <div class="eyebrow">api × status · count matrix</div>
      <div class="matrix" :style="{ gridTemplateColumns: matrixGridCols }">
        <!-- top-left blank -->
        <div></div>
        <!-- status headers -->
        <div v-for="s in statuses" :key="'h-' + s" class="status-head">
          {{ statusLabel(s) }}
        </div>
        <!-- api rows -->
        <template v-for="(row, ri) in rows" :key="'r-' + apis[ri]">
          <div class="api-label">{{ apis[ri] }}</div>
          <div
            v-for="cell in row"
            :key="apis[ri] + '-' + cell.status"
            class="cell"
            :style="{
              background: cell.bg,
              border: '1px solid ' + cell.border,
              fontSize: cell.fontSize,
              color: cell.color,
              cursor: cell.hoverable ? 'pointer' : 'default',
            }"
            @mouseenter="onCellEnter($event, cell)"
            @mousemove="move($event)"
            @mouseleave="hide()"
          >
            {{ cell.text }}
          </div>
        </template>
      </div>
    </div>

    <!-- ---------- TOP ENDPOINTS (right) ---------- -->
    <div class="ep-wrap">
      <div class="eyebrow">top failing endpoints — most-broken first</div>
      <div class="ep-table">
        <div v-for="row in endpoints" :key="row.ep.endpoint + '-' + row.ep.status" class="ep-row">
          <div class="ep-rank">{{ row.rank }}</div>
          <div class="ep-api">{{ row.ep.api }}</div>
          <div class="ep-endpoint">
            {{ row.ep.endpoint }}
            <div class="ep-bar">
              <i :style="{ background: row.color, width: row.barWidth }"></i>
            </div>
          </div>
          <div class="ep-pill-cell">
            <span class="ep-pill" :style="{ color: row.color, borderColor: row.color }">
              {{ row.pillLabel }}
            </span>
          </div>
          <div class="ep-count">{{ fmtInt(row.ep.count) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.api-failures {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 48px;
  margin: 8px 0 12px;
}

.eyebrow {
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin-bottom: 14px;
}

/* ---------- MATRIX ---------- */
.matrix {
  display: grid;
  gap: 6px;
  align-items: center;
}

.status-head {
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-muted);
  text-align: center;
}

.api-label {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink);
}

.cell {
  padding: 12px 6px;
  text-align: center;
  font-family: 'Fira Code', monospace;
  font-weight: 500;
  letter-spacing: 0.02em;
  transition: background 160ms ease-out;
}

/* ---------- TOP ENDPOINTS ---------- */
.ep-row {
  display: grid;
  grid-template-columns: 22px 80px 1fr 90px 56px;
  gap: 14px;
  align-items: baseline;
  padding: 9px 4px;
  border-bottom: 1px solid var(--border-soft);
}

.ep-rank {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 13px;
  color: var(--ink-faint);
}

.ep-api {
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.ep-endpoint {
  font-family: 'Fira Code', monospace;
  font-size: 13px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ep-bar {
  position: relative;
  height: 3px;
  background: var(--surface);
  margin-top: 6px;
  border-radius: 1px;
}

.ep-bar i {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  opacity: 0.7;
  display: block;
}

.ep-pill-cell {
  text-align: right;
}

.ep-pill {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  letter-spacing: 0.06em;
  padding: 3px 7px;
  border-radius: 2px;
  background: oklch(0.68 0.2 22 / 0.14);
  border: 1px solid;
}

.ep-count {
  text-align: right;
  font-family: 'Fira Code', monospace;
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
}
</style>

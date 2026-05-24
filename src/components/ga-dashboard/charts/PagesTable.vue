<script setup lang="ts">
import { computed, ref } from 'vue'
import * as d3 from 'd3'
import type { PageRow } from '@/types/ga-snapshot'
import { pageFamilyColor } from '@/components/ga-dashboard/palette'
import { stripPath } from '@/components/ga-dashboard/paths'
import { fmtInt, fmtPct, fmtSec } from '@/components/ga-dashboard/formatters'

const props = defineProps<{ data: PageRow[] }>()

// GA returns several zero-view duplicate path buckets (e.g. multiple
// `/ff14-craft-helper/` rows from query/trailing-slash variants). Drop them so
// the table reads as real pages.
const rows = computed(() => props.data.filter(p => p.views >= 5))

const medians = computed(() => ({
  engagement: d3.median(rows.value, r => r.engagement) ?? 0,
  avgSession: d3.median(rows.value, r => r.avgSession) ?? 0,
  bounce:     d3.median(rows.value, r => r.bounce) ?? 0,
}))

type SortKey = 'views' | 'engagement' | 'avgSession' | 'bounce'
const sortKey = ref<SortKey>('views')
const sortDir = ref<'desc' | 'asc'>('desc')

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}

const sorted = computed(() => {
  const arr = [...rows.value]
  arr.sort((a, b) => {
    const av = a[sortKey.value]
    const bv = b[sortKey.value]
    return sortDir.value === 'desc' ? bv - av : av - bv
  })
  return arr
})

type Tone = 'good' | 'bad' | 'flat'
interface Cell { text: string; delta: string; tone: Tone }

function buildCell(value: number, median: number, fmt: (n: number) => string, higherIsBetter: boolean): Cell {
  const text = fmt(value)
  if (median === 0) return { text, delta: '·', tone: 'flat' }
  const d = (value - median) / median
  if (Math.abs(d) < 0.03) return { text, delta: '±0%', tone: 'flat' }
  return {
    text,
    delta: (d > 0 ? '+' : '') + (d * 100).toFixed(0) + '%',
    tone: (d > 0) === higherIsBetter ? 'good' : 'bad',
  }
}

interface DisplayRow {
  raw: PageRow
  views: string
  engagement: Cell
  avgSession: Cell
  bounce: Cell
}

const display = computed<DisplayRow[]>(() => sorted.value.map(r => ({
  raw: r,
  views: fmtInt(r.views),
  engagement: buildCell(r.engagement, medians.value.engagement, fmtPct, true),
  avgSession: buildCell(r.avgSession, medians.value.avgSession, fmtSec, true),
  bounce:     buildCell(r.bounce,     medians.value.bounce,     fmtPct, false),
})))

function sortArrow(key: SortKey): string {
  if (sortKey.value !== key) return ''
  return sortDir.value === 'desc' ? ' ↓' : ' ↑'
}
</script>

<template>
  <div class="pages-table" role="region" aria-label="Per-page health table">
    <div class="legend">
      <span>median engagement <b>{{ fmtPct(medians.engagement) }}</b></span>
      <span>median session <b>{{ fmtSec(medians.avgSession) }}</b></span>
      <span>median bounce <b>{{ fmtPct(medians.bounce) }}</b></span>
      <span class="hint">Δ = vs median</span>
    </div>
    <table>
      <thead>
        <tr>
          <th class="left">Page</th>
          <th class="num clickable" @click="toggleSort('views')">Views{{ sortArrow('views') }}</th>
          <th class="num clickable" @click="toggleSort('engagement')">Engagement{{ sortArrow('engagement') }}</th>
          <th class="num clickable" @click="toggleSort('avgSession')">Avg session{{ sortArrow('avgSession') }}</th>
          <th class="num clickable" @click="toggleSort('bounce')">Bounce{{ sortArrow('bounce') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in display" :key="row.raw.path + row.raw.views">
          <td class="left">
            <span class="fam" :style="{ background: pageFamilyColor[row.raw.family] }" />
            <span class="path">{{ stripPath(row.raw.path) }}</span>
            <span class="title">{{ row.raw.title }}</span>
          </td>
          <td class="num">{{ row.views }}</td>
          <td class="num">
            {{ row.engagement.text }}
            <span :class="['delta', row.engagement.tone]">{{ row.engagement.delta }}</span>
          </td>
          <td class="num">
            {{ row.avgSession.text }}
            <span :class="['delta', row.avgSession.tone]">{{ row.avgSession.delta }}</span>
          </td>
          <td class="num">
            {{ row.bounce.text }}
            <span :class="['delta', row.bounce.tone]">{{ row.bounce.delta }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.pages-table { margin: 12px 0 8px; }
.legend {
  display: flex; gap: 28px; flex-wrap: wrap;
  margin-bottom: 18px;
  font-family: 'Fira Code', monospace;
  font-size: 11px; color: var(--ink-faint);
  letter-spacing: 0.10em; text-transform: uppercase;
}
.legend b { color: var(--ink-mid); font-weight: 500; }
.legend .hint { color: var(--ink-faint); font-style: italic; text-transform: none; letter-spacing: 0.04em; }

table { width: 100%; border-collapse: collapse; }
thead th {
  font-family: 'Fira Code', monospace;
  font-size: 10.5px; font-weight: 500;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--ink-faint);
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  text-align: right;
}
thead th.left { text-align: left; }
thead th.clickable { cursor: pointer; user-select: none; }
thead th.clickable:hover { color: var(--ink-mid); }

tbody td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-soft);
  font-family: 'Fira Code', monospace;
  font-size: 13px;
  color: var(--ink);
  text-align: right;
  vertical-align: baseline;
}
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover td { background: var(--surface); }

td.left { text-align: left; }
.fam {
  display: inline-block; width: 8px; height: 8px;
  border-radius: 999px; margin-right: 12px;
  vertical-align: middle;
}
.path {
  font-family: 'Fira Code', monospace; font-weight: 500;
  color: var(--ink);
}
.title {
  display: inline-block; margin-left: 14px;
  font-family: 'Noto Serif TC', serif; font-style: italic;
  font-size: 12.5px; color: var(--ink-muted);
}

.delta {
  display: inline-block; min-width: 48px; margin-left: 10px;
  font-size: 11px; font-weight: 500;
  text-align: right;
}
.delta.good { color: var(--success); }
/* below target reads as danger-red, not mild amber, so true outliers
   (+134% bounce, -36% engagement) actually stand out on a scan. */
.delta.bad { color: var(--danger); }
.delta.flat { color: var(--ink-faint); }
</style>

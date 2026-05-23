<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import type { TimeToFirstActionData } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'
import { fmtInt, fmtMs } from '@/components/ga-dashboard/formatters'

const props = defineProps<{ data: TimeToFirstActionData }>()
const leftRef = ref<HTMLDivElement | null>(null)

// --------- RIGHT (Vue template) derived values ---------
const evMax = computed(() =>
  Math.max(...props.data.firstEventDistribution.map((d) => d.count), 1),
)

function barWidth(count: number): string {
  return ((count / evMax.value) * 100).toFixed(1) + '%'
}

function labelColor(eventName: string): string {
  return eventName === 'theme_change' ? C.gold : 'var(--ink)'
}

// --------- LEFT (D3 SVG, ported 1:1) ---------
function renderLeft(w: number) {
  if (!leftRef.value) return
  const lw = w || 640
  const lh = 220
  d3.select(leftRef.value).selectAll('svg').remove()

  const svg = d3.select(leftRef.value).append('svg').attr('width', lw).attr('height', lh)
  const lmargin = { top: 14, right: 90, bottom: 12, left: 56 }
  const linnerW = lw - lmargin.right - lmargin.left
  const maxDuration = 200000
  const xL = d3.scaleLog().domain([1000, maxDuration]).range([0, linnerW]).clamp(true)

  // Speed zone tints — under 30s = good, 30s-2m = warn, >2m = poor
  const zones: Array<{ from?: number; to?: number; color: string }> = [
    { to: 30000, color: C.success },
    { from: 30000, to: 120000, color: C.warning },
    { from: 120000, color: C.danger },
  ]
  zones.forEach((z) => {
    const x1 = lmargin.left + (z.from ? xL(z.from) : 0)
    const x2 = lmargin.left + (z.to ? xL(z.to) : linnerW)
    svg
      .append('rect')
      .attr('x', x1)
      .attr('y', lmargin.top)
      .attr('width', x2 - x1)
      .attr('height', 130)
      .attr('fill', z.color)
      .attr('fill-opacity', 0.06)
  })

  // Bars for p50/p75/p95
  const tiers: Array<{ key: 'p50' | 'p75' | 'p95'; label: string; y: number }> = [
    { key: 'p50', label: 'p50', y: lmargin.top + 22 },
    { key: 'p75', label: 'p75', y: lmargin.top + 60 },
    { key: 'p95', label: 'p95', y: lmargin.top + 98 },
  ]
  tiers.forEach((t) => {
    const ms = props.data.durationMs[t.key]
    const cx = lmargin.left + xL(ms)
    const color = ms < 30000 ? C.success : ms < 120000 ? C.warning : C.danger

    svg
      .append('line')
      .attr('x1', lmargin.left)
      .attr('x2', lmargin.left)
      .attr('y1', t.y - 14)
      .attr('y2', t.y + 14)
      .attr('stroke', C.border)
      .attr('stroke-width', 1)
    svg
      .append('rect')
      .attr('x', lmargin.left)
      .attr('y', t.y - 8)
      .attr('width', 0)
      .attr('height', 16)
      .attr('fill', color)
      .attr('fill-opacity', 0.85)
      .attr('rx', 1)
      .transition()
      .duration(500)
      .attr('width', cx - lmargin.left)

    svg
      .append('text')
      .attr('x', lmargin.left - 12)
      .attr('y', t.y + 4)
      .attr('text-anchor', 'end')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '12px')
      .style('letter-spacing', '0.10em')
      .style('text-transform', 'uppercase')
      .style('fill', C.inkMuted)
      .text(t.label)
    svg
      .append('text')
      .attr('x', cx + 10)
      .attr('y', t.y + 4)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '12px')
      .style('font-weight', 500)
      .style('fill', color)
      .text(fmtMs(ms))
  })
}

useD3Resize(leftRef, renderLeft)
watch(
  () => props.data,
  () => {
    if (leftRef.value) renderLeft(leftRef.value.clientWidth)
  },
)
onMounted(() => {
  if (leftRef.value) renderLeft(leftRef.value.clientWidth || 640)
})
</script>

<template>
  <div class="ttfa">
    <div class="ttfa-grid">
      <!-- LEFT: percentile bars (D3 SVG) -->
      <div class="ttfa-left">
        <div class="eyebrow">
          duration to first non-auto event · {{ fmtInt(data.durationMs.samples) }} samples
        </div>
        <div ref="leftRef" class="ttfa-svg" role="img" aria-label="Duration to first action percentiles" />
      </div>

      <!-- RIGHT: first-event distribution (Vue template) -->
      <div class="ttfa-right">
        <div class="eyebrow">first event distribution · what they reach for</div>

        <div class="ev-list">
          <div v-for="ev in data.firstEventDistribution" :key="ev.eventName" class="ev-row">
            <div
              class="ev-name"
              :style="{
                color: labelColor(ev.eventName),
                fontStyle: ev.eventName === 'theme_change' ? 'italic' : 'normal',
              }"
            >
              {{ ev.eventName }}
            </div>
            <div class="ev-bar">
              <i :style="{ width: barWidth(ev.count) }"></i>
            </div>
            <div class="ev-count">{{ fmtInt(ev.count) }}</div>
            <div class="ev-median">median {{ fmtMs(ev.medianMs) }}</div>
          </div>
        </div>

        <!-- Editorial annotation — the theme_change observation (v2.1 follow-up) -->
        <div class="ev-note">
          <span class="ev-note-lead">An editorial aside —</span>
          <span class="ev-note-body">
            theme_change as the first move (88 users, median 3.1s) suggests the visual identity is
            doing the seducing before the tools do. Worth a follow-up cohort.
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ttfa-grid {
  display: grid;
  grid-template-columns: 1.05fr 1.4fr;
  gap: 60px;
  margin-top: 8px;
}

.ttfa-svg :deep(svg) {
  display: block;
  overflow: visible;
}

.eyebrow {
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin-bottom: 18px;
}

/* RIGHT — event distribution rows */
.ev-row {
  display: grid;
  grid-template-columns: 200px 1fr 80px 100px;
  gap: 16px;
  align-items: center;
  padding: 9px 0;
  border-bottom: 1px solid var(--border-soft);
}

.ev-name {
  font-family: 'Fira Code', monospace;
  font-size: 12px;
}

.ev-bar {
  position: relative;
  height: 14px;
  background: var(--surface);
  border-radius: 1px;
}

.ev-bar i {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  display: block;
  background: v-bind('C.gold');
  opacity: 0.55;
}

.ev-count {
  text-align: right;
  font-family: 'Fira Code', monospace;
  font-size: 12px;
  color: var(--ink);
}

.ev-median {
  text-align: right;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: var(--ink-muted);
}

/* Editorial note */
.ev-note {
  margin-top: 18px;
  padding: 12px 0 0;
  border-top: 1px solid var(--border-soft);
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 15px;
  line-height: 1.55;
  color: var(--ink-mid);
  max-width: 60ch;
}

.ev-note-lead {
  color: v-bind('C.gold');
}

.ev-note-body {
  color: var(--ink-muted);
}
</style>

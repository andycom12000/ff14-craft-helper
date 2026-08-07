<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import type { FailureRow } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'

const props = defineProps<{ data: FailureRow[] }>()
const root = ref<HTMLDivElement | null>(null)

const fmt = (n: number) => n.toLocaleString('en-US')

const colorFor = (event: 'solver' | 'batch' | 'wasm') => ({
  solver: C.cocoa, batch: C.strawberry, wasm: C.matcha,
}[event])

// #211 — cost-mode dimension added to the batch reasons. `calc_mode`'s two
// real values ('macro' | 'quick-buy') get their own colors, distinct from
// the event-type colors above; raw enum values are used as labels verbatim
// (no invented Chinese translation — same convention ExpertCollectableMatrix.vue
// uses for craft_kind).
const costModeColor = (mode: 'macro' | 'quick-buy') => (mode === 'macro' ? C.gold : C.blueberry)
// Fira Code is monospace, so a fixed per-character width lets the breakdown
// segments below lay out left-to-right without a getBBox() measurement
// round-trip (the chart already re-renders on every resize).
const CHAR_W = 6.3

function render(w: number, _h: number) {
  if (!root.value) return
  const el = root.value
  const data = [...props.data].sort((a, b) => b.count - a.count)
  // Only batch rows with an attributable calc_mode split need the extra
  // right-hand gutter (#211) — every other window keeps the original 60px.
  const hasCostModeBreakdown = data.some((d) => d.costModeBreakdown?.length)
  const margin = { top: 12, right: hasCostModeBreakdown ? 260 : 60, bottom: 12, left: 380 }
  const rowH = 32
  const h = margin.top + margin.bottom + data.length * rowH
  // Reason text lives in the 80px..margin.left gutter; long zh reasons used to
  // run into the bar. Truncate to fit and expose the full string on hover.
  const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

  d3.select(el).selectAll('svg').remove()

  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h)
  const innerW = w - margin.left - margin.right
  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.count) ?? 0])
    .range([0, innerW])

  // event tag + reason label
  data.forEach((d, i) => {
    const y = margin.top + i * rowH + rowH / 2
    svg.append('rect')
      .attr('x', 8).attr('y', y - 9).attr('width', 60).attr('height', 18)
      .attr('rx', 3).attr('fill', colorFor(d.event)).attr('fill-opacity', 0.20)
      .attr('stroke', colorFor(d.event)).attr('stroke-width', 1)
    svg.append('text')
      .attr('x', 38).attr('y', y).attr('dy', 4)
      .attr('text-anchor', 'middle')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '10px')
      .style('letter-spacing', '0.10em')
      .style('text-transform', 'uppercase')
      .style('fill', colorFor(d.event))
      .text(d.event)
    svg.append('text')
      .attr('x', 80).attr('y', y).attr('dy', 4)
      .style('font-family', "'Noto Sans TC', sans-serif")
      .style('font-size', '13px')
      .style('fill', C.ink)
      .text(truncate(d.reason, 22))
      .append('title').text(d.reason)
  })

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  g.selectAll('.bg-row').data(data).join('rect')
    .attr('x', 0).attr('y', (_, i) => i * rowH + 7)
    .attr('width', innerW).attr('height', rowH - 14)
    .attr('fill', C.surface).attr('rx', 2)

  g.selectAll('.bar').data(data).join('rect')
    .attr('x', 0).attr('y', (_, i) => i * rowH + 7)
    .attr('height', rowH - 14).attr('rx', 2)
    .attr('fill', d => colorFor(d.event))
    .attr('fill-opacity', 0.85)
    .attr('width', 0)
    .transition().duration(600).ease(d3.easeCubicOut)
    .attr('width', d => x(d.count))

  g.selectAll('.cnt').data(data).join('text')
    .attr('x', d => x(d.count) + 10)
    .attr('y', (_, i) => i * rowH + rowH / 2)
    .attr('dy', 4)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '13px')
    .style('font-weight', 500)
    .style('fill', C.ink)
    .text(d => fmt(d.count))

  // #211 — cost-mode breakdown, batch rows only. `costModeBreakdown` is
  // undefined (not []) whenever the split isn't attributable (see
  // FailureRow.costModeBreakdown's doc comment) — those rows fall through
  // this filter and keep the plain solid bar unchanged, same as before #211.
  data.forEach((d, i) => {
    if (!d.costModeBreakdown?.length) return
    const y = i * rowH + rowH / 2
    let bx = x(d.count) + 70
    d.costModeBreakdown.forEach((seg, si) => {
      if (si > 0) bx += 8 // gap between segments
      const label = `${seg.costMode} ${fmt(seg.count)}`
      g.append('text')
        .attr('x', bx).attr('y', y).attr('dy', 4)
        .style('font-family', "'Fira Code', monospace")
        .style('font-size', '10.5px')
        .style('font-weight', 500)
        .style('fill', costModeColor(seg.costMode))
        .text(label)
      bx += label.length * CHAR_W
    })
  })
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1068, root.value.clientHeight)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="Top failure reasons by event type" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

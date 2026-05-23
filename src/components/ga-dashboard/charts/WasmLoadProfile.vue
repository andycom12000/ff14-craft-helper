<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import type { PerfProfile } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'
import { fmtInt, fmtPct, fmtMs } from '@/components/ga-dashboard/formatters'

const props = defineProps<{ data: PerfProfile }>()
const root = ref<HTMLDivElement | null>(null)

function render(w: number, _h: number) {
  if (!root.value) return
  const prof = props.data
  const h = 240

  d3.select(root.value).selectAll('svg').remove()

  const svg = d3.select(root.value).append('svg').attr('width', w).attr('height', h)

  const margin = { top: 42, right: 130, bottom: 24, left: 240 }
  const innerW = w - margin.left - margin.right
  const innerH = h - margin.top - margin.bottom
  const maxMs = 2800
  const x = d3.scaleLinear().domain([0, maxMs]).range([0, innerW])

  // Speed-zone bands (good / needs / poor)
  const zones = [
    { from: 0,    to: 500,  color: C.success, label: 'good · <500ms' },
    { from: 500,  to: 1500, color: C.warning, label: 'needs · 500–1500ms' },
    { from: 1500, to: maxMs,color: C.danger,  label: 'poor · >1500ms' },
  ]
  zones.forEach(z => {
    svg.append('rect')
      .attr('x', margin.left + x(z.from))
      .attr('y', margin.top - 14)
      .attr('width', x(z.to - z.from))
      .attr('height', innerH + 24)
      .attr('fill', z.color).attr('fill-opacity', 0.06)
    svg.append('text')
      .attr('x', margin.left + x((z.from + z.to) / 2)).attr('y', margin.top - 18)
      .attr('text-anchor', 'middle')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '9.5px').style('letter-spacing', '0.14em')
      .style('text-transform', 'uppercase').style('fill', z.color).style('fill-opacity', 0.72)
      .text(z.label)
  })

  // Legend (top right) for the two marker shapes
  const legX = margin.left + innerW + 18
  svg.append('circle').attr('cx', legX).attr('cy', margin.top - 18).attr('r', 5)
    .attr('fill', C.gold)
  svg.append('text').attr('x', legX + 12).attr('y', margin.top - 14)
    .style('font-family', "'Noto Sans TC', system-ui, sans-serif")
    .style('font-size', '11px').style('fill', C.inkMuted)
    .text('整體')
  svg.append('path').attr('d', `M${legX-5},${margin.top + 0} L${legX},${margin.top - 5} L${legX+5},${margin.top + 0} L${legX},${margin.top + 5} Z`)
    .attr('fill', 'none').attr('stroke', C.gold).attr('stroke-width', 1.5)
  svg.append('text').attr('x', legX + 12).attr('y', margin.top + 4)
    .style('font-family', "'Noto Sans TC', system-ui, sans-serif")
    .style('font-size', '11px').style('fill', C.inkMuted)
    .text('冷啟動子集')

  const metrics = [
    { key: 'wasmLoadMs', label: 'wasm_load_ms', sub: 'WASM 二進位 fetch + compile' },
    { key: 'workerPoolInitMs', label: 'worker_pool_init_ms', sub: '跨執行緒池建置' },
  ] as const
  const barRowH = 64

  metrics.forEach((m, i) => {
    const overall = prof[m.key]
    const cold = prof.coldStartSubset && prof.coldStartSubset[m.key]
    const y0 = margin.top + i * barRowH + 18

    // Label cluster
    svg.append('text')
      .attr('x', margin.left - 16).attr('y', y0 + 4)
      .attr('text-anchor', 'end')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '12.5px').style('letter-spacing', '0.04em')
      .style('fill', C.ink)
      .text(m.label)
    svg.append('text')
      .attr('x', margin.left - 16).attr('y', y0 + 22)
      .attr('text-anchor', 'end')
      .style('font-family', "'Cormorant Garamond', 'Noto Serif TC', serif")
      .style('font-style', 'italic')
      .style('font-size', '13px').style('fill', C.inkMuted)
      .text(m.sub)

    // Track baseline
    svg.append('line')
      .attr('x1', margin.left).attr('x2', margin.left + innerW)
      .attr('y1', y0 + 8).attr('y2', y0 + 8)
      .attr('stroke', C.borderSoft).attr('stroke-width', 1)

    // ---- Overall p50/p95 (filled dots) ----
    const x50 = margin.left + x(Math.min(overall.p50, maxMs))
    const x95 = margin.left + x(Math.min(overall.p95, maxMs))
    svg.append('line')
      .attr('x1', x50).attr('x2', x95).attr('y1', y0 + 8).attr('y2', y0 + 8)
      .attr('stroke', C.inkMid).attr('stroke-width', 1)
    const p50Color = overall.p50 < 500 ? C.success : overall.p50 < 1500 ? C.warning : C.danger
    const p95Color = overall.p95 < 500 ? C.success : overall.p95 < 1500 ? C.warning : C.danger
    svg.append('circle').attr('cx', x50).attr('cy', y0 + 8).attr('r', 6).attr('fill', p50Color)
    svg.append('circle').attr('cx', x95).attr('cy', y0 + 8).attr('r', 6).attr('fill', p95Color)
    svg.append('text').attr('x', x50).attr('y', y0 - 4).attr('text-anchor', 'middle')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '11px').style('font-weight', 500).style('fill', p50Color)
      .text(`p50 ${fmtMs(overall.p50)}`)
    svg.append('text').attr('x', x95).attr('y', y0 - 4).attr('text-anchor', 'middle')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '11px').style('font-weight', 500).style('fill', p95Color)
      .text(`p95 ${fmtMs(overall.p95)}`)

    // ---- Cold-start subset p50/p95 (hollow diamonds) ----
    if (cold) {
      const cx50 = margin.left + x(Math.min(cold.p50, maxMs))
      const cx95 = margin.left + x(Math.min(cold.p95, maxMs))
      const coldY = y0 + 28
      svg.append('line')
        .attr('x1', cx50).attr('x2', cx95).attr('y1', coldY).attr('y2', coldY)
        .attr('stroke', C.inkFaint).attr('stroke-width', 1).attr('stroke-dasharray', '2,3')
      const c50C = cold.p50 < 500 ? C.success : cold.p50 < 1500 ? C.warning : C.danger
      const c95C = cold.p95 < 500 ? C.success : cold.p95 < 1500 ? C.warning : C.danger
      const diamond = (cx: number, cy: number) =>
        `M${cx-6},${cy} L${cx},${cy-6} L${cx+6},${cy} L${cx},${cy+6} Z`
      svg.append('path').attr('d', diamond(cx50, coldY))
        .attr('fill', 'none').attr('stroke', c50C).attr('stroke-width', 1.5)
      svg.append('path').attr('d', diamond(cx95, coldY))
        .attr('fill', 'none').attr('stroke', c95C).attr('stroke-width', 1.5)
      svg.append('text').attr('x', cx50).attr('y', coldY + 20).attr('text-anchor', 'middle')
        .style('font-family', "'Fira Code', monospace")
        .style('font-size', '10.5px').style('fill', c50C)
        .text(fmtMs(cold.p50))
      svg.append('text').attr('x', cx95).attr('y', coldY + 20).attr('text-anchor', 'middle')
        .style('font-family', "'Fira Code', monospace")
        .style('font-size', '10.5px').style('fill', c95C)
        .text(fmtMs(cold.p95))
    }

    // sample count on right
    svg.append('text')
      .attr('x', margin.left + innerW + 14).attr('y', y0 + 12)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '11px').style('fill', C.inkMuted)
      .text(`${fmtInt(overall.samples)} 樣本`)
  })

  // Cold-start share — single italic note at bottom right
  svg.append('text')
    .attr('x', margin.left + innerW).attr('y', h - 8).attr('text-anchor', 'end')
    .style('font-family', "'Cormorant Garamond', 'Noto Serif TC', serif")
    .style('font-style', 'italic')
    .style('font-size', '14.5px').style('fill', C.gold)
    .html(`冷啟動占 <tspan style="font-family:'Fira Code',monospace;font-weight:500;">${fmtPct(prof.coldStartShare)}</tspan> sessions — 上方虛線即代表這個子集`)
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth || 1400, 240)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1400, 240)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="正式環境 WASM 載入分佈" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

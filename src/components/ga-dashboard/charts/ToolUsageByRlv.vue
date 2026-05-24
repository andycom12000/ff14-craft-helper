<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
import type { ToolUsageRow } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'
import { fmtInt } from '@/components/ga-dashboard/formatters'

const props = defineProps<{ data: ToolUsageRow[] }>()
const root = ref<HTMLDivElement | null>(null)
const { show, move, hide } = useTooltip()

// Per-bar tooltip — only the metric + value, no recipe context.
function metricTip(label: string, value: number, color: string) {
  return `
    <strong style="color:${color};">${label}</strong>
    <div class="row"><span>events</span><span>${fmtInt(value)}</span></div>
  `
}

function render(w: number, _h: number) {
  if (!root.value) return
  const el = root.value
  const data = props.data

  const margin = { top: 56, right: 180, bottom: 12, left: 280 }
  const rowH = 84
  const h = margin.top + margin.bottom + data.length * rowH
  const innerW = w - margin.left - margin.right

  d3.select(el).selectAll('svg').remove()

  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h)

  // Independent max per metric — relative comparison within each tool.
  const maxSim = d3.max(data, d => d.simulatorCount)!
  const maxBat = d3.max(data, d => d.batchTargetCount)!
  const maxBom = d3.max(data, d => d.bomTargetCount)!

  const colSlot = innerW / 3
  const colW = colSlot - 72  // leave 72px gutter for the trailing number

  // Column headers — Chinese, Noto Sans TC 600, jam-jar colours
  const colHeads = [
    { label: '模擬器',    color: C.cocoa,      sub: 'solver_start' },
    { label: '批量最佳化', color: C.blueberry,  sub: 'batch_optimization · target' },
    { label: 'BOM 採購',  color: C.strawberry, sub: 'bom_target_add' },
  ]
  colHeads.forEach((head, i) => {
    const cx = margin.left + i * colSlot + colW / 2
    svg.append('text')
      .attr('x', cx).attr('y', 22).attr('text-anchor', 'middle')
      .style('font-family', "'Noto Sans TC', system-ui, sans-serif")
      .style('font-size', '13px').style('font-weight', 600).style('letter-spacing', '0.10em')
      .style('fill', head.color)
      .text(head.label)
    svg.append('text')
      .attr('x', cx).attr('y', 38).attr('text-anchor', 'middle')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '10px').style('letter-spacing', '0.10em')
      .style('fill', C.inkFaint)
      .text(head.sub)
  })

  data.forEach((row, i) => {
    const y = margin.top + i * rowH + rowH / 2

    // --- Left: RLV bucket label cluster (objective range only)
    svg.append('text')
      .attr('x', 0).attr('y', y - 8)
      .style('font-family', "'Noto Serif TC', serif")
      .style('font-weight', 700).style('font-size', '22px')
      .style('fill', C.ink)
      .text(`RLV ${row.bucket}`)
    svg.append('text')
      .attr('x', 0).attr('y', y + 16)
      .style('font-family', "'Cormorant Garamond', 'Noto Serif TC', serif")
      .style('font-style', 'italic')
      .style('font-size', '14px').style('fill', C.inkMuted)
      .text(`被打開 ${fmtInt(row.selectCount)} 次`)

    // --- Three bars
    const metrics = [
      { v: row.simulatorCount,   max: maxSim, c: C.cocoa,      label: 'solver_start' },
      { v: row.batchTargetCount, max: maxBat, c: C.blueberry,  label: 'batch_optimization' },
      { v: row.bomTargetCount,   max: maxBom, c: C.strawberry, label: 'bom_target_add' },
    ]

    const bh = 18
    metrics.forEach((m, idx) => {
      const bx = margin.left + idx * colSlot
      const sw = (m.v / m.max) * colW

      // bg rail
      svg.append('rect')
        .attr('x', bx).attr('y', y - bh / 2)
        .attr('width', colW).attr('height', bh)
        .attr('fill', C.surface).attr('rx', 1)

      // fill
      svg.append('rect')
        .attr('x', bx).attr('y', y - bh / 2)
        .attr('width', 0).attr('height', bh)
        .attr('fill', m.c).attr('fill-opacity', 0.90)
        .attr('rx', 1)
        .style('cursor', 'pointer')
        .on('mouseenter', (ev: MouseEvent) => show(metricTip(m.label, m.v, m.c), ev))
        .on('mousemove', (ev: MouseEvent) => move(ev))
        .on('mouseleave', hide)
        .transition().duration(500).ease(d3.easeCubicOut)
        .attr('width', sw)

      // numeric value (in 72px gutter)
      svg.append('text')
        .attr('x', bx + colW + 12).attr('y', y + 4)
        .style('font-family', "'Fira Code', monospace")
        .style('font-size', '13px').style('font-weight', 500)
        .style('fill', m.v > 0 ? C.ink : C.inkFaint)
        .text(fmtInt(m.v))
    })

    // --- Right: italic "偏向 X" callout — only when the row actually has data.
    // An all-zero bucket has no dominant tool; a confident verdict there is noise.
    const rowTotal = row.simulatorCount + row.batchTargetCount + row.bomTargetCount
    if (rowTotal > 0) {
      const dom = metrics
        .map((m, i) => ({ idx: i, ratio: m.max > 0 ? m.v / m.max : 0 }))
        .reduce((a, b) => (a.ratio > b.ratio ? a : b)).idx
      const domLabels = ['偏向模擬器', '偏向批量最佳化', '偏向 BOM 採購']
      svg.append('text')
        .attr('x', w - 12).attr('y', y + 5).attr('text-anchor', 'end')
        .style('font-family', "'Cormorant Garamond', 'Noto Serif TC', serif")
        .style('font-style', 'italic').style('font-weight', 500)
        .style('font-size', '17px').style('fill', metrics[dom].c)
        .text(domLabels[dom])
    }

    // --- Row separator
    if (i < data.length - 1) {
      svg.append('line')
        .attr('x1', 0).attr('x2', w)
        .attr('y1', y + 38).attr('y2', y + 38)
        .attr('stroke', C.borderSoft)
    }
  })
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1400, 0)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="工具偏好 · 依配方等級分組" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

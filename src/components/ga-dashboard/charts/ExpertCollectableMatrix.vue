<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import type { TaxonomyCell } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'
import { fmtInt, fmtPct } from '@/components/ga-dashboard/formatters'

const props = defineProps<{ data: TaxonomyCell[] }>()
const root = ref<HTMLDivElement | null>(null)

function render(w: number, _h: number) {
  if (!root.value) return
  const matrix = props.data
  d3.select(root.value).selectAll('svg').remove()

  const h = 420
  const svg = d3.select(root.value).append('svg').attr('width', w).attr('height', h)

  const margin = { top: 56, right: 24, bottom: 24, left: 160 }
  const innerW = w - margin.left - margin.right
  const innerH = h - margin.top - margin.bottom
  const cellGap = 36
  const cellW = (innerW - cellGap) / 2
  const cellH = (innerH - cellGap) / 2
  const maxStarts = d3.max(matrix, d => d.starts) ?? 1

  // Header labels — top of cols
  svg.append('text')
    .attr('x', margin.left + cellW / 2).attr('y', 30)
    .attr('text-anchor', 'middle')
    .style('font-family', "'Noto Sans TC', system-ui, sans-serif")
    .style('font-size', '12.5px').style('font-weight', 600).style('letter-spacing', '0.10em')
    .style('fill', C.inkMuted)
    .text('一般')
  svg.append('text')
    .attr('x', margin.left + cellW + cellGap + cellW / 2).attr('y', 30)
    .attr('text-anchor', 'middle')
    .style('font-family', "'Noto Sans TC', system-ui, sans-serif")
    .style('font-size', '12.5px').style('font-weight', 600).style('letter-spacing', '0.10em')
    .style('fill', C.inkMuted)
    .text('收藏品')

  // Row labels — left of rows
  ;['一般配方', '高難度配方'].forEach((label, i) => {
    svg.append('text')
      .attr('x', margin.left - 18).attr('y', margin.top + i * (cellH + cellGap) + cellH / 2)
      .attr('text-anchor', 'end')
      .style('font-family', "'Noto Sans TC', system-ui, sans-serif")
      .style('font-size', '12.5px').style('font-weight', 600).style('letter-spacing', '0.10em')
      .style('fill', C.inkMuted)
      .text(label)
  })

  matrix.forEach(cell => {
    const col = cell.isCollectable ? 1 : 0
    const row = cell.isExpert ? 1 : 0
    const cx = margin.left + col * (cellW + cellGap)
    const cy = margin.top + row * (cellH + cellGap)

    // Background — alpha by starts share (subtle wash, kept dark so
    // the labels & bar values stay legible)
    const alpha = 0.06 + (cell.starts / maxStarts) * 0.18
    svg.append('rect')
      .attr('x', cx).attr('y', cy)
      .attr('width', cellW).attr('height', cellH)
      .attr('fill', C.cocoaDark).attr('fill-opacity', alpha)
      .attr('stroke', C.cocoa).attr('stroke-opacity', 0.4).attr('stroke-width', 1)
    // (no tooltip — all values are surfaced in the cell itself)

    // ----- Cell internal layout (clean vertical rhythm) -----
    const padX = 20

    // Big number (starts)
    svg.append('text')
      .attr('x', cx + padX).attr('y', cy + 50)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '28px').style('font-weight', 500)
      .style('fill', C.ink)
      .text(fmtInt(cell.starts))

    // Below this many starts the rates are noise: a quadrant with 3 starts at
    // "0.0% complete" should not glow danger-red as if it were a real failure.
    const SPARSE = cell.starts < 20
    if (SPARSE) {
      svg.append('text')
        .attr('x', cx + padX).attr('y', cy + 76)
        .style('font-family', "'Cormorant Garamond', 'Noto Serif TC', serif")
        .style('font-style', 'italic').style('font-size', '12.5px')
        .style('fill', C.inkFaint)
        .text('樣本不足 · 比率僅供參考')
    }

    // Two mini bar rows (own band, no overlap with number)
    const barLabelW = 120
    const barTrackX = cx + padX + barLabelW
    const barTrackW = cellW - padX * 2 - barLabelW - 56
    const bands = [
      { y: cy + 104, label: '求解完成率',   rate: cell.completeRate,
        color: SPARSE ? C.inkFaint
             : cell.completeRate >= 0.95 ? C.success
             : cell.completeRate >= 0.85 ? C.warning : C.danger },
      { y: cy + 134, label: '巨集複製率', rate: cell.macroCopyRate,
        color: SPARSE ? C.inkFaint : C.gold },
    ]

    bands.forEach(b => {
      // Label
      svg.append('text')
        .attr('x', cx + padX).attr('y', b.y + 3)
        .style('font-family', "'Noto Sans TC', system-ui, sans-serif")
        .style('font-size', '12.5px').style('font-weight', 500).style('letter-spacing', '0.04em')
        .style('fill', C.inkMuted)
        .text(b.label)
      // Track bg
      svg.append('rect')
        .attr('x', barTrackX).attr('y', b.y - 7)
        .attr('width', barTrackW).attr('height', 12)
        .attr('fill', C.bgDeep).attr('rx', 1)
      // Fill
      svg.append('rect')
        .attr('x', barTrackX).attr('y', b.y - 7)
        .attr('width', 0).attr('height', 12)
        .attr('fill', b.color).attr('fill-opacity', 0.85).attr('rx', 1)
        .transition().duration(500)
        .attr('width', barTrackW * b.rate)
      // Value (right of bar, in dedicated 48px column)
      svg.append('text')
        .attr('x', barTrackX + barTrackW + 10).attr('y', b.y + 3)
        .style('font-family', "'Fira Code', monospace")
        .style('font-size', '12px').style('font-weight', 500)
        .style('fill', b.color)
        .text(fmtPct(b.rate))
    })
  })
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1400, 420)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="高難度 × 收藏品 矩陣" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

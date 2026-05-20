<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import type { HierarchyRectangularNode } from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
import type { PageRow } from '@/types/ga-snapshot'
import { C, pageFamilyColor } from '@/components/ga-dashboard/palette'

const props = defineProps<{ data: PageRow[] }>()
const root = ref<HTMLDivElement | null>(null)
const tip = useTooltip()

const fmt = (n: number) => n.toLocaleString('en-US')
const fmtPct = (n: number) => (n * 100).toFixed(1) + '%'

function render(w: number, _h: number) {
  if (!root.value) return
  const el = root.value
  const h = 420

  d3.select(el).selectAll('svg').remove()

  type TreeDatum = { children?: PageRow[] } | PageRow

  const hierarchy = d3.hierarchy<TreeDatum>({ children: props.data })
    .sum(d => (d as PageRow).views ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

  const treemapRoot = d3.treemap<TreeDatum>()
    .size([w, h])
    .paddingInner(3)
    .round(true)(hierarchy)

  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h)

  const leaves: HierarchyRectangularNode<TreeDatum>[] = treemapRoot.leaves()

  const cell = svg.selectAll('g')
    .data(leaves)
    .join('g')
    .attr('transform', d => `translate(${d.x0},${d.y0})`)

  cell.append('rect')
    .attr('width',  d => d.x1 - d.x0)
    .attr('height', d => d.y1 - d.y0)
    .attr('fill',   d => pageFamilyColor[(d.data as PageRow).family] || C.surface)
    .attr('fill-opacity', 0.18)
    .attr('stroke', d => pageFamilyColor[(d.data as PageRow).family] || C.border)
    .attr('stroke-width', 1)
    .attr('rx', 4)
    .style('cursor', 'pointer')
    .on('mouseenter', function (ev: MouseEvent, d) {
      d3.select(this).attr('fill-opacity', 0.36)
      const row = d.data as PageRow
      tip.show(`
        <strong>${row.title} <span style="color:${C.inkMuted};font-family:'Fira Code',monospace;font-weight:400">${row.path}</span></strong>
        <div class="row"><span>Views</span><span>${fmt(row.views)}</span></div>
        <div class="row"><span>Users</span><span>${fmt(row.users)}</span></div>
        <div class="row"><span>Sessions</span><span>${fmt(row.sessions)}</span></div>
        <div class="row"><span>Engagement</span><span>${fmtPct(row.engagement)}</span></div>
        <div class="row"><span>Avg session</span><span>${row.avgSession.toFixed(1)}s</span></div>
        <span class="tag" style="background:${pageFamilyColor[row.family]};color:${C.bgDeep}">${row.family}</span>
      `, ev)
    })
    .on('mousemove', function (ev: MouseEvent) {
      tip.move(ev)
    })
    .on('mouseleave', function () {
      d3.select(this).attr('fill-opacity', 0.18)
      tip.hide()
    })

  cell.each(function (d: HierarchyRectangularNode<TreeDatum>) {
    const W = d.x1 - d.x0
    const H = d.y1 - d.y0
    if (W < 50 || H < 28) return
    const row = d.data as PageRow
    const g = d3.select(this)
    g.append('text')
      .attr('x', 10).attr('y', 22)
      .attr('class', 'chart-label')
      .attr('fill', C.ink)
      .style('font-family', "'Noto Serif TC', serif")
      .style('font-weight', 600)
      .style('font-size', W > 200 ? '17px' : '14px')
      .text(row.title)
    if (W > 80 && H > 50) {
      g.append('text')
        .attr('x', 10).attr('y', W > 200 ? 42 : 38)
        .attr('class', 'chart-label-mono')
        .attr('fill', C.inkMuted)
        .style('font-size', '11px')
        .text(row.path)
    }
    if (W > 110 && H > 70) {
      g.append('text')
        .attr('x', 10).attr('y', H - 14)
        .attr('class', 'chart-label-mono')
        .attr('fill', pageFamilyColor[row.family])
        .style('font-weight', 500)
        .style('font-size', W > 200 ? '22px' : '14px')
        .text(fmt(row.views) + ' views')
    }
  })
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1068, 420)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="Treemap of pages sized by view count" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

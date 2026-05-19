<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
import type { PageRow, PageFamily } from '@/types/ga-snapshot'

const props = defineProps<{ data: PageRow[] }>()
const root = ref<HTMLDivElement | null>(null)
const tip = useTooltip()

const C = {
  ink:       'oklch(0.94 0.022 82)',
  inkMid:    'oklch(0.80 0.022 75)',
  inkMuted:  'oklch(0.66 0.024 68)',
  inkFaint:  'oklch(0.52 0.028 62)',
  bgDeep:    'oklch(0.14 0.014 60)',
  border:    'oklch(0.42 0.035 60 / 0.36)',
  borderSoft:'oklch(0.42 0.035 60 / 0.18)',
  surface:   'oklch(0.225 0.018 62)',
  gold:      'oklch(0.78 0.15 72)',
  crust:     'oklch(0.66 0.11 50)',
  cocoa:     'oklch(0.66 0.14 40)',
  strawberry:'oklch(0.70 0.18 15)',
  matcha:    'oklch(0.72 0.15 138)',
  blueberry: 'oklch(0.66 0.16 248)',
}

const familyColor: Record<PageFamily, string> = {
  core:    C.gold,
  craft:   C.cocoa,
  gather:  C.matcha,
  company: C.blueberry,
  meta:    'oklch(0.50 0.04 65)',
  market:  C.strawberry,
}

const fmt    = (n: number) => n.toLocaleString('en-US')
const fmtPct = (n: number) => (n * 100).toFixed(1) + '%'

function render(w: number, _h: number) {
  if (!root.value || !props.data.length) return
  const el = root.value
  const h = 420
  const margin = { top: 26, right: 28, bottom: 50, left: 60 }

  d3.select(el).selectAll('svg').remove()

  const innerW = w - margin.left - margin.right
  const innerH = h - margin.top - margin.bottom

  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h)
  const g   = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  const data = props.data

  const maxSession = d3.max(data, d => d.avgSession) ?? 1
  const maxViews   = d3.max(data, d => d.views) ?? 1

  const x = d3.scaleLinear().domain([0, maxSession * 1.1]).range([0, innerW])
  const y = d3.scaleLinear().domain([0.78, 0.95]).range([innerH, 0])
  const r = d3.scaleSqrt().domain([0, maxViews]).range([6, 48])

  // gridlines
  g.append('g')
    .attr('class', 'grid')
    .call(
      d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat('' as never)
    )
    .selectAll('line, path')
    .attr('stroke', C.border)

  g.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0,${innerH})`)
    .call(
      d3.axisBottom(x).ticks(6).tickSize(-innerH).tickFormat('' as never)
    )
    .selectAll('line, path')
    .attr('stroke', C.border)

  // axes
  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d => `${d}s`))
    .selectAll('text')
    .attr('fill', C.inkMuted)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '11px')

  g.append('g')
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${((d as number) * 100).toFixed(0)}%`))
    .selectAll('text')
    .attr('fill', C.inkMuted)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '11px')

  // axis domain lines
  g.selectAll('.domain').attr('stroke', C.border)

  // axis titles
  svg.append('text')
    .attr('x', margin.left + innerW / 2)
    .attr('y', h - 10)
    .attr('text-anchor', 'middle')
    .attr('fill', C.inkFaint)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '11px')
    .style('letter-spacing', '0.08em')
    .text('avg session duration →')

  svg.append('text')
    .attr('transform', `translate(16, ${margin.top + innerH / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .attr('fill', C.inkFaint)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '11px')
    .style('letter-spacing', '0.08em')
    .text('engagement rate →')

  // bubbles
  const bubbles = g.selectAll<SVGGElement, PageRow>('.bub')
    .data(data)
    .join('g')
    .attr('class', 'bub')
    .style('cursor', 'pointer')
    .on('mouseenter', function (ev: MouseEvent, d: PageRow) {
      d3.select(this).select('circle').attr('fill-opacity', 0.55)
      tip.show(`
        <strong>${d.title} <span style="color:${C.inkMuted};font-family:'Fira Code',monospace;font-weight:400">${d.path}</span></strong>
        <div class="row"><span>Views</span><span>${fmt(d.views)}</span></div>
        <div class="row"><span>Avg session</span><span>${d.avgSession.toFixed(1)}s</span></div>
        <div class="row"><span>Engagement</span><span>${fmtPct(d.engagement)}</span></div>
        <div class="row"><span>Bounce</span><span>${fmtPct(d.bounce)}</span></div>
      `, ev)
    })
    .on('mousemove', function (ev: MouseEvent) {
      tip.move(ev)
    })
    .on('mouseleave', function () {
      d3.select(this).select('circle').attr('fill-opacity', 0.30)
      tip.hide()
    })

  bubbles.append('circle')
    .attr('cx', d => x(d.avgSession))
    .attr('cy', d => y(d.engagement))
    .attr('r', 0)
    .attr('fill', d => familyColor[d.family])
    .attr('fill-opacity', 0.30)
    .attr('stroke', d => familyColor[d.family])
    .attr('stroke-width', 1.5)
    .transition()
    .duration(600)
    .ease(d3.easeCubicOut)
    .delay((_, i) => i * 30)
    .attr('r', d => r(d.views))

  bubbles.append('text')
    .attr('x', d => x(d.avgSession))
    .attr('y', d => y(d.engagement) + 4)
    .attr('text-anchor', 'middle')
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '11px')
    .style('font-weight', '500')
    .style('fill', C.ink)
    .style('pointer-events', 'none')
    .text(d => d.path === '/' ? '/' : d.path.replace('/', ''))
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1068, 420)
})
</script>

<template><div ref="root" class="chart" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
.chart :deep(.grid line) { stroke: oklch(0.42 0.035 60 / 0.18); stroke-dasharray: 3 4; }
.chart :deep(.grid path) { stroke: none; }
</style>

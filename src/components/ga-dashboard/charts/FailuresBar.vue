<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import type { FailureRow } from '@/types/ga-snapshot'

const props = defineProps<{ data: FailureRow[] }>()
const root = ref<HTMLDivElement | null>(null)

const C = {
  ink:      'oklch(0.94 0.022 82)',
  inkMid:   'oklch(0.80 0.022 75)',
  inkMuted: 'oklch(0.66 0.024 68)',
  inkFaint: 'oklch(0.52 0.028 62)',
  bgDeep:   'oklch(0.14 0.014 60)',
  border:   'oklch(0.42 0.035 60 / 0.36)',
  borderSoft: 'oklch(0.42 0.035 60 / 0.18)',
  surface:  'oklch(0.225 0.018 62)',
  surface2: 'oklch(0.26 0.022 62)',
  gold:     'oklch(0.78 0.15 72)',
  goldDim:  'oklch(0.78 0.15 72 / 0.30)',
  crust:    'oklch(0.66 0.11 50)',
  cocoa:    'oklch(0.66 0.14 40)',
  cocoaDark:'oklch(0.50 0.13 40)',
  strawberry:'oklch(0.70 0.18 15)',
  matcha:   'oklch(0.72 0.15 138)',
  blueberry:'oklch(0.66 0.16 248)',
  success:  'oklch(0.70 0.16 145)',
  warning:  'oklch(0.74 0.16 60)',
  danger:   'oklch(0.68 0.20 22)',
}

const fmt = (n: number) => n.toLocaleString('en-US')

const colorFor = (event: 'solver' | 'batch' | 'wasm') => ({
  solver: C.cocoa, batch: C.strawberry, wasm: C.matcha,
}[event])

function render(w: number, _h: number) {
  if (!root.value) return
  const el = root.value
  const margin = { top: 12, right: 60, bottom: 12, left: 380 }
  const rowH = 32
  const data = [...props.data].sort((a, b) => b.count - a.count)
  const h = margin.top + margin.bottom + data.length * rowH

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
      .text(d.reason)
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
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1068, root.value.clientHeight)
})
</script>

<template><div ref="root" class="chart" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

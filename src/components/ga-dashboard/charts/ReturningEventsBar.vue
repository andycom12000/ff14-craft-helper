<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
import type { EventRow, EventFamily } from '@/types/ga-snapshot'

const props = defineProps<{ data: EventRow[] }>()
const root = ref<HTMLDivElement | null>(null)
const tip = useTooltip()

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

const familyColor: Record<EventFamily, string> = {
  core: C.gold, craft: C.cocoa, gather: C.matcha, company: C.blueberry,
  meta: 'oklch(0.50 0.04 65)', market: C.strawberry, error: C.danger,
}

const fmt = (n: number) => n.toLocaleString('en-US')

function render(w: number, _h: number) {
  if (!root.value) return
  const el = root.value
  const margin = { top: 12, right: 90, bottom: 12, left: 250 }
  const rowH = 26
  const top = props.data.slice(0, 15)
  const h = margin.top + margin.bottom + top.length * rowH

  d3.select(el).selectAll('svg').remove()

  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h)
  const innerW = w - margin.left - margin.right
  const x = d3.scaleLinear()
    .domain([0, d3.max(top, d => d.count) ?? 0])
    .range([0, innerW])

  top.forEach((d, i) => {
    const y = margin.top + i * rowH + rowH / 2
    svg.append('text')
      .attr('x', margin.left - 14).attr('y', y).attr('dy', 4).attr('text-anchor', 'end')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '11.5px')
      .style('fill', familyColor[d.family] || C.inkMid)
      .text(d.event)
  })

  // bg
  svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
    .selectAll('.bg').data(top).join('rect')
    .attr('y', (_, i) => i * rowH + 4).attr('height', rowH - 8)
    .attr('width', innerW).attr('fill', C.surface).attr('rx', 2)

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
  g.selectAll('.bar').data(top).join('rect')
    .attr('y', (_, i) => i * rowH + 4).attr('height', rowH - 8).attr('rx', 2)
    .attr('width', 0)
    .attr('fill', d => familyColor[d.family] || C.cocoa)
    .attr('fill-opacity', 0.80)
    .style('cursor', 'pointer')
    .on('mouseenter', function (ev: MouseEvent, d) {
      d3.select(this).attr('fill-opacity', 1)
      tip.show(`
        <strong>${d.event}</strong>
        <div class="row"><span>Count</span><span>${fmt(d.count)}</span></div>
        <div class="row"><span>Returning users</span><span>${fmt(d.users)}</span></div>
        <div class="row"><span>Per user</span><span>${(d.count / d.users).toFixed(1)}</span></div>
        <span class="tag" style="background:${familyColor[d.family]};color:${C.bgDeep}">${d.family}</span>
      `, ev)
    })
    .on('mousemove', function (ev: MouseEvent) {
      tip.move(ev)
    })
    .on('mouseleave', function () {
      d3.select(this).attr('fill-opacity', 0.80)
      tip.hide()
    })
    .transition().duration(600).ease(d3.easeCubicOut).delay((_, i) => i * 20)
    .attr('width', d => x(d.count))

  g.selectAll('.cnt').data(top).join('text')
    .attr('x', d => x(d.count) + 8).attr('y', (_, i) => i * rowH + rowH / 2).attr('dy', 4)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '11.5px').style('font-weight', 500)
    .style('fill', C.ink)
    .text(d => fmt(d.count) + `  · ${d.users}u`)
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

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
import type { ChannelRow } from '@/types/ga-snapshot'

const props = defineProps<{ data: ChannelRow[] }>()
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

const fmt = (n: number) => n.toLocaleString('en-US')
const fmtPct = (n: number) => (n * 100).toFixed(1) + '%'

function render(w: number, _h: number) {
  if (!root.value) return
  const el = root.value
  const margin = { top: 18, right: 110, bottom: 24, left: 220 }
  const rowH = 30
  const data = props.data
  const h = margin.top + margin.bottom + data.length * rowH

  d3.select(el).selectAll('svg').remove()

  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h)
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  const innerW = w - margin.left - margin.right
  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.sessions) ?? 0])
    .range([0, innerW])

  // bg rows
  g.selectAll('.bg').data(data).join('rect')
    .attr('class', 'bg')
    .attr('x', 0).attr('y', (_, i) => i * rowH + 4)
    .attr('width', innerW).attr('height', rowH - 8)
    .attr('fill', C.surface).attr('rx', 3)

  // labels (left side)
  svg.selectAll('.lbl').data(data).join('g')
    .attr('transform', (_, i) => `translate(${margin.left - 14}, ${margin.top + i * rowH + rowH / 2})`)
    .each(function (d) {
      const grp = d3.select(this)
      grp.append('text')
        .attr('text-anchor', 'end')
        .attr('dy', -3)
        .style('font-family', "'Noto Sans TC', sans-serif")
        .style('font-size', '12.5px')
        .style('fill', C.inkMid)
        .text(d.channel)
      grp.append('text')
        .attr('text-anchor', 'end')
        .attr('dy', 12)
        .style('font-family', "'Fira Code', monospace")
        .style('font-size', '10.5px')
        .style('fill', C.inkFaint)
        .text(d.source)
    })

  // bars
  const bars = g.selectAll('.bar').data(data).join('rect')
    .attr('class', 'bar')
    .attr('x', 0).attr('y', (_, i) => i * rowH + 4)
    .attr('height', rowH - 8).attr('rx', 3)
    .attr('width', 0)
    .attr('fill', (_d, i) => i === 0 ? C.gold : i < 3 ? C.crust : C.cocoaDark)
    .style('cursor', 'pointer')
    .on('mouseenter', function (ev: MouseEvent, d) {
      d3.select(this).attr('fill', C.gold)
      tip.show(`
        <strong>${d.channel} · <span style="font-family:'Fira Code',monospace;color:${C.inkMid}">${d.source}</span></strong>
        <div class="row"><span>Sessions</span><span>${fmt(d.sessions)}</span></div>
        <div class="row"><span>Users</span><span>${fmt(d.users)}</span></div>
        <div class="row"><span>Engagement</span><span>${fmtPct(d.engagement)}</span></div>
      `, ev)
    })
    .on('mousemove', function (ev: MouseEvent) {
      tip.move(ev)
    })
    .on('mouseleave', function () {
      const d = d3.select(this).datum() as ChannelRow
      const i = data.indexOf(d)
      d3.select(this).attr('fill', i === 0 ? C.gold : i < 3 ? C.crust : C.cocoaDark)
      tip.hide()
    })

  bars.transition().duration(600).ease(d3.easeCubicOut)
    .attr('width', d => x(d.sessions))

  // values right
  g.selectAll('.val').data(data).join('text')
    .attr('class', 'val')
    .attr('x', d => x(d.sessions) + 10)
    .attr('y', (_, i) => i * rowH + rowH / 2)
    .attr('dy', 4)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '12px')
    .style('fill', C.ink)
    .text(d => fmt(d.sessions) + ` · ${d.users}u`)
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

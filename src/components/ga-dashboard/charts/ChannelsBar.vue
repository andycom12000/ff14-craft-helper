<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
import type { ChannelRow } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'

const props = defineProps<{ data: ChannelRow[] }>()
const root = ref<HTMLDivElement | null>(null)
const tip = useTooltip()

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

<template><div ref="root" class="chart" role="img" aria-label="Traffic channels — sessions by source" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

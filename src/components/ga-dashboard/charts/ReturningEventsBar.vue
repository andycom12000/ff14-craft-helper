<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
import { eventLabel } from '@/components/ga-dashboard/event-labels'
import type { EventRow } from '@/types/ga-snapshot'
import { C, eventFamilyColor } from '@/components/ga-dashboard/palette'

const props = defineProps<{ data: EventRow[] }>()
const root = ref<HTMLDivElement | null>(null)
const tip = useTooltip()

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
      .style('font-family', "'Noto Sans TC', sans-serif")
      .style('font-size', '12.5px')
      .style('fill', eventFamilyColor[d.family] || C.inkMid)
      .text(eventLabel(d.event))
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
    .attr('fill', d => eventFamilyColor[d.family] || C.cocoa)
    .attr('fill-opacity', 0.80)
    .style('cursor', 'pointer')
    .on('mouseenter', function (ev: MouseEvent, d) {
      d3.select(this).attr('fill-opacity', 1)
      tip.show(`
        <strong>${eventLabel(d.event)}</strong>
        <div style="color:${C.inkMuted};font-family:'Fira Code',monospace;font-size:11px;margin:2px 0 6px">${d.event}</div>
        <div class="row"><span>Count</span><span>${fmt(d.count)}</span></div>
        <div class="row"><span>Returning users</span><span>${fmt(d.users)}</span></div>
        <div class="row"><span>Per user</span><span>${(d.count / d.users).toFixed(1)}</span></div>
        <span class="tag" style="background:${eventFamilyColor[d.family]};color:${C.bgDeep}">${d.family}</span>
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

<template><div ref="root" class="chart" role="img" aria-label="What returnees do — event counts and unique users" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

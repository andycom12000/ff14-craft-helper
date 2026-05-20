<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
import type { PageRow, ReturningPageRow } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'

const props = defineProps<{ data: { all: PageRow[]; returning: ReturningPageRow[] } }>()
const root = ref<HTMLDivElement | null>(null)
const tip  = useTooltip()

const fmt = (n: number) => n.toLocaleString('en-US')

interface JoinedRow {
  path: string
  title: string
  allViews: number
  returningViews: number
  returningUsers: number
  engagement: number
}

function buildData(): JoinedRow[] {
  return props.data.returning.map(rp => {
    const p = props.data.all.find(pp => pp.path === rp.path)
    return {
      path: rp.path,
      title: p ? p.title : rp.path,
      allViews: p ? p.views : 0,
      returningViews: rp.returningViews,
      returningUsers: rp.returningUsers,
      engagement: rp.engagement,
    }
  })
}

function render(w: number, _h: number) {
  if (!root.value || !props.data.returning.length) return
  const el = root.value

  const margin  = { top: 30, right: 110, bottom: 12, left: 130 }
  const rowH    = 44
  const data    = buildData()
  const h       = data.length * rowH + margin.top + margin.bottom

  d3.select(el).selectAll('svg').remove()

  const svg    = d3.select(el).append('svg').attr('width', w).attr('height', h)
  const innerW = w - margin.left - margin.right

  const maxAllViews = d3.max(data, d => d.allViews) ?? 1
  const x = d3.scaleLinear().domain([0, maxAllViews]).range([0, innerW])

  // header labels
  svg.append('text')
    .attr('x', margin.left)
    .attr('y', 18)
    .attr('fill', C.inkFaint)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '10px')
    .style('letter-spacing', '0.12em')
    .text('ALL USERS')

  svg.append('text')
    .attr('x', margin.left + innerW * 0.5)
    .attr('y', 18)
    .attr('fill', C.cocoa)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '10px')
    .style('letter-spacing', '0.12em')
    .text('RETURNING ONLY')

  data.forEach((d, i) => {
    const y0       = margin.top + i * rowH
    const retRatio = d.allViews > 0 ? d.returningViews / d.allViews : 0
    const allW     = x(d.allViews)
    const retW     = x(d.returningViews)

    // path label
    svg.append('text')
      .attr('x', margin.left - 14)
      .attr('y', y0 + rowH / 2 + 4)
      .attr('text-anchor', 'end')
      .attr('fill', C.ink)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '12px')
      .text(d.path)

    // all-views bar (light crust)
    svg.append('rect')
      .attr('x', margin.left)
      .attr('y', y0 + 8)
      .attr('height', 12)
      .attr('rx', 2)
      .attr('width', 0)
      .attr('fill', C.crust)
      .attr('fill-opacity', 0.40)
      .transition()
      .duration(600)
      .ease(d3.easeCubicOut)
      .attr('width', allW)

    // returning-views bar (dark cocoa, hoverable)
    svg.append('rect')
      .attr('x', margin.left)
      .attr('y', y0 + 24)
      .attr('height', 12)
      .attr('rx', 2)
      .attr('width', 0)
      .attr('fill', C.cocoa)
      .style('cursor', 'pointer')
      .on('mouseenter', function (ev: MouseEvent) {
        tip.show(`
          <strong>${d.title} <span style="color:${C.inkMuted};font-family:'Fira Code',monospace;font-weight:400">${d.path}</span></strong>
          <div class="row"><span>All views</span><span>${fmt(d.allViews)}</span></div>
          <div class="row"><span>Returning views</span><span>${fmt(d.returningViews)}</span></div>
          <div class="row"><span>Returning share</span><span>${(retRatio * 100).toFixed(1)}%</span></div>
        `, ev)
      })
      .on('mousemove', function (ev: MouseEvent) { tip.move(ev) })
      .on('mouseleave', () => tip.hide())
      .transition()
      .duration(600)
      .ease(d3.easeCubicOut)
      .attr('width', retW)

    // all-views count label (right of light bar)
    svg.append('text')
      .attr('x', margin.left + allW + 8)
      .attr('y', y0 + 18)
      .attr('fill', C.inkMuted)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '11px')
      .text(fmt(d.allViews))

    // returning count + share label (right of dark bar)
    svg.append('text')
      .attr('x', margin.left + retW + 8)
      .attr('y', y0 + 34)
      .attr('fill', C.cocoa)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '11px')
      .text(`${fmt(d.returningViews)} · ${(retRatio * 100).toFixed(0)}%`)
  })
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
}, { deep: true })
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1068, 0)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="Page views — all users vs returning users" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
import { fmtInt, fmtPct } from '@/components/ga-dashboard/formatters'
import { C } from '@/components/ga-dashboard/palette'
import type { RlvBucket, CraftKindRow } from '@/types/ga-snapshot'

const props = defineProps<{ data: { rlvHistogram: RlvBucket[], craftKindBreakdown: CraftKindRow[] } }>()

const leftRef = ref<HTMLDivElement | null>(null)
const rightRef = ref<HTMLDivElement | null>(null)

const { show: tipShow, move: tipMove, hide: tipHide } = useTooltip()

// ----- LEFT: RLV histogram (vertical bars, gold)
function renderLeft() {
  const left = leftRef.value
  if (!left) return
  d3.select(left).selectAll('svg').remove()

  const data = props.data.rlvHistogram
  const w = left.clientWidth || 640, h = 280
  const margin = { top: 36, right: 12, bottom: 56, left: 56 }
  const innerW = w - margin.left - margin.right
  const innerH = h - margin.top - margin.bottom
  const x = d3.scaleBand().domain(data.map(d => d.bucket)).range([0, innerW]).padding(0.32)
  const y = d3.scaleLinear().domain([0, (d3.max(data, d => d.events) ?? 0) * 1.10]).range([innerH, 0])

  const svg = d3.select(left).append('svg').attr('width', w).attr('height', h)

  svg.append('text')
    .attr('x', margin.left).attr('y', 18)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '10.5px').style('letter-spacing', '0.20em')
    .style('text-transform', 'uppercase').style('fill', C.inkFaint)
    .text('Recipe level · recipe_select events')

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
  // Axis
  g.append('line').attr('x1', 0).attr('x2', innerW).attr('y1', innerH).attr('y2', innerH)
    .attr('stroke', C.border)

  data.forEach((d) => {
    const bx = x(d.bucket) ?? 0, bw = x.bandwidth()
    const by = y(d.events), bh = innerH - by
    g.append('rect')
      .attr('x', bx).attr('y', innerH)
      .attr('width', bw).attr('height', 0)
      .attr('fill', C.gold).attr('fill-opacity', 0.35)
      .attr('stroke', C.gold).attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('mouseenter', (ev: MouseEvent) => tipShow(`
            <strong>RLV ${d.bucket}</strong>
            <div class="row"><span>recipe_select</span><span>${fmtInt(d.events)}</span></div>
          `, ev))
      .on('mousemove', (ev: MouseEvent) => tipMove(ev))
      .on('mouseleave', tipHide)
      .transition().duration(500)
      .attr('y', by).attr('height', bh)

    g.append('text')
      .attr('x', bx + bw / 2).attr('y', by - 8)
      .attr('text-anchor', 'middle')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '12px').style('fill', C.gold)
      .text(fmtInt(d.events))

    g.append('text')
      .attr('x', bx + bw / 2).attr('y', innerH + 22)
      .attr('text-anchor', 'middle')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '10.5px').style('letter-spacing', '0.10em')
      .style('fill', C.inkMuted)
      .text(d.bucket)
  })

  // Y-axis ticks
  y.ticks(4).forEach(t => {
    if (t === 0) return
    g.append('text')
      .attr('x', -10).attr('y', y(t) + 3).attr('text-anchor', 'end')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '9.5px').style('letter-spacing', '0.08em')
      .style('fill', C.inkFaint)
      .text(t >= 1000 ? (t / 1000) + 'k' : t)
  })
}

// ----- RIGHT: craft_kind complete rate
function renderRight() {
  const right = rightRef.value
  if (!right) return
  d3.select(right).selectAll('svg').remove()

  const data = props.data.craftKindBreakdown
  const w = right.clientWidth || 600, h = 280
  const margin = { top: 36, right: 100, bottom: 16, left: 160 }
  const innerW = w - margin.left - margin.right
  const rowH = 36

  const svg = d3.select(right).append('svg').attr('width', w).attr('height', h)
  svg.append('text')
    .attr('x', margin.left).attr('y', 18)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '10.5px').style('letter-spacing', '0.20em')
    .style('text-transform', 'uppercase').style('fill', C.inkFaint)
    .text('Craft kind · complete rate · weighted by starts')

  const maxStarts = d3.max(data, d => d.starts) ?? 0

  data.forEach((d, i) => {
    const y = margin.top + i * rowH + rowH / 2
    const bh = rowH - 16
    const startsW = (d.starts / maxStarts) * innerW

    // Background rail
    svg.append('rect')
      .attr('x', margin.left).attr('y', y - bh / 2)
      .attr('width', innerW).attr('height', bh)
      .attr('fill', C.surface).attr('rx', 1)

    // Starts bar (cocoa, low opacity, fills proportional to total starts)
    svg.append('rect')
      .attr('x', margin.left).attr('y', y - bh / 2)
      .attr('width', startsW).attr('height', bh)
      .attr('fill', C.cocoa).attr('fill-opacity', 0.18)
      .attr('rx', 1)

    // Complete-rate fill (clipped within starts)
    const completeRateW = startsW * d.completeRate
    const rateColor = d.completeRate >= 0.95 ? C.success
                   : d.completeRate >= 0.85 ? C.warning
                   : C.danger
    svg.append('rect')
      .attr('x', margin.left).attr('y', y - bh / 2)
      .attr('width', 0).attr('height', bh)
      .attr('fill', rateColor).attr('fill-opacity', 0.78)
      .attr('rx', 1)
      .style('cursor', 'pointer')
      .on('mouseenter', (ev: MouseEvent) => tipShow(`
            <strong>${d.kind}</strong>
            <div class="row"><span>Starts</span><span>${fmtInt(d.starts)}</span></div>
            <div class="row"><span>Complete rate</span><span>${fmtPct(d.completeRate)}</span></div>
          `, ev))
      .on('mousemove', (ev: MouseEvent) => tipMove(ev))
      .on('mouseleave', tipHide)
      .transition().duration(500).attr('width', completeRateW)

    // Kind label
    svg.append('text')
      .attr('x', margin.left - 14).attr('y', y + 4)
      .attr('text-anchor', 'end')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '12px').style('letter-spacing', '0.06em')
      .style('fill', C.ink)
      .text(d.kind)

    // Rate value
    svg.append('text')
      .attr('x', margin.left + innerW + 12).attr('y', y - 2)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '12px').style('font-weight', 500)
      .style('fill', rateColor)
      .text(fmtPct(d.completeRate))
    svg.append('text')
      .attr('x', margin.left + innerW + 12).attr('y', y + 12)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '10px').style('letter-spacing', '0.06em')
      .style('fill', C.inkFaint)
      .text(`${fmtInt(d.starts)} starts`)
  })
}

function renderAll() {
  renderLeft()
  renderRight()
}

useD3Resize(leftRef, renderLeft)
useD3Resize(rightRef, renderRight)
watch(() => props.data, renderAll)
onMounted(renderAll)
</script>

<template>
  <div class="chart taxonomy-split" role="img" aria-label="Recipe difficulty histogram and craft kind complete rate">
    <div ref="leftRef" class="tax-col" />
    <div ref="rightRef" class="tax-col" />
  </div>
</template>

<style scoped>
.taxonomy-split {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  gap: 56px;
  margin: 12px 0 8px;
  position: relative;
}
.tax-col { position: relative; }
.chart :deep(svg), .tax-col :deep(svg) { display: block; overflow: visible; }
</style>

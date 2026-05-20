<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
import type { MarketRegionRow } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'

const props = defineProps<{ data: MarketRegionRow[] }>()
const root = ref<HTMLDivElement | null>(null)
const tip = useTooltip()

const fmt = (n: number) => n.toLocaleString('en-US')

// Detect whether any row has cht / intl values
const hasCht = computed(() => props.data.some(d => (d.cht ?? 0) > 0))
const hasIntl = computed(() => props.data.some(d => (d.intl ?? 0) > 0))

function render(w: number, _h: number) {
  if (!root.value) return
  const el = root.value
  const margin = { top: 24, right: 90, bottom: 12, left: 200 }
  const rowH = 32
  const data = props.data
  const h = margin.top + margin.bottom + data.length * rowH

  d3.select(el).selectAll('svg').remove()

  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h)
  const innerW = w - margin.left - margin.right

  const maxVal = d3.max(data, d =>
    (d.notset ?? 0) + (d.unset ?? 0) + (d.cht ?? 0) + (d.intl ?? 0)
  ) ?? 0
  const x = d3.scaleLinear().domain([0, maxVal]).range([0, innerW])

  data.forEach((d, i) => {
    const y = margin.top + i * rowH + 6
    const bh = rowH - 12
    const total = (d.notset ?? 0) + (d.unset ?? 0) + (d.cht ?? 0) + (d.intl ?? 0)

    // event label
    svg.append('text')
      .attr('x', margin.left - 12).attr('y', y + bh / 2 + 4)
      .attr('text-anchor', 'end')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '12px')
      .style('fill', C.ink)
      .text(d.event)

    let cumX = 0

    // notset segment (grey, 0.5 opacity)
    const notsetW = x(d.notset ?? 0)
    svg.append('rect')
      .attr('x', margin.left + cumX).attr('y', y)
      .attr('height', bh).attr('rx', 2)
      .attr('width', 0)
      .attr('fill', C.inkFaint)
      .attr('fill-opacity', 0.5)
      .style('cursor', 'pointer')
      .on('mouseenter', function (ev: MouseEvent) {
        tip.show(`
          <strong>${d.event}</strong>
          <div class="row"><span>(not set)</span><span>${fmt(d.notset ?? 0)}</span></div>
          <div class="row"><span>Share</span><span>${total > 0 ? ((d.notset ?? 0) / total * 100).toFixed(1) : '0.0'}%</span></div>
          <div style="margin-top:6px;color:${C.inkMuted};font-size:11.5px;font-style:italic">historical events · no dim value</div>
        `, ev)
      })
      .on('mousemove', function (ev: MouseEvent) { tip.move(ev) })
      .on('mouseleave', function () { tip.hide() })
      .transition().duration(600).ease(d3.easeCubicOut)
      .attr('width', notsetW)
    cumX += notsetW

    // unset segment (gold)
    const unsetW = x(d.unset ?? 0)
    svg.append('rect')
      .attr('x', margin.left + cumX).attr('y', y)
      .attr('height', bh).attr('rx', 2)
      .attr('width', 0)
      .attr('fill', C.gold)
      .style('cursor', 'pointer')
      .on('mouseenter', function (ev: MouseEvent) {
        tip.show(`
          <strong>${d.event}</strong>
          <div class="row"><span>(unset)</span><span>${fmt(d.unset ?? 0)}</span></div>
          <div class="row"><span>Share</span><span>${total > 0 ? ((d.unset ?? 0) / total * 100).toFixed(1) : '0.0'}%</span></div>
          <div style="margin-top:6px;color:${C.gold};font-size:11.5px;font-style:italic">PR #40 live · pre-onboarding</div>
        `, ev)
      })
      .on('mousemove', function (ev: MouseEvent) { tip.move(ev) })
      .on('mouseleave', function () { tip.hide() })
      .transition().duration(600).ease(d3.easeCubicOut).delay(600)
      .attr('width', unsetW)
    cumX += unsetW

    // cht segment (cocoa)
    if ((d.cht ?? 0) > 0) {
      const chtW = x(d.cht ?? 0)
      svg.append('rect')
        .attr('x', margin.left + cumX).attr('y', y)
        .attr('height', bh).attr('rx', 2)
        .attr('width', 0)
        .attr('fill', C.cocoa)
        .style('cursor', 'pointer')
        .on('mouseenter', function (ev: MouseEvent) {
          tip.show(`
            <strong>${d.event}</strong>
            <div class="row"><span>cht</span><span>${fmt(d.cht ?? 0)}</span></div>
            <div class="row"><span>Share</span><span>${total > 0 ? ((d.cht ?? 0) / total * 100).toFixed(1) : '0.0'}%</span></div>
          `, ev)
        })
        .on('mousemove', function (ev: MouseEvent) { tip.move(ev) })
        .on('mouseleave', function () { tip.hide() })
        .transition().duration(600).ease(d3.easeCubicOut).delay(1200)
        .attr('width', chtW)
      cumX += chtW
    }

    // intl segment (success/green)
    if ((d.intl ?? 0) > 0) {
      const intlW = x(d.intl ?? 0)
      svg.append('rect')
        .attr('x', margin.left + cumX).attr('y', y)
        .attr('height', bh).attr('rx', 2)
        .attr('width', 0)
        .attr('fill', C.success)
        .style('cursor', 'pointer')
        .on('mouseenter', function (ev: MouseEvent) {
          tip.show(`
            <strong>${d.event}</strong>
            <div class="row"><span>intl</span><span>${fmt(d.intl ?? 0)}</span></div>
            <div class="row"><span>Share</span><span>${total > 0 ? ((d.intl ?? 0) / total * 100).toFixed(1) : '0.0'}%</span></div>
          `, ev)
        })
        .on('mousemove', function (ev: MouseEvent) { tip.move(ev) })
        .on('mouseleave', function () { tip.hide() })
        .transition().duration(600).ease(d3.easeCubicOut).delay(1200)
        .attr('width', intlW)
    }

    // total annotation right of bar
    svg.append('text')
      .attr('x', margin.left + x(total) + 10).attr('y', y + bh / 2 + 4)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '11.5px')
      .style('fill', C.ink)
      .text(fmt(total))
  })

  // top legend
  const lg = svg.append('g').attr('transform', `translate(${margin.left + 8}, 4)`)

  // notset swatch
  lg.append('rect').attr('width', 12).attr('height', 12).attr('y', -2)
    .attr('fill', C.inkFaint).attr('fill-opacity', 0.5).attr('rx', 2)
  lg.append('text').attr('x', 18).attr('y', 8)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '10.5px')
    .style('letter-spacing', '0.14em')
    .style('fill', C.inkFaint)
    .text('(NOT SET) · historical')

  // unset swatch
  lg.append('rect').attr('width', 12).attr('height', 12).attr('x', 200).attr('y', -2)
    .attr('fill', C.gold).attr('rx', 2)
  lg.append('text').attr('x', 218).attr('y', 8)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '10.5px')
    .style('letter-spacing', '0.14em')
    .style('fill', C.gold)
    .text('(UNSET) · PR #40 live')

  // optional cht swatch
  if (hasCht.value) {
    lg.append('rect').attr('width', 12).attr('height', 12).attr('x', 400).attr('y', -2)
      .attr('fill', C.cocoa).attr('rx', 2)
    lg.append('text').attr('x', 418).attr('y', 8)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '10.5px')
      .style('letter-spacing', '0.14em')
      .style('fill', C.cocoa)
      .text('cht')
  }

  // optional intl swatch
  if (hasIntl.value) {
    const intlX = hasCht.value ? 470 : 400
    lg.append('rect').attr('width', 12).attr('height', 12).attr('x', intlX).attr('y', -2)
      .attr('fill', C.success).attr('rx', 2)
    lg.append('text').attr('x', intlX + 18).attr('y', 8)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '10.5px')
      .style('letter-spacing', '0.14em')
      .style('fill', C.success)
      .text('intl')
  }
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1068, root.value.clientHeight)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="Events split by market region" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
import type { VitalRow } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'

const props = defineProps<{ data: VitalRow[] }>()
const root = ref<HTMLDivElement | null>(null)
const tip = useTooltip()

const fmt = (n: number) => n.toLocaleString('en-US')

function render(w: number, _h: number) {
  if (!root.value) return
  const el = root.value
  const margin = { top: 12, right: 80, bottom: 12, left: 80 }
  const rowH = 38
  const data = props.data
  const h = margin.top + margin.bottom + data.length * rowH

  d3.select(el).selectAll('svg').remove()

  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h)
  const innerW = w - margin.left - margin.right

  const max = d3.max(data, d => d.good + d.ni + d.poor) ?? 0
  const x = d3.scaleLinear().domain([0, max]).range([0, innerW])

  data.forEach((d, i) => {
    const y = margin.top + i * rowH + 7
    const bh = rowH - 14
    const total = d.good + d.ni + d.poor

    // metric name label
    svg.append('text')
      .attr('x', margin.left - 12).attr('y', y + bh / 2 + 4)
      .attr('text-anchor', 'end')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '13px')
      .style('font-weight', '500')
      .style('letter-spacing', '0.08em')
      .style('fill', C.ink)
      .text(d.metric)

    const segs = [
      { v: d.good, c: C.success, label: 'good' },
      { v: d.ni,   c: C.warning, label: 'needs-imp' },
      { v: d.poor, c: C.danger,  label: 'poor' },
    ]

    let cumX = 0
    segs.forEach(s => {
      const segW = x(s.v)

      svg.append('rect')
        .attr('x', margin.left + cumX).attr('y', y)
        .attr('height', bh).attr('width', 0)
        .attr('fill', s.c)
        .style('cursor', 'pointer')
        .on('mouseenter', function (ev: MouseEvent) {
          tip.show(`
            <strong>${d.metric} · ${s.label}</strong>
            <div class="row"><span>Count</span><span>${fmt(s.v)}</span></div>
            <div class="row"><span>Share</span><span>${(s.v / total * 100).toFixed(1)}%</span></div>
          `, ev)
        })
        .on('mousemove', function (ev: MouseEvent) { tip.move(ev) })
        .on('mouseleave', function () { tip.hide() })
        .transition().duration(600).ease(d3.easeCubicOut)
        .attr('width', segW)

      if (s.v / max > 0.04) {
        svg.append('text')
          .attr('x', margin.left + cumX + segW / 2).attr('y', y + bh / 2 + 4)
          .attr('text-anchor', 'middle')
          .style('font-family', "'Fira Code', monospace")
          .style('font-size', '10.5px')
          .style('font-weight', '600')
          .style('fill', s.label === 'poor' ? C.ink : C.bgDeep)
          .style('pointer-events', 'none')
          .text(fmt(s.v))
      }

      cumX += segW
    })

    // poor % annotation on the right
    const poorPct = total > 0 ? d.poor / total : 0
    svg.append('text')
      .attr('x', w - margin.right + 12).attr('y', y + bh / 2 + 4)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '11px')
      .style('letter-spacing', '0.04em')
      .style('fill', poorPct > 0.03 ? C.danger : C.inkFaint)
      .text(`poor ${(poorPct * 100).toFixed(1)}%`)
  })
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1068, root.value.clientHeight)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="Web vitals — INP, TTFB, CLS, FCP, LCP good/needs-improvement/poor split" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

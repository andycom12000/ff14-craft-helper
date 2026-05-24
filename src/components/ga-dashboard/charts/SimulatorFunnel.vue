<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import type { SimulatorFunnel } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'

const props = defineProps<{ data: SimulatorFunnel }>()
const root = ref<HTMLDivElement | null>(null)
const fmt = (n: number) => n.toLocaleString('en-US')

function render(w: number, _h: number) {
  if (!root.value) return
  const el = root.value
  const h = 280
  const sim = props.data

  d3.select(el).selectAll('svg').remove()

  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h)

  const labelLeft = 240
  const trapMaxW = w - labelLeft - 180
  const cx = labelLeft + trapMaxW / 2

  // Big trapezoid: entry → macroCopy
  const topY = 30
  const bottomY = 180
  const wTop = trapMaxW * 1.0

  // Visual amplification so 22 (macro count) is visible against 1317 (entry count)
  // Cap the bottom width so it doesn't disappear
  const visualBottomW = Math.max(
    trapMaxW * 0.04,
    Math.min(trapMaxW * (sim.macroCopy.count / sim.entry.count) * 20, trapMaxW * 0.5)
  )

  // Left label — title
  svg.append('text')
    .attr('x', 8).attr('y', 48)
    .attr('class', 'chart-title')
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '11px')
    .style('font-weight', 500)
    .style('letter-spacing', '0.20em')
    .style('text-transform', 'uppercase')
    .style('fill', C.inkMuted)
    .text('SIMULATOR INFERRED FUNNEL')

  svg.append('text')
    .attr('x', 8).attr('y', 82)
    .style('font-family', "'Noto Serif TC', serif")
    .style('font-weight', '600').style('font-size', '17px').style('fill', C.ink)
    .text(sim.entry.label)
  svg.append('text')
    .attr('x', 8).attr('y', 102)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '11px').style('fill', C.inkFaint)
    .text('entries · all users')

  svg.append('text')
    .attr('x', 8).attr('y', 172)
    .style('font-family', "'Noto Serif TC', serif")
    .style('font-weight', '600').style('font-size', '17px').style('fill', C.ink)
    .text(sim.macroCopy.label)
  svg.append('text')
    .attr('x', 8).attr('y', 192)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '11px').style('fill', C.inkFaint)
    .text('endpoint · simulator-exclusive · 寬度非等比')

  // Trapezoid
  svg.append('path')
    .attr('d', `M${cx - wTop/2},${topY} L${cx + wTop/2},${topY} L${cx + visualBottomW/2},${bottomY} L${cx - visualBottomW/2},${bottomY} Z`)
    .attr('fill', C.gold).attr('fill-opacity', 0)
    .attr('stroke', C.gold).attr('stroke-width', 1)
    .transition().duration(600).ease(d3.easeCubicOut)
    .attr('fill-opacity', 0.16)

  // Entry number (top inside)
  svg.append('text')
    .attr('x', cx).attr('y', topY + 36)
    .attr('text-anchor', 'middle')
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '32px').style('font-weight', '600')
    .style('fill', C.ink)
    .text(fmt(sim.entry.count))
  svg.append('text')
    .attr('x', cx).attr('y', topY + 56)
    .attr('text-anchor', 'middle')
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '11px').style('letter-spacing', '0.14em')
    .style('fill', C.inkMuted)
    .text(`page_views · ${sim.entry.users} users`)

  // Macro export number (bottom inside)
  svg.append('text')
    .attr('x', cx).attr('y', bottomY - 24)
    .attr('text-anchor', 'middle')
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '22px').style('font-weight', '600')
    .style('fill', C.danger)
    .text(fmt(sim.macroCopy.count))
  svg.append('text')
    .attr('x', cx).attr('y', bottomY - 8)
    .attr('text-anchor', 'middle')
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '10.5px').style('letter-spacing', '0.14em')
    .style('fill', C.inkMuted)
    .text(`macro exports · ${sim.macroCopy.users} users`)

  // Conversion rates on the right
  const eventConv = (sim.macroCopy.count / sim.entry.count * 100).toFixed(2)
  const userConv  = (sim.macroCopy.users / sim.entry.users * 100).toFixed(2)

  svg.append('text')
    .attr('x', w - 12).attr('y', 60)
    .attr('text-anchor', 'end')
    .style('font-family', "'Cormorant Garamond', serif")
    .style('font-style', 'italic')
    .style('font-size', '14px')
    .style('fill', C.inkMuted)
    .text('event-level')
  svg.append('text')
    .attr('x', w - 12).attr('y', 88)
    .attr('text-anchor', 'end')
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '32px').style('font-weight', '600')
    .style('fill', C.danger)
    .text(eventConv + '%')
  svg.append('text')
    .attr('x', w - 12).attr('y', 148)
    .attr('text-anchor', 'end')
    .style('font-family', "'Cormorant Garamond', serif")
    .style('font-style', 'italic')
    .style('font-size', '14px')
    .style('fill', C.inkMuted)
    .text('user-level')
  svg.append('text')
    .attr('x', w - 12).attr('y', 176)
    .attr('text-anchor', 'end')
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '32px').style('font-weight', '600')
    .style('fill', C.danger)
    .text(userConv + '%')

  // Below — dimmed global context strip
  const ctxY = 230
  svg.append('line')
    .attr('x1', 8).attr('x2', w - 8).attr('y1', ctxY - 18).attr('y2', ctxY - 18)
    .attr('stroke', C.borderSoft)
  svg.append('text')
    .attr('x', 8).attr('y', ctxY)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '10px')
    .style('letter-spacing', '0.14em')
    .style('text-transform', 'uppercase')
    .style('fill', C.inkFaint)
    .text('UNSLICEABLE MID-STEPS · GLOBAL COUNTS · 含批量內部解算，無法依工具切片')

  sim.globalContext.forEach((gc, i) => {
    const gx = labelLeft + i * ((w - labelLeft - 20) / sim.globalContext.length)
    svg.append('text')
      .attr('x', gx).attr('y', ctxY + 22)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '13px').style('font-weight', '500')
      .style('fill', C.inkFaint)
      .text(fmt(gc.count))
    svg.append('text')
      .attr('x', gx).attr('y', ctxY + 38)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '10.5px').style('fill', C.inkFaint)
      .text(gc.label)
  })
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1068, 280)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="Simulator funnel: visit → macro export" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
import type { OnboardingStep } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'
import { fmtInt, fmtPct } from '@/components/ga-dashboard/formatters'

const props = defineProps<{ data: OnboardingStep[] }>()
const root = ref<HTMLDivElement | null>(null)
const { show, move, hide } = useTooltip()

function render(w: number, _h: number) {
  if (!root.value) return
  const steps = props.data

  const h = 260
  const labelStripH = 76 // labels + drop-pct below
  const total = h - labelStripH
  const innerTop = 8
  const innerBottom = total - 8
  const max = d3.max(steps, d => d.users) ?? 1

  d3.select(root.value).selectAll('svg').remove()
  const svg = d3.select(root.value).append('svg').attr('width', w).attr('height', h)

  const padLeft = 56, padRight = 56
  const usable = w - padLeft - padRight
  const stepW = usable / steps.length

  steps.forEach((s, i) => {
    const next = steps[i + 1]
    const xLeft = padLeft + i * stepW
    const xRight = xLeft + stepW - 14 // gap between trapezoids

    const hL = (s.users / max) * (innerBottom - innerTop)
    const hR = next ? (next.users / max) * (innerBottom - innerTop) : hL * 0.78
    const cy = (innerTop + innerBottom) / 2

    // Color tone: first step gold, others cocoa, biggest drop step strawberry
    let fill: string = C.cocoa
    if (i === 0) fill = C.gold
    // Find the max dropFromPrev step index
    const maxDropIdx = steps.reduce((best, st, idx) => st.dropFromPrev > steps[best].dropFromPrev ? idx : best, 0)
    const isBiggestDropExit = i + 1 === maxDropIdx // the segment users LEAVE through
    if (isBiggestDropExit) fill = C.strawberry

    // Trapezoid path: left edge tall, right edge tapers to next step's height
    const path = `
      M${xLeft},${cy - hL/2}
      L${xRight},${cy - hR/2}
      L${xRight},${cy + hR/2}
      L${xLeft},${cy + hL/2} Z
    `

    const baseOp = isBiggestDropExit ? 0.55 : 0.28
    svg.append('path')
      .attr('d', path)
      .attr('fill', fill).attr('fill-opacity', 0)
      .attr('stroke', fill).attr('stroke-width', isBiggestDropExit ? 1.5 : 1)
      .style('cursor', 'pointer')
      .on('mouseenter', function (ev: MouseEvent) {
        d3.select(this).attr('fill-opacity', Math.min(0.75, baseOp + 0.2))
        show(`
          <strong>${s.step}</strong>
          <div class="row"><span>Users</span><span>${fmtInt(s.users)}</span></div>
          <div class="row"><span>Events</span><span>${fmtInt(s.eventCount)}</span></div>
          ${i > 0 ? `<div class="row"><span>Drop from prev</span><span>${fmtPct(s.dropFromPrev)}</span></div>` : ''}
          <div class="row"><span>Conv from start</span><span>${fmtPct(s.users / steps[0].users)}</span></div>
        `, ev)
      })
      .on('mousemove', function (ev: MouseEvent) { move(ev) })
      .on('mouseleave', function () { d3.select(this).attr('fill-opacity', baseOp); hide() })
      .transition().duration(600).ease(d3.easeCubicOut)
      .attr('fill-opacity', baseOp)

    // Centerline (mid)
    svg.append('line')
      .attr('x1', xLeft).attr('x2', xRight).attr('y1', cy).attr('y2', cy)
      .attr('stroke', fill).attr('stroke-opacity', 0.35).attr('stroke-width', 0.5)

    // Step name (above)
    svg.append('text')
      .attr('x', xLeft + stepW / 2).attr('y', cy - hL/2 - 14)
      .attr('text-anchor', 'middle')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '11px').style('letter-spacing', '0.16em')
      .style('text-transform', 'uppercase').style('fill', C.inkMuted)
      .text(s.step)

    // Users count (inside, big)
    svg.append('text')
      .attr('x', xLeft + (xRight - xLeft) / 2).attr('y', cy - 2)
      .attr('text-anchor', 'middle')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '20px').style('font-weight', 500)
      .style('fill', C.ink)
      .text(fmtInt(s.users))

    svg.append('text')
      .attr('x', xLeft + (xRight - xLeft) / 2).attr('y', cy + 18)
      .attr('text-anchor', 'middle')
      .style('font-family', "'Cormorant Garamond', serif")
      .style('font-style', 'italic')
      .style('font-size', '13.5px').style('fill', C.inkMuted)
      .text(`${fmtInt(s.eventCount)} events`)

    // Drop % below
    if (i > 0) {
      const isMaxDrop = i === maxDropIdx
      const dropColor = isMaxDrop ? C.strawberry : C.inkFaint
      svg.append('text')
        .attr('x', xLeft - 6).attr('y', h - 36)
        .attr('text-anchor', 'middle')
        .style('font-family', "'Cormorant Garamond', 'Noto Serif TC', serif")
        .style('font-style', 'italic')
        .style('font-size', isMaxDrop ? '18px' : '15px').style('font-weight', 500)
        .style('fill', dropColor)
        .text(`− ${fmtPct(s.dropFromPrev)}`)
      svg.append('text')
        .attr('x', xLeft - 6).attr('y', h - 20)
        .attr('text-anchor', 'middle')
        .style('font-family', "'Noto Sans TC', system-ui, sans-serif")
        .style('font-size', '10.5px').style('letter-spacing', '0.10em')
        .style('fill', dropColor)
        .text(isMaxDrop ? '最大流失' : '上一階流失')
    }
  })

  // Baseline rule
  svg.append('line')
    .attr('x1', padLeft - 6).attr('x2', w - padRight + 6)
    .attr('y1', h - labelStripH + 8).attr('y2', h - labelStripH + 8)
    .attr('stroke', C.border).attr('stroke-width', 1)
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1400, 260)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="新手里程碑漏斗" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

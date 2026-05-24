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

// These four milestones are INDEPENDENT first-session localStorage flags, not a
// strict sequential funnel: a user can reach used_batch without ever hitting
// saw_macro, so the counts do not monotonically decrease (e.g. used_batch > the
// "earlier" viewed_recipe). The previous trapezoid funnel lied about that — it
// scaled height to users/max, so the tallest step could land LAST, bulging the
// funnel back outward. Render parallel horizontal bars instead, and mark only
// the least-reached milestone — the honest "where do new visitors stop" signal.
function render(w: number, _h: number) {
  if (!root.value) return
  const steps = props.data
  if (!steps.length) return

  const rowH = 60
  const padTop = 16
  const padBottom = 40
  const h = padTop + steps.length * rowH + padBottom

  d3.select(root.value).selectAll('svg').remove()
  const svg = d3.select(root.value).append('svg').attr('width', w).attr('height', h)

  const labelW = 240
  const trailW = 124
  const barMaxW = Math.max(0, w - labelW - trailW)
  const barH = 22

  // maxUsers is floored at 1 so width math can never divide by zero -> no NaN
  // ever reaches a rect width attribute.
  const maxUsers = Math.max(d3.max(steps, (d) => d.users) ?? 0, 1)
  const hasData = (d3.max(steps, (d) => d.users) ?? 0) > 0
  // Least-reached milestone — the honest bottleneck marker (only when we have data).
  const minIdx = steps.reduce((best, s, i) => (s.users < steps[best].users ? i : best), 0)

  steps.forEach((s, i) => {
    const cy = padTop + i * rowH + rowH / 2
    const isBottleneck = hasData && i === minIdx
    const fill = isBottleneck ? C.strawberry : C.cocoa
    const fillW = (s.users / maxUsers) * barMaxW

    // milestone name (mono, left) + events sub
    svg.append('text')
      .attr('x', 0).attr('y', cy - 6)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '12px').style('letter-spacing', '0.14em')
      .style('text-transform', 'uppercase').style('fill', C.inkMid)
      .text(s.step)
    svg.append('text')
      .attr('x', 0).attr('y', cy + 14)
      .style('font-family', "'Cormorant Garamond', 'Noto Serif TC', serif")
      .style('font-style', 'italic').style('font-size', '13px').style('fill', C.inkMuted)
      .text(`${fmtInt(s.eventCount)} events`)

    // bg rail
    svg.append('rect')
      .attr('x', labelW).attr('y', cy - barH / 2)
      .attr('width', barMaxW).attr('height', barH)
      .attr('fill', C.surface).attr('rx', 1)

    // value fill
    svg.append('rect')
      .attr('x', labelW).attr('y', cy - barH / 2)
      .attr('width', 0).attr('height', barH)
      .attr('fill', fill).attr('fill-opacity', isBottleneck ? 0.92 : 0.82).attr('rx', 1)
      .style('cursor', 'pointer')
      .on('mouseenter', function (ev: MouseEvent) {
        show(`
          <strong>${s.step}</strong>
          <div class="row"><span>Users</span><span>${fmtInt(s.users)}</span></div>
          <div class="row"><span>Events</span><span>${fmtInt(s.eventCount)}</span></div>
          <div class="row"><span>佔最高里程碑</span><span>${fmtPct(s.users / maxUsers)}</span></div>
        `, ev)
      })
      .on('mousemove', (ev: MouseEvent) => move(ev))
      .on('mouseleave', hide)
      .transition().duration(500).ease(d3.easeCubicOut)
      .attr('width', fillW)

    // trailing users count
    svg.append('text')
      .attr('x', labelW + barMaxW + 12).attr('y', cy + 4)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '15px').style('font-weight', 500)
      .style('fill', C.ink)
      .text(fmtInt(s.users))

    // bottleneck marker (second line, never overlaps the bar)
    if (isBottleneck) {
      svg.append('text')
        .attr('x', labelW + barMaxW + 12).attr('y', cy + 20)
        .style('font-family', "'Cormorant Garamond', 'Noto Serif TC', serif")
        .style('font-style', 'italic').style('font-size', '12.5px')
        .style('fill', C.strawberry)
        .text('最少抵達')
    }
  })

  // Honest framing caption — kills the funnel claim outright.
  svg.append('text')
    .attr('x', labelW).attr('y', h - 12)
    .style('font-family', "'Cormorant Garamond', 'Noto Serif TC', serif")
    .style('font-style', 'italic').style('font-size', '13.5px').style('fill', C.inkFaint)
    .text('獨立里程碑，非嚴格漏斗：各計數彼此獨立，不保證逐階遞減')
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1400, 260)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="新手里程碑 · 獨立計數平行條" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

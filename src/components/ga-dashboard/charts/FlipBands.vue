<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
import type { FlipBuckets } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'

const props = defineProps<{ data: { users: FlipBuckets; sessions: FlipBuckets } }>()
const root = ref<HTMLDivElement | null>(null)
const tip = useTooltip()

const fmt = (n: number) => n.toLocaleString('en-US')

function render(w: number, _h: number) {
  if (!root.value) return
  const el = root.value
  const h = 220
  const barH = 60
  const gap = 28
  const labelW = 130
  const totalW = w - labelW - 80

  const flip = props.data
  const sessionsPerReturnee = (flip.sessions.returning / Math.max(flip.users.returning, 1)).toFixed(1)

  d3.select(el).selectAll('svg').remove()

  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h)

  const bands: Array<{ y: number; label: string; data: FlipBuckets }> = [
    { y: 22,              label: 'USERS',    data: flip.users },
    { y: 22 + barH + gap, label: 'SESSIONS', data: flip.sessions },
  ]

  bands.forEach(band => {
    const total = band.data.new + band.data.returning + band.data.other
    const segs = [
      { key: 'new',       v: band.data.new,       c: C.gold,     label: 'NEW',       dark: false },
      { key: 'returning', v: band.data.returning, c: C.cocoa,    label: 'RETURNING', dark: false },
      { key: 'other',     v: band.data.other,     c: C.surface2, label: 'OTHER',     dark: true },
    ]

    // band header label
    svg.append('text')
      .attr('x', labelW - 14).attr('y', band.y + barH / 2 - 4)
      .attr('text-anchor', 'end')
      .style('font-family', "'Noto Sans TC', sans-serif")
      .style('font-size', '13px')
      .style('font-weight', '700')
      .style('letter-spacing', '0.10em')
      .style('fill', C.ink)
      .text(band.label)

    svg.append('text')
      .attr('x', labelW - 14).attr('y', band.y + barH / 2 + 14)
      .attr('text-anchor', 'end')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '10px')
      .style('letter-spacing', '0.10em')
      .style('fill', C.inkFaint)
      .text(`total ${fmt(total)}`)

    let cumX = 0
    segs.forEach(s => {
      const segW = total > 0 ? (s.v / total) * totalW : 0

      const rect = svg.append('rect')
        .attr('x', labelW + cumX).attr('y', band.y)
        .attr('height', barH).attr('width', 0)
        .attr('fill', s.c)
        .style('cursor', 'pointer')
        .on('mouseenter', function (ev: MouseEvent) {
          tip.show(`
            <strong>${band.label} · ${s.label}</strong>
            <div class="row"><span>Count</span><span>${fmt(s.v)}</span></div>
            <div class="row"><span>Share</span><span>${total > 0 ? (s.v / total * 100).toFixed(1) : '0.0'}%</span></div>
          `, ev)
        })
        .on('mousemove', function (ev: MouseEvent) { tip.move(ev) })
        .on('mouseleave', function () { tip.hide() })

      rect.transition().duration(600).ease(d3.easeCubicOut).attr('width', segW)

      if (segW > 80) {
        svg.append('text')
          .attr('x', labelW + cumX + 14).attr('y', band.y + 22)
          .style('font-family', "'Fira Code', monospace")
          .style('font-size', '18px')
          .style('font-weight', '600')
          .style('fill', s.dark ? C.ink : C.bgDeep)
          .style('opacity', '0')
          .style('pointer-events', 'none')
          .text(fmt(s.v))
          .transition().delay(600).duration(300).style('opacity', '1')

        svg.append('text')
          .attr('x', labelW + cumX + 14).attr('y', band.y + 42)
          .style('font-family', "'Fira Code', monospace")
          .style('font-size', '10px')
          .style('letter-spacing', '0.18em')
          .style('fill', s.dark ? C.inkMid : C.bgDeep)
          .style('opacity', '0')
          .style('pointer-events', 'none')
          .text(s.label + ' · ' + (total > 0 ? (s.v / total * 100).toFixed(1) : '0.0') + '%')
          .transition().delay(600).duration(300).style('opacity', '1')
      }

      cumX += segW
    })
  })

  // curved arrow between bands
  const ax  = labelW + totalW * 0.36
  const ay1 = bands[0].y + barH + 4
  const ay2 = bands[1].y - 4
  svg.append('path')
    .attr('d', `M${ax} ${ay1} Q ${ax + 40} ${(ay1 + ay2) / 2} ${ax + 80} ${ay2}`)
    .attr('fill', 'none')
    .attr('stroke', C.gold)
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '3 4')

  // italic caption (dynamic)
  svg.append('text')
    .attr('x', ax + 90).attr('y', (ay1 + ay2) / 2 + 4)
    .style('font-family', "'Cormorant Garamond', serif")
    .style('font-style', 'italic')
    .style('font-size', '14px')
    .style('fill', C.gold)
    .text(`the flip — ${sessionsPerReturnee} sessions per returnee`)
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1068, root.value.clientHeight)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="New vs returning — users and sessions" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

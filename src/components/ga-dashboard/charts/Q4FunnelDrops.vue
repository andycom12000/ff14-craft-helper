<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import type { Q4Funnel } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'

const props = defineProps<{ data: Q4Funnel[] }>()
const root = ref<HTMLDivElement | null>(null)
const fmt = (n: number) => n.toLocaleString('en-US')

function render(w: number, _h: number) {
  if (!root.value) return
  const el = root.value
  const data = props.data
  const rowH = 110
  const h = data.length * rowH + 20

  d3.select(el).selectAll('svg').remove()

  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h)

  // Shared scale by total volume across funnels (use the largest "from")
  const maxFrom = d3.max(data, d => Math.max(d.from, d.to)) ?? 1

  data.forEach((d, i) => {
    const y = i * rowH + 16
    const trapY = y + 14
    const trapH = 60
    const labelLeft = 240
    const trapMaxW = w - labelLeft - 200

    const fill = d.flag === 'danger' ? C.danger
               : d.flag === 'warn'   ? C.warning
               : d.flag === 'noise'  ? C.inkFaint
               : C.success

    const noteColor = d.flag === 'danger' ? C.danger
                    : d.flag === 'warn'   ? C.warning
                    : d.flag === 'noise'  ? C.inkFaint
                    : C.success

    // Left label
    svg.append('text')
      .attr('x', 8).attr('y', y + 26)
      .style('font-family', "'Noto Serif TC', serif")
      .style('font-weight', '600')
      .style('font-size', '16px')
      .style('fill', C.ink)
      .text(d.name)
    svg.append('text')
      .attr('x', 8).attr('y', y + 48)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '11px')
      .style('fill', C.inkFaint)
      .text(d.label)
    svg.append('text')
      .attr('x', 8).attr('y', y + 68)
      .style('font-family', "'Cormorant Garamond', serif")
      .style('font-style', 'italic')
      .style('font-size', '13px')
      .style('fill', noteColor)
      .text(d.note)

    const fromW = (d.from / maxFrom) * trapMaxW
    const toW   = (Math.min(d.to, d.from) / maxFrom) * trapMaxW
    const overshoot = d.to > d.from
    const realToW = (d.to / maxFrom) * trapMaxW

    const x0 = labelLeft

    // Trapezoid
    svg.append('path')
      .attr('d', overshoot
        ? `M${x0},${trapY} L${x0 + fromW},${trapY} L${x0 + realToW},${trapY + trapH} L${x0},${trapY + trapH} Z`
        : `M${x0},${trapY} L${x0 + fromW},${trapY} L${x0 + toW},${trapY + trapH} L${x0},${trapY + trapH} Z`)
      .attr('fill', fill).attr('fill-opacity', 0.18)
      .attr('stroke', fill).attr('stroke-width', 1)

    // From text
    svg.append('text')
      .attr('x', x0 + 10).attr('y', trapY + 16)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '12px').style('font-weight', '500')
      .style('fill', C.ink)
      .text(`${fmt(d.from)} →`)

    // To text
    svg.append('text')
      .attr('x', x0 + 10).attr('y', trapY + trapH - 8)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '12px').style('font-weight', '500')
      .style('fill', C.ink)
      .text(`→ ${fmt(d.to)}`)

    // Rate
    const rate = (d.to / d.from) * 100
    svg.append('text')
      .attr('x', w - 12).attr('y', trapY + trapH / 2 + 4)
      .attr('text-anchor', 'end')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '22px').style('font-weight', '600')
      .style('fill', fill)
      .text(rate.toFixed(1) + '%')
  })
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1068, props.data.length * 110 + 20)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="Q4 page funnel drop rates" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import type { FunnelStep } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'

// `stripeSolver` — 態二(一半可信)局部斜紋：solver 失敗率埋點待修、批量完成率已可信時，只蓋
// 左半「Solver」漏斗,右半「Batch optimisation」照常可讀(spec #194 §E6 / issue #208)。是否要
// 蓋由呼叫端從 flag-derive.ts 的 isMetricUntrusted() 推導,這裡只負責畫。
const props = defineProps<{ data: { solver: FunnelStep[], batch: FunnelStep[] }, stripeSolver?: boolean }>()
const root = ref<HTMLDivElement | null>(null)
const fmt = (n: number) => n.toLocaleString('en-US')

type D3Svg = d3.Selection<SVGSVGElement, unknown, null, undefined>

function drawFunnel(svg: D3Svg, ox: number, oy: number, w: number, h: number, steps: FunnelStep[], title: string) {
  const g = svg.append('g').attr('transform', `translate(${ox},${oy})`)

  // title
  g.append('text')
    .attr('x', 0).attr('y', 20)
    .attr('class', 'chart-title')
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '11px')
    .style('font-weight', 500)
    .style('letter-spacing', '0.20em')
    .style('text-transform', 'uppercase')
    .style('fill', C.inkMuted)
    .text(title)

  const top = 48
  const bottom = h - 20
  const inner = bottom - top
  const stepH = inner / steps.length
  const max = d3.max(steps, d => d.count) ?? 1

  steps.forEach((step, i) => {
    const next = steps[i + 1]
    const wTop    = (step.count / max) * w * 0.86
    const wBottom = next ? (next.count / max) * w * 0.86 : wTop * 0.85
    const y1 = top + i * stepH
    const y2 = top + (i + 1) * stepH - 6
    const cx = w / 2

    const fill = step.tone === 'success' ? C.success
               : step.tone === 'danger'  ? C.danger
               : step.tone === 'warn'    ? C.warning
               : C.crust

    g.append('path')
      .attr('d', `M${cx - wTop/2},${y1} L${cx + wTop/2},${y1} L${cx + wBottom/2},${y2} L${cx - wBottom/2},${y2} Z`)
      .attr('fill', fill).attr('fill-opacity', 0)
      .attr('stroke', fill).attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .transition().duration(600).ease(d3.easeCubicOut)
      .attr('fill-opacity', step.tone === 'neutral' ? 0.18 : 0.30)

    // label inside
    g.append('text')
      .attr('x', cx).attr('y', (y1 + y2) / 2 - 4)
      .attr('text-anchor', 'middle')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '11px')
      .style('letter-spacing', '0.12em')
      .style('text-transform', 'uppercase')
      .style('fill', C.ink)
      .text(step.step)

    g.append('text')
      .attr('x', cx).attr('y', (y1 + y2) / 2 + 14)
      .attr('text-anchor', 'middle')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '14px')
      .style('font-weight', '500')
      .style('fill', C.ink)
      .text(fmt(step.count) + (i > 0 ? `  ·  ${(step.count / steps[0].count * 100).toFixed(1)}%` : ''))
  })
}

function render(w: number, _h: number) {
  if (!root.value) return
  const el = root.value
  const h = 340
  const halfW = (w - 32) / 2

  d3.select(el).selectAll('svg').remove()

  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h)

  drawFunnel(svg, 0, 0, halfW, h, props.data.solver, 'Solver')
  drawFunnel(svg, halfW + 32, 0, halfW, h, props.data.batch, 'Batch optimisation')
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1068, 340)
})
</script>

<template>
  <div class="chart" role="img" aria-label="Solver and batch funnels — entry through completion">
    <div ref="root" />
    <!-- 態二局部斜紋：只蓋左半 Solver 漏斗(solver.failRate 埋點待修),右半 Batch 漏斗
         (batch.completeRate 已可信)照常可讀。左半寬度精確對應 render() 裡的 halfW =
         (w-32)/2,即容器寬度的一半再扣掉一半的 32px 間距。 -->
    <div v-if="stripeSolver" class="stripe-solver" aria-hidden="true" />
  </div>
</template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
.stripe-solver {
  position: absolute;
  top: 0; left: 0;
  width: calc(50% - 16px);
  height: 100%;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    -45deg,
    oklch(0.74 0.16 60 / 0.10) 0 5px,
    transparent 5px 10px
  );
  border-right: 1px dashed oklch(0.74 0.16 60 / 0.6);
}
</style>

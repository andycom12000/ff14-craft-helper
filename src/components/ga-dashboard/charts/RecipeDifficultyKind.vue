<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
import { fmtInt } from '@/components/ga-dashboard/formatters'
import { C } from '@/components/ga-dashboard/palette'
import type { RlvRawBucket } from '@/types/ga-snapshot'
import { aggregateTopRlv } from '@/components/ga-dashboard/rlv-aggregate'

// #209 (spec #194 §C3): 去掉 craft_kind 列（併入 ExpertCollectableMatrix.vue
// 的第三列），raw 化——pipeline 不再分桶,這裡對 raw per-rlv 直方圖做動態
// top-8 + 其他聚合（共用 rlv-aggregate.ts,ToolUsageByRlv.vue 用同一套）。
const props = defineProps<{ data: RlvRawBucket[] }>()

const root = ref<HTMLDivElement | null>(null)
const { show: tipShow, move: tipMove, hide: tipHide } = useTooltip()

const aggregated = computed(() => aggregateTopRlv(props.data, 'events'))

function render(w: number, _h: number) {
  if (!root.value) return
  d3.select(root.value).selectAll('svg').remove()

  const data = aggregated.value
  const h = 280
  const margin = { top: 36, right: 12, bottom: 56, left: 56 }
  const innerW = w - margin.left - margin.right
  const innerH = h - margin.top - margin.bottom
  const x = d3.scaleBand().domain(data.map((d) => String(d.rlv))).range([0, innerW]).padding(0.32)
  // Floor the domain top: an all-zero histogram gives domain [0,0], which makes
  // the linear scale return NaN for every bar (the same class of bug that
  // produced `<rect width=NaN>` elsewhere).
  const maxEvents = d3.max(data, (d) => d.row.events) ?? 0
  const y = d3.scaleLinear().domain([0, maxEvents > 0 ? maxEvents * 1.10 : 1]).range([innerH, 0])

  const svg = d3.select(root.value).append('svg').attr('width', w).attr('height', h)

  svg.append('text')
    .attr('x', margin.left).attr('y', 18)
    .style('font-family', "'Fira Code', monospace")
    .style('font-size', '10.5px').style('letter-spacing', '0.20em')
    .style('text-transform', 'uppercase').style('fill', C.inkFaint)
    .text('Recipe level · recipe_select events · top-8 + 其他')

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
  // Axis
  g.append('line').attr('x1', 0).attr('x2', innerW).attr('y1', innerH).attr('y2', innerH)
    .attr('stroke', C.border)

  data.forEach((d) => {
    const bx = x(String(d.rlv)) ?? 0, bw = x.bandwidth()
    const by = y(d.row.events), bh = innerH - by
    g.append('rect')
      .attr('x', bx).attr('y', innerH)
      .attr('width', bw).attr('height', 0)
      .attr('fill', d.isOther ? C.inkFaint : C.gold).attr('fill-opacity', 0.35)
      .attr('stroke', d.isOther ? C.inkFaint : C.gold).attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('mouseenter', (ev: MouseEvent) => tipShow(`
            <strong>${d.isOther ? d.label : `RLV ${d.label}`}</strong>
            <div class="row"><span>recipe_select</span><span>${fmtInt(d.row.events)}</span></div>
          `, ev))
      .on('mousemove', (ev: MouseEvent) => tipMove(ev))
      .on('mouseleave', tipHide)
      .transition().duration(500)
      .attr('y', by).attr('height', bh)

    g.append('text')
      .attr('x', bx + bw / 2).attr('y', by - 8)
      .attr('text-anchor', 'middle')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '12px').style('fill', d.isOther ? C.inkFaint : C.gold)
      .text(fmtInt(d.row.events))

    g.append('text')
      .attr('x', bx + bw / 2).attr('y', innerH + 22)
      .attr('text-anchor', 'middle')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '10.5px').style('letter-spacing', '0.10em')
      .style('fill', C.inkMuted)
      .text(d.label)
  })

  // Y-axis ticks
  y.ticks(4).forEach((t) => {
    if (t === 0) return
    g.append('text')
      .attr('x', -10).attr('y', y(t) + 3).attr('text-anchor', 'end')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '9.5px').style('letter-spacing', '0.08em')
      .style('fill', C.inkFaint)
      .text(t >= 1000 ? (t / 1000) + 'k' : t)
  })
}

useD3Resize(root, render)
watch(aggregated, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 640, 0)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="配方難度分佈 · RLV 直方圖" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

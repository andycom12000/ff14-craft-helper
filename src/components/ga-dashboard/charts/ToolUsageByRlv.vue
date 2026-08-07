<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import { useTooltip } from '@/composables/useTooltip'
import type { ToolUsageRow } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'
import { fmtInt } from '@/components/ga-dashboard/formatters'
import { aggregateTopRlv } from '@/components/ga-dashboard/rlv-aggregate'

// #209 (spec #194 §C3): raw 化，與 RecipeDifficultyKind.vue 共用同一套
// top-8 + 其他聚合函式（rlv-aggregate.ts）——排序依 selectCount（recipe_select
// 開啟次數），與難度圖用同一個底層事件維度排序。
//
// `noRecipeCount`（#210 決定 2）：bom_target_add 裡完全沒有 recipe_id 的目標
// （純採買 / 公司工房專案）——結構上不可能出現在這張以 RLV 為橫軸的圖上，改用
// 常駐註腳呈現，避免默默消失。`undefined`／`0`／缺席三態見
// `MetricsBundle.toolUsageNoRecipeCount` 的型別註解。
const props = defineProps<{ data: ToolUsageRow[]; noRecipeCount?: number }>()
const root = ref<HTMLDivElement | null>(null)
const { show, move, hide } = useTooltip()

const aggregated = computed(() => aggregateTopRlv(props.data, 'selectCount'))

// Per-bar tooltip — only the metric + value, no recipe context.
function metricTip(label: string, value: number, color: string) {
  return `
    <strong style="color:${color};">${label}</strong>
    <div class="row"><span>events</span><span>${fmtInt(value)}</span></div>
  `
}

function render(w: number, _h: number) {
  if (!root.value) return
  const el = root.value
  const data = aggregated.value

  const margin = { top: 56, right: 180, bottom: 12, left: 280 }
  const rowH = 84
  const h = margin.top + margin.bottom + data.length * rowH
  const innerW = w - margin.left - margin.right

  d3.select(el).selectAll('svg').remove()

  const svg = d3.select(el).append('svg').attr('width', w).attr('height', h)

  // Independent max per metric — relative comparison within each tool.
  const maxSim = d3.max(data, (d) => d.row.simulatorCount) ?? 0
  const maxBat = d3.max(data, (d) => d.row.batchTargetCount) ?? 0
  const maxBom = d3.max(data, (d) => d.row.bomTargetCount) ?? 0

  const colSlot = innerW / 3
  const colW = colSlot - 72  // leave 72px gutter for the trailing number

  // Column headers — Chinese, Noto Sans TC 600, jam-jar colours
  const colHeads = [
    { label: '模擬器',    color: C.cocoa,      sub: 'solver_start' },
    { label: '加入批量',  color: C.blueberry,  sub: 'batch_add_recipe' },
    { label: 'BOM 採購',  color: C.strawberry, sub: 'bom_target_add' },
  ]
  colHeads.forEach((head, i) => {
    const cx = margin.left + i * colSlot + colW / 2
    svg.append('text')
      .attr('x', cx).attr('y', 22).attr('text-anchor', 'middle')
      .style('font-family', "'Noto Sans TC', system-ui, sans-serif")
      .style('font-size', '13px').style('font-weight', 600).style('letter-spacing', '0.10em')
      .style('fill', head.color)
      .text(head.label)
    svg.append('text')
      .attr('x', cx).attr('y', 38).attr('text-anchor', 'middle')
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '10px').style('letter-spacing', '0.10em')
      .style('fill', C.inkFaint)
      .text(head.sub)
  })

  data.forEach((d, i) => {
    const row = d.row
    const y = margin.top + i * rowH + rowH / 2

    // --- Left: RLV label cluster (top-8 raw rlv, or 其他)
    svg.append('text')
      .attr('x', 0).attr('y', y - 8)
      .style('font-family', "'Noto Serif TC', serif")
      .style('font-weight', 700).style('font-size', '22px')
      .style('fill', C.ink)
      .text(d.isOther ? d.label : `RLV ${d.label}`)
    svg.append('text')
      .attr('x', 0).attr('y', y + 16)
      .style('font-family', "'Noto Serif TC', serif")
      .style('font-size', '13px').style('fill', C.inkMuted)
      .text(`被打開 ${fmtInt(row.selectCount)} 次`)

    // --- Three bars
    const metrics = [
      { v: row.simulatorCount,   max: maxSim, c: C.cocoa,      label: 'solver_start' },
      { v: row.batchTargetCount, max: maxBat, c: C.blueberry,  label: 'batch_add_recipe' },
      { v: row.bomTargetCount,   max: maxBom, c: C.strawberry, label: 'bom_target_add' },
    ]

    const bh = 18
    metrics.forEach((m, idx) => {
      const bx = margin.left + idx * colSlot
      // Guard the width: an all-zero column makes d3.max 0, and 0/0 = NaN, which
      // D3 then writes as `<rect width="NaN">` (it fired hundreds of times on
      // sparse windows). Floor the denominator instead.
      const sw = m.max > 0 ? (m.v / m.max) * colW : 0

      // bg rail
      svg.append('rect')
        .attr('x', bx).attr('y', y - bh / 2)
        .attr('width', colW).attr('height', bh)
        .attr('fill', C.surface).attr('rx', 1)

      // fill
      svg.append('rect')
        .attr('x', bx).attr('y', y - bh / 2)
        .attr('width', 0).attr('height', bh)
        .attr('fill', m.c).attr('fill-opacity', 0.90)
        .attr('rx', 1)
        .style('cursor', 'pointer')
        .on('mouseenter', (ev: MouseEvent) => show(metricTip(m.label, m.v, m.c), ev))
        .on('mousemove', (ev: MouseEvent) => move(ev))
        .on('mouseleave', hide)
        .transition().duration(500).ease(d3.easeCubicOut)
        .attr('width', sw)

      // numeric value (in 72px gutter)
      svg.append('text')
        .attr('x', bx + colW + 12).attr('y', y + 4)
        .style('font-family', "'Fira Code', monospace")
        .style('font-size', '13px').style('font-weight', 500)
        .style('fill', m.v > 0 ? C.ink : C.inkFaint)
        .text(fmtInt(m.v))
    })

    // --- Right: "偏向 X" callout — only when the row has enough events to
    // mean something. A verdict drawn from n=1 (one solve in a whole RLV band) is
    // noise dressed as a finding, so gate it behind a minimum sample.
    const MIN_VERDICT_SAMPLE = 8
    const rowTotal = row.simulatorCount + row.batchTargetCount + row.bomTargetCount
    if (rowTotal >= MIN_VERDICT_SAMPLE) {
      const dom = metrics
        .map((m, mi) => ({ idx: mi, ratio: m.max > 0 ? m.v / m.max : 0 }))
        .reduce((a, b) => (a.ratio > b.ratio ? a : b)).idx
      const domLabels = ['偏向模擬器', '偏向加入批量', '偏向 BOM 採購']
      svg.append('text')
        .attr('x', w - 12).attr('y', y + 5).attr('text-anchor', 'end')
        .style('font-family', "'Noto Serif TC', serif")
        .style('font-weight', 600)
        .style('font-size', '15px').style('fill', metrics[dom].c)
        .text(domLabels[dom])
    }

    // --- Row separator
    if (i < data.length - 1) {
      svg.append('line')
        .attr('x1', 0).attr('x2', w)
        .attr('y1', y + 38).attr('y2', y + 38)
        .attr('stroke', C.borderSoft)
    }
  })
}

useD3Resize(root, render)
watch(aggregated, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1400, 0)
})
</script>

<template>
  <div>
    <div ref="root" class="chart" role="img" aria-label="工具偏好 · 依 RLV top-8 分組" />
    <p v-if="props.noRecipeCount" class="footnote">
      另有 {{ fmtInt(props.noRecipeCount) }} 筆非可製作目標（純採買 / 公司工房）未列入，結構上不可交棒。
    </p>
  </div>
</template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
.footnote {
  margin: 4px 0 0;
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 11.5px;
  color: var(--ink-faint);
}
</style>

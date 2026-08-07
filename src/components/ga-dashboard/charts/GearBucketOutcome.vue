<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import type { GearBucketRow } from '@/types/ga-snapshot'
import { C } from '@/components/ga-dashboard/palette'
import { fmtInt, fmtPct } from '@/components/ga-dashboard/formatters'

// 裝備水準 × 求解結果 (#211, spec #194 §C3). Three fixed rows (entry/mid/bis —
// `classifyGearBucket()`, src/utils/gear-bucket.ts), always rendered even when
// a bucket saw zero traffic this window (same "fixed axis, not data-pruned"
// convention as ExpertCollectableMatrix.vue's 2×2 grid). Per-cell band layout
// below is a direct port of that component's cell internals (single column
// instead of a 2×2 grid), so the two charts read the same way.
const props = defineProps<{ data: GearBucketRow[] }>()
const root = ref<HTMLDivElement | null>(null)

const BUCKET_LABEL: Record<string, string> = { entry: 'entry · 入門', mid: 'mid · 中階', bis: 'bis · 頂配' }

// Below this many starts the rates are noise — same threshold and reasoning
// as ExpertCollectableMatrix.vue's SPARSE_THRESHOLD.
const SPARSE_THRESHOLD = 20

// `rate === undefined` (completeRate is unattributable, same contract as
// failRate below) must short-circuit BEFORE the sparse/threshold checks —
// `undefined >= 0.95` is `false`, not an error, so without this guard an
// unattributable rate would silently fall through to C.danger instead of the
// neutral "we don't know" color (#211 review 1).
function completeRateColor(sparse: boolean, rate: number | undefined) {
  if (rate === undefined) return C.inkFaint
  if (sparse) return C.inkFaint
  if (rate >= 0.95) return C.success
  if (rate >= 0.85) return C.warning
  return C.danger
}

// `rate === undefined` means "unattributable" (GearBucketRow.fails/failRate
// doc comment) — NOT "measured zero". Renders "—" with the fill skipped
// entirely, same convention ExpertCollectableMatrix.vue uses for
// macroCopyRate (#209 review 2): a zero-width bar beside a confident number
// would say "measured, and it's zero", the wrong message when the true state
// is "cannot currently tell".
function bandVisual(rate: number | undefined): { widthFraction: number; text: string; unknown: boolean } {
  if (rate === undefined) return { widthFraction: 0, text: '—', unknown: true }
  return { widthFraction: Math.min(1, rate), text: fmtPct(rate), unknown: false }
}

function render(w: number, _h: number) {
  if (!root.value) return
  const data = props.data
  d3.select(root.value).selectAll('svg').remove()

  const cellGap = 20
  const cellH = 128
  const h = data.length * cellH + (data.length - 1) * cellGap
  const svg = d3.select(root.value).append('svg').attr('width', w).attr('height', h)

  const maxStarts = d3.max(data, (d) => d.starts) ?? 1

  data.forEach((d, i) => {
    const cy = i * (cellH + cellGap)
    const SPARSE = d.starts < SPARSE_THRESHOLD

    const alpha = 0.06 + (d.starts / maxStarts) * 0.18
    svg.append('rect')
      .attr('x', 0).attr('y', cy)
      .attr('width', w).attr('height', cellH)
      .attr('fill', C.cocoaDark).attr('fill-opacity', alpha)
      .attr('stroke', C.cocoa).attr('stroke-opacity', 0.4).attr('stroke-width', 1)

    const padX = 20

    // Bucket label
    svg.append('text')
      .attr('x', padX).attr('y', cy + 26)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '11.5px').style('letter-spacing', '0.10em').style('text-transform', 'uppercase')
      .style('fill', C.inkMuted)
      .text(BUCKET_LABEL[d.bucket] ?? d.bucket)

    // Big number (starts)
    svg.append('text')
      .attr('x', padX).attr('y', cy + 58)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '26px').style('font-weight', 500)
      .style('fill', C.ink)
      .text(fmtInt(d.starts))

    if (SPARSE) {
      svg.append('text')
        .attr('x', padX).attr('y', cy + 76)
        .style('font-family', "'Noto Serif TC', serif")
        .style('font-size', '11.5px')
        .style('fill', C.inkFaint)
        .text('樣本不足 · 比率僅供參考')
    }

    // Two band rows — 完成率 / 失敗率 — same right-of-label layout as
    // ExpertCollectableMatrix.vue's per-cell bands.
    const barLabelW = 150
    const barTrackX = padX + barLabelW
    const barTrackW = w - padX * 2 - barLabelW - 56
    const bands = [
      { y: cy + 42, label: '求解完成率', rate: d.completeRate, color: completeRateColor(SPARSE, d.completeRate) },
      { y: cy + 76, label: '失敗率', rate: d.failRate, color: d.failRate === undefined ? C.inkFaint : (SPARSE ? C.inkFaint : C.danger) },
    ]

    bands.forEach((b) => {
      const visual = bandVisual(b.rate)
      svg.append('text')
        .attr('x', barTrackX).attr('y', b.y - 12)
        .style('font-family', "'Noto Sans TC', system-ui, sans-serif")
        .style('font-size', '11.5px').style('font-weight', 500).style('letter-spacing', '0.04em')
        .style('fill', C.inkMuted)
        .text(b.label)
      svg.append('rect')
        .attr('x', barTrackX).attr('y', b.y - 6)
        .attr('width', barTrackW).attr('height', 12)
        .attr('fill', C.bgDeep).attr('rx', 1)
      if (!visual.unknown) {
        svg.append('rect')
          .attr('x', barTrackX).attr('y', b.y - 6)
          .attr('width', 0).attr('height', 12)
          .attr('fill', b.color).attr('fill-opacity', 0.85).attr('rx', 1)
          .transition().duration(500)
          .attr('width', barTrackW * visual.widthFraction)
      }
      svg.append('text')
        .attr('x', barTrackX + barTrackW + 10).attr('y', b.y + 4)
        .style('font-family', "'Fira Code', monospace")
        .style('font-size', '12px').style('font-weight', 500)
        .style('fill', b.color)
        .text(visual.text)
    })
  })
}

useD3Resize(root, render)
watch(() => props.data, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1030, 0)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="裝備水準 × 求解結果" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

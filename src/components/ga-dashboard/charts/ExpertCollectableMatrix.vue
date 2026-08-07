<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { useD3Resize } from '@/composables/useD3Resize'
import type { TaxonomyCell, CraftKindRow } from '@/types/ga-snapshot'
import { C, FLAG_STRIPE_ALPHA } from '@/components/ga-dashboard/palette'
import { fmtInt, fmtPct } from '@/components/ga-dashboard/formatters'

// `stripeMacroBand` — 態二(一半可信)局部斜紋：巨集複製率埋點待修、(cell 內的)完成率無門檻
// 規則覆蓋、視為可信時，只蓋每格裡的「巨集複製率」那一條 bar band，「求解完成率」band 與大數字
// 照常可讀(spec #194 §E6 / issue #208)。是否要蓋由呼叫端從 flag-derive.ts 的
// isMetricUntrusted() 推導,這裡只負責畫——用 SVG rect + dashed line，因為兩列的 y 座標由
// render() 動態算,CSS 疊層猜不到正確位置。
//
// #209 (spec #194 §C3)：把「配方難度分佈」圖砍掉的 craft_kind 完成率併進這張矩陣，當成
// 第三列——矩陣是全 dashboard 唯一帶巨集複製率的資料結構，併入而不是另開一張圖，讓那條
// 待辦入場券（巨集複製率／solver 完成率亮時 → 哪一類配方的巨集沒人複製）繼續有地方回答。
// `stripeMacroBand` 對第三列的巨集複製率 band 套用同一條規則、同一個 boundary 邏輯——呼叫端
// 不需要為第三列另外傳一個旗標。
const props = defineProps<{ data: TaxonomyCell[], craftKindData?: CraftKindRow[], stripeMacroBand?: boolean }>()
const root = ref<HTMLDivElement | null>(null)

// Below this many starts the rates are noise: a quadrant/column with 3 starts
// at "0.0% complete" should not glow danger-red as if it were a real failure.
const SPARSE_THRESHOLD = 20

function completeRateColor(sparse: boolean, rate: number) {
  if (sparse) return C.inkFaint
  if (rate >= 0.95) return C.success
  if (rate >= 0.85) return C.warning
  return C.danger
}

function render(w: number, _h: number) {
  if (!root.value) return
  const matrix = props.data
  const craftKind = props.craftKindData ?? []
  d3.select(root.value).selectAll('svg').remove()

  const gridH = 420
  const kindRowH = 190
  const kindSectionGap = 40 // gap between the 2×2 grid's bottom and the craft_kind header
  const hasKindRow = craftKind.length > 0
  const h = hasKindRow ? gridH + kindSectionGap + kindRowH : gridH
  const svg = d3.select(root.value).append('svg').attr('width', w).attr('height', h)

  if (props.stripeMacroBand) {
    const pattern = svg.append('defs').append('pattern')
      .attr('id', 'flag-stripe-pattern')
      .attr('width', 10).attr('height', 10)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('patternTransform', 'rotate(-45)')
    pattern.append('rect').attr('width', 10).attr('height', 10).attr('fill', 'transparent')
    // alpha 吃 palette.ts 的 FLAG_STRIPE_ALPHA（單一來源，見那裡的註解）——之前這裡寫死 0.14,
    // 跟 chart-sim 的 0.07、chart-funnels 的 0.10 各自漂移，同一種「不可信」語意在三張圖上
    // 讀起來卻是三種強度，違背 spec #194 §E6「兩者都是同一種狀態，差的只有範圍」。
    pattern.append('rect').attr('width', 5).attr('height', 10).attr('fill', C.warning).attr('fill-opacity', FLAG_STRIPE_ALPHA)
  }

  const margin = { top: 56, right: 24, bottom: 24, left: 160 }
  const innerW = w - margin.left - margin.right
  const innerH = gridH - margin.top - margin.bottom
  const cellGap = 36
  const cellW = (innerW - cellGap) / 2
  const cellH = (innerH - cellGap) / 2
  const maxStarts = d3.max(matrix, d => d.starts) ?? 1

  // Header labels — top of cols
  svg.append('text')
    .attr('x', margin.left + cellW / 2).attr('y', 30)
    .attr('text-anchor', 'middle')
    .style('font-family', "'Noto Sans TC', system-ui, sans-serif")
    .style('font-size', '12.5px').style('font-weight', 600).style('letter-spacing', '0.10em')
    .style('fill', C.inkMuted)
    .text('一般')
  svg.append('text')
    .attr('x', margin.left + cellW + cellGap + cellW / 2).attr('y', 30)
    .attr('text-anchor', 'middle')
    .style('font-family', "'Noto Sans TC', system-ui, sans-serif")
    .style('font-size', '12.5px').style('font-weight', 600).style('letter-spacing', '0.10em')
    .style('fill', C.inkMuted)
    .text('收藏品')

  // Row labels — left of rows
  ;['一般配方', '高難度配方'].forEach((label, i) => {
    svg.append('text')
      .attr('x', margin.left - 18).attr('y', margin.top + i * (cellH + cellGap) + cellH / 2)
      .attr('text-anchor', 'end')
      .style('font-family', "'Noto Sans TC', system-ui, sans-serif")
      .style('font-size', '12.5px').style('font-weight', 600).style('letter-spacing', '0.10em')
      .style('fill', C.inkMuted)
      .text(label)
  })

  matrix.forEach(cell => {
    const col = cell.isCollectable ? 1 : 0
    const row = cell.isExpert ? 1 : 0
    const cx = margin.left + col * (cellW + cellGap)
    const cy = margin.top + row * (cellH + cellGap)

    // Background — alpha by starts share (subtle wash, kept dark so
    // the labels & bar values stay legible)
    const alpha = 0.06 + (cell.starts / maxStarts) * 0.18
    svg.append('rect')
      .attr('x', cx).attr('y', cy)
      .attr('width', cellW).attr('height', cellH)
      .attr('fill', C.cocoaDark).attr('fill-opacity', alpha)
      .attr('stroke', C.cocoa).attr('stroke-opacity', 0.4).attr('stroke-width', 1)
    // (no tooltip — all values are surfaced in the cell itself)

    // ----- Cell internal layout (clean vertical rhythm) -----
    const padX = 20

    // Big number (starts)
    svg.append('text')
      .attr('x', cx + padX).attr('y', cy + 50)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '28px').style('font-weight', 500)
      .style('fill', C.ink)
      .text(fmtInt(cell.starts))

    const SPARSE = cell.starts < SPARSE_THRESHOLD
    if (SPARSE) {
      svg.append('text')
        .attr('x', cx + padX).attr('y', cy + 76)
        .style('font-family', "'Noto Serif TC', serif")
        .style('font-size', '12.5px')
        .style('fill', C.inkFaint)
        .text('樣本不足 · 比率僅供參考')
    }

    // Two mini bar rows (own band, no overlap with number)
    const barLabelW = 120
    const barTrackX = cx + padX + barLabelW
    const barTrackW = cellW - padX * 2 - barLabelW - 56
    const bands = [
      { y: cy + 104, label: '求解完成率',   rate: cell.completeRate,
        color: completeRateColor(SPARSE, cell.completeRate) },
      { y: cy + 134, label: '巨集複製率', rate: cell.macroCopyRate,
        color: SPARSE ? C.inkFaint : C.gold },
    ]

    bands.forEach(b => {
      // Label
      svg.append('text')
        .attr('x', cx + padX).attr('y', b.y + 3)
        .style('font-family', "'Noto Sans TC', system-ui, sans-serif")
        .style('font-size', '12.5px').style('font-weight', 500).style('letter-spacing', '0.04em')
        .style('fill', C.inkMuted)
        .text(b.label)
      // Track bg
      svg.append('rect')
        .attr('x', barTrackX).attr('y', b.y - 7)
        .attr('width', barTrackW).attr('height', 12)
        .attr('fill', C.bgDeep).attr('rx', 1)
      // Fill
      svg.append('rect')
        .attr('x', barTrackX).attr('y', b.y - 7)
        .attr('width', 0).attr('height', 12)
        .attr('fill', b.color).attr('fill-opacity', 0.85).attr('rx', 1)
        .transition().duration(500)
        .attr('width', barTrackW * b.rate)
      // Value (right of bar, in dedicated 48px column)
      svg.append('text')
        .attr('x', barTrackX + barTrackW + 10).attr('y', b.y + 3)
        .style('font-family', "'Fira Code', monospace")
        .style('font-size', '12px').style('font-weight', 500)
        .style('fill', b.color)
        .text(fmtPct(b.rate))
    })

    // 態二局部斜紋 — 只蓋這格的「巨集複製率」band(下面那條),「求解完成率」band 與大數字
    // 照常可讀。邊界抓在兩個 band 的 y 中點(104 與 134 的中間),往下蓋到格子底部。
    if (props.stripeMacroBand) {
      const boundaryY = cy + 119
      svg.append('line')
        .attr('x1', cx).attr('x2', cx + cellW)
        .attr('y1', boundaryY).attr('y2', boundaryY)
        .attr('stroke', C.warning).attr('stroke-opacity', 0.6)
        .attr('stroke-width', 1).attr('stroke-dasharray', '4,3')
      svg.append('rect')
        .attr('x', cx).attr('y', boundaryY)
        .attr('width', cellW).attr('height', cy + cellH - boundaryY)
        .attr('fill', 'url(#flag-stripe-pattern)')
        .style('pointer-events', 'none')
    }
  })

  // ----- Third row: craft_kind breakdown (#209) -----
  // Narrower per-cell layout than the 2×2 grid above (up to 5 columns:
  // normal/quick/expert/custom_delivery/company) — labels sit below the
  // number/bars instead of beside them so a ~150px-wide cell still fits.
  if (hasKindRow) {
    const rowTop = gridH + kindSectionGap
    svg.append('text')
      .attr('x', margin.left).attr('y', rowTop)
      .style('font-family', "'Fira Code', monospace")
      .style('font-size', '10.5px').style('letter-spacing', '0.20em')
      .style('text-transform', 'uppercase').style('fill', C.inkFaint)
      .text('依製作類型 · craft_kind')

    const kindTop = rowTop + 20
    const kindH = kindRowH - 20
    const kindGap = 16
    const kindInnerW = innerW
    const kindW = (kindInnerW - (craftKind.length - 1) * kindGap) / craftKind.length
    const maxKindStarts = d3.max(craftKind, d => d.starts) ?? 1

    craftKind.forEach((cell, i) => {
      const cx = margin.left + i * (kindW + kindGap)
      const cy = kindTop
      const SPARSE = cell.starts < SPARSE_THRESHOLD

      const alpha = 0.06 + (cell.starts / maxKindStarts) * 0.18
      svg.append('rect')
        .attr('x', cx).attr('y', cy)
        .attr('width', kindW).attr('height', kindH)
        .attr('fill', C.cocoaDark).attr('fill-opacity', alpha)
        .attr('stroke', C.cocoa).attr('stroke-opacity', 0.4).attr('stroke-width', 1)

      const padX = 14

      // Kind identifier (raw craft_kind enum value, same convention the
      // retired RecipeDifficultyKind.vue right column used — no invented
      // Chinese translation).
      svg.append('text')
        .attr('x', cx + padX).attr('y', cy + 20)
        .style('font-family', "'Fira Code', monospace")
        .style('font-size', '11px').style('letter-spacing', '0.06em')
        .style('fill', C.inkMuted)
        .text(cell.kind)

      // Big number (starts)
      svg.append('text')
        .attr('x', cx + padX).attr('y', cy + 46)
        .style('font-family', "'Fira Code', monospace")
        .style('font-size', '22px').style('font-weight', 500)
        .style('fill', C.ink)
        .text(fmtInt(cell.starts))

      // Sparse note sits BEFORE the bands (not after, like the 2×2 grid cells
      // above) so it never falls inside the stripe boundary drawn below —
      // that boundary only ever covers the macro-copy-rate band.
      if (SPARSE) {
        svg.append('text')
          .attr('x', cx + padX).attr('y', cy + 58)
          .style('font-family', "'Noto Serif TC', serif")
          .style('font-size', '9.5px')
          .style('fill', C.inkFaint)
          .text('樣本不足')
      }

      const trackW = kindW - padX * 2
      const bandDefs = [
        { y: cy + 66, rate: cell.completeRate, color: completeRateColor(SPARSE, cell.completeRate), label: '完成率' },
        { y: cy + 98, rate: cell.macroCopyRate, color: SPARSE ? C.inkFaint : C.gold, label: '巨集複製率' },
      ]
      bandDefs.forEach((b) => {
        svg.append('rect')
          .attr('x', cx + padX).attr('y', b.y)
          .attr('width', trackW).attr('height', 8)
          .attr('fill', C.bgDeep).attr('rx', 1)
        svg.append('rect')
          .attr('x', cx + padX).attr('y', b.y)
          .attr('width', 0).attr('height', 8)
          .attr('fill', b.color).attr('fill-opacity', 0.85).attr('rx', 1)
          .transition().duration(500)
          .attr('width', trackW * b.rate)
        svg.append('text')
          .attr('x', cx + padX).attr('y', b.y + 20)
          .style('font-family', "'Fira Code', monospace")
          .style('font-size', '10.5px').style('font-weight', 500)
          .style('fill', b.color)
          .text(`${b.label} ${fmtPct(b.rate)}`)
      })

      // 態二局部斜紋 — 邊界抓在「求解完成率」數值文字(y=cy+86)與「巨集複製率」
      // 軌道(y=cy+98)中間,與 2×2 網格那半用同一條規則:只蓋「巨集複製率」那條
      // band(含它的數值文字)往下到格子底部,完成率的大數字與文字不受影響。
      if (props.stripeMacroBand) {
        const boundaryY = cy + 92
        svg.append('line')
          .attr('x1', cx).attr('x2', cx + kindW)
          .attr('y1', boundaryY).attr('y2', boundaryY)
          .attr('stroke', C.warning).attr('stroke-opacity', 0.6)
          .attr('stroke-width', 1).attr('stroke-dasharray', '4,3')
        svg.append('rect')
          .attr('x', cx).attr('y', boundaryY)
          .attr('width', kindW).attr('height', cy + kindH - boundaryY)
          .attr('fill', 'url(#flag-stripe-pattern)')
          .style('pointer-events', 'none')
      }
    })
  }
}

useD3Resize(root, render)
watch(() => [props.data, props.craftKindData, props.stripeMacroBand] as const, () => {
  if (root.value) render(root.value.clientWidth, root.value.clientHeight)
})
onMounted(() => {
  if (root.value) render(root.value.clientWidth || 1400, 420)
})
</script>

<template><div ref="root" class="chart" role="img" aria-label="高難度 × 收藏品 × 製作類型 矩陣" /></template>

<style scoped>
.chart { margin: 12px 0 8px; position: relative; }
.chart :deep(svg) { display: block; overflow: visible; }
</style>

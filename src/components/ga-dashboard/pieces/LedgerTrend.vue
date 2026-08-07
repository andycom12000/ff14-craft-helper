<script setup lang="ts">
// src/components/ga-dashboard/pieces/LedgerTrend.vue
//
// 首屏 RegionSplitLedger 的趨勢三件組單一格（issue #207，#184 決定 1「D 組合」）：
// 當期值（門檻上色）+ WoW delta（不顯著留白）+ 7d sparkline（門檻虛線 + p10–p90 帶，斷線不補）。
// 純呈現——所有統計判斷（Wilson CI、WoW 顯著性、band 分位數）都已經在 `region-ledger-trend.ts`
// 算完，這裡只負責把 `TrendCell` 畫出來。
import { computed } from 'vue'
import type { TrendCell } from '../region-ledger-trend'
import { fmtInt, fmtPct } from '../formatters'

const props = defineProps<{ cell: TrendCell }>()

const fmtValue = (v: number | null) => (v === null ? '—' : props.cell.kind === 'count' ? fmtInt(v) : fmtPct(v))

// 觀測層(actionable:false)或埋點待修(trusted:false)一律不上色——#184 決議原文「觀測層指標……
// 不上色、不判定，只留走勢」，同一條視覺規則也適用於 trusted:false(#183 決定 5 的既有精神：
// 不可信的數字不該產生誤導的顏色)。有門檻且可信可判定時才依 `state` 上色，色票同
// `TodoRowLine.vue` 的 `.num.state-*`(fire=danger/clear=success/grey=warning/absent=faint)。
const valueTone = computed(() => {
  const c = props.cell
  if (!c.actionable || !c.trusted) return 'dim'
  return c.state
})

// WoW delta 文案——#184 決定 2:「不顯著就留白(顯示「—」+「波動不顯著」小字),不畫箭頭」。
// `dir` 缺席(觀測層規則)時無法判斷「這個方向是變好還是變壞」,一律用中性樣式,不猜。
const deltaDisplay = computed(() => {
  const w = props.cell.wow
  if (!w) return { text: '—', sub: '', tone: 'flat' as const }
  if (!w.significant) return { text: '—', sub: '波動不顯著', tone: 'flat' as const }
  const magnitude = props.cell.kind === 'count' ? fmtInt(Math.round(Math.abs(w.delta))) : `${Math.abs(w.delta * 100).toFixed(1)}pp`
  const rising = w.delta > 0
  let tone: 'up' | 'down' | 'flat' = 'flat'
  if (props.cell.dir) {
    const better = props.cell.dir === 'low' ? !rising : rising
    tone = better ? 'up' : 'down'
  }
  return { text: `${rising ? '▲ +' : '▼ -'}${magnitude}`, sub: 'vs 前 7 天', tone }
})

// ---------- sparkline SVG ----------
const W = 140
const H = 34
const PAD = 3

const cleanSpark = computed(() => props.cell.spark)
const cleanValues = computed(() => cleanSpark.value.map((p) => p.value).filter((v): v is number => v !== null))

// 門檻虛線只在「有門檻、且可信、可判定」時畫(#184 決定 1 的原型:`th: m.actionable && m.trusted
// ? m.th : null`)——觀測層/埋點待修的規則不該讓一條可能造成誤導的門檻線出現。
const showThreshold = computed(() => props.cell.actionable && props.cell.trusted && props.cell.threshold !== undefined)

const domain = computed(() => {
  const vals = [...cleanValues.value]
  if (props.cell.band) vals.push(props.cell.band[0], props.cell.band[1])
  if (showThreshold.value && props.cell.threshold !== undefined) vals.push(props.cell.threshold)
  if (vals.length === 0) return null
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  return { lo, hi, span: hi - lo || 1 }
})

function yOf(v: number): number {
  const d = domain.value
  if (!d) return H / 2
  return H - PAD - ((v - d.lo) / d.span) * (H - 2 * PAD)
}
function xOf(i: number): number {
  const n = cleanSpark.value.length
  if (n <= 1) return PAD
  return PAD + (i * (W - 2 * PAD)) / (n - 1)
}

// path 在 null 值處斷開(#184 決定 6:「缺值 = 斷線不補」)——每個新的非 null 值段落用 M 起筆,
// 段內接續用 L,遇到 null 就把「筆提起來」,不畫任何連接線(不補零、不內插、不 carry-forward)。
const linePath = computed(() => {
  let d = ''
  let penDown = false
  cleanSpark.value.forEach((p, i) => {
    if (p.value === null) {
      penDown = false
      return
    }
    d += `${penDown ? 'L' : 'M'}${xOf(i).toFixed(1)} ${yOf(p.value).toFixed(1)} `
    penDown = true
  })
  return d
})

const bandRect = computed(() => {
  if (!props.cell.band) return null
  const [lo, hi] = props.cell.band
  return { y: yOf(hi), height: Math.max(1, yOf(lo) - yOf(hi)) }
})

const thresholdY = computed(() => (showThreshold.value && props.cell.threshold !== undefined ? yOf(props.cell.threshold) : null))

const lastPoint = computed(() => {
  const spark = cleanSpark.value
  for (let i = spark.length - 1; i >= 0; i--) {
    if (spark[i].value !== null) return { x: xOf(i), y: yOf(spark[i].value!) }
  }
  return null
})

const lineColor = computed(() => {
  if (valueTone.value === 'fire') return 'var(--danger)'
  if (valueTone.value === 'clear') return 'var(--success)'
  if (valueTone.value === 'grey') return 'var(--warning)'
  return 'var(--ink-faint)'
})
</script>

<template>
  <div class="ledger-trend">
    <div class="lt-head">
      <span class="lt-label">{{ cell.label }}</span>
      <span class="lt-value" :class="`tone-${valueTone}`">{{ fmtValue(cell.current) }}</span>
    </div>
    <div class="lt-delta" :class="`tone-${deltaDisplay.tone}`">
      {{ deltaDisplay.text }}
      <small v-if="deltaDisplay.sub">{{ deltaDisplay.sub }}</small>
    </div>
    <svg class="lt-spark" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" width="100%" :height="H">
      <rect
        v-if="bandRect"
        class="lt-band"
        x="0" :y="bandRect.y" :width="W" :height="bandRect.height"
      />
      <line
        v-if="thresholdY !== null"
        class="lt-threshold"
        x1="0" :x2="W" :y1="thresholdY" :y2="thresholdY"
      />
      <path class="lt-line" :d="linePath" :style="{ stroke: lineColor }" fill="none" />
      <circle v-if="lastPoint" class="lt-dot" :cx="lastPoint.x" :cy="lastPoint.y" r="2.6" :style="{ fill: lineColor }" />
    </svg>
  </div>
</template>

<style scoped>
.ledger-trend {
  display: flex; flex-direction: column; gap: 4px;
  min-width: 132px;
}
.lt-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
}
.lt-label {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 11px; color: var(--ink-faint);
  letter-spacing: 0.02em;
}
.lt-value {
  font-family: 'Fira Code', monospace;
  font-size: 13px; font-weight: 500;
}
.lt-value.tone-fire   { color: var(--danger); }
.lt-value.tone-clear  { color: var(--success); }
.lt-value.tone-grey   { color: var(--warning); }
.lt-value.tone-absent,
.lt-value.tone-dim    { color: var(--ink-faint); }
.lt-delta {
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  color: var(--ink-faint);
  min-height: 13px;
}
.lt-delta small {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  color: var(--ink-faint);
  margin-left: 4px;
}
.lt-delta.tone-up   { color: var(--success); }
.lt-delta.tone-down { color: var(--danger); }
.lt-delta.tone-flat { color: var(--ink-faint); }
.lt-spark {
  display: block;
}
.lt-band {
  fill: oklch(0.42 0.035 60 / 0.28);
}
.lt-threshold {
  stroke: var(--gold);
  stroke-width: 1;
  stroke-dasharray: 3 3;
  opacity: 0.75;
}
.lt-line {
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}
</style>

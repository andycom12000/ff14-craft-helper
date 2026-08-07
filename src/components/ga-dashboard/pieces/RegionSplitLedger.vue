<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GaSnapshot, WindowKey, RegionGlance } from '@/types/ga-snapshot'
import type { RuleTrends, Verdict } from '@/analytics/ga-evaluate'
import { fmtInt, fmtPct } from '../formatters'
import { buildRowTrendCells, type RegionLedgerRowKey, type TrendCell } from '../region-ledger-trend'
import LedgerTrend from './LedgerTrend.vue'

// `verdicts`/`trends7d` 供趨勢三件組使用（issue #207，#184 決定 1/2/5/6）——皆有預設空值，
// 舊呼叫端（既有測試、尚未接上 #207 wiring 的頁面）不傳這兩個 prop 時整份趨勢優雅降級成
// 「當期值找不到 → 缺席 → 呈現層畫 —」，不會拋錯。`verdicts` 刻意接受呼叫端已經算好的
// `evaluate()` 輸出（GaDashboardView.vue 給 TodoLedger 算的那份 `todoVerdicts`，固定 28d bundle +
// `GA_THRESHOLD_RULES`），不在這個元件內部重算一次——同一份判定，本期待辦跟這裡看到的顏色/門檻
// 保證一致（#184 決定 1：「當期值：#183 已定的觸發判定，不變」）。
const props = withDefaults(
  defineProps<{ snapshot: GaSnapshot; window: WindowKey; verdicts?: Verdict[]; trends7d?: RuleTrends }>(),
  { verdicts: () => [], trends7d: () => ({}) },
)

const g = computed(() => props.snapshot.windows[props.window].glance)
const byRegion = computed(() => props.snapshot.windows[props.window].byRegion)

// 趨勢三件組固定讀 28d bundle——不隨 `window`（WindowSelector）變動（#184 決定 5：
// 「7 個樣本算 p10–p90 沒有意義，且 #183 已定待辦固定吃 28d 不受 selector 影響，趨勢跟著變反而
// 不一致」）。這與上面 `g`/`byRegion`（跟著 `window` 切換）刻意是兩份獨立、可能不同步的資料源
// ——這一列本身顯示的總數字仍跟著視窗選擇器切換，趨勢卡片的「當期值」則永遠鎖在 28d。
const bundle28d = computed(() => props.snapshot.windows['28d'])
const trendCells = computed(() => buildRowTrendCells(bundle28d.value, props.trends7d, props.verdicts))

type Mode = 'count' | 'percent'
const STORAGE_KEY = 'ga-region-ledger-mode'

function readMode(): Mode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'count' || v === 'percent') return v
  } catch {
    /* localStorage may be unavailable (private mode / SSR) — fall through */
  }
  return 'count'
}

const displayMode = ref<Mode>(readMode())

function setMode(mode: Mode) {
  displayMode.value = mode
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore persistence failures */
  }
}

type RegionKey = 'cht' | 'intl' | 'unset'
const regions: RegionKey[] = ['cht', 'intl', 'unset']

type RowKey = 'activeUsers' | 'solver' | 'batch' | 'bom' | 'infra'
// Keys that actually exist on ByRegion — 'activeUsers' is deliberately absent
// (#202): market_region is a user-scoped property, so GA dedupes each region
// bucket independently but NOT across buckets. A per-region active-user split
// would double-count anyone whose bucket changed mid-window (unset → cht
// after completing onboarding), and no amount of converting to a percentage
// rescues it — the denominator itself is the double-counted sum. See the
// same note on ByRegion in src/types/ga-snapshot.ts.
type RegionRowKey = 'solver' | 'batch' | 'bom' | 'infra'
interface Row {
  label: string
  key: RowKey
  mode: 'count' | 'pct'
  countTotal: string
  countSub: string
  pctTotal: string
  pctSub: string
  /** false ⟹ this row has no valid per-region split; render a note instead. */
  regionSplit: boolean
}

const rows = computed<Row[]>(() => {
  const gl = g.value
  return [
    {
      label: '活躍使用者',
      key: 'activeUsers',
      mode: 'count',
      countTotal: fmtInt(gl.activeUsers.total),
      countSub: '視窗內合計',
      pctTotal: fmtPct(gl.activeUsers.returningPct),
      pctSub: '回訪占比',
      regionSplit: false,
    },
    {
      label: 'Solver 吞吐',
      key: 'solver',
      mode: 'pct',
      regionSplit: true,
      countTotal: `${fmtInt(gl.solver.starts)} → ${fmtInt(gl.solver.completes)}`,
      countSub: `${fmtInt(gl.solver.fails)} 失敗`,
      pctTotal: fmtPct(gl.solver.completePct),
      pctSub: '完成率',
    },
    {
      label: '批量最佳化',
      key: 'batch',
      mode: 'pct',
      regionSplit: true,
      countTotal: `${fmtInt(gl.batch.starts)} → ${fmtInt(gl.batch.completes)}`,
      countSub: `${fmtInt(gl.batch.fails)} 失敗 · ${fmtInt(gl.batch.cancelled)} 取消`,
      pctTotal: fmtPct(gl.batch.completePct),
      pctSub: '完成率',
    },
    {
      label: 'BOM → 批量轉送',
      key: 'bom',
      mode: 'pct',
      regionSplit: true,
      countTotal: `${fmtInt(gl.bom.calculates)} → ${fmtInt(gl.bom.sentToBatch)}`,
      countSub: '計算 → 推送批量',
      pctTotal: fmtPct(gl.bom.handoffPct),
      pctSub: '轉送率',
    },
    {
      label: '基礎建設警告',
      key: 'infra',
      mode: 'count',
      regionSplit: true,
      countTotal: `${fmtInt(gl.infra.sabUnavailable)} SAB · ${fmtInt(gl.infra.wasmLoadFailed)} WASM`,
      countSub: '需注意',
      pctTotal: `${fmtInt(gl.infra.sabUnavailable + gl.infra.wasmLoadFailed)} 件`,
      pctSub: '事件數',
    },
  ]
})

interface Cell {
  region: RegionKey
  first: boolean
  display: string
  barWidthPct: number
  valueClass: string
  secondary: string
  weak: boolean
}

// Replicates the mockup's paint() per-cell logic for the current displayMode.
// Rows with regionSplit: false (activeUsers, #202) never call this — the
// template renders a note in place of the 3-column grid instead.
function cellsFor(row: Row): Cell[] {
  if (!row.regionSplit) return []

  const br = byRegion.value
  // Graceful degrade: no byRegion data → show em-dash, zero-width bars.
  if (!br) {
    return regions.map((r, i) => ({
      region: r,
      first: i === 0,
      display: '—',
      barWidthPct: 0,
      valueClass: r,
      secondary: '',
      weak: false,
    }))
  }

  const byR = br[row.key as RegionRowKey] as Record<RegionKey, RegionGlance>
  const isInfra = row.key === 'infra'
  const totalValue = regions.reduce((s, r) => s + (byR[r].value || 0), 0) || 1
  const maxValue = Math.max(...regions.map((r) => byR[r].value || 0)) || 1
  const mode = displayMode.value

  return regions.map((r, i) => {
    const cell = byR[r]
    let display: string
    let barWidthPct: number
    let valueClass: string = r

    if (mode === 'percent') {
      if (row.mode === 'pct') {
        const sparkPct = cell.sparkPct ?? 0
        display = fmtPct(sparkPct)
        barWidthPct = sparkPct * 100
      } else {
        const share = cell.value / totalValue
        display = fmtPct(share)
        barWidthPct = share * 100
      }
    } else {
      if (isInfra) {
        display = fmtInt(cell.value)
        barWidthPct = Math.min(100, (cell.value / 30) * 100)
        valueClass = cell.tone === 'danger' ? 'danger' : 'warn'
      } else {
        display = fmtInt(cell.value)
        barWidthPct = (cell.value / maxValue) * 100
      }
    }

    if (isInfra && mode === 'percent') {
      valueClass = cell.tone === 'danger' ? 'danger' : 'warn'
    }

    const weak =
      mode === 'percent' &&
      row.mode === 'pct' &&
      (cell.sparkPct ?? 0) < 0.5 &&
      r === 'unset'

    return {
      region: r,
      first: i === 0,
      display,
      barWidthPct: Number(barWidthPct.toFixed(1)),
      valueClass,
      secondary: cell.secondary || '',
      weak,
    }
  })
}

interface RenderRow extends Row {
  totalMain: string
  totalSub: string
  cells: Cell[]
  /** 趨勢三件組（issue #207）——1–2 張卡片，見 `region-ledger-trend.ts` 的
   *  `REGION_LEDGER_ROW_METRICS`。與上面 `cells`（依區域拆欄）完全獨立：這裡固定讀 28d，
   *  不隨 `displayMode`/`window` 切換。 */
  trend: TrendCell[]
}

const renderRows = computed<RenderRow[]>(() =>
  rows.value.map((row) => ({
    ...row,
    totalMain: displayMode.value === 'percent' ? row.pctTotal : row.countTotal,
    totalSub: displayMode.value === 'percent' ? row.pctSub : row.countSub,
    cells: cellsFor(row),
    trend: trendCells.value[row.key as RegionLedgerRowKey],
  })),
)
</script>

<template>
  <section class="region-ledger-wrap">
    <div class="region-ledger-topbar">
      <div class="rlh-eyebrow">概覽 · 依市場服別拆欄</div>
      <div class="rlh-toggle" role="tablist" aria-label="顯示模式">
        <button
          class="rlt-btn"
          :class="{ active: displayMode === 'count' }"
          type="button"
          @click="setMode('count')"
        >
          次數
        </button>
        <button
          class="rlt-btn"
          :class="{ active: displayMode === 'percent' }"
          type="button"
          @click="setMode('percent')"
        >
          比例
        </button>
      </div>
    </div>

    <div class="region-ledger-head">
      <div class="rlh-note">未設定 = 尚未走完伺服器引導的新訪客</div>
      <div class="rlh-cols">
        <div class="rlh-col cht"><span class="swatch cht"></span>台服</div>
        <div class="rlh-col intl"><span class="swatch intl"></span>國際服</div>
        <div class="rlh-col unset"><span class="swatch unset"></span>未設定</div>
      </div>
      <!-- issue #207：趨勢三件組固定讀 7d 視窗序列（sparkline）+ 28d 當期值，與左側「依市場服別
           拆欄」欄位跟著 WindowSelector 切換是兩件不相干的事——標題明講「7d」避免使用者以為這欄
           也會跟著上方的視窗選擇器變動（#184 決定 5）。 -->
      <div class="rlh-trend-head">趨勢 · 7d</div>
    </div>

    <div class="region-ledger">
      <div v-for="row in renderRows" :key="row.key" class="rl-row">
        <div class="rl-label">{{ row.label }}</div>
        <div class="rl-body">
          <span class="num">{{ row.totalMain }}</span>
          <span class="muted">{{ row.totalSub }}</span>
        </div>
        <div v-if="row.regionSplit" class="rl-spark">
          <div
            v-for="cell in row.cells"
            :key="cell.region"
            class="rl-spark-cell"
            :class="{ first: cell.first, weak: cell.weak }"
          >
            <div class="rl-spark-value" :class="cell.valueClass">{{ cell.display }}</div>
            <div class="rl-spark-bar">
              <i :class="cell.region" :style="{ width: cell.barWidthPct + '%' }"></i>
            </div>
            <div class="rl-spark-sub">{{ cell.secondary }}</div>
          </div>
        </div>
        <div v-else class="rl-spark rl-spark-note">
          此列不分地區 — market_region 為 user-scoped 屬性，各列各自去重、跨列相加會重複計數
        </div>
        <!-- 趨勢三件組（issue #207，#184 決定 1）：當期值 + WoW delta + 7d sparkline，每列 1–2 張
             卡片（見 region-ledger-trend.ts 的 REGION_LEDGER_ROW_METRICS）。含觀測層指標
             （activeUsers.total / returningPct / infra.sabUnavailableRate）——它們永不觸發，趨勢是
             它們存在於儀表板上的唯一理由（#184 決定 3）。 -->
        <div class="rl-trend">
          <LedgerTrend v-for="cell in row.trend" :key="cell.ruleId" :cell="cell" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ============================================================
   CHART #1 — REGION SPLIT LEDGER
   Decision: keep the 5-row Ledger skeleton; right "spark" column expands
   into a 3-column cht/intl/unset sub-grid with mini bars beneath each %.
   ============================================================ */
.region-ledger-wrap {
  /* Prelude → Layer I gap — spec #194 §E4 "section 之間 112px" (this ledger
     is the last prelude block before `#sec-why` begins). */
  margin-bottom: 112px;
}
.region-ledger-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 4px 10px;
  gap: 24px;
}
.rlh-toggle {
  display: inline-flex; gap: 4px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 999px;
}
.rlt-btn {
  appearance: none; border: none; background: transparent;
  color: var(--ink-faint);
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 11.5px; font-weight: 500;
  letter-spacing: 0.10em;
  padding: 6px 16px;
  border-radius: 999px;
  cursor: pointer;
  transition: color 160ms ease-out, background 160ms ease-out;
}
.rlt-btn:hover { color: var(--ink-mid); }
.rlt-btn.active { background: var(--gold-glow); color: var(--gold); }

.region-ledger-head {
  display: grid;
  grid-template-columns: 1fr 540px 300px;
  gap: 36px;
  align-items: end;
  padding: 0 4px 14px;
  border-bottom: 1px solid var(--border);
}
.rlh-trend-head {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 12px; font-weight: 500;
  letter-spacing: 0.10em;
  color: var(--ink-muted);
  padding-bottom: 4px;
}
.rlh-eyebrow {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 12px; font-weight: 500;
  letter-spacing: 0.10em;
  color: var(--ink-muted);
  padding-bottom: 4px;
}
.rlh-note {
  /* Chinese explanatory copy — mono has no CJK glyph (spec #194 §E2 hard
     limit), so this stays Noto Sans TC ("說明" role); only italic retires. */
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 13px; color: var(--ink-muted);
  letter-spacing: 0.01em;
  padding-bottom: 4px;
}
.rlh-cols {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}
.rlh-col {
  display: flex; align-items: center; gap: 8px;
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 13px; font-weight: 600;
  letter-spacing: 0.10em;
  border-left: 1px solid var(--border-soft);
  padding-left: 10px;
  padding-bottom: 4px;
}
.rlh-col:first-child { border-left: 0; padding-left: 0; }
.rlh-col.cht   { color: var(--gold); }
.rlh-col.intl  { color: var(--strawberry); }
.rlh-col.unset { color: var(--ink-muted); }
.rlh-col .swatch {
  display: inline-block; width: 10px; height: 10px; border-radius: 2px;
}
.rlh-col .swatch.cht   { background: var(--gold); }
.rlh-col .swatch.intl  { background: var(--strawberry); }
.rlh-col .swatch.unset { background: var(--ink-faint); }

.region-ledger {
  border-bottom: 1px solid var(--border);
}
.rl-row {
  display: grid;
  grid-template-columns: 200px 1fr 540px 300px;
  gap: 36px;
  align-items: baseline;
  padding: 24px 4px;
  border-bottom: 1px solid var(--border-soft);
}
.rl-trend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
  align-self: center;
}
.rl-row:last-child { border-bottom: 0; }
.rl-label {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 13px; font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink-mid);
}
.rl-body {
  font-family: 'Noto Serif TC', serif;
  font-size: 17px; color: var(--ink);
}
.rl-body .num {
  font-family: 'Fira Code', monospace; font-weight: 500;
  letter-spacing: 0.02em;
}
.rl-body .muted {
  color: var(--ink-muted); font-size: 13px; margin-left: 10px;
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  letter-spacing: 0.01em;
}
.rl-spark {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  align-items: end;
}
.rl-spark-note {
  display: flex;
  align-items: center;
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 13px;
  color: var(--ink-faint);
  letter-spacing: 0.01em;
}
.rl-spark-cell {
  display: flex; flex-direction: column; gap: 6px;
  border-left: 1px solid var(--border-soft);
  padding: 2px 0 2px 10px;
}
.rl-spark-cell.first { border-left: 0; padding-left: 0; }
.rl-spark-sub {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 11.5px;
  color: var(--ink-faint);
  letter-spacing: 0.01em;
  margin-top: 4px;
}
.rl-spark-value {
  font-family: 'Fira Code', monospace;
  font-size: 14px; font-weight: 500; letter-spacing: 0.02em;
}
.rl-spark-value.cht   { color: var(--gold); }
.rl-spark-value.intl  { color: var(--strawberry); }
.rl-spark-value.unset { color: var(--ink-muted); }
.rl-spark-value.warn  { color: var(--warning); }
.rl-spark-value.danger { color: var(--danger); }
.rl-spark-bar {
  position: relative; height: 5px; background: var(--surface);
  border-radius: 2px; overflow: hidden;
}
.rl-spark-bar > i {
  position: absolute; left: 0; top: 0; bottom: 0; display: block;
}
.rl-spark-bar > i.cht   { background: var(--gold); }
.rl-spark-bar > i.intl  { background: var(--strawberry); }
.rl-spark-bar > i.unset { background: var(--ink-faint); }
.rl-spark-cell.weak .rl-spark-value { color: var(--ink-faint); }
</style>

<script setup lang="ts">
import { computed } from 'vue'
import type { GlanceAdoption } from '@/types/ga-snapshot'
import { fmtInt, fmtPct } from '@/components/ga-dashboard/formatters'

// 功能採用率 · 跨服與鑲嵌 (#211, spec #194 §C2). Shared chart for two C-class
// rules (`adoption.crossServerRate` / `adoption.meldAdvisorRate`,
// ga-thresholds.ts) — both read `glance.adoption` (#203 built the pipeline
// side; this component is purely the presentation layer #211 owns).
//
// GaDashboardView.vue only mounts this component once the window's endDate
// is past both rules' `validFrom` (2026-08-28) — see the view's
// `adoptionAvailable` computed. That gate exists SEPARATELY from the
// per-metric guards below: even though `crossServerBatches` already has real,
// nonzero data today (2026-08-07, per a live probe — #203's dimension was
// registered 2026-07-31), a rate computed before the 28-day window has fully
// rotated past registration is not a representative measurement yet — the
// population that could have fired the event is still growing every day
// within the window. Showing SOME percentage during that period would be
// exactly the "0 / 1433 → confident 0.0%" failure mode this ticket's brief
// calls out, just with a nonzero numerator instead of zero. So during the
// dark period the View shows the shared EmptyChart placeholder (with the
// resolves-on date) instead of mounting this component at all — this
// component's own job starts only once that's no longer a concern.
//
// Even past that gate, this component still can't blindly trust obs/n: a
// LOW absolute `n` still means an unreliable rate (same `MIN_DENOMINATOR`
// floor as the anchor-side `batchFailPct`/`bomHandoffPct` readouts in
// GaDashboardView.vue and the evaluate() engine's own n≥30 hard floor, #181
// 決定 3), and `n === 0` (today's live shape for `meldAdvisorRate`:
// `meldAdvisorRuns`/`meldApplies` are both 0 — the #198 client instrumentation
// is on main but not yet deployed to production) must render "—", never a
// divide-by-zero-dressed-as-0.0%.
const props = defineProps<{ data: GlanceAdoption }>()

const MIN_DENOMINATOR = 30

interface Row {
  key: string
  label: string
  eventNote: string
  obs?: number
  n?: number
}

const rows = computed<Row[]>(() => [
  {
    key: 'crossServer',
    label: '跨伺服器使用率',
    eventNote: 'batch_optimization_start · cross_server',
    obs: props.data.crossServerBatches,
    n: props.data.batchStarts,
  },
  {
    key: 'meldAdvisor',
    label: '鑲嵌建議採用率',
    eventNote: 'gearset_apply_all (meld_delta) ÷ meld_advisor_run',
    obs: props.data.meldApplies,
    n: props.data.meldAdvisorRuns,
  },
])

function display(row: Row): { text: string; note: string; pending: boolean } {
  if (row.obs == null || row.n == null) {
    return { text: '—', note: '尚無資料', pending: true }
  }
  if (row.n < MIN_DENOMINATOR) {
    return { text: '—', note: `樣本不足（${fmtInt(row.obs)} / ${fmtInt(row.n)}，n < ${MIN_DENOMINATOR}）`, pending: true }
  }
  return { text: fmtPct(row.obs / row.n), note: `${fmtInt(row.obs)} / ${fmtInt(row.n)}`, pending: false }
}
</script>

<template>
  <div class="adoption-rows">
    <div v-for="row in rows" :key="row.key" class="adoption-row">
      <div class="adoption-meta">
        <div class="adoption-label">{{ row.label }}</div>
        <div class="adoption-event">{{ row.eventNote }}</div>
      </div>
      <div class="adoption-metric" :class="{ pending: display(row).pending }">
        <div class="adoption-value">{{ display(row).text }}</div>
        <div class="adoption-note">{{ display(row).note }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.adoption-rows {
  border-top: 1px solid var(--border-soft);
  padding: 4px 0 0;
}
.adoption-row {
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 28px;
  padding: 22px 4px;
  align-items: center;
  border-bottom: 1px solid var(--border-soft);
}
.adoption-row:last-child {
  border-bottom: 0;
}
.adoption-label {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 17px;
  color: var(--ink);
  margin-bottom: 4px;
}
.adoption-event {
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  letter-spacing: 0.04em;
  color: var(--ink-faint);
}
.adoption-metric {
  text-align: right;
}
.adoption-value {
  font-family: 'Fira Code', monospace;
  font-size: 26px;
  font-weight: 500;
  color: var(--ink);
}
.adoption-metric.pending .adoption-value {
  color: var(--ink-faint);
}
.adoption-note {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: var(--ink-faint);
  margin-top: 4px;
}
</style>

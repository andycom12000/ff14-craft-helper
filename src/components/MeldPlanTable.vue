<script setup lang="ts">
import { computed } from 'vue'
import type { MeldStep } from '@/services/meld-advisor'
import type { CraftStat } from '@/engine/materia'
import { materiaForStat, summarizeMeldSteps } from '@/engine/materia'
import { formatGil } from '@/utils/format'

/**
 * #160 — structured per-materia breakdown of a meld plan, shared by the
 * advisor's ability mode (simulator) and cost mode (batch). One row per
 * materia type: the plan keeps one step per overmeld depth (cost math needs
 * the split), so rows merge by stat+grade via `summarizeMeldSteps` — same
 * merge the hero sentence uses, so the two never drift. Pure presentation:
 * no advisor logic, every number derives from the steps given.
 */
const props = defineProps<{
  steps: MeldStep[]
  /** Plan total in gil; null = at least one step had no market price (#128). */
  totalGil: number | null
}>()

const STAT_LABELS: Record<CraftStat, string> = {
  craftsmanship: '作業',
  control: '加工',
  cp: 'CP',
}
const GRADE_ROMAN: Record<number, string> = { 12: 'Ⅻ', 11: 'Ⅺ', 10: 'Ⅹ' }

/** Flat bonus per materia of this stat+grade, for the 能力值 column. */
function materiaValue(stat: CraftStat, grade: number): number {
  return materiaForStat(stat).find((m) => m.grade === grade)?.value ?? 0
}

interface PlanRow {
  key: string
  name: string
  statDelta: number
  slots: number
  purchase: number
  subtotal: number | null
}

const rows = computed<PlanRow[]>(() =>
  summarizeMeldSteps(props.steps).map((s) => {
    // Re-sum the merged row's subtotal from the original steps (summarize only
    // carries counts); any unpriced step poisons the row's subtotal to null.
    const siblings = props.steps.filter((o) => o.stat === s.stat && o.grade === s.grade)
    const subtotal = siblings.some((o) => o.subtotal === null)
      ? null
      : siblings.reduce((sum, o) => sum + (o.subtotal ?? 0), 0)
    return {
      key: `${s.stat}:${s.grade}`,
      name: `${STAT_LABELS[s.stat] ?? s.stat}魔晶石${GRADE_ROMAN[s.grade] ?? String(s.grade)}`,
      statDelta: s.placedCount * materiaValue(s.stat, s.grade),
      slots: s.placedCount,
      purchase: Math.ceil(s.expectedCount),
      subtotal,
    }
  }),
)

const totalSlots = computed(() => rows.value.reduce((sum, r) => sum + r.slots, 0))
const totalPurchase = computed(() => rows.value.reduce((sum, r) => sum + r.purchase, 0))

/** Any overmeld waste in the plan → the 顆數 column needs its footnote. */
const hasOvermeldWaste = computed(() => totalPurchase.value > totalSlots.value)

const EM_DASH = '—'
const gilText = (v: number | null) => (v === null ? EM_DASH : formatGil(v))
/** Stat increments don't sum meaningfully across stats — totals cell stays blank. */
const formatDelta = (v: number) => `+${formatGil(v)}`
</script>

<template>
  <div class="meld-plan-table-wrap">
    <table class="meld-plan-table" data-test="meld-plan-table">
      <thead>
        <tr>
          <th class="col-name" scope="col">魔晶石</th>
          <th class="col-num" scope="col">能力值</th>
          <th class="col-num" scope="col">槽位</th>
          <th class="col-num" scope="col">顆數</th>
          <th class="col-num" scope="col">費用</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.key" data-test="meld-plan-row">
          <td class="col-name">{{ r.name }}</td>
          <td class="col-num num">{{ formatDelta(r.statDelta) }}</td>
          <td class="col-num num">{{ r.slots }}</td>
          <td class="col-num num">{{ r.purchase }}</td>
          <td class="col-num num">{{ gilText(r.subtotal) }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr data-test="meld-plan-totals">
          <th class="col-name" scope="row">合計</th>
          <td class="col-num num"></td>
          <td class="col-num num">{{ totalSlots }}</td>
          <td class="col-num num">{{ totalPurchase }}</td>
          <td class="col-num num total-gil">{{ gilText(totalGil) }}</td>
        </tr>
      </tfoot>
    </table>
    <p v-if="hasOvermeldWaste" class="overmeld-footnote" data-test="overmeld-footnote">
      顆數已含禁斷失敗的預估耗損
    </p>
  </div>
</template>

<style scoped>
.meld-plan-table-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Quiet data table per DESIGN.md: sans body cells, Fira Code numbers, warm
   1px row separators only — no zebra, no resting shadow, no gray. */
.meld-plan-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  color: var(--app-text, oklch(0.28 0.04 55));
}

.meld-plan-table th {
  font-weight: 500;
  font-size: 12px;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}

.meld-plan-table thead th {
  padding: 0 8px 5px 0;
  border-bottom: 1px solid var(--app-border, oklch(0.65 0.04 65 / 0.3));
}

.meld-plan-table tbody td {
  padding: 5px 8px 5px 0;
  /* Softened row separator derived from the single border token so it tracks
     dark mode; a hard-coded oklch here would stay light-tuned. */
  border-bottom: 1px solid
    color-mix(in oklab, var(--app-border, oklch(0.65 0.04 65 / 0.3)) 55%, transparent);
}

.meld-plan-table tfoot th,
.meld-plan-table tfoot td {
  padding: 6px 8px 0 0;
  border-top: 1px solid var(--app-border, oklch(0.65 0.04 65 / 0.3));
  border-bottom: 0;
}

.meld-plan-table th:last-child,
.meld-plan-table td:last-child {
  padding-right: 0;
}

.col-name {
  text-align: left;
}

.col-num {
  text-align: right;
}

/* Numbers are always Fira Code (DESIGN.md Four-Track Rule). */
.num {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}

.meld-plan-table tfoot th {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text, oklch(0.28 0.04 55));
  text-align: left;
}

.meld-plan-table tfoot .num {
  font-weight: 600;
  color: var(--app-text, oklch(0.28 0.04 55));
}

.overmeld-footnote {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
// ElMessage's CSS side-effect is loaded once by useSimulator (the host); see
// MeldAdvisorCard for the same note. Re-importing it here breaks the jsdom test.
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { FoodBuff } from '@/engine/food-medicine'
import type { MeldAdvice } from '@/services/meld-advisor'
import type { CraftStat } from '@/engine/materia'
import { materiaForStat, MAX_MELD_COUNT } from '@/engine/materia'
import { gearsetToBuffedStats } from '@/services/stat-stacking'
import { useMeldPlayground, type MeldVerdict } from '@/composables/useMeldPlayground'

/**
 * #130 — the forward 鑲嵌試算台 (Meld Playground), the forward half of the Meld
 * Workbench (ADR-0002). The user places materia (grade/count) per stat and sees
 * the resulting gear stats + an HQ判定 from the REAL forward solver/sim. A
 * one-click「載入逆向建議」seeds the picker from #126's cost-optimal plan, after
 * which the user tweaks and re-checks (criterion 2 + 6).
 *
 * Apply emits the session-only override delta to the host (criterion 3): the
 * host folds it through #124's `meldOverride` — NEVER written to the saved
 * gearset, and clearable.
 */
const props = defineProps<{
  recipe: Recipe | null
  gearset: GearsetStats | null
  /** The #126 reverse suggestion to seed from (null/non-object = no seed yet). */
  advice: MeldAdvice | 'loading' | 'stale' | 'no-market' | null
  /** HQ ingredients head-start so the forward check matches the screen baseline. */
  initialQuality?: number
  /** Active food/medicine so the forward check judges on the same
   *  effectiveStats basis as the screen and the reverse advisor (#136 parity). */
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null }
  /** Whether the host currently holds a meld override applied from this card —
   *  gates the in-place「撤銷」undo (criterion 3). */
  overrideActive?: boolean
}>()

const emit = defineEmits<{
  apply: [delta: { craftsmanship: number; control: number; cp: number }]
  /** Revoke the host's session meld override (clear / in-place undo, criterion 3). */
  'clear-override': []
}>()

const pg = useMeldPlayground(
  () => props.recipe,
  () => props.gearset,
  undefined,
  () => props.initialQuality ?? 0,
  () => props.buffs,
)
const { selections, deltaStats, verdict, hasSelections } = pg

/**
 * #129 tweak B — the forward picker used to sit permanently expanded at the
 * bottom of the Step 2 cascade, burying it below a long reverse-advisor card.
 * Collapse it behind a toggle so its entry point is reachable without scrolling.
 * It auto-opens whenever there's something to show — the user loaded the reverse
 * plan, placed materia, or the host holds an applied override — so collapsing
 * never hides live state. `expanded` is the manual toggle on top of that.
 */
const expanded = ref(false)
/** Live state that force-opens the picker: collapsing must never hide an applied
 *  override or in-progress selections. While pinned, the manual toggle is inert. */
const pinnedOpen = computed(() => !!props.overrideActive || hasSelections.value)
const isOpen = computed(() => expanded.value || pinnedOpen.value)
function toggleOpen() {
  // Flip the user's own `expanded` flag — never derive it from `isOpen`, or a
  // pinned-open state would make every click a no-op (the toggle is disabled
  // while pinned anyway, but keep the semantics honest).
  expanded.value = !expanded.value
}

const STATS: { key: CraftStat; label: string }[] = [
  { key: 'craftsmanship', label: '作業' },
  { key: 'control', label: '加工' },
  { key: 'cp', label: 'CP' },
]
const GRADE_ROMAN: Record<number, string> = { 12: 'Ⅻ', 11: 'Ⅺ', 10: 'Ⅹ' }

/** Grade options per stat (top grade first), for the row's grade select. */
const gradesByStat = (stat: CraftStat) => materiaForStat(stat)

/** Current count placed for a stat (across all grades — one grade per row in v1). */
function countFor(stat: CraftStat): number {
  return selections.value
    .filter((s) => s.stat === stat)
    .reduce((sum, s) => sum + s.count, 0)
}

/** Current grade chosen for a stat (defaults to the top grade). */
function gradeFor(stat: CraftStat): number {
  return selections.value.find((s) => s.stat === stat)?.grade
    ?? gradesByStat(stat)[0]?.grade
    ?? 12
}

function onCount(stat: CraftStat, raw: string | number) {
  // #141 AC2: clamp to the physical slot budget so an absurd entry (e.g. 999)
  // can't reach the solver and read can-hq / emit an override.
  const count = Math.min(MAX_MELD_COUNT, Math.max(0, Math.floor(Number(raw) || 0)))
  pg.setSelection(stat, gradeFor(stat), count)
}

function onGrade(stat: CraftStat, raw: string | number) {
  // #141 AC5: atomic grade move keeps a computed verdict stale (not idle).
  pg.changeGrade(stat, Number(raw))
}

/** Buffed stats the solver actually sees (Soul/food fold; food/medicine are
 *  applied upstream in the host's effectiveStats, so here we only fold Soul). */
const bumpedBuffed = computed(() => {
  const g = pg.bumpedGearset.value
  if (!g) return null
  return gearsetToBuffedStats(g, undefined)
})

/**
 * Whether the #126 reverse suggestion is loadable: a resolved advice object
 * whose status is `feasible` (#133). A non-feasible run (infeasible / timed-out
 * / error / cancelled) carries no solver-confirmed plan, so seeding the picker
 * from it would present an unconfirmed plan as a real starting point.
 */
const canLoadReverse = computed(
  () => !!props.advice && typeof props.advice === 'object' && props.advice.status === 'feasible',
)

function loadReverse() {
  if (!props.advice || typeof props.advice !== 'object' || props.advice.status !== 'feasible') return
  pg.loadFromReverse(props.advice)
  expanded.value = true // #129 B: surface the seeded rows immediately
  ElMessage.success('已載入逆向建議，可微調魔晶石後重新試算')
}

function clearAll() {
  pg.clear()
  // #141 AC3: clearing also revokes any override this card applied, so the host
  // drops its chip instead of stranding a phantom +Δ.
  emit('clear-override')
}

/** #141 AC3: in-place undo — revoke the applied override without hunting for the
 *  distant FoodMedicine chip ✕. Leaves the picker selections intact. */
function undoOverride() {
  emit('clear-override')
}

async function runCheck() {
  await pg.runForwardCheck()
}

function applyOverride() {
  if (!hasSelections.value) return
  // #141 AC4: the host owns the single「已套用模擬鑲嵌」toast; don't double it.
  emit('apply', { ...deltaStats.value })
}

const VERDICT_TEXT: Record<MeldVerdict, string> = {
  idle: '擺上魔晶石後按「試算」即可判定能否 HQ',
  checking: '試算中…',
  'can-hq': '可保證 HQ',
  'cannot-hq': '尚無法保證 HQ',
  stale: '魔晶石已變更，請重新試算',
  error: '試算失敗，請重試',
}
const verdictClass = computed(() => {
  switch (verdict.value) {
    case 'can-hq': return 'verdict-can'
    case 'cannot-hq': return 'verdict-cannot'
    case 'stale': return 'verdict-stale'
    case 'checking': return 'verdict-checking'
    case 'error': return 'verdict-error'
    default: return 'verdict-idle'
  }
})
</script>

<template>
  <div class="meld-playground-card">
    <div class="mpg-head">
      <button
        type="button"
        class="mpg-toggle"
        data-test="pg-toggle"
        :aria-expanded="isOpen"
        :disabled="pinnedOpen"
        @click="toggleOpen"
      >
        <span class="mpg-caret" :class="{ open: isOpen }" aria-hidden="true">▸</span>
        <span class="mpg-title">正向試算台</span>
        <span class="mpg-subtitle">自擺微調</span>
      </button>
      <button
        type="button"
        class="mpg-link"
        data-test="load-reverse"
        :disabled="!canLoadReverse"
        @click="loadReverse"
      >
        載入逆向建議
      </button>
    </div>

    <div v-show="isOpen" class="mpg-body" data-test="mpg-body">
    <div class="mpg-rows">
      <div
        v-for="s in STATS"
        :key="s.key"
        class="mpg-row"
        :data-test="`meld-row-${s.key}`"
      >
        <span class="mpg-stat-label">{{ s.label }}</span>
        <select
          class="mpg-grade"
          :data-test="`grade-${s.key}`"
          :value="gradeFor(s.key)"
          @change="onGrade(s.key, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="g in gradesByStat(s.key)" :key="g.grade" :value="g.grade">
            魔晶石{{ GRADE_ROMAN[g.grade] ?? g.grade }}（+{{ g.value }}）
          </option>
        </select>
        <input
          class="mpg-count"
          type="number"
          min="0"
          :max="MAX_MELD_COUNT"
          :data-test="`count-${s.key}`"
          :value="countFor(s.key)"
          @input="onCount(s.key, ($event.target as HTMLInputElement).value)"
        />
        <span class="mpg-count-unit">顆</span>
        <span class="mpg-result" :data-test="`stat-${s.key}`">
          → {{ (bumpedBuffed?.[s.key] ?? props.gearset?.[s.key] ?? 0).toLocaleString() }}
          <span v-if="deltaStats[s.key] > 0" class="mpg-delta">(+{{ deltaStats[s.key] }})</span>
        </span>
      </div>
    </div>

    <div class="mpg-actions">
      <button
        type="button"
        class="mpg-btn mpg-primary"
        data-test="run-check"
        :disabled="!hasSelections || verdict === 'checking'"
        @click="runCheck"
      >
        試算能否 HQ
      </button>
      <button
        type="button"
        class="mpg-btn mpg-accent"
        data-test="apply-override"
        :disabled="!hasSelections"
        @click="applyOverride"
      >
        套用鑲嵌（模擬）
      </button>
      <button
        type="button"
        class="mpg-btn mpg-ghost"
        data-test="clear"
        :disabled="!hasSelections"
        @click="clearAll"
      >
        清除
      </button>
    </div>

    <button
      v-if="props.overrideActive"
      type="button"
      class="mpg-undo"
      data-test="undo-override"
      @click="undoOverride"
    >
      撤銷已套用的模擬鑲嵌
    </button>

    <p class="mpg-verdict" :class="verdictClass" data-test="verdict" aria-live="polite">
      {{ VERDICT_TEXT[verdict] }}
    </p>
    </div>
  </div>
</template>

<style scoped>
.meld-playground-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mpg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
/* #129 B: the title row is a collapse toggle for the forward picker. */
.mpg-toggle {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}
/* Pinned open by live state (override / selections) — the toggle can't collapse,
   so it reads as a status indicator, not a clickable control. */
.mpg-toggle:disabled {
  cursor: default;
}
.mpg-caret {
  font-size: 11px;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
  transition: transform 140ms ease;
  align-self: center;
}
.mpg-caret.open {
  transform: rotate(90deg);
}
.mpg-title {
  font-family: 'Noto Serif TC', serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text, oklch(0.28 0.04 55));
}
.mpg-subtitle {
  font-size: 12px;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}
/* Collapsible body — the picker rows, actions, undo, and verdict. */
.mpg-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mpg-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-accent-strong, oklch(0.5 0.12 60));
  font-family: 'Noto Serif TC', serif;
  font-size: 12.5px;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.mpg-link:disabled {
  color: var(--app-text-muted, oklch(0.5 0.03 60));
  text-decoration: none;
  cursor: not-allowed;
  opacity: 0.6;
}

.mpg-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mpg-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.mpg-stat-label {
  flex: 0 0 32px;
  font-family: 'Noto Serif TC', serif;
  color: var(--app-text, oklch(0.28 0.04 55));
}
.mpg-grade {
  flex: 0 0 auto;
  padding: 2px 4px;
  border: 1px solid var(--app-border, oklch(0.65 0.04 65 / 0.4));
  border-radius: 6px;
  background: var(--app-surface, oklch(0.99 0.01 80));
  font-size: 12px;
}
.mpg-count {
  flex: 0 0 56px;
  width: 56px;
  padding: 2px 6px;
  border: 1px solid var(--app-border, oklch(0.65 0.04 65 / 0.4));
  border-radius: 6px;
  font-family: 'Fira Code', ui-monospace, monospace;
  text-align: right;
}
.mpg-count-unit {
  flex: 0 0 auto;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}
.mpg-result {
  flex: 1 1 auto;
  text-align: right;
  font-family: 'Fira Code', ui-monospace, monospace;
  color: var(--app-text, oklch(0.28 0.04 55));
}
.mpg-delta {
  color: var(--app-success, oklch(0.55 0.16 145));
}

.mpg-actions {
  display: flex;
  gap: 8px;
}
.mpg-btn {
  flex: 1 1 auto;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  font-family: 'Noto Serif TC', serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 140ms ease, opacity 140ms ease;
}
.mpg-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.mpg-primary {
  background: var(--app-accent, oklch(0.72 0.15 65));
  color: var(--app-on-accent, oklch(0.22 0.04 55));
}
.mpg-accent {
  background: transparent;
  border-color: var(--app-craft, oklch(0.5 0.16 40 / 0.5));
  color: var(--app-craft, oklch(0.5 0.16 40));
}
.mpg-ghost {
  flex: 0 0 auto;
  background: transparent;
  border-color: var(--app-border, oklch(0.65 0.04 65 / 0.4));
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}

.mpg-undo {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-craft, oklch(0.5 0.16 40));
  font-family: 'Noto Serif TC', serif;
  font-size: 12.5px;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.mpg-verdict {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.verdict-idle,
.verdict-checking {
  color: var(--app-text-muted, oklch(0.5 0.03 60));
  font-weight: 500;
}
.verdict-can {
  color: var(--app-success, oklch(0.55 0.16 145));
}
.verdict-cannot,
.verdict-error {
  color: var(--app-danger, oklch(0.55 0.2 25));
}
.verdict-stale {
  color: var(--app-craft, oklch(0.5 0.16 40));
}
</style>

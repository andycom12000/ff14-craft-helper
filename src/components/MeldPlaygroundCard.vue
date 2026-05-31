<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
// ElMessage's CSS side-effect is loaded once by useSimulator (the host); see
// MeldAdvisorCard for the same note. Re-importing it here breaks the jsdom test.
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { MeldAdvice } from '@/services/meld-advisor'
import type { CraftStat } from '@/engine/materia'
import { materiaForStat } from '@/engine/materia'
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
}>()

const emit = defineEmits<{
  apply: [delta: { craftsmanship: number; control: number; cp: number }]
}>()

const pg = useMeldPlayground(
  () => props.recipe,
  () => props.gearset,
  undefined,
  () => props.initialQuality ?? 0,
)
const { selections, deltaStats, verdict, hasSelections } = pg

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
  const count = Math.max(0, Math.floor(Number(raw) || 0))
  pg.setSelection(stat, gradeFor(stat), count)
}

function onGrade(stat: CraftStat, raw: string | number) {
  const grade = Number(raw)
  const count = countFor(stat)
  // Move the existing count onto the new grade (clear the old grade row first).
  const old = selections.value.find((s) => s.stat === stat)
  if (old && old.grade !== grade) pg.setSelection(stat, old.grade, 0)
  pg.setSelection(stat, grade, count)
}

/** Buffed stats the solver actually sees (Soul/food fold; food/medicine are
 *  applied upstream in the host's effectiveStats, so here we only fold Soul). */
const bumpedBuffed = computed(() => {
  const g = pg.bumpedGearset.value
  if (!g) return null
  return gearsetToBuffedStats(g, undefined)
})

/** Whether the #126 reverse suggestion is loadable (a resolved advice object). */
const canLoadReverse = computed(
  () => !!props.advice && typeof props.advice === 'object',
)

function loadReverse() {
  if (!props.advice || typeof props.advice !== 'object') return
  pg.loadFromReverse(props.advice)
  ElMessage.success('已載入逆向建議，可微調魔晶石後重新試算')
}

function clearAll() {
  pg.clear()
}

async function runCheck() {
  await pg.runForwardCheck()
}

function applyOverride() {
  if (!hasSelections.value) return
  emit('apply', { ...deltaStats.value })
  ElMessage.success('已套用模擬鑲嵌（未寫入配裝）')
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
      <span class="mpg-title">鑲嵌試算台</span>
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

    <p class="mpg-verdict" :class="verdictClass" data-test="verdict" aria-live="polite">
      {{ VERDICT_TEXT[verdict] }}
    </p>
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
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.mpg-title {
  font-family: 'Noto Serif TC', serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text, oklch(0.28 0.04 55));
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

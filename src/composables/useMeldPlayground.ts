import { ref, computed } from 'vue'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { FoodBuff } from '@/engine/food-medicine'
import type { MeldAdvice } from '@/services/meld-advisor'
import type { CraftStat } from '@/engine/materia'
import { MATERIA_GRADES } from '@/engine/materia'
import type { RawStatDelta } from '@/services/stat-stacking'
import { applyRawStatDelta } from '@/services/stat-stacking'
import {
  solveCraftForRecipe as defaultSolve,
  simulateCraftForRecipe as defaultSimulate,
} from '@/solver/api'

/**
 * One user-placed materia choice in the forward 試算台 (playground): a stat,
 * a materia grade, and how many to place. The resulting raw-gear delta for the
 * row is `gradeValue(stat, grade) × count`.
 */
export interface MeldSelection {
  stat: CraftStat
  grade: number
  count: number
}

/**
 * The HQ判定 state machine for the forward playground:
 *  - idle      — nothing checked yet (no selections / fresh)
 *  - checking  — a real forward solve/sim is in flight
 *  - can-hq    — the binding recipe double-maxes at the current stats
 *  - cannot-hq — the solver could NOT double-max at the current stats
 *  - stale     — selections changed since the last check; awaiting recompute
 *  - error     — the forward solve/sim threw (e.g. WASM bailout)
 */
export type MeldVerdict =
  | 'idle'
  | 'checking'
  | 'can-hq'
  | 'cannot-hq'
  | 'stale'
  | 'error'

/** Flat stat value of one materia of the given stat + grade (0 if unknown). */
function gradeValue(stat: CraftStat, grade: number): number {
  return MATERIA_GRADES.find((m) => m.stat === stat && m.grade === grade)?.value ?? 0
}

/**
 * Injectable forward primitives (ADR-0002 substrate). Defaults to the real
 * solver/api façade; component/unit tests inject mocks so the cadence + HQ判定
 * can be driven without WASM.
 */
export interface MeldPlaygroundDeps {
  solve: typeof defaultSolve
  simulate: typeof defaultSimulate
}

/**
 * #130 — the forward "鑲嵌試算台" (playground) half of the Meld Workbench
 * (ADR-0002 「正向／逆向／正向試算台」). The user places materia (grade/count)
 * per stat and sees, live, the resulting gear stats + an HQ判定 produced by the
 * REAL forward primitives (`solveCraftForRecipe` / `simulateCraftForRecipe`),
 * NOT closed-form estimation.
 *
 * Integration: `loadFromReverse(advice)` seeds the playground from #126's
 * cost-optimal plan (its steps → grade/count rows), after which the user tweaks
 * grade/count and re-checks — closing the reverse→forward loop. The finalized
 * delta is surfaced via `deltaStats` so the host can push it through #124's
 * session-only override (never written to the saved gearset).
 *
 * The solve cadence mirrors `useSimulator.runSimulation` / `useMeldAdvisor`:
 * a version counter discards slow/stale responses and a cancel token aborts
 * in-flight solves when a newer check starts.
 */
export function useMeldPlayground(
  recipe: () => Recipe | null,
  gearset: () => GearsetStats | null,
  deps: MeldPlaygroundDeps = { solve: defaultSolve, simulate: defaultSimulate },
  initialQuality: () => number = () => 0,
  // Premise parity with the reverse advisor (#136 family): the reverse advisor
  // folds the screen's active food/medicine into every solver call, so the
  // forward check must judge on the SAME effectiveStats basis — otherwise a
  // plan the reverse just confirmed can false-report cannot-hq here.
  buffs: () => { food: FoodBuff | null; medicine: FoodBuff | null } | undefined = () => undefined,
) {
  const selections = ref<MeldSelection[]>([])
  const verdict = ref<MeldVerdict>('idle')

  /** Sum the placed materia into a raw-gear Δstats triple (ADR-0001 order:
   *  this folds onto raw gear BEFORE Soul/food/medicine). */
  const deltaStats = computed<RawStatDelta>(() => {
    const delta: RawStatDelta = { craftsmanship: 0, control: 0, cp: 0 }
    for (const sel of selections.value) {
      delta[sel.stat] += gradeValue(sel.stat, sel.grade) * sel.count
    }
    return delta
  })

  /** The gearset bumped by the playground delta (still RAW — buffing happens
   *  downstream in the solver façade). Null when no gearset is bound. */
  const bumpedGearset = computed<GearsetStats | null>(() => {
    const g = gearset()
    if (!g) return null
    return applyRawStatDelta(g, deltaStats.value)
  })

  /** True once any materia has been placed — gates the Solve CTA / verdict. */
  const hasSelections = computed(() =>
    selections.value.some((s) => s.count > 0),
  )

  /**
   * Set the count for a (stat, grade) row. Count 0 removes the row. Any change
   * marks a previously-computed verdict STALE (awaiting recompute), following
   * the existing solve cadence — the user must re-run the forward check.
   */
  function setSelection(stat: CraftStat, grade: number, count: number) {
    const next = selections.value.filter(
      (s) => !(s.stat === stat && s.grade === grade),
    )
    if (count > 0) next.push({ stat, grade, count })
    selections.value = next
    markStaleAfterEdit()
  }

  /**
   * Move a stat's placed count onto a new grade in ONE selections update (#141
   * AC5). Doing it atomically — rather than `setSelection(old, 0)` then
   * `setSelection(new, count)` — avoids transiently emptying the row, which used
   * to bounce an already-computed verdict back to idle instead of marking it
   * stale.
   */
  function changeGrade(stat: CraftStat, grade: number) {
    const existing = selections.value.find((s) => s.stat === stat)
    const count = existing?.count ?? 0
    const next = selections.value.filter((s) => s.stat !== stat)
    if (count > 0) next.push({ stat, grade, count })
    selections.value = next
    markStaleAfterEdit()
  }

  function markStaleAfterEdit() {
    // Only an already-computed verdict becomes stale; idle/checking are left as
    // is (nothing to invalidate). If everything was removed, drop back to idle.
    if (!hasSelections.value) {
      verdict.value = 'idle'
      return
    }
    if (verdict.value === 'can-hq' || verdict.value === 'cannot-hq' || verdict.value === 'error') {
      verdict.value = 'stale'
    }
  }

  /**
   * Seed the playground from #126's reverse suggestion (criterion 2). Each
   * cost-optimal `MeldStep` carries a `stat`/`grade`/`placedCount` (the melds
   * that must SUCCEED — the stat-bearing count, NOT the overmeld-waste
   * `expectedCount`), so the reconstructed rows reproduce `costOptimal.deltaStats`
   * exactly. Rows with the same (stat, grade) are merged. Loading resets the
   * verdict to stale so the user re-confirms via the real forward check.
   */
  function loadFromReverse(advice: MeldAdvice) {
    const merged = new Map<string, MeldSelection>()
    for (const step of advice.costOptimal.steps) {
      const key = `${step.stat}:${step.grade}`
      const existing = merged.get(key)
      if (existing) existing.count += step.placedCount
      else merged.set(key, { stat: step.stat, grade: step.grade, count: step.placedCount })
    }
    selections.value = [...merged.values()]
    verdict.value = hasSelections.value ? 'stale' : 'idle'
  }

  /** Clear all placed materia and reset the verdict (chip ✕ / reset). */
  function clear() {
    selections.value = []
    verdict.value = 'idle'
  }

  let checkVersion = 0
  let cancelToken = { cancelled: false }

  /**
   * Run the REAL forward primitives on the bumped gearset and set the HQ判定
   * (criterion 4 + 5). A version counter discards slow/stale responses; a cancel
   * token aborts an in-flight solve when a newer check supersedes it — the same
   * cadence as `useSimulator.runSimulation` / `useMeldAdvisor`.
   */
  async function runForwardCheck() {
    const r = recipe()
    const g = bumpedGearset.value
    if (!r || !g) {
      verdict.value = 'idle'
      return
    }
    cancelToken.cancelled = true
    const token = { cancelled: false }
    cancelToken = token
    const version = ++checkVersion
    verdict.value = 'checking'
    const iq = initialQuality()
    const activeBuffs = buffs()
    try {
      const solved = await deps.solve(r, g, { initialQuality: iq, buffs: activeBuffs })
      if (token.cancelled || version !== checkVersion) return
      const sim = await deps.simulate(r, g, {
        actions: solved.actions,
        initialQuality: iq,
        buffs: activeBuffs,
      })
      if (token.cancelled || version !== checkVersion) return
      // #141 AC1: the solver subtracts `initialQuality` from the target and the
      // sim never adds it back, so `sim.quality` is RAW. Judge double-max on the
      // same axis as the host's `runSimulation` (`step.quality + initialQuality`),
      // else iq>0 recipes (HQ ingredients — this feature's headline case) would
      // systematically false-report cannot-hq.
      const doubleMax =
        sim.progress >= sim.max_progress && sim.quality + iq >= sim.max_quality
      verdict.value = doubleMax ? 'can-hq' : 'cannot-hq'
    } catch (err) {
      console.warn('[meld-playground] forward check failed:', err)
      if (!token.cancelled && version === checkVersion) verdict.value = 'error'
    }
  }

  return {
    selections,
    deltaStats,
    bumpedGearset,
    hasSelections,
    verdict,
    setSelection,
    changeGrade,
    loadFromReverse,
    clear,
    runForwardCheck,
  }
}

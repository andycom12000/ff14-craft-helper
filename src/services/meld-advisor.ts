/**
 * Materia Meld Advisor.
 *
 * Reverse-solves the minimum materia spend on a same-job recipe set so the
 * Raphael solver can double-max (= guarantee HQ) every target, and compares
 * to a maintained per-patch BiS reference. The gap between the two is the
 * headline value.
 *
 * Algorithm (ADR-0002 = closed-form seeds + solver-authoritative bounded search):
 *   0. already-meets check at the MAX-HQ baseline (§2): if maxing every HQ
 *      material alone double-maxes the binding recipe, HQ materials suffice and
 *      no meld is needed (hqSufficient = true)
 *   1. pick binding recipe (single-axis-max binding for v1)
 *   2-3. solveProgressBreakpoint / solveQualityBreakpoint (closed-form), demoted to
 *      NON-BINDING SEEDS — they only choose where to start probing, never the
 *      answer. Quality uses the max-HQ initialQuality (all HQ ingredients), NOT
 *      the screen's current selection — meld only covers the residual above max-HQ.
 *   4. enumerateCraftsmanshipLadder × searchMinimalQualityDelta (#126/#127): the
 *      OUTER craftsmanship ladder around the inner solver-authoritative quality
 *      search. Each bounded rung runs real solves and keeps the globally cheapest
 *      FEASIBLE, solver-confirmed Δ (craftsmanship × control × CP bounded 3D search).
 *      This bounded solver pass is the authority that replaced the old
 *      per-candidate closed-form confirmation step.
 *   5. translateDeltaToMeldPlan (guaranteed → overmeld, fail ladder)
 *   6. computeBisPlan (current → BIS_REFERENCE, deep overmeld)
 *   7. assemble MeldAdvice with gapGil
 *
 * Stat-stacking (ADR-0001): the Δstats produced by this service are RAW gear
 * deltas. They MUST be folded into the gearset before Soul/food/medicine.
 * The reverse-solve uses `recipeToCraftParams` (canonical entry) so Soul and
 * existing buffs stack correctly.
 */
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { MarketData } from '@/api/universalis'
import { solveCraftForRecipe, simulateCraftForRecipe, SolveCancelledError } from '@/solver/api'
import type { CraftStat, BiSReference, MateriaGrade } from '@/engine/materia'
import {
  SLOT_STRUCTURE,
  expectedCountForOvermeldDepth, topGradeForStat,
} from '@/engine/materia'
import {
  computeBaseProgress,
  computeBaseQuality,
  QUALITY_PHASE_UPPER_BOUND_MULTIPLIER,
  AVG_QUALITY_CP_COST,
  MARGIN,
} from '@/services/feasibility-prefilter'
import { gearsetToBuffedStats } from '@/services/stat-stacking'
import type { FoodBuff } from '@/engine/food-medicine'
import { calculateInitialQuality } from '@/engine/quality'

/**
 * Active food/medicine buffs to fold after Soul (ADR-0001 order), so the advisor
 * solves on the SAME effectiveStats the screen uses (#136). `undefined` = no
 * buffs — byte-identical to the pre-#136 advisor.
 */
type AdvisorBuffs = { food: FoodBuff | null; medicine: FoodBuff | null } | undefined

/**
 * Per-`solve`/`simulate` wall-clock budget for the bounded search (#132).
 * Default only — the final tolerance policy is #129 (HITL). A single WASM call
 * exceeding this is treated as "this recipe is too hard within the budget": the
 * call is aborted (worker slot freed) and the run bails to its best-so-far,
 * rather than the old behaviour of blocking indefinitely (>3 min observed on a
 * 0%-HQ custom recipe with a 7,400 quality gap). 8s comfortably covers a normal
 * solve (seconds) while capping a pathological one.
 */
export const DEFAULT_ADVISOR_SOLVE_DEADLINE_MS = 8000

/** Thrown when a single solve/simulate exceeds the wall-clock deadline (#132). */
export class SolveDeadlineError extends Error {
  constructor(message = '求解逾時') {
    super(message)
    this.name = 'SolveDeadlineError'
  }
}

/**
 * Race `run(signal)` against a wall-clock deadline (#132). On timeout the signal
 * is aborted — which, for the real solver, terminates the worker slot and frees
 * the pool — and a `SolveDeadlineError` is thrown. A caller-supplied `runSignal`
 * (run-level cancel: superseded run / input change / unmount / cancel button)
 * also aborts the call. The underlying promise gets a no-op `.catch` so its
 * late rejection (after the race already settled) is never unhandled.
 */
function raceDeadline<T>(
  ms: number,
  runSignal: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const onRunAbort = () => controller.abort()
  if (runSignal) {
    if (runSignal.aborted) controller.abort()
    else runSignal.addEventListener('abort', onRunAbort, { once: true })
  }
  const runPromise = run(controller.signal)
  runPromise.catch(() => { /* swallow late rejection if the deadline won */ })

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // #133: reject the race with SolveDeadlineError BEFORE aborting. The abort
      // makes the worker synchronously reject `runPromise` with a
      // SolveCancelledError (cancelRequest); if that fires first it would win the
      // race and a genuine deadline would be mislabelled `cancelled`. Settling
      // the timeout first latches `timed-out`; the worker's later cancel is then
      // swallowed by `runPromise.catch`.
      reject(new SolveDeadlineError())
      controller.abort()
    }, ms)
  })

  return Promise.race([runPromise, timeout]).finally(() => {
    clearTimeout(timer)
    if (runSignal) runSignal.removeEventListener('abort', onRunAbort)
  })
}

/**
 * Wrap a `ConfirmDeps` so every solve/simulate is bounded by `deadlineMs` and
 * abortable via `runSignal` (#132). The injected `signal` reaches the solver
 * façade, which threads it to the worker so a timed-out / cancelled call truly
 * terminates the WASM and releases the slot. `deadlineMs <= 0` disables the
 * deadline (tests / opt-out) while still threading the run signal.
 */
function withSolveDeadline(
  deps: ConfirmDeps,
  deadlineMs: number,
  runSignal: AbortSignal | undefined,
): ConfirmDeps {
  if (deadlineMs <= 0 && !runSignal) return deps
  const guard = <T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> =>
    deadlineMs > 0
      ? raceDeadline(deadlineMs, runSignal, run)
      : run(makeRunOnlySignal(runSignal))
  return {
    solve: (recipe, gearset, opts) => guard(signal => deps.solve(recipe, gearset, { ...opts, signal })),
    simulate: (recipe, gearset, opts) => guard(signal => deps.simulate(recipe, gearset, { ...opts, signal })),
  }
}

/** Forward a run-level signal as-is when there's no per-call deadline. */
function makeRunOnlySignal(runSignal: AbortSignal | undefined): AbortSignal {
  if (runSignal) return runSignal
  return new AbortController().signal
}

export type MateriaPriceMap = Map<number, MarketData>

export interface MeldStep {
  stat: CraftStat
  grade: number
  placedCount: number       // melds that must succeed
  expectedCount: number     // including overmeld failure waste
  unitPrice: number | null  // null = Universalis had no listing
  subtotal: number | null   // unitPrice * expectedCount, null if no price
}

export interface MeldPlan {
  feasible: boolean
  reason?: string
  deltaStats: { craftsmanship: number; control: number; cp: number }
  steps: MeldStep[]
  totalGil: number | null   // null when any step has no price
  confirmedBySolver: boolean
}

/**
 * #133 — honest outcome discriminant for a reverse-advisor run. Replaces the
 * old bit-identical bailout: infeasible / timed-out / error / cancelled all used
 * to return the same `MeldAdvice` shape, so the UI could not tell "this recipe
 * can't be HQ-guaranteed by melds" from "the solve timed out" from "the solve
 * crashed". The UI renders each honestly and never claims 保證 HQ on a non-`feasible`
 * status.
 *
 * - `feasible`   — a solver-confirmed plan exists (incl. hqSufficient = 0 melds).
 * - `infeasible` — the full bounded ladder ran and no rung double-maxed: melds
 *                  alone cannot guarantee HQ on this recipe + gear.
 * - `timed-out`  — a solve hit the wall-clock deadline (#132) before converging.
 * - `error`      — a solve threw for a non-deadline/cancel reason.
 * - `cancelled`  — the run was superseded/aborted (rarely reaches the UI; the
 *                  composable drops a cancelled run's result).
 */
export type MeldAdviceStatus = 'feasible' | 'infeasible' | 'timed-out' | 'error' | 'cancelled'

export interface MeldAdvice {
  /** #133 — see {@link MeldAdviceStatus}. Drives honest no-result rendering and
   *  gates the apply / load-reverse CTAs (only `feasible` + a solver-confirmed
   *  plan may act). */
  status: MeldAdviceStatus
  costOptimal: MeldPlan
  bis: MeldPlan
  gapGil: number | null     // bis.totalGil - costOptimal.totalGil; null if either is null
  alreadyMeetsThreshold: boolean
  /**
   * True when maxing out HQ materials alone already double-maxes the binding
   * recipe — the meld lever is unnecessary. Consumed by the ability-mode UI
   * (Slice B2) to hide the meld step entirely and show the "HQ 素材即可達標"
   * success state. Distinct, dedicated flag so the UI does not have to infer
   * intent from `alreadyMeetsThreshold` (kept for back-compat). See §2.
   */
  hqSufficient: boolean
  /**
   * #128 — true when the cost-optimal plan could NOT be ranked by gil because
   * the market price for at least one of its materia steps was missing, so the
   * advisor fell back to ranking candidates by total materia / occupied slot
   * count (ADR-0002 "缺市場價時：改以總鑲嵌顆數 / 占用格數最少為排序依據").
   *
   * It is set precisely when the chosen plan has spend but no `totalGil`
   * (`steps.length > 0 && totalGil === null`) — covering BOTH the fully-missing
   * regime (no listing for any materia) and the partial-missing regime (some
   * grades priced, the chosen plan's grade not). A zero-spend plan
   * (already-meets / hqSufficient) has nothing to estimate and is always false,
   * even with an empty price map. The UI consumes it to show the
   * 「無市場資料，依鑲嵌數量估算」estimate hint, distinct from `confirmedBySolver`
   * (a solver-confidence signal, not a price-completeness one).
   */
  rankedByCount: boolean
}

export interface AdviseMeldOptions {
  bisReference: BiSReference
  /** initialQuality from HQ ingredients (default 0). Required so we don't
   *  over-estimate the control breakpoint. */
  initialQuality?: number
  /** Active food/medicine buffs (#136). Folded after Soul (ADR-0001) so the
   *  advisor solves on the same effectiveStats as the screen. Absent = no buffs. */
  buffs?: AdvisorBuffs
  isCancelled?: () => boolean
  /** Per-solve wall-clock deadline in ms (#132). Defaults to
   *  DEFAULT_ADVISOR_SOLVE_DEADLINE_MS; <= 0 disables it. */
  deadlineMs?: number
  /** Run-level abort (#132): superseded run / input change / unmount / cancel
   *  button. Aborting terminates any in-flight WASM solve and bails the run. */
  signal?: AbortSignal
}

/**
 * A no-meld plan (zero Δ, no steps). `totalGil` is 0 when we know no spend is
 * needed and null when cost is unknown (solver bailout); `confirmedBySolver`
 * records whether a real solver pass established the result.
 */
function emptyMeldPlan(totalGil: number | null, confirmedBySolver: boolean): MeldPlan {
  return {
    feasible: true,
    deltaStats: { craftsmanship: 0, control: 0, cp: 0 },
    steps: [],
    totalGil,
    confirmedBySolver,
  }
}

/**
 * Pick the single hardest recipe to drive the breakpoint.
 * v1: highest progress; tie-break by highest quality.
 * Multi-recipe per-axis dominance is v2.
 */
export function findBindingRecipe(targets: Recipe[]): Recipe | null {
  if (targets.length === 0) return null
  let best = targets[0]
  for (const r of targets.slice(1)) {
    const bestP = best.recipeLevelTable.difficulty
    const bestQ = best.recipeLevelTable.quality
    const rP = r.recipeLevelTable.difficulty
    const rQ = r.recipeLevelTable.quality
    if (rP > bestP || (rP === bestP && rQ > bestQ)) best = r
  }
  return best
}

/**
 * The `initialQuality` the binding recipe would start with if EVERY HQ-eligible
 * ingredient were supplied HQ. This is the correct meld baseline (§2): HQ
 * materials are the zero-cost lever and must be spent first, so meld only ever
 * covers the residual above max-HQ. Returns 0 for recipes without HQ-eligible
 * ingredient data (custom recipes / test stubs missing `ingredients` or
 * `materialQualityFactor`).
 */
export function computeMaxHqInitialQuality(recipe: Recipe): number {
  const ingredients = recipe.ingredients
  if (!ingredients || ingredients.length === 0 || !recipe.materialQualityFactor) {
    return 0
  }
  const maxHqIngredients = ingredients.map((ing) => ({
    amount: ing.amount,
    hqAmount: ing.canHq ? ing.amount : 0,
    level: ing.level,
    canHq: ing.canHq,
  }))
  return calculateInitialQuality(
    recipe.recipeLevelTable.quality,
    recipe.materialQualityFactor,
    maxHqIngredients,
  )
}

/**
 * Coarse upper bound on progress steps in a typical max-quality macro, times a
 * high-efficiency factor.
 *
 * `computeBaseProgress` is 1× efficiency, but real progress actions are far
 * more efficient: Groundwork is 360% (at full durability) and even Prudent
 * Synthesis / Careful Synthesis sit at 180%. A max-quality macro spends only a
 * handful of steps on progress, but each clears 1.8-3.6× the base. The old
 * code used a flat ×10 against 1× efficiency, which under-counted reachable
 * progress by ~3× and so demanded ~3× too much craftsmanship — falsely flagging
 * normally-craftable recipes as "槽位不足，需換底裝" (issue #99).
 *
 * This fallback bound is only used for custom recipes (suggestedCraftsmanship
 * = 0). Catalogue recipes use the RLT's own suggestedCraftsmanship — see
 * `solveProgressBreakpoint`.
 *
 * 18 is a TUNED constant (≈ 6 effective progress steps × ~1.8-3.6× action
 * efficiency, a 10.8-21.6 band), NOT a derived authority. It is used ONLY as a
 * NON-BINDING seed on the custom-recipe fallback path to pick a search starting
 * point — correctness comes from solver confirmation (the bounded quality-gap
 * search in `searchMinimalQualityDelta` and `adviseMeld`'s solver-double-max
 * authority), not from this number. See ADR-0002. The value is left at 18 so
 * the existing #99 fallback tests (which pin current seed behaviour) stay green.
 */
const PROGRESS_REACHABLE_FACTOR = 18

/**
 * Step 2 — minimum Δcraftsmanship so the binding recipe's progress is
 * clearable. Returns 0 if the current gearset (after Soul) already suffices.
 *
 * Catalogue recipes carry the RLT's `suggestedCraftsmanship` — FFXIV's own
 * per-recipe-level recommendation for comfortably clearing progress. We trust
 * it directly: Δcraft = max(0, suggestedCraftsmanship - buffed.craftsmanship).
 * This is the robust fix for #99 — the old closed-form bound ignored
 * high-efficiency progress actions and over-estimated by ~3×.
 *
 * Custom recipes set `suggestedCraftsmanship = 0`
 * (useCustomRecipes.ts) — for those we fall back to a corrected closed-form
 * bound (`computeBaseProgress` × `PROGRESS_REACHABLE_FACTOR`) which now folds
 * in a high-efficiency factor. Both paths are biased toward over-accepting so
 * the solver-confirmation step (Step 4) catches any residual shortfall, rather
 * than the old behaviour of over-rejecting feasible recipes.
 */
export function solveProgressBreakpoint(
  recipe: Recipe,
  gearset: GearsetStats,
  buffs?: AdvisorBuffs,
): number {
  const buffed = gearsetToBuffedStats(gearset, buffs)
  const rlt = recipe.recipeLevelTable

  // Preferred path: trust the recipe-level table's suggestedCraftsmanship.
  if (rlt.suggestedCraftsmanship && rlt.suggestedCraftsmanship > 0) {
    return Math.max(0, rlt.suggestedCraftsmanship - buffed.craftsmanship)
  }

  // Fallback (custom recipes, suggestedCraftsmanship = 0): corrected
  // closed-form bound with a high-efficiency factor folded in.
  const bp = computeBaseProgress(buffed.craftsmanship, gearset.level, rlt)
  const reachable = bp * PROGRESS_REACHABLE_FACTOR
  if (reachable >= rlt.difficulty) return 0

  // Binary search for the minimum craftsmanship delta that flips
  // computeBaseProgress * reachable factor >= recipe.difficulty.
  let lo = 0
  let hi = 10_000
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const bumped = computeBaseProgress(buffed.craftsmanship + mid, gearset.level, rlt)
    if (bumped * PROGRESS_REACHABLE_FACTOR >= rlt.difficulty) hi = mid
    else lo = mid + 1
  }
  return lo
}

/**
 * Internal: does the closed-form upper bound allow reaching max quality given
 * already-buffed control/cp (after Soul/food/medicine) and an initialQuality
 * head start?
 *
 * Mirrors the math of `canReachHQQuality` but takes buffed stats directly so
 * `solveQualityBreakpoint` can buff once and probe many candidates without
 * re-running `gearsetToBuffedStats` per binary-search step. Without buffs the
 * fold is additive, so adding a Δ to buffed stats is EXACT; with food % (#136)
 * a hit cap makes "buffed + Δ" only APPROXIMATE — acceptable because this only
 * seeds the inner search's first probe (ADR-0002 non-binding), and
 * `searchMinimalQualityDelta` re-confirms every candidate through the real
 * solver with the same buffs.
 */
function quietCanReachHQQuality(
  recipe: Recipe,
  buffedControl: number,
  buffedCp: number,
  level: number,
  initialQuality: number,
): boolean {
  const baseQuality = computeBaseQuality(buffedControl, level, recipe.recipeLevelTable)
  const maxQualitySteps = Math.floor(buffedCp / AVG_QUALITY_CP_COST)
  const maxAchievable =
    baseQuality * QUALITY_PHASE_UPPER_BOUND_MULTIPLIER * maxQualitySteps * MARGIN
  return (maxAchievable + initialQuality) >= recipe.recipeLevelTable.quality
}

const CP_STEP = 6
const CP_SEARCH_LIMIT = 600

/**
 * Step 3 — closed-form: minimum Δcontrol + Δcp on top of an existing
 * Δcraftsmanship so the binding recipe is quality-feasible. v1 greedy:
 * binary-search Δcontrol at each candidate Δcp.
 */
export function solveQualityBreakpoint(
  recipe: Recipe,
  gearset: GearsetStats,
  craftsmanshipDelta: number,
  initialQuality: number,
  buffs?: AdvisorBuffs,
): { control: number; cp: number } {
  // Buff once (now WITH food/medicine, #136, so the baseline matches the screen).
  // We then probe candidates by adding Δ to the buffed baseline instead of
  // re-buffing gearset+Δ per binary-search step. With food % (capped) the
  // add-Δ-to-buffed shortcut is only APPROXIMATE — but this breakpoint is a
  // NON-BINDING seed (ADR-0002): it picks the inner search's first probe point,
  // and `searchMinimalQualityDelta` re-confirms every candidate through the real
  // solver with the same buffs, so an approximate seed never changes the answer.
  // craftsmanshipDelta is folded in for a faithful baseline even though it does
  // not affect the quality math.
  const withCraft: GearsetStats = {
    ...gearset,
    craftsmanship: gearset.craftsmanship + craftsmanshipDelta,
  }
  const buffed = gearsetToBuffedStats(withCraft, buffs)

  const tryControlBinary = (cpDelta: number): number | null => {
    const cp = buffed.cp + cpDelta
    const reach = (controlDelta: number) =>
      quietCanReachHQQuality(recipe, buffed.control + controlDelta, cp, gearset.level, initialQuality)
    if (reach(0)) return 0
    let lo = 1
    let hi = 10_000
    let last: number | null = null
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (reach(mid)) {
        last = mid
        hi = mid - 1
      } else {
        lo = mid + 1
      }
    }
    return last
  }

  let bestControl = tryControlBinary(0)
  let bestCp = 0
  if (bestControl === null) {
    for (let cpDelta = CP_STEP; cpDelta <= CP_SEARCH_LIMIT; cpDelta += CP_STEP) {
      const c = tryControlBinary(cpDelta)
      if (c !== null) {
        bestControl = c
        bestCp = cpDelta
        break
      }
    }
  }
  return { control: bestControl ?? 10_000, cp: bestCp }
}

export interface ConfirmDeps {
  solve: typeof solveCraftForRecipe
  simulate: typeof simulateCraftForRecipe
}

export interface ConfirmedBreakpoint {
  deltaStats: { craftsmanship: number; control: number; cp: number }
  confirmedBySolver: boolean
}

/**
 * Double-max predicate: a sim result "double-maxes" when it reaches both max
 * progress and max quality (= guaranteed HQ). Shared by the Step 0 already-meets
 * check and the Step 4 bounded solver search (searchMinimalQualityDelta) so the
 * contract lives in one place.
 */
function isDoubleMax(simResult: {
  progress: number
  max_progress: number
  quality: number
  max_quality: number
}): boolean {
  return (
    simResult.progress >= simResult.max_progress &&
    simResult.quality >= simResult.max_quality
  )
}

/**
 * Hard-cap backstop on the number of solver calls a single bounded quality-gap
 * search may issue (ADR-0002). The search probes ascending control grades and
 * then bisects downward; this cap guarantees termination on a pathological /
 * genuinely-unsolvable recipe rather than looping unbounded. With the top grade
 * = 54 control per materia, 11 probes covers a control delta well past any
 * single gear set's slot budget, so it never binds on a solvable recipe.
 *
 * The search runs after `adviseMeld`'s Step 0 already-meets probe (1 solve), so
 * the documented overall advisor budget is 1 + 11 = 12 solves per run.
 */
const MAX_QUALITY_PROBES = 11

/** Top-grade control materia value (one meld worth of control). */
const CONTROL_GRADE_STEP = topGradeForStat('control')?.value ?? 54

/** Top-grade craftsmanship materia value (one meld worth of craftsmanship). */
const CRAFTSMANSHIP_GRADE_STEP = topGradeForStat('craftsmanship')?.value ?? 54

/**
 * Per-step progress-action efficiency used ONLY to enumerate the craftsmanship
 * ladder rungs (#127). A max-quality macro clears each progress step at far more
 * than 1× base efficiency (Groundwork 360%, Careful/Prudent Synthesis 180%);
 * 3.6 is the high-efficiency end. This is a NON-BINDING seed — it picks how much
 * craftsmanship to try per rung, not whether a rung is feasible. The inner
 * `searchMinimalQualityDelta` solver pass is the authority for every candidate
 * (ADR-0002). Wrong rung craftsmanship only wastes/saves solves, never changes
 * correctness.
 */
const PROGRESS_STEP_EFFICIENCY = 3.6

/**
 * Hard upper bound on the number of craftsmanship rungs the outer ladder probes
 * (#127). The ladder is intrinsically short — it runs from "exactly secure
 * progress" to "progress done in 1 step", and a max-quality macro only spends a
 * handful of steps on progress. This cap is a backstop so a pathological recipe
 * (e.g. a degenerate closed-form step count) can never expand the ladder
 * unbounded. With each rung issuing at most MAX_QUALITY_PROBES inner solves, the
 * documented advisor budget is 1 (Step 0) + MAX_CRAFTSMANSHIP_RUNGS ×
 * MAX_QUALITY_PROBES solves per run.
 */
const MAX_CRAFTSMANSHIP_RUNGS = 6

/**
 * #127 — enumerate the OUTER craftsmanship ladder for the bounded 3D cost search.
 *
 * Adding craftsmanship beyond securing progress only has value because clearing
 * progress in fewer steps frees the shared durability+CP budget for quality
 * (CONTEXT.md 「製作能力與資源耦合」). So the ladder is SHORT and BOUNDED:
 *
 *   - rung 0: `baseCraftDelta` — exactly secure progress (the #126 baseline).
 *   - rung k: enough extra craftsmanship to clear progress in one FEWER step.
 *   - cap:    "progress finished in 1 step" (hard upper bound — progress steps
 *             are few, so this is a handful of rungs), and `MAX_CRAFTSMANSHIP_RUNGS`.
 *
 * Returns ascending, de-duplicated craftsmanship deltas (raw points on top of the
 * bare gearset). Every value is a NON-BINDING seed for the inner solver search;
 * the closed-form step model here only chooses WHICH craftsmanship to try.
 *
 * The step count is derived from the corrected high-efficiency progress model
 * (`computeBaseProgress` × `PROGRESS_STEP_EFFICIENCY`). When the recipe's progress
 * is already comfortably cleared in 1 step at the baseline (typical normal
 * recipe), the ladder degenerates to the single baseline rung — so a
 * progress-already-met recipe behaves identically to #126 (criterion 2).
 */
export function enumerateCraftsmanshipLadder(
  recipe: Recipe,
  gearset: GearsetStats,
  baseCraftDelta: number,
  buffs?: AdvisorBuffs,
): number[] {
  const rlt = recipe.recipeLevelTable
  const buffed = gearsetToBuffedStats(gearset, buffs)
  const baseCraftsmanship = buffed.craftsmanship + baseCraftDelta

  // Progress steps cleared at a given buffed craftsmanship under the
  // high-efficiency model. Clamped to >= 1 (you always do at least one step).
  const stepsAt = (craftsmanship: number): number => {
    const perStep = computeBaseProgress(craftsmanship, gearset.level, rlt) * PROGRESS_STEP_EFFICIENCY
    if (perStep <= 0) return Number.POSITIVE_INFINITY
    return Math.max(1, Math.ceil(rlt.difficulty / perStep))
  }

  // Minimum extra craftsmanship (raw) above the baseline so progress clears in
  // `targetSteps` or fewer. Binary search on the monotone step-count function.
  const craftForSteps = (targetSteps: number): number => {
    if (stepsAt(baseCraftsmanship) <= targetSteps) return baseCraftDelta
    let lo = 0
    let hi = 10_000
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (stepsAt(baseCraftsmanship + mid) <= targetSteps) hi = mid
      else lo = mid + 1
    }
    return baseCraftDelta + lo
  }

  // Round a raw craftsmanship delta UP to the top-grade materia grid so each
  // rung is achievable with whole materia (no fractional meld). The extra
  // craftsmanship over the closed-form minimum is the rounding remainder, kept
  // because under-shooting the grid would make the rung non-meldable; the inner
  // solver still confirms feasibility either way.
  const toGrid = (raw: number) =>
    Math.ceil(raw / CRAFTSMANSHIP_GRADE_STEP) * CRAFTSMANSHIP_GRADE_STEP

  const rungs = new Set<number>([baseCraftDelta])
  const baseSteps = stepsAt(baseCraftsmanship)
  // #140 finite guard: if the baseline already has non-positive per-step progress
  // (e.g. a recipe with progressModifier === 0 → computeBaseProgress <= 0),
  // stepsAt returns Infinity. The descending loop below would then spin forever on
  // the main thread (Infinity - 1 === Infinity, Infinity >= Infinity always true),
  // and #132's async wall-clock deadline cannot interrupt a synchronous spin. There
  // is no meaningful craftsmanship ladder when progress cannot advance, so bail to
  // the single baseline rung.
  if (!Number.isFinite(baseSteps)) return [baseCraftDelta]
  // Walk down from (baseSteps - 1) to 1 (progress done in 1 step = hard cap),
  // bounded by MAX_CRAFTSMANSHIP_RUNGS additional rungs.
  const lowestTarget = Math.max(1, baseSteps - MAX_CRAFTSMANSHIP_RUNGS)
  for (let target = baseSteps - 1; target >= lowestTarget; target--) {
    const raw = craftForSteps(target)
    // Keep the baseline component exact; grid-align only the extra above it.
    rungs.add(baseCraftDelta + toGrid(raw - baseCraftDelta))
  }
  return [...rungs].sort((a, b) => a - b)
}

/**
 * #126 — solver-authoritative minimal-Δ search over the QUALITY axis only.
 *
 * The craftsmanship outer ladder (trading craftsmanship to compress progress
 * steps and free CP for quality) is #127 and is explicitly OUT of scope here:
 * craftsmanship is FIXED at the progress breakpoint carried in `seed`
 * (typically 0 for the #123 repro). This search finds the cheapest Δcontrol
 * such that `deps.solve` + `deps.simulate` double-maxes the binding recipe.
 *
 * Contract / algorithm:
 *   1. SEED Δcontrol from the closed-form `seed.control` — NON-BINDING: it only
 *      picks the first probe point to reduce solver calls. A wrong seed (the
 *      over-accept Δ=0 bug, or an over-large value) never changes the answer.
 *   2. Probe control deltas on the top-grade grid (multiples of
 *      `CONTROL_GRADE_STEP` = 54). Each probe runs `deps.solve` then
 *      `deps.simulate` on the bumped gearset and accepts only when
 *      `isDoubleMax`. Find an UPPER bound: probe the seed grid point, then march
 *      up by one grade until a double-max is found or `MAX_QUALITY_PROBES` is
 *      hit (the hard cap is the real backstop against unbounded probing).
 *   3. BISECT downward in [0, upperBound] on the grade grid for the MINIMAL
 *      confirmed delta — re-confirming via solver at each midpoint rather than
 *      trusting closed-form interpolation. Double-max is monotone in control, so
 *      bisection is sound.
 *   4. `isCancelled` is honoured between every solve.
 *
 * Returns the confirmed `deltaStats` (craftsmanship/cp pinned from the seed,
 * control = minimal confirmed) and `confirmedBySolver`. Cost ranking across
 * candidates is the caller's job via `translateDeltaToMeldPlan`; because the
 * grade-grid bisection already yields the single minimal control delta, that
 * delta is also the cheapest (fewer materia = fewer slots = lower gil under a
 * uniform top-grade price), and a null-price set simply ranks by that same
 * fewest-slots delta.
 */
export async function searchMinimalQualityDelta(
  recipe: Recipe,
  gearset: GearsetStats,
  seed: { craftsmanship: number; control: number; cp: number },
  initialQuality: number,
  deps: ConfirmDeps = { solve: solveCraftForRecipe, simulate: simulateCraftForRecipe },
  isCancelled?: () => boolean,
  buffs?: AdvisorBuffs,
): Promise<ConfirmedBreakpoint> {
  const craftsmanship = seed.craftsmanship
  const cp = seed.cp
  const pin = (control: number) => ({ craftsmanship, control, cp })

  let solveCount = 0
  const cache = new Map<number, boolean>()

  // Probe `controlDelta` raw control points. Returns null when cancelled or the
  // hard cap is exhausted (caller treats null as "could not confirm here").
  const probe = async (controlDelta: number): Promise<boolean | null> => {
    if (cache.has(controlDelta)) return cache.get(controlDelta)!
    if (isCancelled?.()) return null
    if (solveCount >= MAX_QUALITY_PROBES) return null
    const bumped: GearsetStats = {
      ...gearset,
      craftsmanship: gearset.craftsmanship + craftsmanship,
      control: gearset.control + controlDelta,
      cp: gearset.cp + cp,
    }
    solveCount++
    const solverResult = await deps.solve(recipe, bumped, { initialQuality, buffs })
    if (isCancelled?.()) return null
    const simResult = await deps.simulate(recipe, bumped, {
      actions: solverResult.actions,
      initialQuality,
      buffs,
    })
    const ok = isDoubleMax(simResult)
    cache.set(controlDelta, ok)
    return ok
  }

  // Grade-grid steps: 0, 1, 2, ... → 0, 54, 108, ...
  const toSteps = (raw: number) => Math.max(0, Math.ceil(raw / CONTROL_GRADE_STEP))
  const toDelta = (steps: number) => steps * CONTROL_GRADE_STEP

  // Phase 1 — find an upper bound starting from the (non-binding) seed grid
  // point and marching upward by one grade per probe.
  let hiSteps: number | null = null
  let step = toSteps(seed.control)
  while (solveCount < MAX_QUALITY_PROBES) {
    const ok = await probe(toDelta(step))
    if (ok === null) {
      return { deltaStats: pin(toDelta(step)), confirmedBySolver: false }
    }
    if (ok) { hiSteps = step; break }
    step += 1
  }
  if (hiSteps === null) {
    // Exhausted the probe budget without ever double-maxing → unsolvable within
    // the bounded search.
    return { deltaStats: pin(toDelta(step)), confirmedBySolver: false }
  }

  // Phase 2 — bisect downward in [0, hiSteps] for the minimal confirmed delta,
  // re-confirming via the solver at each midpoint.
  let lo = 0
  let hi = hiSteps
  let best = hiSteps
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const ok = await probe(toDelta(mid))
    if (ok === null) break // cancelled or cap hit; keep current best (confirmed)
    if (ok) { best = mid; hi = mid } else { lo = mid + 1 }
  }

  return { deltaStats: pin(toDelta(best)), confirmedBySolver: true }
}

interface AllocationCursor {
  guaranteedRemaining: number
  // Global overmeld-slot budget (shared across stats — gear pieces are finite).
  // The ladder *index* is per-stat and lives as a local in allocateForStat:
  // in-game, overmeld depth is per-piece, and ②-lite approximates that as
  // per-stat since stats land on different pieces.
  overmeldRemaining: number
}

function priceForItemNq(priceMap: MateriaPriceMap, itemId: number): number | null {
  const md = priceMap.get(itemId)
  if (!md) return null
  if (md.minPriceNQ && md.minPriceNQ > 0) return md.minPriceNQ
  if (md.minPriceHQ && md.minPriceHQ > 0) return md.minPriceHQ
  return null
}

function allocateForStat(
  stat: CraftStat,
  delta: number,
  cursor: AllocationCursor,
  priceMap: MateriaPriceMap,
): { steps: MeldStep[]; remaining: number } {
  const steps: MeldStep[] = []
  if (delta <= 0) return { steps, remaining: 0 }

  // Always use the top grade for this stat — cap waste is ②-lite scope-out.
  const top = topGradeForStat(stat)
  if (top === null) return { steps, remaining: delta }

  let remaining = delta

  // Phase A: guaranteed slots (100%, zero failure) — emit one batched step.
  if (remaining > 0 && cursor.guaranteedRemaining > 0) {
    const neededSlots = Math.ceil(remaining / top.value)
    const usedSlots = Math.min(neededSlots, cursor.guaranteedRemaining)
    steps.push(emitStep(top, usedSlots, usedSlots, priceMap))
    cursor.guaranteedRemaining -= usedSlots
    remaining -= usedSlots * top.value
  }

  // Phase B: overmeld slots, applying the fail ladder — one step per depth level.
  // `depth` is local so each stat starts at the top of the ladder; the
  // overmeld-slot budget is global and lives on the cursor.
  let depth = 0
  while (remaining > 0 && cursor.overmeldRemaining > 0) {
    const placed = 1
    const expected = expectedCountForOvermeldDepth(depth, placed)
    steps.push(emitStep(top, placed, expected, priceMap))
    depth += 1
    cursor.overmeldRemaining -= 1
    remaining -= top.value
  }

  // If we ran out of slots, the caller marks the plan infeasible.
  return { steps, remaining }
}

function emitStep(
  grade: MateriaGrade,
  placed: number,
  expected: number,
  priceMap: MateriaPriceMap,
): MeldStep {
  const unitPrice = priceForItemNq(priceMap, grade.itemId)
  const subtotal = unitPrice === null ? null : Math.round(unitPrice * expected)
  return {
    stat: grade.stat,
    grade: grade.grade,
    placedCount: placed,
    expectedCount: expected,
    unitPrice,
    subtotal,
  }
}

/**
 * Step 5 — translate a Δstats triple into a MeldPlan. Greedy big-grade-first,
 * fill guaranteed slots, overflow into overmeld with fail-ladder cost.
 * Returns feasible=false when total required slots exceed SLOT_STRUCTURE.
 */
export function translateDeltaToMeldPlan(
  deltaStats: { craftsmanship: number; control: number; cp: number },
  priceMap: MateriaPriceMap,
): MeldPlan {
  if (
    deltaStats.craftsmanship === 0 &&
    deltaStats.control === 0 &&
    deltaStats.cp === 0
  ) {
    return emptyMeldPlan(0, false)
  }

  const cursor: AllocationCursor = {
    guaranteedRemaining: SLOT_STRUCTURE.guaranteedSlots,
    overmeldRemaining: SLOT_STRUCTURE.overmeldSlots,
  }

  const allSteps: MeldStep[] = []
  let infeasible = false

  for (const stat of ['craftsmanship', 'control', 'cp'] as const) {
    const { steps, remaining } = allocateForStat(stat, deltaStats[stat], cursor, priceMap)
    allSteps.push(...steps)
    if (remaining > 0) infeasible = true
  }

  if (infeasible) {
    return {
      feasible: false,
      reason: '槽位不足,需換底裝',
      deltaStats,
      steps: allSteps,
      totalGil: null,
      confirmedBySolver: false,
    }
  }

  let totalGil: number | null = 0
  for (const s of allSteps) {
    if (s.subtotal === null) { totalGil = null; break }
    totalGil += s.subtotal
  }

  return {
    feasible: true,
    deltaStats,
    steps: allSteps,
    totalGil,
    confirmedBySolver: false,
  }
}

/**
 * Total expected materia (whole-purchase count) a plan implies — the no-price
 * ranking key (#127, ADR-0002). When gil is unavailable across candidates, the
 * cheapest plan is the one occupying the fewest slots / buying the fewest
 * materia, which is `Σ expectedCount` (overmeld waste included so a deep-overmeld
 * detour is correctly penalised against a shallow one). A plan with no steps
 * (zero delta) sums to 0.
 */
function totalMeldCount(plan: MeldPlan): number {
  let sum = 0
  for (const s of plan.steps) sum += s.expectedCount
  return sum
}

/**
 * Rank two FEASIBLE candidate plans (#127). Primary key: total gil (lower wins);
 * a priced plan always beats an unpriced one. When BOTH are unpriced (no market
 * data), fall back to fewest total melds (slot minimality), honoring the
 * ADR-0002 no-price fallback. Final tie-break is the smaller craftsmanship
 * detour so a zero-craftsmanship plan is preferred on an exact tie (keeps #126
 * behaviour for progress-already-met recipes). Returns < 0 when `a` is cheaper.
 */
function compareCandidatePlans(a: MeldPlan, b: MeldPlan): number {
  if (a.totalGil !== null && b.totalGil !== null) {
    if (a.totalGil !== b.totalGil) return a.totalGil - b.totalGil
  } else if (a.totalGil !== null) {
    return -1
  } else if (b.totalGil !== null) {
    return 1
  } else {
    const ma = totalMeldCount(a)
    const mb = totalMeldCount(b)
    if (ma !== mb) return ma - mb
  }
  return a.deltaStats.craftsmanship - b.deltaStats.craftsmanship
}

/**
 * #128 — was the cost-optimal plan ranked by materia/slot count rather than gil?
 *
 * True iff the plan actually spends materia (has steps) but its gil is unknown
 * (`totalGil === null`, i.e. at least one step had no market price). In that
 * case `compareCandidatePlans` ranked it by `totalMeldCount` (ADR-0002 no-price
 * fallback), so the headline gil/gap is unusable and the UI must show the
 * 「依鑲嵌數量估算」estimate hint. A zero-spend plan (already-meets / hqSufficient)
 * has `totalGil === 0` with no steps and is never count-ranked.
 */
function isRankedByCount(plan: MeldPlan): boolean {
  return plan.steps.length > 0 && plan.totalGil === null
}

/**
 * Step 6 — BiS ceiling plan: melds needed to lift current gear stats up to
 * BIS_REFERENCE, costed with the same slot/fail-ladder model.
 *
 * Operates on RAW gear stats (no Soul/food adjustment) because BIS_REFERENCE
 * is itself a raw-gear target. Δ is the raw delta to reach that target.
 */
export function computeBisPlan(
  gearset: GearsetStats,
  bisReference: BiSReference,
  priceMap: MateriaPriceMap,
): MeldPlan {
  const deltaStats = {
    craftsmanship: Math.max(0, bisReference.craftsmanship - gearset.craftsmanship),
    control: Math.max(0, bisReference.control - gearset.control),
    cp: Math.max(0, bisReference.cp - gearset.cp),
  }
  return translateDeltaToMeldPlan(deltaStats, priceMap)
}

export async function adviseMeld(
  targets: Recipe[],
  gearset: GearsetStats,
  priceMap: MateriaPriceMap,
  options: AdviseMeldOptions,
  deps: ConfirmDeps = { solve: solveCraftForRecipe, simulate: simulateCraftForRecipe },
): Promise<MeldAdvice> {
  const initialQuality = options.initialQuality ?? 0
  const isCancelled = options.isCancelled
  // #136: fold the screen's active food/medicine into every solver call + the
  // closed-form seeds, so the advisor judges HQ on the same effectiveStats.
  const buffs = options.buffs
  // #132: bound every solve/simulate by a wall-clock deadline and make the run
  // abortable, so a pathological recipe can't block indefinitely and a
  // superseded/cancelled run truly tears down its in-flight WASM.
  const deadlineMs = options.deadlineMs ?? DEFAULT_ADVISOR_SOLVE_DEADLINE_MS
  const guardedDeps = withSolveDeadline(deps, deadlineMs, options.signal)

  const bis = computeBisPlan(gearset, options.bisReference, priceMap)

  const binding = findBindingRecipe(targets)
  if (!binding) {
    return {
      status: 'feasible',
      costOptimal: emptyMeldPlan(0, false),
      bis,
      gapGil: bis.totalGil,
      alreadyMeetsThreshold: true,
      hqSufficient: true,
      rankedByCount: false,
    }
  }

  // §2 engine touchpoint: the meld residual is computed against the
  // initialQuality the binding recipe would have with ALL HQ materials, not the
  // screen's current (possibly partial) HQ selection. HQ materials are the
  // zero-cost lever and are spent first; meld only covers what max-HQ can't.
  // `Math.max` guards stub/edge cases where computeMaxHqInitialQuality degrades
  // to 0 (custom recipes) — never worse than the screen baseline.
  const maxHqInitialQuality = Math.max(initialQuality, computeMaxHqInitialQuality(binding))

  // Step 0: already meets (at max-HQ baseline)? → HQ materials alone suffice.
  // Deadline/cancel (#132) throw out of guardedDeps and land in the catch →
  // bailout, same as any other Step-0 solver failure.
  try {
    const solverResult = await guardedDeps.solve(binding, gearset, { initialQuality: maxHqInitialQuality, buffs })
    if (isCancelled?.()) return bailout(bis, 'cancelled')
    const simResult = await guardedDeps.simulate(binding, gearset, {
      actions: solverResult.actions,
      initialQuality: maxHqInitialQuality,
      buffs,
    })
    if (isDoubleMax(simResult)) {
      return {
        status: 'feasible',
        costOptimal: emptyMeldPlan(0, true),
        bis,
        gapGil: bis.totalGil,
        alreadyMeetsThreshold: true,
        hqSufficient: true,
        rankedByCount: false,
      }
    }
  } catch (err) {
    // #133: distinguish deadline (timed-out) / cancel (cancelled) / other
    // (error) instead of the old bit-identical bailout.
    return bailout(bis, statusForError(err))
  }

  if (isCancelled?.()) return bailout(bis, 'cancelled')

  // Steps 2 + 3: closed-form breakpoints (on top of max-HQ baseline), demoted to
  // NON-BINDING SEEDS (ADR-0002). solveProgressBreakpoint gives the BASE rung of
  // the #127 craftsmanship ladder; solveQualityBreakpoint seeds the inner control
  // search's first probe point.
  const craftDelta = solveProgressBreakpoint(binding, gearset, buffs)

  if (isCancelled?.()) return bailout(bis, 'cancelled')

  // Step 4 (#127): the OUTER craftsmanship ladder around the #126 inner quality
  // search, completing the 3D (craftsmanship × control × CP) bounded cost search.
  // For each bounded rung — exactly-secure-progress up to progress-done-in-1-step
  // — run the solver-authoritative inner search for the cheapest confirmed
  // Δcontrol(+ΔCP), translate to a MeldPlan, and keep the globally cheapest
  // FEASIBLE + solver-confirmed candidate. Adding craftsmanship only helps when
  // finishing progress in fewer steps frees CP budget for quality; the search
  // ranks that coupling against direct control on real gil (ADR-0002).
  const ladder = enumerateCraftsmanshipLadder(binding, gearset, craftDelta, buffs)

  let best: MeldPlan | null = null
  let bestConfirmed = false
  // #133: why the ladder stopped without a confirmed plan — drives the honest
  // terminal status. Stays null while the ladder runs to completion (→ infeasible).
  let interruptedStatus: Exclude<MeldAdviceStatus, 'feasible' | 'infeasible'> | null = null
  for (const rungCraft of ladder) {
    if (isCancelled?.()) { interruptedStatus = 'cancelled'; break }
    // Re-seed the inner control search at this rung's craftsmanship. The seed is
    // non-binding (search speed only); recompute it so the probe starts near the
    // answer for THIS rung rather than the stale baseline-craftsmanship hint.
    const qualityDelta = solveQualityBreakpoint(binding, gearset, rungCraft, maxHqInitialQuality, buffs)
    const seed = { craftsmanship: rungCraft, control: qualityDelta.control, cp: qualityDelta.cp }

    let confirmed: ConfirmedBreakpoint
    try {
      confirmed = await searchMinimalQualityDelta(
        binding, gearset, seed, maxHqInitialQuality, guardedDeps, isCancelled, buffs,
      )
    } catch (err) {
      // #132: a wall-clock deadline or run-level abort tore down an in-flight
      // solve. Stop the ladder and keep the best confirmed candidate so far
      // (the bailout shape if none) rather than rejecting the whole advisor.
      // #133: remember WHY so the terminal status is honest (timed-out / cancelled).
      if (err instanceof SolveDeadlineError || err instanceof SolveCancelledError) {
        interruptedStatus = statusForError(err)
        break
      }
      throw err
    }
    // Criterion 4: only solver double-max-confirmed candidates enter the price
    // comparison. An unconfirmed rung (cancelled or genuinely unsolvable within
    // the cap) is skipped — unless NO rung confirms, in which case the last
    // unconfirmed plan is surfaced so the UI still shows the bailout shape.
    const plan = translateDeltaToMeldPlan(confirmed.deltaStats, priceMap)
    plan.confirmedBySolver = confirmed.confirmedBySolver

    if (confirmed.confirmedBySolver && plan.feasible) {
      if (best === null || !bestConfirmed || compareCandidatePlans(plan, best) < 0) {
        best = plan
        bestConfirmed = true
      }
    } else if (!bestConfirmed && best === null) {
      best = plan
    }
  }

  const costOptimal = best ?? emptyMeldPlan(null, false)

  // #133: honest terminal status. A solver-confirmed plan → feasible. Otherwise
  // the run either ran the full ladder with nothing confirmed (genuinely
  // infeasible by melds) or was cut short by a deadline/cancel (timed-out /
  // cancelled) — never claim feasibility for an unconfirmed best.
  const status: MeldAdviceStatus = bestConfirmed
    ? 'feasible'
    : interruptedStatus ?? 'infeasible'

  // Step 7: gap (clamped to ≥ 0 — if optimal cost exceeds BiS cost the user
  // is already paying more than needed, so the "saving" is 0, not negative).
  const gapGil =
    bis.totalGil !== null && costOptimal.totalGil !== null
      ? Math.max(0, bis.totalGil - costOptimal.totalGil)
      : null

  return {
    status,
    costOptimal,
    bis,
    gapGil,
    alreadyMeetsThreshold: false,
    hqSufficient: false,
    rankedByCount: isRankedByCount(costOptimal),
  }
}

function bailout(bis: MeldPlan, status: Exclude<MeldAdviceStatus, 'feasible'>): MeldAdvice {
  return {
    status,
    costOptimal: emptyMeldPlan(null, false),
    bis,
    gapGil: null,
    alreadyMeetsThreshold: false,
    hqSufficient: false,
    rankedByCount: false,
  }
}

/** #133 — map a thrown solver error to the honest non-feasible status it
 *  represents. Deadline → timed-out, deliberate cancel → cancelled, anything
 *  else → error. */
function statusForError(err: unknown): Exclude<MeldAdviceStatus, 'feasible' | 'infeasible'> {
  if (err instanceof SolveDeadlineError) return 'timed-out'
  if (err instanceof SolveCancelledError) return 'cancelled'
  return 'error'
}

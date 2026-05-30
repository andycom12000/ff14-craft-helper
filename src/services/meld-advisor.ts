/**
 * Materia Meld Advisor.
 *
 * Reverse-solves the minimum materia spend on a same-job recipe set so the
 * Raphael solver can double-max (= guarantee HQ) every target, and compares
 * to a maintained per-patch BiS reference. The gap between the two is the
 * headline value.
 *
 * Algorithm (approach B = closed-form prefilter + bounded solver confirmation):
 *   0. already-meets check at the MAX-HQ baseline (§2): if maxing every HQ
 *      material alone double-maxes the binding recipe, HQ materials suffice and
 *      no meld is needed (hqSufficient = true)
 *   1. pick binding recipe (single-axis-max binding for v1)
 *   2. solveProgressBreakpoint (closed-form)
 *   3. solveQualityBreakpoint (closed-form binary search). Quality breakpoints
 *      use the max-HQ initialQuality (all HQ ingredients), NOT the screen's
 *      current selection — meld only covers the residual above max-HQ.
 *   4. confirmBreakpointWithSolver (1-3 real solves, bump up on shortfall)
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
import { solveCraftForRecipe, simulateCraftForRecipe } from '@/solver/api'
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
import { calculateInitialQuality } from '@/engine/quality'

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

export interface MeldAdvice {
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
}

export interface AdviseMeldOptions {
  bisReference: BiSReference
  /** initialQuality from HQ ingredients (default 0). Required so we don't
   *  over-estimate the control breakpoint. */
  initialQuality?: number
  isCancelled?: () => boolean
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
 * `solveProgressBreakpoint`. Factor chosen conservatively: ~6 effective
 * progress steps at ~3× efficiency ≈ 18, biased toward over-accepting (the
 * solver-confirmation step catches any genuine shortfall) rather than the
 * old over-rejecting behaviour.
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
): number {
  const buffed = gearsetToBuffedStats(gearset, undefined)
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
 * re-running `gearsetToBuffedStats` per binary-search step (the Soul/buff fold
 * is additive when buffs are absent, so adding a Δ to buffed stats is identical
 * to buffing gearset+Δ).
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
): { control: number; cp: number } {
  // Buff once. The closed-form quality bound depends only on control/cp, which
  // are additive through the Soul/buff fold (buffs absent here), so we probe
  // candidates by adding Δ to the buffed baseline instead of re-buffing
  // gearset+Δ on every binary-search step. craftsmanshipDelta is folded in for
  // a faithful baseline even though it does not affect the quality math.
  const withCraft: GearsetStats = {
    ...gearset,
    craftsmanship: gearset.craftsmanship + craftsmanshipDelta,
  }
  const buffed = gearsetToBuffedStats(withCraft, undefined)

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

const MAX_CONFIRM_ATTEMPTS = 3
const BUMP_FACTOR = 0.05 // 5% upward bump on shortfall
// Safety margin applied when seeding a zero axis from a shortfall ratio, so the
// first seeded attempt overshoots slightly rather than landing just short.
const SEED_MARGIN = 1.1

/**
 * Estimate the raw stat delta to seed a *zero* axis that the closed-form
 * pre-filter optimistically left at 0, using the shortfall observed by the
 * solver. Quality and progress are both ~linear in their driving stat
 * (control / craftsmanship), so scaling the buffed stat by the achieved-vs-target
 * ratio is a good first guess; the bump loop refines from there.
 *
 * `buffedAxis` is the buffed value of the driving stat at the current candidate
 * (raw delta is additive through the Soul/buff fold, so the raw seed equals the
 * buffed seed). Falls back to a 10% nudge when the solver achieved nothing.
 */
function seedZeroAxis(achieved: number, target: number, buffedAxis: number): number {
  if (achieved <= 0) return Math.max(1, Math.round(buffedAxis * 0.1))
  const ratio = target / achieved
  return Math.max(1, Math.ceil(buffedAxis * (ratio - 1) * SEED_MARGIN))
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
 * check and the Step 4 confirmation loop so the contract lives in one place.
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
 * Step 4 — confirm a closed-form candidate against the real solver.
 * If the solver can't double-max with the candidate stats, bump the short axes
 * (and seed any zero axis whose dimension is short) and retry. Bounded to
 * MAX_CONFIRM_ATTEMPTS total solves.
 *
 * `deps` is injected so tests can mock the solver without bootstrapping WASM.
 */
export async function confirmBreakpointWithSolver(
  recipe: Recipe,
  gearset: GearsetStats,
  candidate: { craftsmanship: number; control: number; cp: number },
  initialQuality: number,
  deps: ConfirmDeps = { solve: solveCraftForRecipe, simulate: simulateCraftForRecipe },
  isCancelled?: () => boolean,
): Promise<ConfirmedBreakpoint> {
  let delta = { ...candidate }
  for (let attempt = 0; attempt < MAX_CONFIRM_ATTEMPTS; attempt++) {
    if (isCancelled?.()) return { deltaStats: delta, confirmedBySolver: false }
    const bumped: GearsetStats = {
      ...gearset,
      craftsmanship: gearset.craftsmanship + delta.craftsmanship,
      control: gearset.control + delta.control,
      cp: gearset.cp + delta.cp,
    }
    const solverResult = await deps.solve(recipe, bumped, { initialQuality })
    if (isCancelled?.()) return { deltaStats: delta, confirmedBySolver: false }
    const simResult = await deps.simulate(recipe, bumped, {
      actions: solverResult.actions,
      initialQuality,
    })
    if (isDoubleMax(simResult)) return { deltaStats: delta, confirmedBySolver: true }
    // Retry: bump axes that already carry a positive delta. A zero axis is only
    // touched when the solver shows that *its* dimension is short — then it is
    // SEEDED from the shortfall (the closed-form pre-filter over-accepts and can
    // hand us Δ=0 on an axis that is actually needed; the old `=== 0 ? 0` guard
    // could never lift it, so the advisor silently recommended "0 melds" for an
    // unsolvable gearset). Axes whose dimension is already met stay untouched so
    // we don't inflate cost.
    const progressShort = simResult.progress < simResult.max_progress
    const qualityShort = simResult.quality < simResult.max_quality
    const buffed = gearsetToBuffedStats(bumped, undefined)
    delta = {
      craftsmanship: delta.craftsmanship > 0
        ? Math.ceil(delta.craftsmanship * (1 + BUMP_FACTOR)) + 1
        : (progressShort ? seedZeroAxis(simResult.progress, simResult.max_progress, buffed.craftsmanship) : 0),
      control: delta.control > 0
        ? Math.ceil(delta.control * (1 + BUMP_FACTOR)) + 1
        : (qualityShort ? seedZeroAxis(simResult.quality, simResult.max_quality, buffed.control) : 0),
      cp: delta.cp > 0 ? Math.ceil(delta.cp * (1 + BUMP_FACTOR)) : 0,
    }
  }
  return { deltaStats: delta, confirmedBySolver: false }
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

  const bis = computeBisPlan(gearset, options.bisReference, priceMap)

  const binding = findBindingRecipe(targets)
  if (!binding) {
    return {
      costOptimal: emptyMeldPlan(0, false),
      bis,
      gapGil: bis.totalGil,
      alreadyMeetsThreshold: true,
      hqSufficient: true,
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
  try {
    const solverResult = await deps.solve(binding, gearset, { initialQuality: maxHqInitialQuality })
    if (isCancelled?.()) return bailout(bis)
    const simResult = await deps.simulate(binding, gearset, {
      actions: solverResult.actions,
      initialQuality: maxHqInitialQuality,
    })
    if (isDoubleMax(simResult)) {
      return {
        costOptimal: emptyMeldPlan(0, true),
        bis,
        gapGil: bis.totalGil,
        alreadyMeetsThreshold: true,
        hqSufficient: true,
      }
    }
  } catch {
    return bailout(bis)
  }

  if (isCancelled?.()) return bailout(bis)

  // Steps 2 + 3: closed-form breakpoints (on top of max-HQ baseline).
  const craftDelta = solveProgressBreakpoint(binding, gearset)
  const qualityDelta = solveQualityBreakpoint(binding, gearset, craftDelta, maxHqInitialQuality)
  const candidate = {
    craftsmanship: craftDelta,
    control: qualityDelta.control,
    cp: qualityDelta.cp,
  }

  if (isCancelled?.()) return bailout(bis)

  // Step 4: confirm.
  const confirmed = await confirmBreakpointWithSolver(
    binding, gearset, candidate, maxHqInitialQuality, deps, isCancelled,
  )

  // Step 5: translate.
  const costOptimal = translateDeltaToMeldPlan(confirmed.deltaStats, priceMap)
  costOptimal.confirmedBySolver = confirmed.confirmedBySolver

  // Step 7: gap (clamped to ≥ 0 — if optimal cost exceeds BiS cost the user
  // is already paying more than needed, so the "saving" is 0, not negative).
  const gapGil =
    bis.totalGil !== null && costOptimal.totalGil !== null
      ? Math.max(0, bis.totalGil - costOptimal.totalGil)
      : null

  return { costOptimal, bis, gapGil, alreadyMeetsThreshold: false, hqSufficient: false }
}

function bailout(bis: MeldPlan): MeldAdvice {
  return {
    costOptimal: emptyMeldPlan(null, false),
    bis,
    gapGil: null,
    alreadyMeetsThreshold: false,
    hqSufficient: false,
  }
}

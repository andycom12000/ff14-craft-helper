/**
 * Materia Meld Advisor.
 *
 * Reverse-solves the minimum materia spend on a same-job recipe set so the
 * Raphael solver can double-max (= guarantee HQ) every target, and compares
 * to a maintained per-patch BiS reference. The gap between the two is the
 * headline value.
 *
 * Algorithm (approach B = closed-form prefilter + bounded solver confirmation):
 *   0. already-meets check (skip if current gearset already double-maxes)
 *   1. pick binding recipe (single-axis-max binding for v1)
 *   2. solveProgressBreakpoint (closed-form)
 *   3. solveQualityBreakpoint (closed-form binary search, honours initialQuality
 *      from HQ ingredients)
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
  SLOT_STRUCTURE, OVERMELD_SUCCESS_LADDER,
  expectedCountForOvermeldDepth, materiaForStat,
} from '@/engine/materia'
import {
  computeBaseProgress,
  computeBaseQuality,
  QUALITY_PHASE_UPPER_BOUND_MULTIPLIER,
  AVG_QUALITY_CP_COST,
  MARGIN,
} from '@/services/feasibility-prefilter'
import { gearsetToBuffedStats } from '@/services/stat-stacking'

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
}

export interface AdviseMeldOptions {
  bisReference: BiSReference
  /** initialQuality from HQ ingredients (default 0). Required so we don't
   *  over-estimate the control breakpoint. */
  initialQuality?: number
  isCancelled?: () => boolean
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

/** Coarse upper bound on progress steps in a typical max-quality macro. */
const PROGRESS_STEP_UPPER_BOUND = 10

/**
 * Step 2 — closed-form: minimum Δcraftsmanship so the binding recipe's
 * progress is clearable. Returns 0 if the current gearset (after Soul) already
 * suffices.
 */
export function solveProgressBreakpoint(
  recipe: Recipe,
  gearset: GearsetStats,
): number {
  const buffed = gearsetToBuffedStats(gearset, undefined)
  const rlt = recipe.recipeLevelTable
  const bp = computeBaseProgress(buffed.craftsmanship, gearset.level, rlt)
  const reachable = bp * PROGRESS_STEP_UPPER_BOUND
  if (reachable >= rlt.difficulty) return 0

  // Binary search for the minimum craftsmanship delta that flips
  // computeBaseProgress * step upper bound >= recipe.difficulty.
  let lo = 0
  let hi = 10_000
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const bumped = computeBaseProgress(buffed.craftsmanship + mid, gearset.level, rlt)
    if (bumped * PROGRESS_STEP_UPPER_BOUND >= rlt.difficulty) hi = mid
    else lo = mid + 1
  }
  return lo
}

/**
 * Internal: does the closed-form upper bound allow reaching max quality
 * for this gearset (after Soul/buffs), given an initialQuality head start?
 *
 * Mirrors the math of `canReachHQQuality` but accepts an explicit
 * initialQuality so HQ sub-materials are honoured.
 */
function quietCanReachHQQuality(
  recipe: Recipe,
  gearset: GearsetStats,
  initialQuality: number,
): boolean {
  const buffed = gearsetToBuffedStats(gearset, undefined)
  const baseQuality = computeBaseQuality(buffed.control, gearset.level, recipe.recipeLevelTable)
  const maxQualitySteps = Math.floor(buffed.cp / AVG_QUALITY_CP_COST)
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
  const withCraft: GearsetStats = {
    ...gearset,
    craftsmanship: gearset.craftsmanship + craftsmanshipDelta,
  }

  const tryControlBinary = (cpDelta: number): number | null => {
    const withCp: GearsetStats = { ...withCraft, cp: withCraft.cp + cpDelta }
    if (quietCanReachHQQuality(recipe, withCp, initialQuality)) return 0
    let lo = 1
    let hi = 10_000
    let last: number | null = null
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2)
      const probe: GearsetStats = { ...withCp, control: withCp.control + mid }
      if (quietCanReachHQQuality(recipe, probe, initialQuality)) {
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

export interface ConfirmDeps {
  solve: typeof solveCraftForRecipe
  simulate: typeof simulateCraftForRecipe
}

export interface ConfirmedBreakpoint {
  deltaStats: { craftsmanship: number; control: number; cp: number }
  confirmedBySolver: boolean
}

/**
 * Step 4 — confirm a closed-form candidate against the real solver.
 * If the solver can't double-max with the candidate stats, bump all three
 * deltas by 5% and retry. Bounded to MAX_CONFIRM_ATTEMPTS total solves.
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
    const passes =
      simResult.progress >= simResult.max_progress &&
      simResult.quality >= simResult.max_quality
    if (passes) return { deltaStats: delta, confirmedBySolver: true }
    // Bump up and retry — only bump axes that already have a positive delta
    // to avoid inflating zero-cost axes (e.g. craftsmanship already sufficient).
    delta = {
      craftsmanship: delta.craftsmanship === 0 ? 0 : Math.ceil(delta.craftsmanship * (1 + BUMP_FACTOR)) + 1,
      control: delta.control === 0 ? 0 : Math.ceil(delta.control * (1 + BUMP_FACTOR)) + 1,
      cp: delta.cp === 0 ? 0 : Math.ceil(delta.cp * (1 + BUMP_FACTOR)),
    }
  }
  return { deltaStats: delta, confirmedBySolver: false }
}

interface AllocationCursor {
  guaranteedRemaining: number
  overmeldDepth: number  // next overmeld slot index
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
  const grades = materiaForStat(stat)
  if (grades.length === 0) return { steps, remaining: delta }
  const top = grades[0]

  let remaining = delta

  // Phase A: guaranteed slots (100%, zero failure) — emit one batched step.
  if (remaining > 0 && cursor.guaranteedRemaining > 0) {
    const neededSlots = Math.ceil(remaining / top.value)
    const usedSlots = Math.min(neededSlots, cursor.guaranteedRemaining)
    const placed = usedSlots
    steps.push(emitStep(top, placed, placed, priceMap))
    cursor.guaranteedRemaining -= usedSlots
    remaining -= usedSlots * top.value
  }

  // Phase B: overmeld slots, applying the fail ladder — one step per depth level.
  while (remaining > 0 && cursor.overmeldDepth < SLOT_STRUCTURE.overmeldSlots) {
    const placed = 1
    const expected = expectedCountForOvermeldDepth(cursor.overmeldDepth, placed)
    steps.push(emitStep(top, placed, expected, priceMap))
    cursor.overmeldDepth += 1
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
    return {
      feasible: true,
      deltaStats,
      steps: [],
      totalGil: 0,
      confirmedBySolver: false,
    }
  }

  const cursor: AllocationCursor = {
    guaranteedRemaining: SLOT_STRUCTURE.guaranteedSlots,
    overmeldDepth: 0,
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

export interface AdviseMeldDeps extends ConfirmDeps {}

export async function adviseMeld(
  targets: Recipe[],
  gearset: GearsetStats,
  priceMap: MateriaPriceMap,
  options: AdviseMeldOptions,
  deps: AdviseMeldDeps = { solve: solveCraftForRecipe, simulate: simulateCraftForRecipe },
): Promise<MeldAdvice> {
  const initialQuality = options.initialQuality ?? 0
  const isCancelled = options.isCancelled

  const bis = computeBisPlan(gearset, options.bisReference, priceMap)

  const binding = findBindingRecipe(targets)
  if (!binding) {
    return {
      costOptimal: {
        feasible: true,
        deltaStats: { craftsmanship: 0, control: 0, cp: 0 },
        steps: [],
        totalGil: 0,
        confirmedBySolver: false,
      },
      bis,
      gapGil: bis.totalGil,
      alreadyMeetsThreshold: true,
    }
  }

  // Step 0: already meets?
  try {
    const solverResult = await deps.solve(binding, gearset, { initialQuality })
    if (isCancelled?.()) return bailout(bis)
    const simResult = await deps.simulate(binding, gearset, {
      actions: solverResult.actions,
      initialQuality,
    })
    const passes =
      simResult.progress >= simResult.max_progress &&
      simResult.quality >= simResult.max_quality
    if (passes) {
      const emptyPlan: MeldPlan = {
        feasible: true,
        deltaStats: { craftsmanship: 0, control: 0, cp: 0 },
        steps: [],
        totalGil: 0,
        confirmedBySolver: true,
      }
      return {
        costOptimal: emptyPlan,
        bis,
        gapGil: bis.totalGil,
        alreadyMeetsThreshold: true,
      }
    }
  } catch {
    return bailout(bis)
  }

  if (isCancelled?.()) return bailout(bis)

  // Steps 2 + 3: closed-form breakpoints.
  const craftDelta = solveProgressBreakpoint(binding, gearset)
  const qualityDelta = solveQualityBreakpoint(binding, gearset, craftDelta, initialQuality)
  const candidate = {
    craftsmanship: craftDelta,
    control: qualityDelta.control,
    cp: qualityDelta.cp,
  }

  if (isCancelled?.()) return bailout(bis)

  // Step 4: confirm.
  const confirmed = await confirmBreakpointWithSolver(
    binding, gearset, candidate, initialQuality, deps, isCancelled,
  )

  // Step 5: translate.
  const costOptimal = translateDeltaToMeldPlan(confirmed.deltaStats, priceMap)
  costOptimal.confirmedBySolver = confirmed.confirmedBySolver

  // Step 7: gap.
  const gapGil =
    bis.totalGil !== null && costOptimal.totalGil !== null
      ? bis.totalGil - costOptimal.totalGil
      : null

  return { costOptimal, bis, gapGil, alreadyMeetsThreshold: false }
}

function bailout(bis: MeldPlan): MeldAdvice {
  const conservative: MeldPlan = {
    feasible: true,
    deltaStats: { craftsmanship: 0, control: 0, cp: 0 },
    steps: [],
    totalGil: null,
    confirmedBySolver: false,
  }
  return {
    costOptimal: conservative,
    bis,
    gapGil: null,
    alreadyMeetsThreshold: false,
  }
}

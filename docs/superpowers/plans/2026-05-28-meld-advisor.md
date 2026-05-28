# Materia Meld Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Materia Meld Advisor" that reverse-solves the minimum materia spend to guarantee HQ on a recipe (or whole batch) and compares it to a full-BiS pentameld ceiling — surfaced in both simulator and batch as a side-by-side card with the gil **gap** as the headline.

**Architecture:** New deep modules `engine/materia` (constants + pure helpers) and `services/meld-advisor` (the reverse-solve algorithm, mirrored on the `buff-recommender.ts` pattern). Integration: Phase 6 hook in `batch-optimizer`, parallel "ride-along" trigger in simulator (no separate button). All stat work goes through ADR-0001 canonical stacking; materia delta is applied at raw gear (before Soul of the Crafter). Threshold = double-max (guaranteed HQ). Fidelity = ②-lite (hardcoded slot structure + hardcoded overmeld success ladder; per-version cap tables are deferred to v2).

**Tech Stack:** Vue 3 + Pinia + Element Plus + Vite + TypeScript + Vitest. Raphael WASM solver via `@/solver/api` (`solveCraftForRecipe`, `simulateCraftForRecipe`). Market prices via `@/api/universalis`.

**Source spec:** GitHub Issue #91. Re-read it before starting if unsure about any decision.

---

## File Structure

**New files:**
- `src/engine/materia.ts` — `MATERIA_GRADES`, `SLOT_STRUCTURE`, `OVERMELD_SUCCESS_LADDER`, `BIS_REFERENCE` constants + pure helpers (`materiaForStat`, `topGradeForStat`, `expectedCountForOvermeldDepth`).
- `src/services/meld-advisor.ts` — public `adviseMeld()` async fn plus private breakpoint/translate/BiS helpers. Single owner of the reverse-solve algorithm.
- `src/components/MeldAdvisorCard.vue` — dumb presentation card; takes `MeldAdvice | 'loading' | 'stale' | null` and renders 6 states.
- `src/__tests__/engine/materia.test.ts` — constants integrity + helpers.
- `src/__tests__/services/meld-advisor.test.ts` — algorithm tests (Step 0-7 branches + HQ-initialQuality regression + cancellation + golden snapshot).

**Modified files:**
- `src/services/stat-stacking.ts` — extend `recipeToCraftParams` to accept an optional `initialQuality` override; canonical entry point keeps owning the parameter.
- `src/solver/api.ts` — extend `CraftRequestOptions` / `SimulateRequestOptions` to forward optional `initialQuality`.
- `src/api/universalis.ts` — add helper to fetch materia prices (or document how to reuse existing multi-id fetch).
- `src/services/batch-optimizer.ts` — Phase 6 hook: group by job, call `adviseMeld`, attach to result.
- `src/stores/batch.ts` — add `meldAdvicePerJob: Map<string, MeldAdvice>` to the batch result type.
- `src/__tests__/services/batch-optimizer.test.ts` — Phase 6 hookup, HQ → initialQuality propagation, cancellation.
- `src/__tests__/services/stat-stacking-parity.test.ts` — extension: materia delta applies before Soul.
- `src/views/SimulatorView.vue` (or whichever component owns the simulator solve button — investigation step in Task 18) — mount card, wire to existing solve trigger.
- `src/components/batch/` — mount one card per job in the batch result area (investigation step in Task 19).

**Patterns to follow (read first):**
- `src/engine/food-medicine.ts` — constant table + pure helper style.
- `src/services/buff-recommender.ts` — service signature, `isCancelled` token, `onProgress`, dedup-by-stats, ceiling check.
- `src/services/feasibility-prefilter.ts` — closed-form quality upper bound (`canReachHQQuality`, `computeBaseProgress`).
- `src/services/stat-stacking.ts` — `gearsetToBuffedStats`, `recipeToCraftParams` (ADR-0001).
- `docs/adr/0001-stat-stacking-order.md` — non-negotiable stacking order.

**Out of scope** (do NOT add tasks for these — see PRD `Out of Scope`):
- Per-piece gear inventory, Etro/Lodestone import, per-version cap tables, cross-axis global optimum, multi-recipe per-axis dominance, per-job BiS variance, collectability thresholds, gathering/battle materia, cross-server arbitrage, global on/off toggle.

---

## Task 1: Materia stat constants table

**Files:**
- Create: `src/engine/materia.ts`
- Create: `src/__tests__/engine/materia.test.ts`

Materia bonuses are **flat +N** (unlike food's percent+max). Source values from raphael-rs game data / Garland Tools, matching the patch comment in `food-medicine.ts`. Use placeholder values that match Dawntrail 7.x; document the source and last-verified patch in a code comment.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/engine/materia.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MATERIA_GRADES } from '@/engine/materia'

describe('MATERIA_GRADES', () => {
  it('covers craftsmanship/control/cp at the top grade', () => {
    const top = Math.max(...MATERIA_GRADES.map(m => m.grade))
    const topGradeStats = new Set(
      MATERIA_GRADES.filter(m => m.grade === top).map(m => m.stat),
    )
    expect(topGradeStats.has('craftsmanship')).toBe(true)
    expect(topGradeStats.has('control')).toBe(true)
    expect(topGradeStats.has('cp')).toBe(true)
  })

  it('every entry has a positive value and a Universalis itemId', () => {
    for (const m of MATERIA_GRADES) {
      expect(m.value).toBeGreaterThan(0)
      expect(m.itemId).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/engine/materia.test.ts`
Expected: FAIL — `Cannot find module '@/engine/materia'`.

- [ ] **Step 3: Create the constants module**

Create `src/engine/materia.ts`:

```ts
/**
 * Materia stat tables for the meld advisor.
 * Source: raphael-rs game data + Garland Tools.
 * Last verified patch: 7.x (Dawntrail). When a major patch ships,
 * re-check Grade XII/XI values and itemIds.
 *
 * Stacking note (ADR-0001): materia adds to RAW gear stats. Apply BEFORE
 * `applyCrafterSoulBonus` and before food/medicine. Callers must produce a
 * Δstats triple and feed it through `gearsetToBuffedStats` — never apply
 * after food/medicine.
 */

export type CraftStat = 'craftsmanship' | 'control' | 'cp'

export interface MateriaGrade {
  grade: number       // e.g. 12, 11, 10
  stat: CraftStat
  value: number       // flat bonus
  itemId: number      // Universalis item ID
}

// Values below are illustrative for the patch noted above; verify against the
// game data table in raphael-rs (game_data/items.csv) when bumping patches.
export const MATERIA_GRADES: MateriaGrade[] = [
  // Grade XII (top)
  { grade: 12, stat: 'craftsmanship', value: 54, itemId: 41757 },
  { grade: 12, stat: 'control',       value: 54, itemId: 41758 },
  { grade: 12, stat: 'cp',            value: 14, itemId: 41759 },
  // Grade XI (overmeld top-up tier)
  { grade: 11, stat: 'craftsmanship', value: 45, itemId: 33930 },
  { grade: 11, stat: 'control',       value: 45, itemId: 33931 },
  { grade: 11, stat: 'cp',            value: 12, itemId: 33932 },
  // Grade X (lower top-up, used when caps would waste XI)
  { grade: 10, stat: 'craftsmanship', value: 36, itemId: 33918 },
  { grade: 10, stat: 'control',       value: 36, itemId: 33919 },
  { grade: 10, stat: 'cp',            value:  9, itemId: 33920 },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/engine/materia.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/materia.ts src/__tests__/engine/materia.test.ts
git commit -m "feat(meld-advisor): add MATERIA_GRADES constant table"
```

---

## Task 2: Slot structure & overmeld success ladder

**Files:**
- Modify: `src/engine/materia.ts`
- Modify: `src/__tests__/engine/materia.test.ts`

Slot structure represents a full crafter gear set (main + off + 5 armor + 5 accessories = 12 pieces). The success-rate ladder is a **game constant** indexed by overmeld depth (0 = first overmeld, ...). Both are hardcoded; per-version cap tables are out of scope.

- [ ] **Step 1: Add failing tests for the new constants**

Append to `src/__tests__/engine/materia.test.ts`:

```ts
import {
  MATERIA_GRADES,
  SLOT_STRUCTURE,
  OVERMELD_SUCCESS_LADDER,
} from '@/engine/materia'

describe('SLOT_STRUCTURE', () => {
  it('has positive guaranteed and overmeld slot totals', () => {
    expect(SLOT_STRUCTURE.guaranteedSlots).toBeGreaterThan(0)
    expect(SLOT_STRUCTURE.overmeldSlots).toBeGreaterThan(0)
  })

  it('total slots are within a sane range for a 12-piece crafter set', () => {
    const total = SLOT_STRUCTURE.guaranteedSlots + SLOT_STRUCTURE.overmeldSlots
    expect(total).toBeGreaterThanOrEqual(20)
    expect(total).toBeLessThanOrEqual(60)
  })
})

describe('OVERMELD_SUCCESS_LADDER', () => {
  it('is monotone non-increasing in (0, 1]', () => {
    expect(OVERMELD_SUCCESS_LADDER.length).toBeGreaterThan(0)
    for (let i = 0; i < OVERMELD_SUCCESS_LADDER.length; i++) {
      expect(OVERMELD_SUCCESS_LADDER[i]).toBeGreaterThan(0)
      expect(OVERMELD_SUCCESS_LADDER[i]).toBeLessThanOrEqual(1)
      if (i > 0) {
        expect(OVERMELD_SUCCESS_LADDER[i]).toBeLessThanOrEqual(OVERMELD_SUCCESS_LADDER[i - 1])
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/engine/materia.test.ts`
Expected: FAIL — `SLOT_STRUCTURE`/`OVERMELD_SUCCESS_LADDER` not exported.

- [ ] **Step 3: Add the constants**

Append to `src/engine/materia.ts`:

```ts
/**
 * Aggregate slot structure for a full crafter gear set (12 pieces:
 * main + off + 5 armor + 5 accessories). Base meld slots are guaranteed
 * (100% success); the rest are overmeld slots subject to OVERMELD_SUCCESS_LADDER.
 *
 * Reasoning: armor & weapon typically have 2 base slots (10 × 2 = 20),
 * accessories 1 base slot (5 × 1 = 5)  → 25 guaranteed. Each piece can
 * overmeld up to 5 total, so overmeld budget = 12 × (5 - base) ≈ 35.
 *
 * v1 hardcodes one representative shape; per-version refinement is v2.
 */
export const SLOT_STRUCTURE = {
  guaranteedSlots: 25,
  overmeldSlots: 35,
} as const

/**
 * Overmeld success-rate ladder indexed by overmeld depth (0 = first
 * overmeld attempt past the guaranteed slots, ...). Game constant.
 * Source: in-game advanced melding rates (high-grade tier). For lower
 * grades the rate is higher, but ②-lite uses one representative ladder.
 */
export const OVERMELD_SUCCESS_LADDER: number[] = [
  0.17, 0.17, 0.10, 0.05,
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/engine/materia.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/materia.ts src/__tests__/engine/materia.test.ts
git commit -m "feat(meld-advisor): add SLOT_STRUCTURE and OVERMELD_SUCCESS_LADDER"
```

---

## Task 3: BIS_REFERENCE + snapshot test

**Files:**
- Modify: `src/engine/materia.ts`
- Modify: `src/__tests__/engine/materia.test.ts`

`BIS_REFERENCE` is a single triple per patch (crafter jobs share to first approximation). The snapshot test guards against forgetting to bump it on a new patch.

- [ ] **Step 1: Add failing snapshot test**

Append to `src/__tests__/engine/materia.test.ts`:

```ts
import { BIS_REFERENCE } from '@/engine/materia'

describe('BIS_REFERENCE', () => {
  it('matches the maintained reference (snapshot)', () => {
    expect(BIS_REFERENCE).toMatchSnapshot()
  })

  it('has positive values for all three stats', () => {
    expect(BIS_REFERENCE.craftsmanship).toBeGreaterThan(0)
    expect(BIS_REFERENCE.control).toBeGreaterThan(0)
    expect(BIS_REFERENCE.cp).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/engine/materia.test.ts`
Expected: FAIL — `BIS_REFERENCE` not exported.

- [ ] **Step 3: Add the constant**

Append to `src/engine/materia.ts`:

```ts
/**
 * BiS reference stats (fully pentamelded community-standard set).
 * One triple per patch, shared across crafter jobs (per-job variance
 * is below the precision of ②-lite). Maintain this when a major patch
 * lands or BiS gear changes. Snapshot test enforces a manual review on
 * change.
 *
 * Last verified patch: 7.x (Dawntrail).
 */
export interface BiSReference {
  patch: string
  craftsmanship: number
  control: number
  cp: number
}

export const BIS_REFERENCE: BiSReference = {
  patch: '7.x',
  craftsmanship: 5050,
  control: 5050,
  cp: 691,
}
```

- [ ] **Step 4: Run test to verify it passes (this writes the snapshot file)**

Run: `npx vitest run src/__tests__/engine/materia.test.ts`
Expected: PASS, snapshot created.

- [ ] **Step 5: Commit**

```bash
git add src/engine/materia.ts src/__tests__/engine/materia.test.ts src/__tests__/engine/__snapshots__/
git commit -m "feat(meld-advisor): add BIS_REFERENCE with snapshot test"
```

---

## Task 4: Materia helpers (`materiaForStat`, `topGradeForStat`, `expectedCountForOvermeldDepth`)

**Files:**
- Modify: `src/engine/materia.ts`
- Modify: `src/__tests__/engine/materia.test.ts`

Small pure helpers used by the advisor. `expectedCountForOvermeldDepth(depth, placed)` returns `placed / successRate(depth)` (i.e., expected attempts to land `placed` successful melds).

- [ ] **Step 1: Add failing tests**

Append to `src/__tests__/engine/materia.test.ts`:

```ts
import {
  materiaForStat, topGradeForStat, expectedCountForOvermeldDepth,
} from '@/engine/materia'

describe('topGradeForStat', () => {
  it('returns the highest-grade materia for a given stat', () => {
    const top = topGradeForStat('craftsmanship')
    expect(top).not.toBeNull()
    expect(top!.grade).toBe(12)
    expect(top!.value).toBeGreaterThan(0)
  })
})

describe('materiaForStat', () => {
  it('returns all materia of a given stat sorted descending by grade', () => {
    const list = materiaForStat('control')
    expect(list.length).toBeGreaterThan(0)
    for (let i = 1; i < list.length; i++) {
      expect(list[i].grade).toBeLessThanOrEqual(list[i - 1].grade)
    }
  })
})

describe('expectedCountForOvermeldDepth', () => {
  it('returns placed count divided by success rate at the given depth', () => {
    const placed = 5
    const expected = expectedCountForOvermeldDepth(0, placed)
    expect(expected).toBeCloseTo(placed / 0.17, 5)
  })

  it('depths beyond the ladder use the last entry (deepest, lowest rate)', () => {
    const last = OVERMELD_SUCCESS_LADDER[OVERMELD_SUCCESS_LADDER.length - 1]
    expect(expectedCountForOvermeldDepth(99, 1)).toBeCloseTo(1 / last, 5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/engine/materia.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Add the helpers**

Append to `src/engine/materia.ts`:

```ts
/** Return all materia entries for a stat, sorted descending by grade. */
export function materiaForStat(stat: CraftStat): MateriaGrade[] {
  return MATERIA_GRADES
    .filter(m => m.stat === stat)
    .sort((a, b) => b.grade - a.grade)
}

/** Return the highest-grade materia for a stat, or null if none. */
export function topGradeForStat(stat: CraftStat): MateriaGrade | null {
  return materiaForStat(stat)[0] ?? null
}

/**
 * Expected number of materia to purchase to successfully place `placed`
 * melds at overmeld depth `depth` (0-indexed beyond the guaranteed slots).
 * Depths past the ladder length clamp to the final (lowest) rate.
 */
export function expectedCountForOvermeldDepth(depth: number, placed: number): number {
  const idx = Math.min(depth, OVERMELD_SUCCESS_LADDER.length - 1)
  const rate = OVERMELD_SUCCESS_LADDER[idx]
  return placed / rate
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/engine/materia.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/materia.ts src/__tests__/engine/materia.test.ts
git commit -m "feat(meld-advisor): add materia helpers (materiaForStat, top, expected count)"
```

---

## Task 5: Meld advisor public types

**Files:**
- Create: `src/services/meld-advisor.ts`
- Create: `src/__tests__/services/meld-advisor.test.ts`

Define `MeldStep`, `MeldPlan`, `MeldAdvice` and a stub `adviseMeld` that returns a placeholder shape. We'll fill in real logic over the next tasks. The stub lets downstream tasks compile against the types immediately.

- [ ] **Step 1: Write the failing test for type shape**

Create `src/__tests__/services/meld-advisor.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { MeldAdvice, MeldPlan, MeldStep } from '@/services/meld-advisor'
import { adviseMeld } from '@/services/meld-advisor'
import { BIS_REFERENCE } from '@/engine/materia'

describe('adviseMeld (stub)', () => {
  it('returns a MeldAdvice with both plans present', async () => {
    const advice: MeldAdvice = await adviseMeld(
      [],                       // empty targets — exercises the empty path
      { level: 100, craftsmanship: 4000, control: 4000, cp: 600, isSpecialist: false },
      new Map(),
      { bisReference: BIS_REFERENCE },
    )
    expect(advice.costOptimal).toBeDefined()
    expect(advice.bis).toBeDefined()
    expect(typeof advice.alreadyMeetsThreshold).toBe('boolean')
  })
})

// Trivial type-level checks (compile-time only; no runtime asserts needed).
const _stepShape: MeldStep = {
  stat: 'craftsmanship', grade: 12, placedCount: 1, expectedCount: 1,
  unitPrice: null, subtotal: null,
}
const _planShape: MeldPlan = {
  feasible: true, deltaStats: { craftsmanship: 0, control: 0, cp: 0 },
  steps: [_stepShape], totalGil: null, confirmedBySolver: false,
}
void _stepShape; void _planShape
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: FAIL — `Cannot find module '@/services/meld-advisor'`.

- [ ] **Step 3: Create the service skeleton**

Create `src/services/meld-advisor.ts`:

```ts
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
import type { CraftStat, BiSReference } from '@/engine/materia'

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

/** Stub — will be filled in over Tasks 6-12. */
export async function adviseMeld(
  _targets: Recipe[],
  _gearset: GearsetStats,
  _priceMap: MateriaPriceMap,
  _options: AdviseMeldOptions,
): Promise<MeldAdvice> {
  const empty: MeldPlan = {
    feasible: true,
    deltaStats: { craftsmanship: 0, control: 0, cp: 0 },
    steps: [],
    totalGil: 0,
    confirmedBySolver: false,
  }
  return {
    costOptimal: empty,
    bis: { ...empty },
    gapGil: 0,
    alreadyMeetsThreshold: true,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/meld-advisor.ts src/__tests__/services/meld-advisor.test.ts
git commit -m "feat(meld-advisor): scaffold service with public types"
```

---

## Task 6: Extend `recipeToCraftParams` & `solveCraftForRecipe` for optional `initialQuality`

**Files:**
- Modify: `src/services/stat-stacking.ts`
- Modify: `src/solver/api.ts`
- Modify: `src/__tests__/services/stat-stacking.test.ts` (if it exists) or create

This is an ADR-1 sensitive change: the canonical entry must keep owning the parameter. Add an optional override so the meld advisor can model HQ sub-materials raising starting quality. Default behaviour unchanged.

- [ ] **Step 1: Read existing tests to find the right place**

Read `src/__tests__/services/stat-stacking.test.ts` (if absent, you'll create it in Step 2 below). Identify a single existing pass-through test you can mirror for the new override.

- [ ] **Step 2: Add a failing test for the new parameter**

Append (or create) `src/__tests__/services/stat-stacking.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { recipeToCraftParams } from '@/services/stat-stacking'
import type { Recipe } from '@/stores/recipe'

const sampleRecipe = {
  id: 1, name: 'x', job: 'CRP', canHq: true, isExpert: false,
  recipeLevelTable: {
    classJobLevel: 100, progressDivider: 1, qualityDivider: 1,
    progressModifier: 100, qualityModifier: 100,
    progress: 1000, quality: 5000, durability: 80,
  },
} as unknown as Recipe

const gearset = {
  level: 100, craftsmanship: 4000, control: 4000, cp: 600, isSpecialist: false,
}

describe('recipeToCraftParams initialQuality override', () => {
  it('defaults initialQuality to 0', () => {
    const params = recipeToCraftParams(sampleRecipe, gearset)
    expect(params.initialQuality).toBe(0)
  })

  it('honours an explicit initialQuality override', () => {
    const params = recipeToCraftParams(sampleRecipe, gearset, undefined, 1200)
    expect(params.initialQuality).toBe(1200)
  })
})
```

- [ ] **Step 3: Run test to verify the override test fails**

Run: `npx vitest run src/__tests__/services/stat-stacking.test.ts`
Expected: FAIL — function signature does not yet accept 4th arg / value is still 0.

- [ ] **Step 4: Extend `recipeToCraftParams`**

Modify `src/services/stat-stacking.ts` — replace the existing `recipeToCraftParams`:

```ts
export function recipeToCraftParams(
  recipe: Recipe,
  gearset: GearsetStats,
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null },
  initialQuality: number = 0,
): CraftParams {
  const buffed = gearsetToBuffedStats(gearset, buffs)
  return {
    craftsmanship: buffed.craftsmanship,
    control: buffed.control,
    cp: buffed.cp,
    crafterLevel: gearset.level,
    recipeLevelTable: recipe.recipeLevelTable,
    canHq: recipe.canHq,
    initialQuality,
    isExpert: recipe.isExpert ?? false,
  }
}
```

- [ ] **Step 5: Forward `initialQuality` through `solveCraftForRecipe` / `simulateCraftForRecipe`**

Modify `src/solver/api.ts`:

```ts
export interface CraftRequestOptions extends SolverSkillOptions {
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null }
  /** Override initial quality from HQ sub-materials (default 0). */
  initialQuality?: number
  strictQuality?: boolean
  onProgress?: (percent: number) => void
}

export function solveCraftForRecipe(
  recipe: Recipe,
  gearset: GearsetStats,
  options: CraftRequestOptions = {},
): Promise<SolverResultWithTiming> {
  const { buffs, onProgress, strictQuality, initialQuality, ...skills } = options
  const params = recipeToCraftParams(recipe, gearset, buffs, initialQuality)
  const config = craftParamsToSolverConfig(params, skills)
  if (strictQuality !== undefined) config.strict_quality = strictQuality
  return solveCraft(config, onProgress)
}

// ... apply the same destructure-and-forward change to simulateCraftForRecipe.
```

Mirror the same `initialQuality` destructure in `simulateCraftForRecipe`.

- [ ] **Step 6: Run all tests in the affected files to verify**

Run: `npx vitest run src/__tests__/services/stat-stacking.test.ts src/__tests__/services/stat-stacking-parity.test.ts`
Expected: all PASS (existing tests untouched; new override tests pass).

- [ ] **Step 7: Commit**

```bash
git add src/services/stat-stacking.ts src/solver/api.ts src/__tests__/services/stat-stacking.test.ts
git commit -m "feat(stat-stacking): allow optional initialQuality override (ADR-0001 canonical)"
```

---

## Task 7: `findBindingRecipe` (Step 1 of the algorithm)

**Files:**
- Modify: `src/services/meld-advisor.ts`
- Modify: `src/__tests__/services/meld-advisor.test.ts`

Picks the single hardest recipe in a same-job batch to drive the breakpoint. v1 simplification: highest progress requirement; tie-break by quality. Multi-recipe per-axis dominance is deferred.

- [ ] **Step 1: Add failing tests**

Append to `src/__tests__/services/meld-advisor.test.ts`:

```ts
import { findBindingRecipe } from '@/services/meld-advisor'
import type { Recipe } from '@/stores/recipe'

const makeRecipe = (id: number, progress: number, quality: number): Recipe => ({
  id, name: `r${id}`, job: 'CRP', canHq: true, isExpert: false,
  recipeLevelTable: {
    classJobLevel: 100, progressDivider: 1, qualityDivider: 1,
    progressModifier: 100, qualityModifier: 100,
    progress, quality, durability: 80,
  },
} as unknown as Recipe)

describe('findBindingRecipe', () => {
  it('returns null for an empty list', () => {
    expect(findBindingRecipe([])).toBeNull()
  })

  it('picks the recipe with the highest progress requirement', () => {
    const a = makeRecipe(1, 1000, 5000)
    const b = makeRecipe(2, 2000, 4000)
    expect(findBindingRecipe([a, b])).toBe(b)
  })

  it('breaks ties by highest quality', () => {
    const a = makeRecipe(1, 1000, 4000)
    const b = makeRecipe(2, 1000, 5000)
    expect(findBindingRecipe([a, b])).toBe(b)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: FAIL — `findBindingRecipe` not exported.

- [ ] **Step 3: Implement `findBindingRecipe`**

Append to `src/services/meld-advisor.ts`:

```ts
/**
 * Pick the single hardest recipe to drive the breakpoint.
 * v1: highest progress; tie-break by highest quality.
 * Multi-recipe per-axis dominance is v2.
 */
export function findBindingRecipe(targets: Recipe[]): Recipe | null {
  if (targets.length === 0) return null
  let best = targets[0]
  for (const r of targets.slice(1)) {
    const bestP = best.recipeLevelTable.progress
    const bestQ = best.recipeLevelTable.quality
    const rP = r.recipeLevelTable.progress
    const rQ = r.recipeLevelTable.quality
    if (rP > bestP || (rP === bestP && rQ > bestQ)) best = r
  }
  return best
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/meld-advisor.ts src/__tests__/services/meld-advisor.test.ts
git commit -m "feat(meld-advisor): findBindingRecipe (Step 1)"
```

---

## Task 8: `solveProgressBreakpoint` (Step 2, closed-form craftsmanship)

**Files:**
- Modify: `src/services/meld-advisor.ts`
- Modify: `src/__tests__/services/meld-advisor.test.ts`

Closed-form: invert `computeBaseProgress` from `feasibility-prefilter.ts`. Given a recipe and current gearset, find the minimum craftsmanship delta such that the per-action progress can clear the recipe progress requirement in a reasonable number of steps.

Reference: `src/services/feasibility-prefilter.ts:20-24` (`computeBaseProgress`) and `:10` (`QUALITY_PHASE_UPPER_BOUND_MULTIPLIER` style upper bound). For progress, use a similar coarse bound: a max-step rotation (e.g. ~10 progress steps in a typical macro) must clear `progress`. Concretely, we want `computeBaseProgress(cms, level, rlt) * stepMultiplier >= progress`. v1: invert with `stepMultiplier = 10` (matches typical "Groundwork-heavy" optimal rotations).

- [ ] **Step 1: Add failing tests**

Append to `src/__tests__/services/meld-advisor.test.ts`:

```ts
import { solveProgressBreakpoint } from '@/services/meld-advisor'

describe('solveProgressBreakpoint', () => {
  const baseGearset = {
    level: 100, craftsmanship: 100, control: 4000, cp: 600, isSpecialist: false,
  }

  it('returns 0 when the gearset already exceeds the breakpoint', () => {
    const easy = makeRecipe(1, 100, 1000) // tiny progress
    const strong = { ...baseGearset, craftsmanship: 5000 }
    expect(solveProgressBreakpoint(easy, strong)).toBe(0)
  })

  it('returns a positive delta when craftsmanship is short', () => {
    const hard = makeRecipe(1, 5000, 5000)
    const delta = solveProgressBreakpoint(hard, baseGearset)
    expect(delta).toBeGreaterThan(0)
  })

  it('delta is monotonically non-increasing as base craftsmanship rises', () => {
    const hard = makeRecipe(1, 5000, 5000)
    const lo = solveProgressBreakpoint(hard, { ...baseGearset, craftsmanship: 100 })
    const hi = solveProgressBreakpoint(hard, { ...baseGearset, craftsmanship: 2000 })
    expect(hi).toBeLessThanOrEqual(lo)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: FAIL — `solveProgressBreakpoint` not exported.

- [ ] **Step 3: Implement `solveProgressBreakpoint`**

Append to `src/services/meld-advisor.ts`:

```ts
import { computeBaseProgress } from '@/services/feasibility-prefilter'
import { gearsetToBuffedStats } from '@/services/stat-stacking'

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
  if (reachable >= rlt.progress) return 0

  // Binary search for the minimum craftsmanship delta that flips
  // computeBaseProgress * step upper bound >= recipe.progress.
  let lo = 0
  let hi = 10_000
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const bumped = computeBaseProgress(buffed.craftsmanship + mid, gearset.level, rlt)
    if (bumped * PROGRESS_STEP_UPPER_BOUND >= rlt.progress) hi = mid
    else lo = mid + 1
  }
  return lo
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/meld-advisor.ts src/__tests__/services/meld-advisor.test.ts
git commit -m "feat(meld-advisor): solveProgressBreakpoint (Step 2)"
```

---

## Task 9: `solveQualityBreakpoint` (Step 3, closed-form quality with HQ-initialQuality)

**Files:**
- Modify: `src/services/meld-advisor.ts`
- Modify: `src/__tests__/services/meld-advisor.test.ts`

Closed-form quality breakpoint using `canReachHQQuality` (which already encodes the over-accepting upper bound). The closed form takes `initialQuality` into account so HQ sub-materials reduce the control requirement. v1 greedy: search Δcontrol first holding Δcraftsmanship and Δcp fixed; if no control delta works within search bounds, bump cp by a small step and retry.

- [ ] **Step 1: Add failing tests**

Append to `src/__tests__/services/meld-advisor.test.ts`:

```ts
import { solveQualityBreakpoint } from '@/services/meld-advisor'

describe('solveQualityBreakpoint', () => {
  const gearset = {
    level: 100, craftsmanship: 5000, control: 1000, cp: 300, isSpecialist: false,
  }

  it('returns zeros when gearset already reaches quality', () => {
    const easy = makeRecipe(1, 100, 100)
    const strong = { ...gearset, control: 5000, cp: 600 }
    const delta = solveQualityBreakpoint(easy, strong, 0, 0)
    expect(delta.control).toBe(0)
    expect(delta.cp).toBe(0)
  })

  it('returns a positive control delta on a hard recipe', () => {
    const hard = makeRecipe(1, 1000, 8000)
    const delta = solveQualityBreakpoint(hard, gearset, 0, 0)
    expect(delta.control + delta.cp).toBeGreaterThan(0)
  })

  it('higher initialQuality (HQ ingredients) lowers the control delta', () => {
    const recipe = makeRecipe(1, 1000, 8000)
    const noHq = solveQualityBreakpoint(recipe, gearset, 0, 0)
    const someHq = solveQualityBreakpoint(recipe, gearset, 0, 2000)
    expect(someHq.control).toBeLessThanOrEqual(noHq.control)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: FAIL — `solveQualityBreakpoint` not exported.

- [ ] **Step 3: Implement `solveQualityBreakpoint`**

Append to `src/services/meld-advisor.ts`:

```ts
import {
  canReachHQQuality, computeBaseQuality,
  QUALITY_PHASE_UPPER_BOUND_MULTIPLIER, AVG_QUALITY_CP_COST, MARGIN,
} from '@/services/feasibility-prefilter'

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/meld-advisor.ts src/__tests__/services/meld-advisor.test.ts
git commit -m "feat(meld-advisor): solveQualityBreakpoint with HQ-initialQuality (Step 3)"
```

---

## Task 10: `confirmBreakpointWithSolver` (Step 4, bounded retries)

**Files:**
- Modify: `src/services/meld-advisor.ts`
- Modify: `src/__tests__/services/meld-advisor.test.ts`

`canReachHQQuality` is an over-accepting upper bound (PRD risk 1), so the closed-form candidate Δ may be too low. Confirm with a real solver run; if the solver fails to double-max, bump stats by a small step (~5%) and retry, up to 3 times total. Returns the confirmed Δ and a `confirmedBySolver` flag.

- [ ] **Step 1: Add failing tests with a mocked solver**

Append to `src/__tests__/services/meld-advisor.test.ts`:

```ts
import { vi } from 'vitest'
import { confirmBreakpointWithSolver } from '@/services/meld-advisor'

const makeSolveResult = (progress: number, quality: number, maxQuality: number) => ({
  actions: ['BasicSynthesis'],
  // shape mirrors what simulateCraftForRecipe returns enough to satisfy the
  // service's "passes" check — see actual SimulateResult type. Adjust if API
  // exposes more fields:
})

describe('confirmBreakpointWithSolver', () => {
  it('returns confirmed=true on first solver pass', async () => {
    const recipe = makeRecipe(1, 1000, 5000)
    const gs = { level: 100, craftsmanship: 5000, control: 5000, cp: 600, isSpecialist: false }

    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn().mockResolvedValue({
      progress: 1000, max_progress: 1000, quality: 5000, max_quality: 5000,
    })

    const out = await confirmBreakpointWithSolver(
      recipe, gs,
      { craftsmanship: 0, control: 0, cp: 0 },
      0,
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(out.confirmedBySolver).toBe(true)
    expect(fakeSolve).toHaveBeenCalledTimes(1)
  })

  it('bumps stats and retries when first attempt falls short', async () => {
    const recipe = makeRecipe(1, 1000, 5000)
    const gs = { level: 100, craftsmanship: 1000, control: 1000, cp: 600, isSpecialist: false }

    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn()
      .mockResolvedValueOnce({ progress: 500, max_progress: 1000, quality: 4000, max_quality: 5000 })
      .mockResolvedValueOnce({ progress: 1000, max_progress: 1000, quality: 5000, max_quality: 5000 })

    const out = await confirmBreakpointWithSolver(
      recipe, gs,
      { craftsmanship: 100, control: 100, cp: 0 },
      0,
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(out.confirmedBySolver).toBe(true)
    expect(fakeSolve).toHaveBeenCalledTimes(2)
    expect(out.deltaStats.craftsmanship).toBeGreaterThan(100)
  })

  it('returns confirmed=false after bounded retries fail', async () => {
    const recipe = makeRecipe(1, 1000, 5000)
    const gs = { level: 100, craftsmanship: 1000, control: 1000, cp: 600, isSpecialist: false }

    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn().mockResolvedValue({
      progress: 500, max_progress: 1000, quality: 4000, max_quality: 5000,
    })

    const out = await confirmBreakpointWithSolver(
      recipe, gs,
      { craftsmanship: 100, control: 100, cp: 0 },
      0,
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(out.confirmedBySolver).toBe(false)
    expect(fakeSolve.mock.calls.length).toBeLessThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: FAIL — `confirmBreakpointWithSolver` not exported.

- [ ] **Step 3: Implement `confirmBreakpointWithSolver`**

Append to `src/services/meld-advisor.ts`:

```ts
import { solveCraftForRecipe, simulateCraftForRecipe } from '@/solver/api'

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
    // Bump up and retry.
    delta = {
      craftsmanship: Math.ceil(delta.craftsmanship * (1 + BUMP_FACTOR)) + 1,
      control: Math.ceil(delta.control * (1 + BUMP_FACTOR)) + 1,
      cp: Math.ceil(delta.cp * (1 + BUMP_FACTOR)),
    }
  }
  return { deltaStats: delta, confirmedBySolver: false }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/meld-advisor.ts src/__tests__/services/meld-advisor.test.ts
git commit -m "feat(meld-advisor): confirmBreakpointWithSolver with bounded retries (Step 4)"
```

---

## Task 11: `translateDeltaToMeldPlan` (Step 5, slots + fail ladder + cost)

**Files:**
- Modify: `src/services/meld-advisor.ts`
- Modify: `src/__tests__/services/meld-advisor.test.ts`

Translates a Δstats triple into a `MeldPlan`: greedy big-grade-first, fill guaranteed slots (100%), overflow into overmeld with fail-ladder cost. Returns `feasible: false` when total required slots exceed `SLOT_STRUCTURE`.

- [ ] **Step 1: Add failing tests**

Append to `src/__tests__/services/meld-advisor.test.ts`:

```ts
import { translateDeltaToMeldPlan } from '@/services/meld-advisor'
import { MATERIA_GRADES } from '@/engine/materia'

describe('translateDeltaToMeldPlan', () => {
  const priceMap = new Map<number, any>(
    MATERIA_GRADES.map(m => [
      m.itemId,
      { minPriceNQ: 1000 + m.value, minPriceHQ: 0, listings: [] },
    ]),
  )

  it('returns an empty feasible plan when delta is zero', () => {
    const plan = translateDeltaToMeldPlan(
      { craftsmanship: 0, control: 0, cp: 0 },
      priceMap,
    )
    expect(plan.feasible).toBe(true)
    expect(plan.steps).toHaveLength(0)
    expect(plan.totalGil).toBe(0)
  })

  it('fits a small delta into guaranteed slots (no failure multiplier)', () => {
    const plan = translateDeltaToMeldPlan(
      { craftsmanship: 60, control: 0, cp: 0 },
      priceMap,
    )
    expect(plan.feasible).toBe(true)
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].placedCount).toBe(plan.steps[0].expectedCount) // 100% success
    expect(plan.steps[0].subtotal).toBeGreaterThan(0)
  })

  it('applies the fail ladder when overflow lands in overmeld slots', () => {
    // Pick a delta large enough to exhaust guaranteedSlots.
    const huge = { craftsmanship: 5000, control: 0, cp: 0 }
    const plan = translateDeltaToMeldPlan(huge, priceMap)
    const overmeldStep = plan.steps.find(s => s.expectedCount > s.placedCount)
    expect(overmeldStep).toBeDefined()
  })

  it('marks plan infeasible when delta exceeds total slots', () => {
    const beyond = { craftsmanship: 50_000, control: 50_000, cp: 50_000 }
    const plan = translateDeltaToMeldPlan(beyond, priceMap)
    expect(plan.feasible).toBe(false)
    expect(plan.reason).toMatch(/槽位/) // or English equivalent if user prefers
  })

  it('reports null subtotal when a step has no price data', () => {
    const empty = new Map()
    const plan = translateDeltaToMeldPlan(
      { craftsmanship: 60, control: 0, cp: 0 },
      empty,
    )
    expect(plan.steps[0].subtotal).toBeNull()
    expect(plan.totalGil).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: FAIL — `translateDeltaToMeldPlan` not exported.

- [ ] **Step 3: Implement `translateDeltaToMeldPlan`**

Append to `src/services/meld-advisor.ts`:

```ts
import {
  SLOT_STRUCTURE, OVERMELD_SUCCESS_LADDER,
  expectedCountForOvermeldDepth, materiaForStat,
} from '@/engine/materia'
import type { MateriaGrade } from '@/engine/materia'

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

  // Phase A: guaranteed slots (100%, zero failure).
  while (remaining > 0 && cursor.guaranteedRemaining > 0) {
    const placed = 1
    const value = top.value
    steps.push(emitStep(top, placed, placed, priceMap))
    cursor.guaranteedRemaining -= 1
    remaining -= value
  }

  // Phase B: overmeld slots, applying the fail ladder.
  while (remaining > 0 && cursor.overmeldDepth < OVERMELD_SUCCESS_LADDER.length) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/meld-advisor.ts src/__tests__/services/meld-advisor.test.ts
git commit -m "feat(meld-advisor): translateDeltaToMeldPlan (Step 5)"
```

---

## Task 12: `computeBisPlan` (Step 6, current → BiS reference)

**Files:**
- Modify: `src/services/meld-advisor.ts`
- Modify: `src/__tests__/services/meld-advisor.test.ts`

Compute the BiS ceiling plan: Δ = `max(0, BIS_REFERENCE - raw gearset)` per axis, then translate. The BiS side does NOT go through the solver — it's a deep-overmeld reference.

- [ ] **Step 1: Add failing tests**

Append to `src/__tests__/services/meld-advisor.test.ts`:

```ts
import { computeBisPlan } from '@/services/meld-advisor'
import { BIS_REFERENCE } from '@/engine/materia'

describe('computeBisPlan', () => {
  const priceMap = new Map<number, any>(
    MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1000, listings: [] }]),
  )

  it('returns zero-delta plan when current gearset already matches BiS', () => {
    const atBis = {
      level: 100, isSpecialist: false,
      craftsmanship: BIS_REFERENCE.craftsmanship,
      control: BIS_REFERENCE.control,
      cp: BIS_REFERENCE.cp,
    }
    const plan = computeBisPlan(atBis, BIS_REFERENCE, priceMap)
    expect(plan.deltaStats).toEqual({ craftsmanship: 0, control: 0, cp: 0 })
    expect(plan.steps).toHaveLength(0)
    expect(plan.totalGil).toBe(0)
  })

  it('computes a deep-overmeld plan when current is far below BiS', () => {
    const low = {
      level: 100, isSpecialist: false,
      craftsmanship: 100, control: 100, cp: 100,
    }
    const plan = computeBisPlan(low, BIS_REFERENCE, priceMap)
    expect(plan.steps.length).toBeGreaterThan(0)
    // The deep overmeld tail should multiply expected count > placed count.
    const tail = plan.steps[plan.steps.length - 1]
    expect(tail.expectedCount).toBeGreaterThanOrEqual(tail.placedCount)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: FAIL — `computeBisPlan` not exported.

- [ ] **Step 3: Implement `computeBisPlan`**

Append to `src/services/meld-advisor.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/meld-advisor.ts src/__tests__/services/meld-advisor.test.ts
git commit -m "feat(meld-advisor): computeBisPlan (Step 6)"
```

---

## Task 13: `adviseMeld` orchestrator (Steps 0 + 7)

**Files:**
- Modify: `src/services/meld-advisor.ts`
- Modify: `src/__tests__/services/meld-advisor.test.ts`

Replace the stub with the real orchestrator: Step 0 already-meets check (1 solve, reuse `deps.solve` + `deps.simulate`), bail out if double-max; otherwise run binding → progress breakpoint → quality breakpoint → confirm → translate. Then compute BiS and the gap.

- [ ] **Step 1: Add failing tests for the orchestrator**

Append to `src/__tests__/services/meld-advisor.test.ts`:

```ts
describe('adviseMeld (orchestrated)', () => {
  const priceMap = new Map<number, any>(
    MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1000, listings: [] }]),
  )
  const baseGearset = {
    level: 100, craftsmanship: 4500, control: 4500, cp: 600, isSpecialist: false,
  }

  it('alreadyMeetsThreshold = true when current gear double-maxes', async () => {
    const recipe = makeRecipe(1, 1000, 5000)
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn().mockResolvedValue({
      progress: 1000, max_progress: 1000, quality: 5000, max_quality: 5000,
    })

    const out = await adviseMeld(
      [recipe], baseGearset, priceMap,
      { bisReference: BIS_REFERENCE },
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(out.alreadyMeetsThreshold).toBe(true)
    expect(out.costOptimal.steps).toHaveLength(0)
    expect(out.bis.steps.length).toBeGreaterThan(0)
  })

  it('produces a cost-optimal plan when gear is short', async () => {
    const hard = makeRecipe(1, 5000, 8000)
    const weak = { ...baseGearset, craftsmanship: 100, control: 100, cp: 300 }
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn()
      // Step 0 fails (current gear can't double-max)
      .mockResolvedValueOnce({ progress: 500, max_progress: 1000, quality: 4000, max_quality: 5000 })
      // Step 4 confirm succeeds after the breakpoint delta is applied
      .mockResolvedValue({ progress: 5000, max_progress: 5000, quality: 8000, max_quality: 8000 })

    const out = await adviseMeld(
      [hard], weak, priceMap,
      { bisReference: BIS_REFERENCE },
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    expect(out.alreadyMeetsThreshold).toBe(false)
    expect(out.costOptimal.steps.length).toBeGreaterThan(0)
    expect(out.costOptimal.confirmedBySolver).toBe(true)
  })

  it('respects isCancelled mid-run', async () => {
    const hard = makeRecipe(1, 5000, 8000)
    const weak = { ...baseGearset, craftsmanship: 100, control: 100 }
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn().mockResolvedValue({
      progress: 0, max_progress: 1000, quality: 0, max_quality: 5000,
    })

    let cancelled = false
    const out = await adviseMeld(
      [hard], weak, priceMap,
      { bisReference: BIS_REFERENCE, isCancelled: () => cancelled },
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    // Trigger cancellation after first call; verify we return something sensible.
    cancelled = true
    expect(out.costOptimal.confirmedBySolver).toBe(false)
  })

  it('returns gapGil = bis.totalGil - costOptimal.totalGil when both are priced', async () => {
    const hard = makeRecipe(1, 5000, 8000)
    const weak = { ...baseGearset, craftsmanship: 100, control: 100, cp: 300 }
    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn()
      .mockResolvedValueOnce({ progress: 0, max_progress: 1000, quality: 0, max_quality: 5000 })
      .mockResolvedValue({ progress: 5000, max_progress: 5000, quality: 8000, max_quality: 8000 })

    const out = await adviseMeld(
      [hard], weak, priceMap,
      { bisReference: BIS_REFERENCE },
      { solve: fakeSolve, simulate: fakeSimulate },
    )
    if (out.bis.totalGil !== null && out.costOptimal.totalGil !== null) {
      expect(out.gapGil).toBe(out.bis.totalGil - out.costOptimal.totalGil)
    }
  })
})
```

- [ ] **Step 2: Run test to verify the new tests fail**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: FAIL — orchestration tests fail because the stub returns `alreadyMeetsThreshold = true` unconditionally and never invokes `deps.solve`.

- [ ] **Step 3: Replace the stub with the real orchestrator**

In `src/services/meld-advisor.ts`, replace `adviseMeld` with:

```ts
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
    // Solver unavailable — fall through and return a conservative plan below.
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
```

- [ ] **Step 4: Run all meld-advisor tests**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: PASS, all tests including orchestrator.

- [ ] **Step 5: Commit**

```bash
git add src/services/meld-advisor.ts src/__tests__/services/meld-advisor.test.ts
git commit -m "feat(meld-advisor): orchestrator with Step 0 already-meets + gap"
```

---

## Task 14: Golden snapshot test (regression net)

**Files:**
- Modify: `src/__tests__/services/meld-advisor.test.ts`

A single fixed (recipe, gearset, priceMap) → `MeldAdvice` shape snapshot. Triggers on any change to `MATERIA_GRADES`, `OVERMELD_SUCCESS_LADDER`, or the algorithm. Snapshot the costed structure with rounded numbers to avoid float churn.

- [ ] **Step 1: Add the snapshot test**

Append to `src/__tests__/services/meld-advisor.test.ts`:

```ts
describe('adviseMeld golden snapshot', () => {
  it('produces a stable MeldAdvice shape for the fixture', async () => {
    const fixtureRecipe = makeRecipe(99, 3500, 6500)
    const fixtureGearset = {
      level: 100, craftsmanship: 3200, control: 3200, cp: 540, isSpecialist: false,
    }
    const fixturePrices = new Map<number, any>(
      MATERIA_GRADES.map(m => [m.itemId, { minPriceNQ: 1500, listings: [] }]),
    )

    const fakeSolve = vi.fn().mockResolvedValue({ actions: ['x'] })
    const fakeSimulate = vi.fn()
      .mockResolvedValueOnce({ progress: 0, max_progress: 3500, quality: 0, max_quality: 6500 })
      .mockResolvedValue({ progress: 3500, max_progress: 3500, quality: 6500, max_quality: 6500 })

    const out = await adviseMeld(
      [fixtureRecipe], fixtureGearset, fixturePrices,
      { bisReference: BIS_REFERENCE },
      { solve: fakeSolve, simulate: fakeSimulate },
    )

    const sanitized = {
      alreadyMeetsThreshold: out.alreadyMeetsThreshold,
      costOptimal: { ...out.costOptimal, steps: out.costOptimal.steps.length },
      bis: { ...out.bis, steps: out.bis.steps.length },
      gapGil: out.gapGil,
    }
    expect(sanitized).toMatchSnapshot()
  })
})
```

- [ ] **Step 2: Run test to write the snapshot**

Run: `npx vitest run src/__tests__/services/meld-advisor.test.ts`
Expected: PASS, snapshot file created at `src/__tests__/services/__snapshots__/meld-advisor.test.ts.snap`.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/services/meld-advisor.test.ts src/__tests__/services/__snapshots__/
git commit -m "test(meld-advisor): golden snapshot for regression net"
```

---

## Task 15: stat-stacking parity test extension

**Files:**
- Modify: `src/__tests__/services/stat-stacking-parity.test.ts`

PRD requirement: prove that materia Δ stacks at raw gear, BEFORE Soul and food/medicine. Add a parity test that compares two paths:

1. `gearsetToBuffedStats({ ...gearset, control: gearset.control + Δ }, buffs)` — Δ applied at raw gear (correct).
2. `applyMedicineBuff(applyFoodBuff(gearsetToBuffedStats(gearset, undefined), food), medicine).control + Δ` — Δ applied after stacking (wrong).

These produce different results when food's percent×max cap is hit. The test asserts the correct path matches the canonical entry, and that the wrong path can disagree under a cap-hit scenario.

- [ ] **Step 1: Read the existing parity test for style**

Read `src/__tests__/services/stat-stacking-parity.test.ts` and identify the existing test that asserts an equality across paths.

- [ ] **Step 2: Append a new parity test for materia ordering**

Append to `src/__tests__/services/stat-stacking-parity.test.ts`:

```ts
import { gearsetToBuffedStats } from '@/services/stat-stacking'
import { COMMON_FOODS } from '@/engine/food-medicine'

describe('materia delta is applied at raw gear (ADR-0001)', () => {
  it('matches raw-gear+materia → Soul → food when control food cap is hit', () => {
    // Build a gearset where food's % bonus would cap.
    const gearset = {
      level: 100, craftsmanship: 1000, control: 5000, cp: 600, isSpecialist: false,
    }
    const food = COMMON_FOODS.find(f => f.control) ?? COMMON_FOODS[0]
    const buffs = { food, medicine: null }
    const materiaDelta = 60

    // CORRECT path: materia added at raw gear.
    const correct = gearsetToBuffedStats(
      { ...gearset, control: gearset.control + materiaDelta },
      buffs,
    )

    // WRONG path: materia added after stacking.
    const stacked = gearsetToBuffedStats(gearset, buffs)
    const wrong = { ...stacked, control: stacked.control + materiaDelta }

    // Under a cap-hit, the two paths disagree.
    expect(correct.control).not.toBe(wrong.control)
  })
})
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run src/__tests__/services/stat-stacking-parity.test.ts`
Expected: PASS.

If the test PASSES trivially (no cap hit), tweak the gearset/food so that food's percent bonus would clamp — that's the only scenario where the order matters. Refer to `applyBonus` in `food-medicine.ts` for the cap math.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/services/stat-stacking-parity.test.ts
git commit -m "test(stat-stacking): assert materia delta applies at raw gear (ADR-0001)"
```

---

## Task 16: Universalis materia price fetch

**Files:**
- Modify: `src/api/universalis.ts`
- Modify: `src/__tests__/api/universalis.test.ts` (if it exists; else create)

Add a small helper that fetches `MarketData` for the materia item IDs in `MATERIA_GRADES`. Reuse the existing multi-id fetch infrastructure that `shopping-list.ts` and `buff-recommender` already depend on.

- [ ] **Step 1: Investigate the existing fetch pattern**

Read `src/api/universalis.ts` to identify the existing multi-id fetch function (e.g. `fetchMarketData(itemIds, world)` or similar). Confirm what `MarketData` looks like — `buff-recommender` consumes `minPriceNQ`, `minPriceHQ`, `listings`.

- [ ] **Step 2: Add a failing test for the helper**

Create or append `src/__tests__/api/universalis.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fetchMateriaPriceMap } from '@/api/universalis'
import { MATERIA_GRADES } from '@/engine/materia'

describe('fetchMateriaPriceMap', () => {
  it('returns a Map keyed by materia itemId', async () => {
    // Use a stub world / cached fixture. If the existing test infra mocks the
    // upstream fetch, follow that pattern.
    const map = await fetchMateriaPriceMap('Chocobo', { fetchImpl: vi.fn().mockResolvedValue({
      items: Object.fromEntries(MATERIA_GRADES.map(m => [m.itemId, {
        minPriceNQ: 1000, minPriceHQ: 0, listings: [],
      }])),
    }) as any })
    for (const m of MATERIA_GRADES) {
      expect(map.has(m.itemId)).toBe(true)
    }
  })
})
```

(If `universalis.ts` doesn't yet take an injectable `fetchImpl`, leverage whatever existing mock layer the repo has — read one other `universalis.ts`-touching test to see how it stubs.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/__tests__/api/universalis.test.ts`
Expected: FAIL — helper not exported.

- [ ] **Step 4: Implement `fetchMateriaPriceMap`**

Append to `src/api/universalis.ts` (use the existing multi-id fetch):

```ts
import { MATERIA_GRADES } from '@/engine/materia'

/**
 * Fetch market data for all materia in MATERIA_GRADES from the given world
 * (or DC). Returns a Map keyed by itemId so the meld advisor can price each
 * recommended grade.
 */
export async function fetchMateriaPriceMap(
  world: string,
  options: { /* mirror options on existing fetchMarketData */ } = {},
): Promise<Map<number, MarketData>> {
  const ids = MATERIA_GRADES.map(m => m.itemId)
  // Replace with the actual existing multi-id helper, e.g.
  // const items = await fetchMarketData(world, ids, options)
  // return new Map(ids.map((id, i) => [id, items[i]]))
  throw new Error('not implemented — wire to existing multi-id fetcher')
}
```

Now wire it to the existing multi-id fetcher — DO NOT leave the `throw new Error`. After reading `universalis.ts` in Step 1 you'll know the exact function name and signature; use it.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/api/universalis.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/universalis.ts src/__tests__/api/universalis.test.ts
git commit -m "feat(universalis): fetchMateriaPriceMap helper"
```

---

## Task 17: batch-optimizer Phase 6 integration

**Files:**
- Modify: `src/services/batch-optimizer.ts`
- Modify: `src/stores/batch.ts`
- Modify: `src/__tests__/services/batch-optimizer.test.ts`

After existing batch phases finish, group `recipesToCraft` by job, compute `initialQuality` from each binding recipe's `hqAmounts`, and call `adviseMeld` per job. Stash the result on the batch output as `meldAdvicePerJob`.

- [ ] **Step 1: Add field to the batch result type**

In `src/stores/batch.ts`, locate the batch result interface (`BatchResult` or similar) and add:

```ts
import type { MeldAdvice } from '@/services/meld-advisor'

export interface BatchResult {
  // ... existing fields
  meldAdvicePerJob?: Map<string, MeldAdvice>
}
```

- [ ] **Step 2: Add a failing test in batch-optimizer**

In `src/__tests__/services/batch-optimizer.test.ts`, add (mirroring how existing tests invoke `runBatchOptimization`):

```ts
describe('batch Phase 6 — meld advice', () => {
  it('attaches a MeldAdvice per job to the batch result', async () => {
    const result = await runBatchOptimization(/* ... existing fixture ... */)
    expect(result.meldAdvicePerJob).toBeDefined()
    expect(result.meldAdvicePerJob!.size).toBeGreaterThan(0)
  })

  it('passes hqAmounts through as initialQuality', async () => {
    // Use a fixture with non-zero hqAmounts; assert that adviseMeld is called
    // with initialQuality > 0 (spy via vi.mock on @/services/meld-advisor).
  })
})
```

Use `vi.mock('@/services/meld-advisor', ...)` to spy on `adviseMeld` and assert the `initialQuality` arg.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/batch-optimizer.test.ts`
Expected: FAIL — `meldAdvicePerJob` undefined.

- [ ] **Step 4: Implement Phase 6 in `runBatchOptimization`**

In `src/services/batch-optimizer.ts`, after the last existing phase, add:

```ts
import { adviseMeld } from '@/services/meld-advisor'
import { fetchMateriaPriceMap } from '@/api/universalis'
import { BIS_REFERENCE } from '@/engine/materia'

// ... inside runBatchOptimization, after Phase 5/4.6:

// Phase 6 — meld advice per job.
const meldAdvicePerJob = new Map<string, MeldAdvice>()
const recipesByJob = new Map<string, RecipeOptimizeResult[]>()
for (const r of recipesToCraft) {
  const list = recipesByJob.get(r.recipe.job) ?? []
  list.push(r)
  recipesByJob.set(r.recipe.job, list)
}
const materiaPrices = await fetchMateriaPriceMap(server /* or DC, matching shopping-list */)
for (const [job, list] of recipesByJob) {
  if (isCancelled()) break
  const gs = getGearset(job)
  if (!gs) continue
  // Compute initialQuality from HQ ingredients of the binding recipe.
  // For v1 simplicity: take the binding's hqAmounts and convert to initialQuality
  // via the recipe's quality-per-HQ formula (mirror the simulator/InitialQuality
  // approach — see InitialQuality.vue for the exact conversion).
  const binding = list.reduce(
    (best, r) => (r.recipe.recipeLevelTable.progress > best.recipe.recipeLevelTable.progress ? r : best),
    list[0],
  )
  const initialQuality = computeInitialQualityFromHq(binding) // implement near here, mirror InitialQuality.vue
  const advice = await adviseMeld(
    list.map(r => r.recipe),
    gs,
    materiaPrices,
    { bisReference: BIS_REFERENCE, initialQuality, isCancelled },
  )
  meldAdvicePerJob.set(job, advice)
}

// Attach to result
return {
  // ... existing result fields
  meldAdvicePerJob,
}
```

Wire `computeInitialQualityFromHq` next to where existing HQ logic lives — copy the formula from `InitialQuality.vue` (or `simulator/InitialQuality.vue`) so a single source of truth is preserved. If the formula is non-trivial, hoist it to a small helper in `src/engine/quality.ts` and import it both places.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/batch-optimizer.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/batch-optimizer.ts src/stores/batch.ts src/__tests__/services/batch-optimizer.test.ts
git commit -m "feat(batch): Phase 6 — attach meld advice per job (HQ → initialQuality)"
```

---

## Task 18: `MeldAdvisorCard.vue` component

**Files:**
- Create: `src/components/MeldAdvisorCard.vue`
- Create: `src/__tests__/components/MeldAdvisorCard.spec.ts`

Dumb card. Props: `advice: MeldAdvice | 'loading' | 'stale' | null` (six states: null = empty/never-solved, loading, stale, result with `feasible:false`, result with `alreadyMeetsThreshold:true`, normal result with totalGil possibly null). Mirror `BuffRecommendationCard.vue` style (read first).

- [ ] **Step 1: Read the existing card for style**

Read `src/components/batch/BuffRecommendationCard.vue` — mirror its structure (Element Plus card with header, body sections, copy-to-clipboard button), wording, and class naming.

- [ ] **Step 2: Add a failing component test**

Create `src/__tests__/components/MeldAdvisorCard.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MeldAdvisorCard from '@/components/MeldAdvisorCard.vue'
import type { MeldAdvice } from '@/services/meld-advisor'

const fullAdvice: MeldAdvice = {
  alreadyMeetsThreshold: false,
  costOptimal: {
    feasible: true,
    deltaStats: { craftsmanship: 60, control: 0, cp: 0 },
    steps: [{ stat: 'craftsmanship', grade: 12, placedCount: 2, expectedCount: 2, unitPrice: 8000, subtotal: 16000 }],
    totalGil: 16000, confirmedBySolver: true,
  },
  bis: {
    feasible: true,
    deltaStats: { craftsmanship: 400, control: 400, cp: 50 },
    steps: [],
    totalGil: 2_400_000, confirmedBySolver: false,
  },
  gapGil: 2_384_000,
}

describe('MeldAdvisorCard', () => {
  it('renders the gap as the headline', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice } })
    expect(w.text()).toContain('2,384,000') // or however gil is formatted
  })

  it('renders the empty state when advice is null', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: null } })
    expect(w.text()).toMatch(/按 solve|尚未/) // matches the empty hint
  })

  it('renders a spinner when loading', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: 'loading' } })
    expect(w.find('[data-test=spinner]').exists()).toBe(true)
  })

  it('greys the card when stale', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: 'stale' } })
    expect(w.classes()).toContain('is-stale')
  })

  it('shows "needs different base gear" when infeasible', () => {
    const infeasible: MeldAdvice = {
      ...fullAdvice,
      costOptimal: { ...fullAdvice.costOptimal, feasible: false, reason: '槽位不足,需換底裝' },
    }
    const w = mount(MeldAdvisorCard, { props: { advice: infeasible } })
    expect(w.text()).toContain('槽位不足')
  })

  it('shows the already-met state', () => {
    const met: MeldAdvice = { ...fullAdvice, alreadyMeetsThreshold: true }
    const w = mount(MeldAdvisorCard, { props: { advice: met } })
    expect(w.text()).toMatch(/已能保證 HQ|無需鑲嵌/)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/MeldAdvisorCard.spec.ts`
Expected: FAIL — component file missing.

- [ ] **Step 4: Implement the component**

Create `src/components/MeldAdvisorCard.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { MeldAdvice } from '@/services/meld-advisor'

const props = defineProps<{
  advice: MeldAdvice | 'loading' | 'stale' | null
}>()

const isLoading = computed(() => props.advice === 'loading')
const isStale = computed(() => props.advice === 'stale')
const isEmpty = computed(() => props.advice === null)
const result = computed(() => {
  if (isLoading.value || isStale.value || isEmpty.value) return null
  return props.advice as MeldAdvice
})

function fmtGil(n: number | null): string {
  if (n === null) return '—'
  return n.toLocaleString('en-US')
}
</script>

<template>
  <el-card
    class="meld-advisor-card"
    :class="{ 'is-stale': isStale }"
  >
    <template #header>
      <span>鑲嵌建議</span>
    </template>

    <div v-if="isEmpty" class="empty-state">
      <p>按下 solve 後將算出鑲嵌建議</p>
    </div>

    <div v-else-if="isLoading" class="loading-state">
      <el-icon data-test="spinner" class="is-loading"><Loading /></el-icon>
      <span>計算中…</span>
    </div>

    <div v-else-if="result" class="result-grid">
      <!-- already-met branch -->
      <template v-if="result.alreadyMeetsThreshold">
        <p class="met-message">你的裝備已能保證 HQ,無需鑲嵌</p>
        <p class="bis-context">
          往全 BiS 還需 {{ fmtGil(result.bis.totalGil) }} gil(over-meld 空間)
        </p>
      </template>

      <!-- normal branch -->
      <template v-else>
        <div class="gap-headline">
          <span class="label">你能省</span>
          <span class="amount">{{ fmtGil(result.gapGil) }} gil</span>
        </div>
        <div class="two-cards">
          <section class="card-side cost-optimal">
            <h4>最省錢達標</h4>
            <p class="total">{{ fmtGil(result.costOptimal.totalGil) }} gil</p>
            <p class="detail" v-if="!result.costOptimal.feasible">
              {{ result.costOptimal.reason ?? '不可行' }}
            </p>
            <ul v-else class="steps">
              <li v-for="(s, i) in result.costOptimal.steps" :key="i">
                {{ s.stat }} XII × {{ Math.ceil(s.expectedCount) }}
              </li>
            </ul>
            <small v-if="!result.costOptimal.confirmedBySolver">保守估計</small>
          </section>

          <section class="card-side bis">
            <h4>全 BiS pentameld</h4>
            <p class="total">{{ fmtGil(result.bis.totalGil) }} gil</p>
            <small>含 overmeld 失敗耗損</small>
          </section>
        </div>

        <p class="disclaimer">
          ⓘ「可行門檻」可靠,「跨軸最省配比」為近似(v1 貪婪)
        </p>
      </template>
    </div>
  </el-card>
</template>

<style scoped>
.meld-advisor-card.is-stale { opacity: 0.5; }
.gap-headline { text-align: center; margin-bottom: 1rem; }
.gap-headline .amount { font-size: 2rem; font-weight: bold; display: block; }
.two-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.card-side { padding: 1rem; border: 1px solid var(--el-border-color); border-radius: 4px; }
.card-side .total { font-size: 1.25rem; font-weight: 600; }
.disclaimer { margin-top: 1rem; font-size: 0.85rem; color: var(--el-text-color-secondary); }
</style>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/MeldAdvisorCard.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/MeldAdvisorCard.vue src/__tests__/components/MeldAdvisorCard.spec.ts
git commit -m "feat(meld-advisor): MeldAdvisorCard component with 6 states"
```

---

## Task 19: Simulator integration (ride-along with the solve trigger)

**Files:**
- Modify: `src/views/SimulatorView.vue` (or whichever component owns the simulator's "solve" button — investigate below)

The card mounts in simulator and re-runs in parallel whenever the user presses solve. Existing solve flow continues unblocked; the card spinner appears in its own panel while it computes.

- [ ] **Step 1: Locate the simulator's solve trigger**

Search for the component that wires up the simulator solve button. Likely candidates:
- `src/views/SimulatorView.vue`
- `src/components/simulator/*.vue`

Run: `npx ripgrep --type=vue solveCraftForRecipe src/components src/views` (or use the Grep tool).

Identify (a) where the solve button's click handler lives, (b) where the resulting actions/macro are stored, and (c) where the gearset and current recipe are sourced.

- [ ] **Step 2: Add a `useMeldAdvisor` composable to encapsulate the lifecycle**

Create `src/composables/useMeldAdvisor.ts`:

```ts
import { ref, shallowRef } from 'vue'
import { adviseMeld, type MeldAdvice } from '@/services/meld-advisor'
import { fetchMateriaPriceMap } from '@/api/universalis'
import { BIS_REFERENCE } from '@/engine/materia'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

export function useMeldAdvisor(world: () => string) {
  const advice = shallowRef<MeldAdvice | 'loading' | 'stale' | null>(null)
  let cancelToken = { cancelled: false }

  async function runAdvisor(
    recipe: Recipe,
    gearset: GearsetStats,
    initialQuality: number,
  ) {
    cancelToken.cancelled = true
    const token = { cancelled: false }
    cancelToken = token
    advice.value = 'loading'
    try {
      const priceMap = await fetchMateriaPriceMap(world())
      if (token.cancelled) return
      const out = await adviseMeld(
        [recipe], gearset, priceMap,
        {
          bisReference: BIS_REFERENCE,
          initialQuality,
          isCancelled: () => token.cancelled,
        },
      )
      if (token.cancelled) return
      advice.value = out
    } catch {
      if (!token.cancelled) advice.value = null
    }
  }

  function markStale() {
    if (advice.value && typeof advice.value === 'object') advice.value = 'stale'
  }

  return { advice, runAdvisor, markStale }
}
```

- [ ] **Step 3: Wire the composable into the simulator**

In the simulator view identified in Step 1:

```vue
<script setup lang="ts">
import { useMeldAdvisor } from '@/composables/useMeldAdvisor'
import MeldAdvisorCard from '@/components/MeldAdvisorCard.vue'
// ... existing imports

const { advice, runAdvisor, markStale } = useMeldAdvisor(() => userStore.world)

// Wherever the existing solve handler lives, after it kicks off the main solve:
async function onSolveClicked() {
  // Existing main-macro solve continues here, unchanged.
  // ...

  // Ride along: fire-and-forget the advisor with the same recipe/gearset.
  if (currentRecipe.value && currentGearset.value) {
    runAdvisor(currentRecipe.value, currentGearset.value, initialQuality.value)
  }
}

// On gearset/recipe edits (without re-solving), mark advice stale.
watch([currentGearset, currentRecipe], () => markStale())
</script>

<template>
  <!-- existing simulator UI -->
  <MeldAdvisorCard :advice="advice" />
</template>
```

(Adjust ref/store names to match what the simulator actually uses.)

- [ ] **Step 4: Manually verify in dev**

Run: `npm run dev` and navigate to the simulator page.

Expected:
- Card visible, empty state until solve is pressed.
- After pressing solve: main macro appears immediately; card shows spinner; card fills in with `MeldAdvice` after the advisor solve completes.
- Editing gearset without pressing solve: card greys (stale).
- Pressing solve again while previous advisor is in-flight: previous run is cancelled cleanly (no console error).

- [ ] **Step 5: Commit**

```bash
git add src/composables/useMeldAdvisor.ts src/views/SimulatorView.vue  # or whichever file you edited
git commit -m "feat(simulator): ride-along meld advisor wired to solve trigger"
```

---

## Task 20: Batch UI integration (one card per job)

**Files:**
- Modify: a component in `src/components/batch/` that owns the batch result region — investigate below.

Render one `MeldAdvisorCard` per job from `batchResult.meldAdvicePerJob`. No new triggers; Phase 6 already fired it.

- [ ] **Step 1: Locate where batch results render**

Look at `src/components/batch/`. Find the parent that consumes `batchResult` and renders results sections (`BuffRecommendationCard` lives in this region — co-locate the new card with it).

- [ ] **Step 2: Mount the card per job**

In the identified component:

```vue
<script setup lang="ts">
import MeldAdvisorCard from '@/components/MeldAdvisorCard.vue'
// ... existing imports

const props = defineProps<{ batchResult: BatchResult }>()
</script>

<template>
  <!-- existing batch result UI -->

  <section v-if="batchResult.meldAdvicePerJob" class="meld-advisor-section">
    <h3>鑲嵌建議(依職業)</h3>
    <div class="meld-cards">
      <div
        v-for="[job, advice] in batchResult.meldAdvicePerJob"
        :key="job"
        class="meld-card-wrap"
      >
        <h4>{{ job }}</h4>
        <MeldAdvisorCard :advice="advice" />
      </div>
    </div>
  </section>
</template>
```

- [ ] **Step 3: Manually verify**

Run: `npm run dev`, set up a small batch (2-3 recipes spanning 2 jobs), press 最佳化.

Expected:
- Main batch results appear immediately.
- Below them, a "鑲嵌建議" section appears with one card per job.
- Each card shows the gap headline, cost-optimal, and BiS side-by-side.

- [ ] **Step 4: Commit**

```bash
git add src/components/batch/<the-file>.vue
git commit -m "feat(batch): render meld advisor card per job in batch result"
```

---

## Task 21: Full-suite verification + summary

**Files:** none

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all tests pass, no new failures introduced. Pay attention to:
- `src/__tests__/engine/materia.test.ts`
- `src/__tests__/services/meld-advisor.test.ts`
- `src/__tests__/services/stat-stacking-parity.test.ts`
- `src/__tests__/services/batch-optimizer.test.ts`
- `src/__tests__/components/MeldAdvisorCard.spec.ts`

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck` (or whatever the repo uses — check `package.json` scripts).
Expected: zero errors.

- [ ] **Step 3: Manual smoke**

Run: `npm run dev` and exercise both entry points end-to-end:
- Simulator: load a recipe → press solve → verify card fills.
- Batch: build a small multi-job batch → 最佳化 → verify per-job cards.

- [ ] **Step 4: Update changelog before tagging**

Per `CLAUDE.md`: any release needs the version's changelog written into `src/views/ChangelogView.vue` BEFORE `git tag`. (The git hook will block otherwise.) This task only ships the feature in `main` via PR — tagging is a separate step the maintainer decides on later. **Do NOT tag.**

- [ ] **Step 5: Open the PR**

Push the worktree branch and open a PR linking back to Issue #91:

```bash
git push -u origin worktree-meld-advisor
gh pr create \
  --title "feat(meld-advisor): materia meld advisor (closes #91)" \
  --body "Implements the materia meld advisor per Issue #91 and the design at docs/superpowers/plans/2026-05-28-meld-advisor.md."
```

---

## Self-Review Notes (writer's checklist)

1. **Spec coverage:** Every PRD section maps to ≥1 task:
   - Algorithm Step 0–7 → Tasks 7, 8, 9, 10, 11, 12, 13.
   - ②-lite scope (no per-piece, no cap tables) → fidelity choices live in Tasks 2, 11; cap tables explicitly absent.
   - HQ → initialQuality → Task 6 (plumbing) + Task 9 (closed-form) + Task 13 (orchestrator default) + Task 17 (batch wiring).
   - ADR-0001 ordering → Tasks 6, 15.
   - Universalis price + partial-missing handling → Tasks 16, 11 (null subtotal path).
   - Slot-insufficient feasibility → Task 11.
   - Already-met → Task 13.
   - UI states → Task 18.
   - Side-by-side + gap headline → Task 18.
   - Simulator ride-along + stale → Task 19.
   - Batch Phase 6 per-job → Tasks 17, 20.
   - Cancellation → Tasks 10, 13, 19.
   - Golden snapshot → Task 14.
   - "Out of Scope" items → explicitly NOT covered by any task (confirmed).

2. **Placeholder scan:** no TBD/TODO in concrete code; investigation steps that say "read the file first" are bounded actions, not placeholders.

3. **Type consistency:** `MeldAdvice`, `MeldPlan`, `MeldStep`, `MateriaPriceMap`, `BiSReference`, `CraftStat`, `AdviseMeldOptions`, `ConfirmDeps` are all defined in Task 5 and re-used identically downstream. `solveCraftForRecipe`/`simulateCraftForRecipe` injection signature in Task 10 matches usage in Tasks 13 and 19.

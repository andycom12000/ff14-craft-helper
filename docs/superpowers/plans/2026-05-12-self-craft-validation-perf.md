# Self-Craft Validation Perf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut batch optimization wall-clock time from 134.8 s to 45–70 s by adding NQ template/simulate validation, HQ feasibility pre-filter, a 2-slot solver worker pool, and parallelizing Phase 1 + Phase 4.6 self-craft loops.

**Architecture:** Branch self-craft candidate validation by `hqRequired`: NQ candidates use a template macro verified via `simulateCraft` (zero false positive); HQ candidates use a pure-JS quality upper-bound pre-filter to skip clearly-impossible cases before solving. Refactor `solver/worker.ts` to multiplex two Worker instances behind the existing `pendingRequests` machinery, then wrap Phase 1 and self-craft candidate loops in `Promise.allSettled`. Progress bar moves from order-dependent labels to a completion counter.

**Tech Stack:** TypeScript, Vue 3 + Pinia, Vitest, raphael-rs WASM (via `solver/worker.ts`)

**Source of truth for formulas:** `~/.cargo/git/checkouts/raphael-rs-e9b0b2fe4e9f5b15/47c4ea7/raphael-data/src/lib.rs:113-118` (base_quality / base_progress) and `raphael-sim/src/actions.rs:37-49` + `raphael-sim/src/effects.rs:70-80` (quality multipliers).

**Spec:** `docs/superpowers/specs/2026-05-12-self-craft-validation-perf-design.md`

**Validation tool:** `[bperf]` logs already inserted in `batch-optimizer.ts` / `buff-recommender.ts` / `self-craft-candidates.ts`. After every PR, run a real batch in the browser, copy console logs, compare with pre-PR baseline.

---

## File Structure

| File | Responsibility | Status |
| --- | --- | --- |
| `src/engine/food-medicine.ts` | Add `applyBuffsToStats()` shared helper | Modify |
| `src/services/feasibility-prefilter.ts` | Pure-JS HQ quality upper-bound check + raphael-sim-derived constants | **New** |
| `src/__tests__/services/feasibility-prefilter.test.ts` | Unit tests | **New** |
| `src/services/self-craft-candidates.ts` | Inline `nqTemplate()`; branch Step 8 on `hqRequired` | Modify |
| `src/__tests__/services/self-craft-candidates.test.ts` | NQ/HQ branch behavior tests | **New** |
| `src/services/batch-optimizer.ts` | Phase 4.6 `Promise.all`; Phase 1 `Promise.allSettled` | Modify |
| `src/__tests__/services/batch-optimizer.test.ts` | Concurrency + cancel propagation tests | Modify |
| `src/solver/worker.ts` | Multiplex solve via `requestId`; 2-slot pool | Refactor |
| `src/solver/solver-worker.ts` | Echo `requestId` in solve `progress`/`result`/`error` | Modify |
| `src/__tests__/solver/worker-pool.test.ts` | Pool concurrency + cancel | **New** |
| `src/stores/batch.ts` | Rename progress `current` → `completed` | Modify |
| `src/components/batch/BatchProgress.vue` | Update consumers of `current` → `completed` | Modify |

---

## PR 1 — Shared Helper + Feasibility Pre-Filter

**Goal:** Add `applyBuffsToStats()` to `food-medicine.ts` (shared by later PRs), then land the HQ quality upper-bound pre-filter. Pure-JS, fully tested, no call sites touched.

**Risk:** Low. No I/O, isolated modules. Rollback = revert two files.

### Task 1: Shared `applyBuffsToStats` helper

**Files:**
- Modify: `src/engine/food-medicine.ts`

- [ ] **Step 1: Write failing test in existing food-medicine test file (or create one if absent)**

Run: `ls src/__tests__/engine/food-medicine.test.ts 2>/dev/null || echo MISSING`

If MISSING, create `src/__tests__/engine/food-medicine.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applyBuffsToStats, COMMON_FOODS, COMMON_MEDICINES } from '@/engine/food-medicine'

describe('applyBuffsToStats', () => {
  const base = { craftsmanship: 4000, control: 3800, cp: 600 }

  it('returns base when no buffs', () => {
    expect(applyBuffsToStats(base, undefined)).toEqual(base)
    expect(applyBuffsToStats(base, { food: null, medicine: null })).toEqual(base)
  })

  it('applies food then medicine, additive on stats', () => {
    const food = COMMON_FOODS[0]
    const medicine = COMMON_MEDICINES[0]
    const result = applyBuffsToStats(base, { food, medicine })
    expect(result.craftsmanship).toBeGreaterThanOrEqual(base.craftsmanship)
    expect(result.cp).toBeGreaterThanOrEqual(base.cp)
  })
})
```

If the test file already exists, append the `describe` block.

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/__tests__/engine/food-medicine.test.ts`
Expected: FAIL with "applyBuffsToStats is not exported"

- [ ] **Step 3: Add the helper to `src/engine/food-medicine.ts`**

Append to `src/engine/food-medicine.ts`:

```ts
export function applyBuffsToStats(
  stats: EnhancedStats,
  buffs: { food: FoodBuff | null; medicine: FoodBuff | null } | undefined,
): EnhancedStats {
  if (!buffs) return stats
  return applyMedicineBuff(applyFoodBuff(stats, buffs.food), buffs.medicine)
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run src/__tests__/engine/food-medicine.test.ts`
Expected: PASS

### Task 2: Feasibility pre-filter module + base formulas

**Files:**
- Create: `src/services/feasibility-prefilter.ts`
- Create: `src/__tests__/services/feasibility-prefilter.test.ts`

- [ ] **Step 1: Write failing tests for base_quality / base_progress formulas**

```ts
// src/__tests__/services/feasibility-prefilter.test.ts
import { describe, it, expect } from 'vitest'
import { computeBaseQuality, computeBaseProgress, canReachHQQuality } from '@/services/feasibility-prefilter'
import type { Recipe } from '@/stores/recipe'

const lv90Rlt = {
  classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
  durability: 80, suggestedCraftsmanship: 3500,
  progressDivider: 130, qualityDivider: 115,
  progressModifier: 90, qualityModifier: 80,
}

describe('computeBaseQuality / computeBaseProgress', () => {
  it('applies recipe-level modifier when crafter level ≤ rlvl', () => {
    expect(computeBaseQuality(3800, 90, lv90Rlt)).toBe(292)
    expect(computeBaseProgress(4000, 90, lv90Rlt)).toBe(278)
  })

  it('skips modifier when crafter outlevels recipe', () => {
    expect(computeBaseQuality(3800, 100, lv90Rlt)).toBe(365)
  })
})

const lv94Recipe: Recipe = {
  id: 1, itemId: 100, name: 'test', icon: '', job: 'CRP',
  level: 94, stars: 0, canHq: true, materialQualityFactor: 50, amountResult: 1,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 94, stars: 0, difficulty: 4400, quality: 8500,
    durability: 80, suggestedCraftsmanship: 3950,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 80,
  },
}

describe('canReachHQQuality', () => {
  it('passes when control + CP comfortably exceed target', () => {
    expect(canReachHQQuality(lv94Recipe, { level: 100, craftsmanship: 5000, control: 5000, cp: 700 })).toBe(true)
  })

  it('rejects when both control and CP are starved', () => {
    expect(canReachHQQuality(lv94Recipe, { level: 94, craftsmanship: 3500, control: 100, cp: 50 })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run src/__tests__/services/feasibility-prefilter.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement the module**

Create `src/services/feasibility-prefilter.ts`:

```ts
import type { RecipeLevelTable, Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { FoodBuff } from '@/engine/food-medicine'
import { applyBuffsToStats } from '@/engine/food-medicine'

// Derived from raphael-sim/src/actions.rs:46-47 and effects.rs:70-80.
// Whole-phase upper bound — empirically matches what raphael-solver can
// actually achieve in ~10 quality steps. Tuned for false positive (over-accept,
// solver catches the rest) over false negative.
export const QUALITY_PHASE_UPPER_BOUND_MULTIPLIER = 25
export const AVG_QUALITY_CP_COST = 18
export const MARGIN = 1.10

export function computeBaseQuality(control: number, crafterLevel: number, rlt: RecipeLevelTable): number {
  let bq = (control * 10) / rlt.qualityDivider + 35
  if (crafterLevel <= rlt.classJobLevel) bq = (bq * rlt.qualityModifier) / 100
  return Math.floor(bq)
}

export function computeBaseProgress(craftsmanship: number, crafterLevel: number, rlt: RecipeLevelTable): number {
  let bp = (craftsmanship * 10) / rlt.progressDivider + 2
  if (crafterLevel <= rlt.classJobLevel) bp = (bp * rlt.progressModifier) / 100
  return Math.floor(bp)
}

export function canReachHQQuality(
  recipe: Recipe,
  gearset: GearsetStats,
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null },
): boolean {
  const stats = applyBuffsToStats(
    { craftsmanship: gearset.craftsmanship, control: gearset.control, cp: gearset.cp },
    buffs,
  )
  const baseQuality = computeBaseQuality(stats.control, gearset.level, recipe.recipeLevelTable)
  const maxQualitySteps = Math.floor(stats.cp / AVG_QUALITY_CP_COST)
  const maxAchievable = baseQuality * QUALITY_PHASE_UPPER_BOUND_MULTIPLIER * maxQualitySteps * MARGIN
  return maxAchievable >= recipe.recipeLevelTable.quality
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `npx vitest run src/__tests__/services/feasibility-prefilter.test.ts`
Expected: 4 PASS

### Task 3: Commit PR 1

- [ ] **Step 1: Type-check and run full suite**

Run: `npx vue-tsc --noEmit && npx vitest run`
Expected: EXIT=0; all tests pass

- [ ] **Step 2: Commit**

```bash
git add src/engine/food-medicine.ts \
        src/__tests__/engine/food-medicine.test.ts \
        src/services/feasibility-prefilter.ts \
        src/__tests__/services/feasibility-prefilter.test.ts
git commit -m "feat(batch): add HQ feasibility pre-filter + shared buffs helper

applyBuffsToStats() centralizes food+medicine application in food-medicine.ts
(used by PR 2/3).

feasibility-prefilter.ts: pure-JS upper-bound check derived from raphael-sim.
Tuned for false positive (solver verifies) over false negative."
```

---

## PR 2 — Step 8 Branch Rewrite

**Goal:** Replace `self-craft-candidates.ts` Step 8 with `hqRequired` branching: NQ → template-via-simulate then fallback solver; HQ → arithmetic prefilter then solver. Loop stays serial (PR 4 makes it parallel).

**Risk:** Medium. Self-craft acceptance changes. Behavior preserved when both paths fall back to solver. Rollback = revert one file.

### Task 4: Test scaffold + NQ + HQ branch tests + implementation

**Files:**
- Create: `src/__tests__/services/self-craft-candidates.test.ts`
- Modify: `src/services/self-craft-candidates.ts`

- [ ] **Step 1: Write failing tests covering all 4 branch outcomes**

```ts
// src/__tests__/services/self-craft-candidates.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

vi.mock('@/solver/worker', () => ({
  simulateCraft: vi.fn(),
  waitForWasm: vi.fn().mockResolvedValue(undefined),
  SOLVE_CANCELLED: '求解已取消',
}))
vi.mock('@/api/universalis', () => ({
  getAggregatedPrices: vi.fn().mockResolvedValue(new Map()),
}))
vi.mock('@/api/xivapi', () => ({
  findRecipesByItemName: vi.fn(),
  getRecipe: vi.fn(),
}))
vi.mock('@/services/bom-calculator', () => ({
  buildMaterialTree: vi.fn(),
  computeOptimalCosts: vi.fn(),
  SELF_CRAFT_SAVINGS_THRESHOLD: 0.05,
}))

import { produceSelfCraftCandidates } from '@/services/self-craft-candidates'
import { simulateCraft } from '@/solver/worker'
import { findRecipesByItemName, getRecipe } from '@/api/xivapi'
import { buildMaterialTree, computeOptimalCosts } from '@/services/bom-calculator'

const intermediateRecipe: Recipe = {
  id: 100, itemId: 200, name: 'test-intermediate', icon: '', job: 'CRP',
  level: 50, stars: 0, canHq: true, materialQualityFactor: 50, amountResult: 1,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 50, stars: 0, difficulty: 350, quality: 1100,
    durability: 60, suggestedCraftsmanship: 300,
    progressDivider: 50, qualityDivider: 30,
    progressModifier: 100, qualityModifier: 100,
  },
}
const ampleGearset: GearsetStats = { level: 90, craftsmanship: 1500, control: 1500, cp: 500 }
const starvedGearset: GearsetStats = { level: 90, craftsmanship: 100, control: 100, cp: 50 }
const passProgressSim = { progress: 350, max_progress: 350, quality: 0, max_quality: 1100, durability: 10, max_durability: 60, cp: 200, max_cp: 500, steps_count: 6 } as any
const failProgressSim = { progress: 200, max_progress: 350, quality: 0, max_quality: 1100, durability: 0, max_durability: 60, cp: 0, max_cp: 500, steps_count: 5 } as any

function stubOneCandidate(itemId: number) {
  vi.mocked(buildMaterialTree).mockResolvedValue([{
    itemId: 999, name: 'root', icon: '', amount: 1, recipeId: 999,
    children: [{ itemId, name: 'test-intermediate', icon: '', amount: 1, recipeId: 100, children: [] }],
  }] as any)
  vi.mocked(computeOptimalCosts).mockReturnValue({
    totalCost: 0,
    decisions: [{
      itemId, name: 'test-intermediate', icon: '', amount: 1,
      buyCost: 1000, craftCost: 800, optimalCost: 800,
      savingsRatio: 0.20, recommendation: 'craft',
    }],
  })
  vi.mocked(findRecipesByItemName).mockResolvedValue([{ recipeId: 100, job: '木工' }])
  vi.mocked(getRecipe).mockResolvedValue(intermediateRecipe)
}

function buildArgs(overrides: Partial<Parameters<typeof produceSelfCraftCandidates>[0]> = {}) {
  return {
    recipesToCraft: [{
      recipe: { ...intermediateRecipe, id: 999, itemId: 999, level: 90 },
      quantity: 1, outputAmount: 1, actions: [], hqAmounts: [0, 0],
      initialQuality: 0, isDoubleMax: false, materials: [], qualityDeficit: 0,
    }] as any,
    priceMap: new Map() as any,
    priceSource: 'TestServer', crossServer: false, server: 'TestServer',
    getGearset: () => ampleGearset,
    maxDepth: 2, buffs: undefined,
    optimizeRecipe: vi.fn(),
    onProgress: () => {}, isCancelled: () => false,
    ...overrides,
  }
}

describe('produceSelfCraftCandidates', () => {
  beforeEach(() => vi.clearAllMocks())

  it('NQ: accepts when template simulate succeeds, no solver call', async () => {
    stubOneCandidate(200)
    vi.mocked(simulateCraft).mockResolvedValue(passProgressSim)
    const args = buildArgs()
    const out = await produceSelfCraftCandidates(args)
    expect(out).toHaveLength(1)
    expect(out[0].actions[0]).toBe('BasicSynthesis')
    expect(args.optimizeRecipe).not.toHaveBeenCalled()
  })

  it('NQ: template fails → solver fallback → drop when unreachable', async () => {
    stubOneCandidate(200)
    vi.mocked(simulateCraft).mockResolvedValue(failProgressSim)
    const optimizeFn = vi.fn().mockResolvedValue({
      isDoubleMax: false, actions: [], hqAmounts: [],
      qualityDeficit: 0, initialQuality: 0, materials: [],
      recipe: intermediateRecipe, quantity: 1, outputAmount: 1,
    })
    const out = await produceSelfCraftCandidates(buildArgs({ optimizeRecipe: optimizeFn as any }))
    expect(optimizeFn).toHaveBeenCalledTimes(1)
    expect(out).toHaveLength(0)
  })

  it('NQ: template fails → solver fallback → accept on reachable', async () => {
    stubOneCandidate(200)
    vi.mocked(simulateCraft).mockResolvedValue(failProgressSim)
    const optimizeFn = vi.fn().mockResolvedValue({
      isDoubleMax: false, actions: ['solver-action'], hqAmounts: [1, 0],
      qualityDeficit: 100, initialQuality: 0, materials: [],
      recipe: intermediateRecipe, quantity: 1, outputAmount: 1,
    })
    const out = await produceSelfCraftCandidates(buildArgs({ optimizeRecipe: optimizeFn as any }))
    expect(out).toHaveLength(1)
    expect(out[0].actions).toEqual(['solver-action'])
  })

  it('HQ: prefilter rejects starved gearset, no solver call', async () => {
    stubOneCandidate(300)
    const optimizeFn = vi.fn()
    const out = await produceSelfCraftCandidates(buildArgs({
      recipesToCraft: [{
        recipe: intermediateRecipe, quantity: 1, outputAmount: 1,
        actions: [], hqAmounts: [1, 1],
        initialQuality: 0, isDoubleMax: false,
        materials: [{ itemId: 300, name: 'test', icon: '', amount: 1 }],
        qualityDeficit: 100,
      }] as any,
      getGearset: () => starvedGearset,
      optimizeRecipe: optimizeFn as any,
    }))
    expect(optimizeFn).not.toHaveBeenCalled()
    expect(out).toHaveLength(0)
  })

  it('HQ: prefilter passes → solver accepts on doubleMax', async () => {
    stubOneCandidate(300)
    const optimizeFn = vi.fn().mockResolvedValue({
      isDoubleMax: true, actions: ['mm', 'careful'], hqAmounts: [],
      qualityDeficit: 0, initialQuality: 0, materials: [],
      recipe: intermediateRecipe, quantity: 1, outputAmount: 1,
    })
    const out = await produceSelfCraftCandidates(buildArgs({
      recipesToCraft: [{
        recipe: intermediateRecipe, quantity: 1, outputAmount: 1,
        actions: [], hqAmounts: [1, 1],
        initialQuality: 0, isDoubleMax: false,
        materials: [{ itemId: 300, name: 'test', icon: '', amount: 1 }],
        qualityDeficit: 100,
      }] as any,
      optimizeRecipe: optimizeFn as any,
    }))
    expect(optimizeFn).toHaveBeenCalledTimes(1)
    expect(out).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests, verify they fail with expected reasons**

Run: `npx vitest run src/__tests__/services/self-craft-candidates.test.ts`
Expected: FAIL — Step 8 still runs unconditional solver

- [ ] **Step 3: Add imports + `nqTemplate` helper at top of self-craft-candidates.ts**

Add to imports in `src/services/self-craft-candidates.ts`:

```ts
import { simulateCraft } from '@/solver/worker'
import { canReachHQQuality } from '@/services/feasibility-prefilter'
import { craftParamsToSolverConfig, recipeToCraftParams } from '@/solver/config'
import { applyBuffsToStats } from '@/engine/food-medicine'
import type { FoodBuff } from '@/engine/food-medicine'
```

Add helper after the imports:

```ts
function nqTemplate(level: number): string[] {
  if (level < 54) return new Array(15).fill('BasicSynthesis')
  if (level <= 70) return ['MuscleMemory', ...new Array(10).fill('BasicSynthesis')]
  if (level <= 90) return ['MuscleMemory', ...new Array(8).fill('CarefulSynthesis')]
  return ['MuscleMemory', 'Veneration', ...new Array(7).fill('CarefulSynthesis')]
}

type ValidateOutcome =
  | { kind: 'accepted'; via: 'template' | 'solver'; actions: string[]; hqAmounts: number[]; solveDur?: number }
  | { kind: 'failed' }
  | { kind: 'prefilter-rejected' }

async function validateNQ(
  recipe: Recipe,
  gearset: GearsetStats,
  buffs: { food: FoodBuff | null; medicine: FoodBuff | null } | undefined,
  optimizeRecipe: OptimizeRecipeFn,
): Promise<ValidateOutcome> {
  const enhanced = applyBuffsToStats(
    { craftsmanship: gearset.craftsmanship, control: gearset.control, cp: gearset.cp },
    buffs,
  )
  const params = recipeToCraftParams(recipe, { ...gearset, ...enhanced })
  const config = craftParamsToSolverConfig(params)
  const template = nqTemplate(recipe.level)

  try {
    const sim = await simulateCraft(config, template)
    if (sim.progress >= sim.max_progress) {
      return { kind: 'accepted', via: 'template', actions: template, hqAmounts: [] }
    }
  } catch (err) {
    console.warn(`[self-craft] simulate failed for ${recipe.name}, falling back to solver`, err)
  }

  const t0 = performance.now()
  try {
    const opt = await optimizeRecipe(recipe, gearset, undefined, buffs)
    if (!opt.isDoubleMax && opt.hqAmounts.length === 0) return { kind: 'failed' }
    return {
      kind: 'accepted', via: 'solver',
      actions: opt.actions, hqAmounts: opt.hqAmounts,
      solveDur: performance.now() - t0,
    }
  } catch (err) {
    console.warn(`[self-craft] solver failed for ${recipe.name}:`, err)
    return { kind: 'failed' }
  }
}

async function validateHQ(
  recipe: Recipe,
  gearset: GearsetStats,
  buffs: { food: FoodBuff | null; medicine: FoodBuff | null } | undefined,
  optimizeRecipe: OptimizeRecipeFn,
): Promise<ValidateOutcome> {
  if (!canReachHQQuality(recipe, gearset, buffs)) {
    return { kind: 'prefilter-rejected' }
  }
  const t0 = performance.now()
  try {
    const opt = await optimizeRecipe(recipe, gearset, undefined, buffs)
    if (!opt.isDoubleMax) return { kind: 'failed' }
    return {
      kind: 'accepted', via: 'solver',
      actions: opt.actions, hqAmounts: opt.hqAmounts,
      solveDur: performance.now() - t0,
    }
  } catch (err) {
    console.warn(`[self-craft] solver failed for ${recipe.name}:`, err)
    return { kind: 'failed' }
  }
}
```

- [ ] **Step 4: Replace Step 8 loop body (around lines 250-292)**

```ts
const candidates: SelfCraftCandidate[] = []
let _bperfSolveCount = 0, _bperfSolveTotal = 0
let _bperfTemplateHits = 0, _bperfPrefilterRejects = 0

for (let i = 0; i < withRecipes.length; i++) {
  if (isCancelled()) return candidates
  const { decision, node, recipe, job } = withRecipes[i]
  onProgress({ current: i + 1, total: withRecipes.length, name: recipe.name })

  const gs = getGearset(job)
  if (!gs) continue
  const hqRequired = hqRequiredMap.get(decision.itemId) === true

  const validated = hqRequired
    ? await validateHQ(recipe, gs, buffs, optimizeRecipe)
    : await validateNQ(recipe, gs, buffs, optimizeRecipe)

  if (validated.kind === 'prefilter-rejected') {
    _bperfPrefilterRejects++
    console.log(`[bperf-self]   prefilter-rejected[${i}] "${recipe.name}" lvl=${recipe.level}`)
    continue
  }
  if (validated.kind === 'failed') continue

  if (validated.via === 'template') _bperfTemplateHits++
  else {
    _bperfSolveCount++
    _bperfSolveTotal += validated.solveDur ?? 0
  }
  console.log(`[bperf-self]   ${validated.via}[${i}] "${recipe.name}" lvl=${recipe.level} ` +
    (validated.via === 'solver' ? `dur=${(validated.solveDur ?? 0).toFixed(1)}ms ` : '') +
    `hqRequired=${hqRequired}`)

  candidates.push({
    itemId: decision.itemId, name: decision.name, icon: decision.icon, amount: decision.amount,
    recipe, job,
    buyCost: decision.buyCost, craftCost: decision.craftCost,
    savings: decision.buyCost - decision.craftCost, savingsRatio: decision.savingsRatio,
    actions: validated.actions, hqAmounts: validated.hqAmounts,
    rawMaterials: computeRawMaterials(node.childNodes, priceMap, crossServer, server),
    hqRequired, depth: node.depth,
  })
}

console.log(`[bperf-self] done · dur=${(performance.now() - _bperfT0).toFixed(1)}ms · ` +
  `solverRuns=${_bperfSolveCount} (${_bperfSolveTotal.toFixed(0)}ms) ` +
  `templateHits=${_bperfTemplateHits} prefilterRejects=${_bperfPrefilterRejects} ` +
  `accepted=${candidates.length}`)
return candidates
```

- [ ] **Step 5: Run tests, verify all pass**

Run: `npx vitest run src/__tests__/services/self-craft-candidates.test.ts`
Expected: 5 PASS

### Task 5: Type-check, smoke test, commit PR 2

- [ ] **Step 1: Type-check + full suite**

Run: `npx vue-tsc --noEmit && npx vitest run`
Expected: EXIT=0; all pass

- [ ] **Step 2: Browser smoke test**

Restart dev server, run a 1-2 recipe batch. Verify `[bperf-self]` log shows `template[N]` or `prefilter-rejected[N]` entries.

- [ ] **Step 3: Commit**

```bash
git add src/services/self-craft-candidates.ts src/__tests__/services/self-craft-candidates.test.ts
git commit -m "feat(batch): branch self-craft validation on hqRequired

NQ → simulate template macro, fallback solver. HQ → arithmetic prefilter,
then solver. Eliminates ~9s solver call per template hit and per
prefilter rejection."
```

---

## PR 3 — Phase 4.6 Promise.all

**Goal:** Run `evaluateBuffRecommendation` and `produceSelfCraftCandidates` in parallel inside `batch-optimizer.ts`. Standalone savings small (~2-5s) because both serialize on the single worker — sets up PR 4.

**Risk:** Low.

### Task 6: Wrap Phase 4.6 in Promise.all with concurrency test

**Files:**
- Modify: `src/services/batch-optimizer.ts`
- Modify: `src/__tests__/services/batch-optimizer.test.ts`

- [ ] **Step 1: Add concurrency test**

Append to `batch-optimizer.test.ts`:

```ts
describe('runBatchOptimization · Phase 4.6 concurrency', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invokes buff + self-craft concurrently', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: [], progress: 3500, quality: 7200, steps: 0 })
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)
    const { evaluateBuffRecommendation } = await import('@/services/buff-recommender')
    const { produceSelfCraftCandidates } = await import('@/services/self-craft-candidates')

    let buffStarted = false, selfStarted = false, bothActive = false
    vi.mocked(evaluateBuffRecommendation).mockImplementation(async () => {
      buffStarted = true
      if (selfStarted) bothActive = true
      await new Promise(r => setTimeout(r, 10))
      return null
    })
    vi.mocked(produceSelfCraftCandidates).mockImplementation(async () => {
      selfStarted = true
      if (buffStarted) bothActive = true
      await new Promise(r => setTimeout(r, 10))
      return []
    })

    await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }],
      () => mockGearset,
      { crossServer: false, recursivePricing: true, maxRecursionDepth: 2,
        exceptionStrategy: 'skip', server: 'S', dataCenter: 'DC', autoEvaluateBuffs: true },
      () => {}, () => false,
    )
    expect(bothActive).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run src/__tests__/services/batch-optimizer.test.ts -t 'concurrency'`
Expected: FAIL — currently sequential

- [ ] **Step 3: Refactor Phase 4.6 region (around lines 382-450)**

Find the existing two-step structure (Phase 4.6-buff block then Phase 4.6 self-craft block separated by Phase 5 aggregation prep). Restructure:

```ts
// === Phase 4.6: buff recommendation + self-craft candidates (parallel) ===
const _bperfPhase46T0 = performance.now()

const buffPromise: Promise<BuffRecommendation | undefined> = (async () => {
  if (!noBuffSelected || isCancelled()) return undefined
  const buyFinishedIds = new Set(buyFinishedItems.map(bf => bf.recipe.id))
  const hasDeficit = recipesToCraft.some(r => !r.isDoubleMax && r.recipe.canHq)
  const hasUnachievable = qualityUnachievableResults.length > 0
  if (!hasDeficit && !hasUnachievable) return undefined
  onProgress({ current: 0, total: 0, name: '', phase: 'evaluating-buffs', solverPercent: 0 })
  const rec = await evaluateBuffRecommendation(
    recipesToCraft, buyFinishedIds, getGearset as (job: string) => GearsetStats | null,
    priceMap, isCancelled,
    (info) => onProgress({ current: info.current, total: info.total, name: '', phase: 'evaluating-buffs', solverPercent: 0 }),
    qualityUnachievableResults,
  )
  return rec ?? undefined
})()

const selfCraftPromise: Promise<SelfCraftCandidate[]> = (async () => {
  if (!settings.recursivePricing || isCancelled()) return []
  try {
    return await produceSelfCraftCandidates({
      recipesToCraft, priceMap, priceSource,
      crossServer: settings.crossServer, server: settings.server,
      getGearset: getGearset as (job: string) => GearsetStats | null,
      maxDepth: settings.maxRecursionDepth, buffs, optimizeRecipe,
      onProgress: (info) => onProgress({
        current: info.current, total: info.total, name: info.name,
        phase: 'evaluating-self-craft', solverPercent: 0,
      }),
      isCancelled,
    })
  } catch (err) {
    console.warn('[batch-optimizer] self-craft candidate production failed:', err)
    return []
  }
})()

const [buffRecommendation, selfCraftCandidates] = await Promise.all([buffPromise, selfCraftPromise])
console.log(`[bperf] ◆ Phase 4.6 (parallel) done · ${(performance.now() - _bperfPhase46T0).toFixed(1)}ms · ` +
  `buff=${buffRecommendation ? 'yes' : 'no'} candidates=${selfCraftCandidates.length}`)
```

Delete the orphaned standalone `let buffRecommendation` / `let selfCraftCandidates` blocks lower in the file.

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: all pass

### Task 7: Type-check, smoke test, commit PR 3

- [ ] **Step 1: Type-check + browser smoke test**

Run: `npx vue-tsc --noEmit`
Browser: run batch with food auto-evaluation; confirm `[bperf] ◆ Phase 4.6 (parallel) done` single line replaces two-phase output.

- [ ] **Step 2: Commit**

```bash
git add src/services/batch-optimizer.ts src/__tests__/services/batch-optimizer.test.ts
git commit -m "perf(batch): run Phase 4.6-buff and self-craft in parallel"
```

---

## PR 4 — Worker Pool + Phase 1 / Self-Craft Parallel + Progress Counter

**Goal:** Refactor `solver/worker.ts` to multiplex two Worker instances. Wrap Phase 1 and self-craft candidate loops in `Promise.allSettled`. Update progress shape from `current` to `completed`.

**Risk:** High. Touches core solver dispatcher. Each task is its own commit; PR 4 = ~7 commits.

**Known cancel limitation:** raphael-wasm-wrapper currently constructs `AtomicFlag::new()` per solve call and does not expose it to JS (`raphael-wasm-wrapper/src/lib.rs:124`). So `cancelSolve` must terminate workers; next solve pays ~200 ms × 2 WASM init. Acceptable trade-off; documenting for future wrapper API extension.

### Task 8: Solver worker — echo requestId in solve responses

**Files:**
- Modify: `src/solver/solver-worker.ts`

- [ ] **Step 1: Add requestId to solve progress/result/error postMessages**

In `src/solver/solver-worker.ts`, in the `'solve'` branch of the message handler (around line 152), every `self.postMessage(...)` with `type: 'progress' | 'result' | 'error'` must include `requestId` from the destructured input.

Each existing line like:
```ts
const progressUpdate: SolverResponse = { type: 'progress', progress: 10 }
```
becomes:
```ts
const progressUpdate: SolverResponse = { type: 'progress', progress: 10, requestId }
```

Apply to: the three progress posts (10/30/90), the `result` post, and any solve-branch `error` post.

- [ ] **Step 2: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: EXIT=0

- [ ] **Step 3: Commit**

```bash
git add src/solver/solver-worker.ts
git commit -m "refactor(solver): echo requestId in solve progress/result/error

Prep for multi-slot pool. No behavior change."
```

### Task 9: Route solve via pendingRequests (merge progressCallbacks into value)

**Files:**
- Modify: `src/solver/worker.ts`

- [ ] **Step 1: Extend pendingRequests value type**

In `src/solver/worker.ts`, replace:

```ts
const pendingRequests = new Map<number, {
  resolve: (value: any) => void
  reject: (reason: Error) => void
}>()
```

with:

```ts
const pendingRequests = new Map<number, {
  resolve: (value: any) => void
  reject: (reason: Error) => void
  onProgress?: (pct: number) => void
}>()
```

- [ ] **Step 2: Rewrite solveCraft to use pendingRequests**

Replace `solveCraft` (lines 107-165):

```ts
export function solveCraft(
  config: SolverConfig,
  onProgress?: (percent: number) => void,
): Promise<SolverResult> {
  const w = getWorker()
  const requestId = nextRequestId++
  const startedAt = performance.now()
  trackEvent('solver_start', {
    crafter_level: config.crafter_level, recipe_level: config.recipe_level,
    hq_target: config.hq_target,
    gear_bucket: classifyGearBucket(config.crafter_level, config.craftsmanship, config.control),
  })
  return new Promise<SolverResult>((resolve, reject) => {
    pendingRequests.set(requestId, {
      onProgress,
      resolve: (r: SolverResult) => {
        trackEvent('solver_complete', {
          duration_ms: Math.round(performance.now() - startedAt),
          action_count: r.actions.length, steps: r.steps,
        })
        resolve(r)
      },
      reject: (err: Error) => {
        trackEvent('solver_failed', { reason: err.message })
        trackError(`solver_failed: ${err.message}`)
        reject(err)
      },
    })
    w.postMessage({ type: 'solve', config: { ...config }, requestId })
  })
}
```

- [ ] **Step 3: Extend message handler to route solve responses by requestId**

In `getWorker()`'s `addEventListener('message', ...)`, replace the `else if (data.requestId !== undefined)` branch with:

```ts
else if (data.requestId !== undefined) {
  const pending = pendingRequests.get(data.requestId)
  if (data.type === 'progress' && data.progress !== undefined) {
    pending?.onProgress?.(data.progress)
    return
  }
  if (!pending) return
  if (data.type === 'result' && data.result) {
    pendingRequests.delete(data.requestId)
    pending.resolve(data.result)
  } else if (data.type === 'simulate-result' && data.simulateResult) {
    pendingRequests.delete(data.requestId)
    pending.resolve(data.simulateResult)
  } else if (data.type === 'simulate-detail-result' && data.simulateDetailResult) {
    pendingRequests.delete(data.requestId)
    pending.resolve(data.simulateDetailResult)
  } else if (data.type === 'error') {
    pendingRequests.delete(data.requestId)
    pending.reject(new Error(data.error ?? '求解器發生未知錯誤'))
  }
}
```

- [ ] **Step 4: Remove `currentReject` and its assignments**

Search `currentReject` in `src/solver/worker.ts` and delete all references (declaration line 13, usages in solveCraft, `w.onerror` handler, cancelSolve, disposeWorker). The single message handler now owns all routing.

Also remove the `w.onerror = …` line previously inside solveCraft; the global handler (added at worker init) covers it.

- [ ] **Step 5: Update cancelSolve to use pendingRequests size only**

Replace cancelSolve body:

```ts
export function cancelSolve(): void {
  if (pendingRequests.size === 0) return
  if (worker) { worker.terminate(); worker = null }
  wasmStatus = 'loading'
  wasmErrorMessage = null
  for (const [, pending] of pendingRequests) pending.reject(new Error(SOLVE_CANCELLED))
  pendingRequests.clear()
}
```

Similarly for disposeWorker.

- [ ] **Step 6: Type-check and run full suite**

Run: `npx vue-tsc --noEmit && npx vitest run`
Expected: EXIT=0; all pass

- [ ] **Step 7: Browser smoke test**

Restart dev server. Run a single solve in Simulator view. Confirm progress bar still advances and result populates.

- [ ] **Step 8: Commit**

```bash
git add src/solver/worker.ts
git commit -m "refactor(solver): route solveCraft via requestId multiplexer

Drop the onmessage-reassignment hack and currentReject global. solveCraft
uses pendingRequests with optional onProgress. No behavior change."
```

### Task 10: Write failing pool tests

**Files:**
- Create: `src/__tests__/solver/worker-pool.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/__tests__/solver/worker-pool.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

class FakeWorker {
  static instances: FakeWorker[] = []
  static handlers = new WeakMap<FakeWorker, Set<(e: MessageEvent) => void>>()
  postedMessages: any[] = []
  constructor() {
    FakeWorker.instances.push(this)
    FakeWorker.handlers.set(this, new Set())
    queueMicrotask(() => this.fireMessage({ type: 'ready' }))
  }
  addEventListener(_: string, cb: (e: MessageEvent) => void) {
    FakeWorker.handlers.get(this)!.add(cb)
  }
  postMessage(data: any) { this.postedMessages.push(data) }
  terminate() {}
  set onmessage(_cb: any) {}
  fireMessage(data: any) {
    for (const cb of FakeWorker.handlers.get(this)!) cb({ data } as MessageEvent)
  }
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.resetModules()
})
afterEach(() => { vi.unstubAllGlobals() })

const stubResult = { actions: [], progress: 0, quality: 0, steps: 0 }

describe('solver worker pool', () => {
  it('spawns two workers; concurrent solves dispatch to different slots', async () => {
    const { solveCraft, waitForWasm } = await import('@/solver/worker')
    await waitForWasm()
    const p1 = solveCraft({ progress: 100 } as any)
    const p2 = solveCraft({ progress: 200 } as any)
    await new Promise(r => queueMicrotask(r))

    expect(FakeWorker.instances).toHaveLength(2)
    const slot0Solves = FakeWorker.instances[0].postedMessages.filter(m => m.type === 'solve')
    const slot1Solves = FakeWorker.instances[1].postedMessages.filter(m => m.type === 'solve')
    expect(slot0Solves).toHaveLength(1)
    expect(slot1Solves).toHaveLength(1)

    FakeWorker.instances[0].fireMessage({ type: 'result', requestId: slot0Solves[0].requestId, result: { ...stubResult, actions: ['a'] } })
    FakeWorker.instances[1].fireMessage({ type: 'result', requestId: slot1Solves[0].requestId, result: { ...stubResult, actions: ['b'] } })
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1.actions).toEqual(['a'])
    expect(r2.actions).toEqual(['b'])
  })

  it('queues third solve when both slots busy; drains on completion', async () => {
    const { solveCraft, waitForWasm } = await import('@/solver/worker')
    await waitForWasm()
    const p1 = solveCraft({ progress: 100 } as any)
    const p2 = solveCraft({ progress: 200 } as any)
    const p3 = solveCraft({ progress: 300 } as any)
    await new Promise(r => queueMicrotask(r))

    const dispatched = FakeWorker.instances.flatMap(w => w.postedMessages.filter(m => m.type === 'solve'))
    expect(dispatched).toHaveLength(2)

    FakeWorker.instances[0].fireMessage({ type: 'result', requestId: dispatched[0].requestId, result: stubResult })
    await p1
    const after = FakeWorker.instances.flatMap(w => w.postedMessages.filter(m => m.type === 'solve'))
    expect(after).toHaveLength(3)

    FakeWorker.instances[1].fireMessage({ type: 'result', requestId: after[1].requestId, result: stubResult })
    FakeWorker.instances[0].fireMessage({ type: 'result', requestId: after[2].requestId, result: stubResult })
    await Promise.all([p2, p3])
  })

  it('cancelSolve rejects in-flight and queued solves', async () => {
    const { solveCraft, cancelSolve, SOLVE_CANCELLED, waitForWasm } = await import('@/solver/worker')
    await waitForWasm()
    const p1 = solveCraft({ progress: 100 } as any).catch(e => e.message)
    const p2 = solveCraft({ progress: 200 } as any).catch(e => e.message)
    const p3 = solveCraft({ progress: 300 } as any).catch(e => e.message)
    await new Promise(r => queueMicrotask(r))

    cancelSolve()
    const results = await Promise.all([p1, p2, p3])
    expect(results.every(r => r === SOLVE_CANCELLED)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests, verify all 3 fail**

Run: `npx vitest run src/__tests__/solver/worker-pool.test.ts`
Expected: FAIL — only one worker instance gets created

### Task 11: Implement 2-slot pool

**Files:**
- Modify: `src/solver/worker.ts`

- [ ] **Step 1: Replace module state with slot array + queue**

In `src/solver/worker.ts`, replace:
```ts
let worker: Worker | null = null
```
with:
```ts
const POOL_SIZE = 2

interface WorkerSlot { worker: Worker; busy: boolean }

const slots: WorkerSlot[] = []
let readySlotCount = 0
const taskQueue: Array<{ slot?: WorkerSlot; type: 'solve' | 'simulate' | 'simulate-detail'; payload: Record<string, unknown>; requestId: number }> = []
```

- [ ] **Step 2: Replace getWorker with ensurePool**

```ts
function ensurePool(): void {
  if (slots.length === POOL_SIZE) return
  for (let i = slots.length; i < POOL_SIZE; i++) {
    const w = new Worker(new URL('./solver-worker.ts', import.meta.url), { type: 'module' })
    const slot: WorkerSlot = { worker: w, busy: false }
    slots.push(slot)
    wasmStatus = 'loading'

    w.addEventListener('message', (e: MessageEvent<SolverResponse>) => {
      const data = e.data
      if (data.type === 'ready') return onSlotReady()
      if (data.type === 'init-error') return onSlotInitError(data.error ?? 'WASM 初始化失敗')
      if (data.requestId === undefined) return
      handleRoutedResponse(slot, data)
    })
  }
}

function onSlotReady(): void {
  readySlotCount++
  if (readySlotCount === POOL_SIZE) {
    wasmStatus = 'ready'
    const waiters = wasmReadyWaiters.splice(0)
    wasmErrorWaiters.length = 0
    for (const cb of waiters) cb()
  }
}

function onSlotInitError(message: string): void {
  wasmStatus = 'error'
  wasmErrorMessage = message
  trackEvent('wasm_load_failed', { reason: message, fallback_used: false })
  trackError(`WASM init failed: ${message}`)
  const waiters = wasmErrorWaiters.splice(0)
  wasmReadyWaiters.length = 0
  for (const cb of waiters) cb(message)
}

function handleRoutedResponse(slot: WorkerSlot, data: SolverResponse): void {
  if (data.requestId === undefined) return
  const pending = pendingRequests.get(data.requestId)
  if (data.type === 'progress' && data.progress !== undefined) {
    pending?.onProgress?.(data.progress)
    return
  }
  if (!pending) return

  let terminal = true
  if (data.type === 'result' && data.result) pending.resolve(data.result)
  else if (data.type === 'simulate-result' && data.simulateResult) pending.resolve(data.simulateResult)
  else if (data.type === 'simulate-detail-result' && data.simulateDetailResult) pending.resolve(data.simulateDetailResult)
  else if (data.type === 'error') pending.reject(new Error(data.error ?? '求解器發生未知錯誤'))
  else terminal = false

  if (terminal) {
    pendingRequests.delete(data.requestId)
    slot.busy = false
    drainQueue()
  }
}

function drainQueue(): void {
  while (taskQueue.length > 0) {
    const idle = slots.find(s => !s.busy)
    if (!idle) return
    const task = taskQueue.shift()!
    idle.busy = true
    idle.worker.postMessage({ type: task.type, ...task.payload, requestId: task.requestId })
  }
}

function dispatchOrQueue(type: 'solve' | 'simulate' | 'simulate-detail', payload: Record<string, unknown>, requestId: number): void {
  ensurePool()
  const idle = slots.find(s => !s.busy)
  if (idle) {
    idle.busy = true
    idle.worker.postMessage({ type, ...payload, requestId })
  } else {
    taskQueue.push({ type, payload, requestId })
  }
}
```

- [ ] **Step 3: Update solveCraft / simulateCraft / simulateCraftDetail to use dispatchOrQueue**

```ts
export function solveCraft(config: SolverConfig, onProgress?: (pct: number) => void): Promise<SolverResult> {
  const requestId = nextRequestId++
  const startedAt = performance.now()
  trackEvent('solver_start', { /* …same as before… */ })
  return new Promise<SolverResult>((resolve, reject) => {
    pendingRequests.set(requestId, {
      onProgress,
      resolve: (r: SolverResult) => { trackEvent('solver_complete', { duration_ms: Math.round(performance.now() - startedAt), action_count: r.actions.length, steps: r.steps }); resolve(r) },
      reject: (err: Error) => { trackEvent('solver_failed', { reason: err.message }); trackError(`solver_failed: ${err.message}`); reject(err) },
    })
    dispatchOrQueue('solve', { config: { ...config } }, requestId)
  })
}

export function simulateCraft(config: SolverConfig, actions: string[], conditions?: string[]): Promise<SimulateResult> {
  const requestId = nextRequestId++
  return new Promise<SimulateResult>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject })
    dispatchOrQueue('simulate', { config: { ...config }, actions: [...actions], conditions: conditions ? [...conditions] : undefined }, requestId)
  })
}

export function simulateCraftDetail(config: SolverConfig, actions: string[], conditions?: string[]): Promise<SimulateDetailResult> {
  const requestId = nextRequestId++
  return new Promise<SimulateDetailResult>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject })
    dispatchOrQueue('simulate-detail', { config: { ...config }, actions: [...actions], conditions: conditions ? [...conditions] : undefined }, requestId)
  })
}
```

- [ ] **Step 4: Update cancelSolve / disposeWorker for pool**

```ts
export function cancelSolve(): void {
  if (pendingRequests.size === 0 && taskQueue.length === 0) return
  for (const slot of slots) slot.worker.terminate()
  slots.length = 0
  readySlotCount = 0
  wasmStatus = 'loading'
  wasmErrorMessage = null
  for (const [, pending] of pendingRequests) pending.reject(new Error(SOLVE_CANCELLED))
  pendingRequests.clear()
  for (const task of taskQueue) {
    pendingRequests.get(task.requestId)?.reject(new Error(SOLVE_CANCELLED))
  }
  taskQueue.length = 0
}

export function disposeWorker(): void {
  for (const slot of slots) slot.worker.terminate()
  slots.length = 0
  readySlotCount = 0
  wasmStatus = 'loading'
  wasmErrorMessage = null
  pendingRequests.clear()
  taskQueue.length = 0
  wasmReadyWaiters.length = 0
  wasmErrorWaiters.length = 0
}
```

- [ ] **Step 5: Update waitForWasm / getWasmStatus to call ensurePool**

Find both functions; replace any `getWorker()` call with `ensurePool()`.

- [ ] **Step 6: Run pool tests + full suite**

Run: `npx vitest run`
Expected: pool tests PASS, all existing tests pass

- [ ] **Step 7: Browser smoke test — single solve still works**

Run a Simulator solve. Confirm progress bar advances, result populates.

- [ ] **Step 8: Commit**

```bash
git add src/solver/worker.ts src/__tests__/solver/worker-pool.test.ts
git commit -m "feat(solver): 2-slot worker pool with FIFO queue

Replace single-worker module state with a 2-slot pool. Dispatch via
shared pendingRequests indexed by requestId. Queue when both slots busy.

Cancel terminates both workers (raphael-wasm-wrapper does not expose an
interrupt flag to JS; documented limitation). Public API unchanged."
```

### Task 12: Rename progress `current` → `completed`

**Files:**
- Modify: `src/stores/batch.ts`
- Modify: `src/components/batch/BatchProgress.vue`

- [ ] **Step 1: Audit consumers of `progress.current`**

Run: `grep -rn "progress.current\|progress\.value\.current" src/`
Expected: list of every reader. Confirm all are in `BatchProgress.vue` and `batch.ts`.

- [ ] **Step 2: Rename in `src/stores/batch.ts`**

Find the progress ref. Rename the `current` field to `completed`. Update the `setProgress` / equivalent setter calls.

Example diff:
```ts
// before
progress.value = { phase: 'solving', current: i + 1, total, currentName, solverPercent }
// after
progress.value = { phase: 'solving', completed: i + 1, total, currentName, solverPercent }
```

- [ ] **Step 3: Rename in `src/components/batch/BatchProgress.vue`**

Update both occurrences of `p.current` to `p.completed`:

```ts
// percentage computed - solving branch
if (p.phase === 'solving' && p.total > 0) {
  const completedPortion = (p.completed - 1) / p.total
  const currentPortion = (p.solverPercent / 100) / p.total
  return Math.round(start + (completedPortion + currentPortion) * (end - start))
}

// pricing / evaluating-buffs
if ((p.phase === 'pricing' || p.phase === 'evaluating-buffs') && p.total > 0) {
  return Math.round(start + (p.completed / p.total) * (end - start))
}
```

Update statusText `solving` clause:
```ts
case 'solving':
  return p.total > 0 ? `正在求解（${p.completed}/${p.total} 完成）...` : '正在求解...'
```

And other counters showing `p.current`:
```ts
{{ batchStore.progress.completed }} / {{ batchStore.progress.total }}
```

- [ ] **Step 4: Verify no `progress.current` left**

Run: `grep -rn "progress.current\|progress\.value\.current" src/`
Expected: no output

- [ ] **Step 5: Type-check, run tests, smoke test**

Run: `npx vue-tsc --noEmit && npx vitest run`
Browser: confirm progress card renders during a batch.

- [ ] **Step 6: Commit**

```bash
git add src/stores/batch.ts src/components/batch/BatchProgress.vue
git commit -m "refactor(batch): rename progress.current → completed

Single-meaning counter. Prep for PR-4 parallel Phase 1 where the
'current recipe' label loses meaning."
```

### Task 13: Parallelize Phase 1 loop + cancel propagation test

**Files:**
- Modify: `src/services/batch-optimizer.ts`
- Modify: `src/__tests__/services/batch-optimizer.test.ts`

- [ ] **Step 1: Add cancel-propagation test**

Append to `batch-optimizer.test.ts`:

```ts
describe('runBatchOptimization · Phase 1 cancel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('propagates SOLVE_CANCELLED through Promise.allSettled', async () => {
    // First solve resolves slowly; second rejects with SOLVE_CANCELLED mid-flight
    let firstResolve: ((v: any) => void) | undefined
    vi.mocked(solveCraft).mockImplementationOnce(() => new Promise(r => { firstResolve = r }))
    vi.mocked(solveCraft).mockRejectedValueOnce(new Error(SOLVE_CANCELLED))
    vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)

    const targets = [
      { recipe: mockRecipe, quantity: 1 },
      { recipe: { ...mockRecipe, id: 2 }, quantity: 1 },
    ]
    const run = runBatchOptimization(
      targets, () => mockGearset,
      { crossServer: false, recursivePricing: false, maxRecursionDepth: 2,
        exceptionStrategy: 'skip', server: 'S', dataCenter: 'DC', autoEvaluateBuffs: false },
      () => {}, () => false,
    )
    // Allow second solve to reject
    await new Promise(r => setTimeout(r, 10))
    // Resolve first so allSettled completes
    firstResolve?.({ actions: [], progress: 3500, quality: 7200, steps: 0 })

    await expect(run).rejects.toThrow(SOLVE_CANCELLED)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run src/__tests__/services/batch-optimizer.test.ts -t 'cancel'`
Expected: FAIL — current loop bails on first SOLVE_CANCELLED via break/throw, not via allSettled

- [ ] **Step 3: Replace Phase 1 loop with Promise.allSettled**

In `src/services/batch-optimizer.ts`, locate the Phase 1 loop (around lines 189-247). Replace with:

```ts
let completedCount = 0
const phase1Settled = await Promise.allSettled(targets.map(async (target, i) => {
  if (isCancelled()) throw new Error(SOLVE_CANCELLED)
  const gearset = getGearset(target.recipe.job)
  if (!gearset || gearset.level < target.recipe.level) {
    return { kind: 'level-insufficient' as const, target, gearset }
  }
  const _bperfR0 = performance.now()
  try {
    const result = await optimizeRecipe(target.recipe, gearset, (pct) => {
      onProgress({ completed: completedCount, total: targets.length, name: target.recipe.name, phase: 'solving', solverPercent: pct })
    }, buffs)
    const _bperfRDur = performance.now() - _bperfR0
    _bperfSolveCount++
    _bperfSolveTotalMs += _bperfRDur
    console.log(`[bperf]   · optimizeRecipe[${i}] "${target.recipe.name}" lvl=${target.recipe.level} dur=${_bperfRDur.toFixed(1)}ms doubleMax=${result.isDoubleMax} hqOk=${result.hqAmounts.length > 0}`)
    completedCount++
    onProgress({ completed: completedCount, total: targets.length, name: '', phase: 'solving', solverPercent: 0 })
    return { kind: 'ok' as const, target, result }
  } catch (err) {
    if (err instanceof Error && err.message === SOLVE_CANCELLED) throw err
    completedCount++
    return { kind: 'failed' as const, target, error: err }
  }
}))

for (const settled of phase1Settled) {
  if (settled.status === 'rejected') {
    if (settled.reason instanceof Error && settled.reason.message === SOLVE_CANCELLED) throw settled.reason
    continue
  }
  const v = settled.value
  if (v.kind === 'level-insufficient') {
    exceptions.push({
      type: 'level-insufficient', recipe: v.target.recipe, quantity: v.target.quantity,
      message: '職業等級不足',
      details: `你的 ${v.target.recipe.job} 等級 ${v.gearset?.level ?? 0} 不足以製作「${v.target.recipe.name}」（需要等級 ${v.target.recipe.level}）`,
      action: settings.exceptionStrategy === 'buy' ? 'buy-finished' : 'skipped',
    })
    continue
  }
  if (v.kind === 'failed') {
    exceptions.push({
      type: 'quality-unachievable', recipe: v.target.recipe,
      message: '計算失敗', details: `「${v.target.recipe.name}」計算過程發生錯誤：${v.error}`,
      action: 'skipped',
    })
    continue
  }
  const result = v.result
  const yieldPerCraft = Math.max(1, v.target.recipe.amountResult)
  result.outputAmount = v.target.quantity
  result.quantity = Math.ceil(v.target.quantity / yieldPerCraft)
  if (!result.isDoubleMax && result.hqAmounts.length === 0) {
    if (result.recipe.canHq) qualityUnachievableResults.push(result)
    exceptions.push({
      type: 'quality-unachievable', recipe: v.target.recipe, quantity: v.target.quantity,
      message: '無法達成雙滿',
      details: `「${v.target.recipe.name}」即使使用全部 HQ 素材仍無法達成品質上限`,
      action: settings.exceptionStrategy === 'buy' ? 'buy-finished' : 'skipped',
    })
    continue
  }
  recipeResults.push(result)
}
```

If TypeScript complains about the `onProgress` signature change (`current` → `completed`), update the function-type declaration on `runBatchOptimization`'s `onProgress` parameter accordingly.

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: all pass including new cancel test

- [ ] **Step 5: Real-batch smoke test**

Run the 6-recipe baseline. Expect Phase 1 wall-clock ≈ 35-40 s (down from 71 s).

- [ ] **Step 6: Commit**

```bash
git add src/services/batch-optimizer.ts src/__tests__/services/batch-optimizer.test.ts
git commit -m "perf(batch): parallelize Phase 1 recipe solver loop

Promise.allSettled over targets. With 2-slot pool, Phase 1 drops from
~71s to ~37s on the 6-recipe baseline. SOLVE_CANCELLED propagates
through the post-loop drain."
```

### Task 14: Parallelize self-craft candidate loop

**Files:**
- Modify: `src/services/self-craft-candidates.ts`

- [ ] **Step 1: Replace serial candidate loop with Promise.allSettled**

In `src/services/self-craft-candidates.ts`, replace the Step 8 loop:

```ts
let completedCount = 0
const settled = await Promise.allSettled(withRecipes.map(async ({decision, node, recipe, job}, i) => {
  if (isCancelled()) throw new Error('cancelled')
  const gs = getGearset(job)
  if (!gs) return null
  const hqRequired = hqRequiredMap.get(decision.itemId) === true

  const validated = hqRequired
    ? await validateHQ(recipe, gs, buffs, optimizeRecipe)
    : await validateNQ(recipe, gs, buffs, optimizeRecipe)

  completedCount++
  onProgress({ current: completedCount, total: withRecipes.length, name: recipe.name })

  if (validated.kind !== 'accepted') {
    if (validated.kind === 'prefilter-rejected') _bperfPrefilterRejects++
    return null
  }
  if (validated.via === 'template') _bperfTemplateHits++
  else { _bperfSolveCount++; _bperfSolveTotal += validated.solveDur ?? 0 }

  return {
    itemId: decision.itemId, name: decision.name, icon: decision.icon, amount: decision.amount,
    recipe, job,
    buyCost: decision.buyCost, craftCost: decision.craftCost,
    savings: decision.buyCost - decision.craftCost, savingsRatio: decision.savingsRatio,
    actions: validated.actions, hqAmounts: validated.hqAmounts,
    rawMaterials: computeRawMaterials(node.childNodes, priceMap, crossServer, server),
    hqRequired, depth: node.depth,
  } as SelfCraftCandidate
}))

for (const s of settled) {
  if (s.status === 'fulfilled' && s.value !== null) candidates.push(s.value)
}
```

- [ ] **Step 2: Type-check + tests**

Run: `npx vue-tsc --noEmit && npx vitest run`
Expected: all pass; existing self-craft tests still hold (ordering not asserted)

- [ ] **Step 3: Real-batch test — target met**

Run the 6-recipe baseline. Expected `[bperf] ✔ runBatchOptimization COMPLETE t=...ms` ≈ 45-70 s (down from 134 s).

If not hitting target:
- Confirm both workers initialized: in `[bperf]` log, both Phase 1 `optimizeRecipe[N]` solver durations should interleave (not strictly accumulate to total)
- Confirm `[bperf-self]` shows `template[N]` hits

- [ ] **Step 4: Commit**

```bash
git add src/services/self-craft-candidates.ts
git commit -m "perf(batch): parallelize self-craft candidate validation loop

With both worker slots filled by Phase 1 and self-craft loops, the
6-recipe batch wall-clock drops from 134.8 s baseline to ~45-70 s
target. 5 candidates × ~9 s sequential → ~25 s with 2-slot pool."
```

### Task 15: Remove `[bperf]` instrumentation

**Files:**
- Modify: `src/services/batch-optimizer.ts`
- Modify: `src/services/buff-recommender.ts`
- Modify: `src/services/self-craft-candidates.ts`

- [ ] **Step 1: Confirm targets met**

Real-batch `[bperf]` log shows total ≤ 70 s. User approves.

- [ ] **Step 2: Remove every `[bperf` line and associated `_bperf*` variables**

Run: `grep -rn "_bperf\|\[bperf" src/`
Expected: list of occurrences.

Use Edit tool to remove each occurrence (do not use sed — comments may interleave).

- [ ] **Step 3: Verify clean**

Run: `grep -rn "_bperf\|\[bperf" src/`
Expected: no output

- [ ] **Step 4: Type-check + tests**

Run: `npx vue-tsc --noEmit && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add src/services/batch-optimizer.ts src/services/buff-recommender.ts src/services/self-craft-candidates.ts
git commit -m "chore(batch): remove [bperf] timing instrumentation"
```

---

## Validation Plan (per PR)

| PR | Validation |
| --- | --- |
| 1 | Unit tests pass; no behavior change |
| 2 | 1-recipe batch in browser; `[bperf-self]` shows `template[N]` or `prefilter-rejected[N]` |
| 3 | Batch run; single `[bperf] ◆ Phase 4.6 (parallel) done` line |
| 4 | 6-recipe baseline matches spec; total ≤ 70 s; cancel mid-batch works |

Final regression: `npx vitest run` + `npx vue-tsc --noEmit` + browser cancel test + empty/single/large batch all produce expected results.

---

## Spec Coverage Check

- §5 NQ template + simulate — Task 4
- §6 HQ prefilter — Tasks 2, 4
- §7.1 Phase 1 parallel — Task 13
- §7.2 Phase 4.6 parallel — Task 6
- §7.3 self-craft candidates parallel — Task 14
- §8 2-slot worker pool — Tasks 10, 11
- §9 no interface changes — verified (SelfCraftCandidate untouched)
- §11 risks — false positive (Task 4 tests), cancel semantics (Task 10 test, Task 13 test)
- §13 PR slicing — Tasks 1-3 = PR 1, 4-5 = PR 2, 6-7 = PR 3, 8-15 = PR 4

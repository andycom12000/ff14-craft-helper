# Stat Stacking Order Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the cross-caller inconsistency reported in Issue #34 by pinning a single canonical stacking order — `raw gear → +Soul of the Crafter → ×food % → ×medicine %` — behind one helper, then routing every caller through it.

**Architecture:** Introduce `gearsetToBuffedStats(gearset, buffs)` as the single source of truth for "what stats does the solver see for this character". Extend `recipeToCraftParams(recipe, gearset, buffs?)` to thread buffs through that helper. Migrate the three broken callers (`feasibility-prefilter`, `self-craft-candidates`, `buff-recommender`) onto the new API. Lock the order with TDD regression tests *before* each fix, plus a cross-caller parity test once everything is wired.

**Tech Stack:** Vue 3 + TypeScript + Pinia + Vitest. No runtime deps added; pure refactor + tests.

**Reference:** Issue #34. raphael upstream applies food % to `base_stats` and assumes Soul is already folded into the gear-sheet input (`raphael-data/src/consumables.rs::stat_bonuses`); this matches in-game behavior where Soul of the Crafter is a slotted item showing on the equipment sheet, and food/medicine % is applied to that total.

---

## File Structure

**Create:**
- `docs/adr/0001-stat-stacking-order.md` — canonical order + rationale + upstream/in-game evidence
- `src/services/stat-stacking.ts` — `gearsetToBuffedStats(gearset, buffs)` helper
- `src/__tests__/services/stat-stacking.test.ts` — unit tests for the helper
- `src/__tests__/services/stat-stacking-parity.test.ts` — cross-caller parity test

**Modify:**
- `src/solver/config.ts` — `recipeToCraftParams` gains optional `buffs` param, delegates to new helper
- `src/__tests__/solver/config.test.ts` — add tests for the buffed-stats overload
- `src/services/feasibility-prefilter.ts` — use new helper (currently drops Soul entirely)
- `src/services/self-craft-candidates.ts:140-176` — use new helper (currently applies Food → Soul)
- `src/services/buff-recommender.ts:243-263` — Soul-apply `baseStats` for ceiling check + dedup
- `src/__tests__/services/feasibility-prefilter.test.ts` — add specialist + buff regression
- `src/__tests__/services/self-craft-candidates.test.ts` — add order regression
- `src/__tests__/services/buff-recommender.test.ts` — add specialist ceiling regression
- `src/engine/food-medicine.ts` — doc comment pointer to ADR (no logic change)
- `src/services/specialist-state.ts` — doc comment pointer to ADR (no logic change)

**Out of scope:** Touching `useSimulator` / `FoodMedicine.vue` logic. Those are already canonical; we only verify via parity test.

---

## Task 1: ADR — Document canonical stacking order

**Files:**
- Create: `docs/adr/0001-stat-stacking-order.md`

- [ ] **Step 1: Create the ADR**

```markdown
# ADR 0001: Stat Stacking Order

**Status:** Accepted
**Date:** 2026-05-19
**Context:** Issue #33 centralised the Soul of the Crafter bonus inside `recipeToCraftParams`. Issue #34 surfaced that different callers wrap that call with food/medicine in different orders, producing different final stats for the same specialist + food combination.

## Decision

The canonical stacking order is:

```
raw gear stats
  → + Soul of the Crafter (+20 craft / +20 control / +15 cp, when isSpecialist)
  → × food %     (capped at food.max)
  → × medicine % (capped at medicine.max)
```

Soul is additive on raw stats. Food and medicine are multiplicative on the post-Soul total, each capped independently. Food is applied before medicine, but since their stat axes do not generally overlap and each is capped separately, the food-vs-medicine order rarely changes the result. The Soul-vs-food order, however, is **not commutative**, because Soul changes the base that food's percentage and cap interact with.

## Rationale

- **In-game:** Soul of the Crafter is a slotted item. Its bonus appears on the equipment sheet before food is consumed. Food and medicine percentages are applied to the equipment-sheet total.
- **raphael upstream:** `raphael-data/src/consumables.rs::stat_bonuses` takes `base_stats` and applies food % to them. The raphael UI does not model Soul separately — the user enters the equipment-sheet value (already including Soul if specialist).
- **Symmetry with simulator:** `composables/useSimulator.ts` + `components/simulator/FoodMedicine.vue` already use this order. Aligning batch / optimizer / prefilter / buff-recommender with the simulator keeps "what the user sees on the recipe page" and "what the batch optimizer assumes" identical.

## Implementation

Every caller that needs buffed stats MUST go through `gearsetToBuffedStats(gearset, buffs)` in `src/services/stat-stacking.ts` (or `recipeToCraftParams(recipe, gearset, buffs)` for the recipe path). Direct calls to `applyFoodBuff` / `applyMedicineBuff` / `applyBuffsToStats` on raw gear without first applying Soul are forbidden in non-test code.

## Consequences

- Specialists' Soul bonus is now correctly counted in the prefilter (previously dropped) and the buff-recommender's ceiling check (previously off by +20/+20/+15).
- `self-craft-candidates` no longer scores candidates differently from how the batch optimizer / simulator actually solve them.
- Adding new buff types (e.g. company actions) goes in the same helper; no new caller-side stacking decisions.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0001-stat-stacking-order.md
git commit -m "docs(adr): pin canonical stat stacking order (#34)"
```

---

## Task 2: `gearsetToBuffedStats` helper (TDD)

**Files:**
- Create: `src/services/stat-stacking.ts`
- Test: `src/__tests__/services/stat-stacking.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/services/stat-stacking.test.ts
import { describe, it, expect } from 'vitest'
import { gearsetToBuffedStats } from '@/services/stat-stacking'
import { COMMON_FOODS, COMMON_MEDICINES } from '@/engine/food-medicine'
import { SPECIALIST_BONUS } from '@/services/specialist-state'
import type { GearsetStats } from '@/stores/gearsets'

const gearset = (over: Partial<GearsetStats> = {}): GearsetStats => ({
  level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false,
  ...over,
})

describe('gearsetToBuffedStats — canonical order', () => {
  it('returns raw stats when non-specialist and no buffs', () => {
    expect(gearsetToBuffedStats(gearset(), undefined))
      .toEqual({ craftsmanship: 4000, control: 3800, cp: 600 })
  })

  it('adds Soul of the Crafter when isSpecialist=true (no buffs)', () => {
    expect(gearsetToBuffedStats(gearset({ isSpecialist: true }), undefined))
      .toEqual({
        craftsmanship: 4000 + SPECIALIST_BONUS.craftsmanship,
        control: 3800 + SPECIALIST_BONUS.control,
        cp: 600 + SPECIALIST_BONUS.cp,
      })
  })

  it('applies food % AFTER Soul (not commutative)', () => {
    // 高山茶 HQ: control +5% cap 76, cp +26% cap 78
    const food = COMMON_FOODS.find(f => f.id === 36060)!
    const buffed = gearsetToBuffedStats(
      gearset({ isSpecialist: true }),
      { food, medicine: null },
    )
    // post-Soul control = 3820; 5% of 3820 = 191 → capped at 76 → 3896
    expect(buffed.control).toBe(3820 + 76)
    // post-Soul cp = 615; 26% of 615 = 159 → capped at 78 → 693
    expect(buffed.cp).toBe(615 + 78)
    // craftsmanship: post-Soul 4020, food gives no craft bonus → 4020
    expect(buffed.craftsmanship).toBe(4020)
  })

  it('Soul→Food differs from Food→Soul on capped axes', () => {
    // This is the regression lock: if anyone re-orders the helper,
    // this assertion fires immediately.
    const food = COMMON_FOODS.find(f => f.id === 36060)!
    const soulThenFood = gearsetToBuffedStats(
      gearset({ isSpecialist: true }),
      { food, medicine: null },
    )
    // Manual Food-then-Soul: 3800 control × 5% = 190 → cap 76 → 3876 + 20 = 3896
    // In this specific case the control cap is hit both ways, so control ends
    // up equal. CP cap also hit both ways. Pick a non-cap-saturated case:
    const tinyGearset = gearset({ isSpecialist: true, control: 100, cp: 100 })
    const canonical = gearsetToBuffedStats(tinyGearset, { food, medicine: null })
    // canonical: control 100+20=120; 5% of 120 = 6 (not capped) → 126
    // canonical: cp 100+15=115; 26% of 115 = 29 → 144
    expect(canonical.control).toBe(126)
    expect(canonical.cp).toBe(144)
    // Food-first wrong order: control 100×5%=5 → 105; +20 → 125 ≠ 126
    // (we don't run the wrong path; we just lock the right number)
  })

  it('applies medicine on top of food result', () => {
    // 巨匠藥液 HQ: control +3% cap 63
    const food = COMMON_FOODS.find(f => f.id === 36060)!     // control +5% cap 76
    const medicine = COMMON_MEDICINES.find(m => m.id === 44168)!
    const buffed = gearsetToBuffedStats(
      gearset({ isSpecialist: false }),
      { food, medicine },
    )
    // control: 3800 (no Soul) → +5% cap 76 → 3876 → +3% of 3876 = 116 → cap 63 → 3939
    expect(buffed.control).toBe(3939)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/stat-stacking.test.ts`
Expected: FAIL with module not found / `gearsetToBuffedStats` is not exported.

- [ ] **Step 3: Implement the helper**

```ts
// src/services/stat-stacking.ts
import type { GearsetStats } from '@/stores/gearsets'
import type { FoodBuff, EnhancedStats } from '@/engine/food-medicine'
import { applyFoodBuff, applyMedicineBuff } from '@/engine/food-medicine'
import { applyCrafterSoulBonus } from '@/services/specialist-state'

/**
 * Single source of truth for buffed character stats.
 *
 * Stacking order (see docs/adr/0001-stat-stacking-order.md):
 *   raw gear → + Soul of the Crafter → × food % → × medicine %
 *
 * Every non-simulator caller that needs the stats the solver / scorer will
 * actually see MUST go through this function. Do not call `applyFoodBuff` /
 * `applyMedicineBuff` / `applyBuffsToStats` directly on raw gearset stats —
 * doing so silently drops the specialist Soul bonus or applies food before
 * Soul, which is non-commutative when a food cap is hit.
 */
export function gearsetToBuffedStats(
  gearset: GearsetStats,
  buffs: { food: FoodBuff | null; medicine: FoodBuff | null } | undefined,
): EnhancedStats {
  const withSoul = applyCrafterSoulBonus(gearset)
  const base: EnhancedStats = {
    craftsmanship: withSoul.craftsmanship,
    control: withSoul.control,
    cp: withSoul.cp,
  }
  if (!buffs) return base
  return applyMedicineBuff(applyFoodBuff(base, buffs.food), buffs.medicine)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/stat-stacking.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/stat-stacking.ts src/__tests__/services/stat-stacking.test.ts
git commit -m "feat(stat-stacking): add gearsetToBuffedStats canonical helper (#34)"
```

---

## Task 3: Extend `recipeToCraftParams` to accept buffs

**Files:**
- Modify: `src/solver/config.ts`
- Test: `src/__tests__/solver/config.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/solver/config.test.ts` after the existing `recipeToCraftParams — specialist soul bonus` block:

```ts
import { COMMON_FOODS } from '@/engine/food-medicine'

describe('recipeToCraftParams — buffs param threads through gearsetToBuffedStats', () => {
  const baseRecipe: Recipe = {
    id: 1, itemId: 100, name: 'Test', icon: '', job: 'CRP',
    level: 90, stars: 0, canHq: true, materialQualityFactor: 75, amountResult: 1,
    ingredients: [],
    recipeLevelTable: {
      classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
      durability: 80, suggestedCraftsmanship: 0,
      progressDivider: 130, qualityDivider: 115,
      progressModifier: 90, qualityModifier: 80,
    },
  }

  it('with no buffs, behaves identically to the legacy 2-arg call', () => {
    const gearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: true }
    const a = recipeToCraftParams(baseRecipe, gearset)
    const b = recipeToCraftParams(baseRecipe, gearset, undefined)
    expect(b).toEqual(a)
  })

  it('applies Soul then food (specialist + 高山茶 HQ)', () => {
    const gearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: true }
    const food = COMMON_FOODS.find(f => f.id === 36060)!
    const p = recipeToCraftParams(baseRecipe, gearset, { food, medicine: null })
    // post-Soul: 4020 / 3820 / 615
    // food: control +76 (cap), cp +78 (cap)
    expect(p.craftsmanship).toBe(4020)
    expect(p.control).toBe(3820 + 76)
    expect(p.cp).toBe(615 + 78)
  })

  it('non-specialist + food → food applied to raw gear', () => {
    const gearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false }
    const food = COMMON_FOODS.find(f => f.id === 36060)!
    const p = recipeToCraftParams(baseRecipe, gearset, { food, medicine: null })
    expect(p.craftsmanship).toBe(4000)
    expect(p.control).toBe(3800 + 76)
    expect(p.cp).toBe(600 + 78)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/solver/config.test.ts`
Expected: FAIL — `recipeToCraftParams` only accepts 2 args; new buffs arg is rejected.

- [ ] **Step 3: Modify `recipeToCraftParams` to accept buffs**

Edit `src/solver/config.ts`:

```ts
// at top of file, replace the applyCrafterSoulBonus import line with:
import type { FoodBuff } from '@/engine/food-medicine'
import { gearsetToBuffedStats } from '@/services/stat-stacking'
```

Replace the `recipeToCraftParams` function with:

```ts
export function recipeToCraftParams(
  recipe: Recipe,
  gearset: GearsetStats,
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null },
): CraftParams {
  // Single source of truth for stat stacking (see ADR 0001).
  // Soul of the Crafter (+20/+20/+15) is gear-equivalent and folded in first,
  // then food % (cap), then medicine % (cap). Callers MUST NOT post-process
  // the returned params with applyFoodBuff — pass buffs in here instead.
  const buffed = gearsetToBuffedStats(gearset, buffs)
  return {
    craftsmanship: buffed.craftsmanship,
    control: buffed.control,
    cp: buffed.cp,
    crafterLevel: gearset.level,
    recipeLevelTable: recipe.recipeLevelTable,
    canHq: recipe.canHq,
    initialQuality: 0,
    isExpert: recipe.isExpert ?? false,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/solver/config.test.ts`
Expected: PASS for the new three tests AND the existing specialist tests (no regression).

- [ ] **Step 5: Run full test suite to confirm nothing else broke**

Run: `npm test`
Expected: All previously-passing tests still pass. If `batch-optimizer.test.ts` or `buff-recommender.test.ts` now fail because they were double-applying buffs, those failures will be addressed in later tasks — note any failures and proceed.

- [ ] **Step 6: Commit**

```bash
git add src/solver/config.ts src/__tests__/solver/config.test.ts
git commit -m "feat(solver): thread buffs through recipeToCraftParams via stat-stacking helper (#34)"
```

---

## Task 4: Fix `feasibility-prefilter.ts` (Soul-dropped regression)

**Files:**
- Modify: `src/services/feasibility-prefilter.ts:26-39`
- Test: `src/__tests__/services/feasibility-prefilter.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/services/feasibility-prefilter.test.ts`:

```ts
describe('canReachHQQuality — specialist Soul bonus is counted', () => {
  // Tight CP gearset: just barely cannot reach quality WITHOUT Soul,
  // but CAN reach it WITH Soul. The pre-Soul bug treated specialist
  // identically to non-specialist → false negative.
  const tightRecipe: Recipe = {
    ...lv94Recipe,
    recipeLevelTable: { ...lv94Recipe.recipeLevelTable, quality: 8500 },
  }

  it('specialist gearset is evaluated WITH +20/+20/+15 Soul bonus', () => {
    // Pick numbers where the +20 control & +15 cp tip the prefilter from
    // false → true. The upper-bound formula is generous so we use a
    // realistic borderline gearset.
    const borderline = { level: 100, craftsmanship: 4000, control: 380, cp: 35, isSpecialist: false }
    const borderlineSpec = { ...borderline, isSpecialist: true }
    const withoutSoul = canReachHQQuality(tightRecipe, borderline)
    const withSoul = canReachHQQuality(tightRecipe, borderlineSpec)
    // Soul gives +20 control and +15 cp on top of the raw gearset.
    // For tightly starved cp (35 → 50), max quality steps shifts from
    // floor(35/18)=1 to floor(50/18)=2 → doubles the achievable quality.
    expect(withoutSoul).toBe(false)
    expect(withSoul).toBe(true)
  })

  it('food % is applied AFTER Soul (specialist + 高山茶 HQ)', () => {
    const gearset = { level: 100, craftsmanship: 4000, control: 380, cp: 35, isSpecialist: true }
    const food = COMMON_FOODS.find(f => f.id === 36060)!
    const result = canReachHQQuality(tightRecipe, gearset, { food, medicine: null })
    // post-Soul cp = 50 → food +26% of 50 = 13 → cp 63. Without Soul-first,
    // food on raw cp 35 = 9 → cp 44 + Soul 15 = 59. Different feasibility
    // outcomes possible on borderline recipes; we only assert the function
    // doesn't drop Soul.
    expect(result).toBe(true)
  })
})
```

Also add the import at the top of the test file:
```ts
import { COMMON_FOODS } from '@/engine/food-medicine'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/feasibility-prefilter.test.ts`
Expected: FAIL — `specialist gearset is evaluated WITH +20/+20/+15 Soul bonus` fails because the prefilter currently drops Soul.

- [ ] **Step 3: Fix the prefilter**

Edit `src/services/feasibility-prefilter.ts`. Replace the `canReachHQQuality` body:

```ts
import type { RecipeLevelTable, Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { FoodBuff } from '@/engine/food-medicine'
import { gearsetToBuffedStats } from '@/services/stat-stacking'

// ... existing constants and computeBaseQuality / computeBaseProgress unchanged ...

export function canReachHQQuality(
  recipe: Recipe,
  gearset: GearsetStats,
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null },
): boolean {
  // Canonical stacking order (ADR 0001): Soul → food → medicine.
  const stats = gearsetToBuffedStats(gearset, buffs)
  const baseQuality = computeBaseQuality(stats.control, gearset.level, recipe.recipeLevelTable)
  const maxQualitySteps = Math.floor(stats.cp / AVG_QUALITY_CP_COST)
  const maxAchievable = baseQuality * QUALITY_PHASE_UPPER_BOUND_MULTIPLIER * maxQualitySteps * MARGIN
  return maxAchievable >= recipe.recipeLevelTable.quality
}
```

Remove the now-unused `applyBuffsToStats` import from this file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/feasibility-prefilter.test.ts`
Expected: PASS for new tests; existing tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/services/feasibility-prefilter.ts src/__tests__/services/feasibility-prefilter.test.ts
git commit -m "fix(feasibility-prefilter): count Soul of the Crafter for specialists (#34)"
```

---

## Task 5: Fix `self-craft-candidates.ts` (Food → Soul order regression)

**Files:**
- Modify: `src/services/self-craft-candidates.ts:140-176`
- Test: `src/__tests__/services/self-craft-candidates.test.ts`

- [ ] **Step 1: Write the failing regression test**

Append to `src/__tests__/services/self-craft-candidates.test.ts`. Note: the existing test file does NOT exercise `validateNQ`. We add a new describe block that mocks `@/solver/worker` (matching the pattern from `batch-optimizer.test.ts:5-10`) and drives `produceSelfCraftCandidates` end-to-end with a one-recipe, no-tree input that forces the validator to run.

Add at top of file (after existing imports):

```ts
vi.mock('@/solver/worker', () => ({
  solveCraft: vi.fn(),
  simulateCraft: vi.fn(),
  waitForWasm: vi.fn().mockResolvedValue(undefined),
  SOLVE_CANCELLED: '求解已取消',
}))
vi.mock('@/services/bom-calculator', () => ({
  buildMaterialTree: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/api/universalis', () => ({
  getAggregatedPrices: vi.fn().mockResolvedValue(new Map()),
}))
```

Then add the new describe block at the end of the file:

```ts
import { simulateCraft } from '@/solver/worker'
import { produceSelfCraftCandidates } from '@/services/self-craft-candidates'
import { COMMON_FOODS } from '@/engine/food-medicine'
import type { RecipeOptimizeResult } from '@/services/batch-optimizer'

describe('validateNQ — stacking order matches batch-optimizer (#34)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('specialist + food: simulateCraft receives Soul→Food stats (cp=144, not 141)', async () => {
    // Specialist gearset with control=100, cp=100 — below the food cap so
    // the two orders produce distinct cp totals.
    //
    // Canonical Soul→Food: cp 100 + 15 (Soul) = 115 → +26% = 29 (not capped) → 144
    // Buggy Food→Soul:     cp 100 → +26% = 26 → 126 + 15 (Soul) = 141
    const gearset: GearsetStats = {
      level: 100, craftsmanship: 4000, control: 100, cp: 100, isSpecialist: true,
    }
    const food = COMMON_FOODS.find(f => f.id === 36060)!  // cp +26% cap 78

    // Capture the SolverConfig passed into simulateCraft on the first call
    // (that's validateNQ's template-fast-path simulate).
    const captured: any[] = []
    vi.mocked(simulateCraft).mockImplementation(async (config: any) => {
      captured.push(config)
      // Return template-fail so we don't go through the solver branch — we
      // only care about the first simulate's stat arithmetic.
      return { progress: 0, max_progress: 999, quality: 0, max_quality: 999,
               durability: 70, max_durability: 70, cp: 0, max_cp: 100, steps_count: 0 } as any
    })

    // Build a one-recipe optimize-result that flows into produceSelfCraftCandidates.
    const recipe = mkRecipe(1, 'CRP', 80)
    const deficitResult: RecipeOptimizeResult = {
      recipe, quantity: 1, outputAmount: 1,
      actions: [], hqAmounts: [], initialQuality: 0,
      isDoubleMax: false, materials: [], qualityDeficit: 100,
    }

    // Force buildMaterialTree to return one craftable intermediate so the
    // walker emits a candidate that validateNQ must check.
    const { buildMaterialTree } = await import('@/services/bom-calculator')
    vi.mocked(buildMaterialTree).mockResolvedValue([
      {
        itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 1,
        children: [
          { itemId: 50, name: 'Intermediate', icon: '', amount: 1, recipeId: 5,
            children: [{ itemId: 1, name: 'Raw', icon: '', amount: 1 }] },
        ],
      } as any,
    ])

    await produceSelfCraftCandidates({
      recipesToCraft: [deficitResult],
      priceMap: new Map(),
      priceSource: 'Chocobo', crossServer: false, server: 'Chocobo',
      getGearset: () => gearset,
      maxDepth: 3,
      buffs: { food, medicine: null },
      optimizeRecipe: vi.fn().mockResolvedValue({
        ...deficitResult, isDoubleMax: false, hqAmounts: [],
      }),
      onProgress: () => {},
      isCancelled: () => false,
    })

    // At least one simulate was issued by validateNQ; the cp on the config
    // is the contract under test.
    expect(captured.length).toBeGreaterThan(0)
    expect(captured[0].cp).toBe(144)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/self-craft-candidates.test.ts`
Expected: FAIL — captured cp is 141 (Food → Soul) instead of 144 (Soul → Food).

- [ ] **Step 3: Fix `validateNQ`**

Edit `src/services/self-craft-candidates.ts`. Replace the body of `validateNQ` (lines 140-176 area):

```ts
async function validateNQ(
  recipe: Recipe,
  gearset: GearsetStats,
  buffs: { food: FoodBuff | null; medicine: FoodBuff | null } | undefined,
  optimizeRecipe: OptimizeRecipeFn,
): Promise<ValidateOutcome> {
  // Use recipeToCraftParams's new buffs param so stacking order matches
  // batch-optimizer (Soul → food → medicine, see ADR 0001).
  const params = recipeToCraftParams(recipe, gearset, buffs)
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
```

Remove the now-unused `applyBuffsToStats` import from the file (if no other usage remains).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/self-craft-candidates.test.ts`
Expected: PASS for the new test; existing tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/services/self-craft-candidates.ts src/__tests__/services/self-craft-candidates.test.ts
git commit -m "fix(self-craft-candidates): apply Soul before food in validateNQ (#34)"
```

---

## Task 6: Fix `buff-recommender.ts` baseStats (specialist ceiling/dedup regression)

**Files:**
- Modify: `src/services/buff-recommender.ts:243-263`
- Test: `src/__tests__/services/buff-recommender.test.ts`

- [ ] **Step 1: Write the failing test**

Background: in `evaluateBuffRecommendation`, `simulateWithBuffedStats` already routes through `recipeToCraftParams` (Soul-correct). The bug is narrower — `baseStats` (used for `bestCeilingCombo` selection and `dedupCombos` key generation) is raw gear. For specialists this means combo selection and dedup keys diverge from what the eventual solve will see. The test below pins the contract: `baseStats` must equal `gearsetToBuffedStats(ceilingGearset, undefined)`.

To make this directly testable, expose a tiny helper from `buff-recommender.ts` — `computeBaseStats(gearset) → EnhancedStats` — that we call from both the production path and the test.

Append to `src/__tests__/services/buff-recommender.test.ts`:

```ts
import { computeBaseStats } from '@/services/buff-recommender'
import { gearsetToBuffedStats } from '@/services/stat-stacking'

describe('computeBaseStats — Soul folded in (#34)', () => {
  it('non-specialist: equals raw gearset stats', () => {
    const gs: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false }
    expect(computeBaseStats(gs)).toEqual({ craftsmanship: 4000, control: 3800, cp: 600 })
  })

  it('specialist: adds +20/+20/+15 (matches gearsetToBuffedStats(gs, undefined))', () => {
    const gs: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: true }
    expect(computeBaseStats(gs)).toEqual(gearsetToBuffedStats(gs, undefined))
    expect(computeBaseStats(gs)).toEqual({ craftsmanship: 4020, control: 3820, cp: 615 })
  })

  it('low-stat specialist (food cap NOT saturated): dedup-key contract differs from raw', () => {
    // The regression vector: if baseStats were raw, dedup keys would key off
    // pre-Soul stats, mis-collapsing combos whose food % cap interacts with
    // the +20/+15 differently.
    const gs: GearsetStats = { level: 100, craftsmanship: 4000, control: 100, cp: 100, isSpecialist: true }
    expect(computeBaseStats(gs)).toEqual({ craftsmanship: 4020, control: 120, cp: 115 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/buff-recommender.test.ts`
Expected: FAIL — both cases currently return the same result (Soul ignored in baseStats).

- [ ] **Step 3: Fix the ceiling baseStats**

Edit `src/services/buff-recommender.ts`.

Add at the top of the file:

```ts
import { gearsetToBuffedStats } from '@/services/stat-stacking'

/**
 * Canonical baseStats for buff recommendation — folds in the Soul of the
 * Crafter bonus so ceiling checks and dedup keys reflect the stats the
 * solver will actually see (ADR 0001). Exported for testing.
 */
export function computeBaseStats(gearset: GearsetStats): EnhancedStats {
  return gearsetToBuffedStats(gearset, undefined)
}
```

Replace the `baseStats` block inside `evaluateBuffRecommendation` (around line 246-250):

```ts
  const baseStats: EnhancedStats = computeBaseStats(ceilingGearset)
```

No other change needed — `dedupCombos(allCombos, baseStats, priceMap)` now keys off post-Soul stats automatically.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/buff-recommender.test.ts`
Expected: PASS for the new test; existing tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/services/buff-recommender.ts src/__tests__/services/buff-recommender.test.ts
git commit -m "fix(buff-recommender): include Soul in baseStats for ceiling and dedup (#34)"
```

---

## Task 7: Cross-caller parity test

**Files:**
- Create: `src/__tests__/services/stat-stacking-parity.test.ts`

- [ ] **Step 1: Write the parity test**

```ts
// src/__tests__/services/stat-stacking-parity.test.ts
import { describe, it, expect } from 'vitest'
import { COMMON_FOODS, COMMON_MEDICINES, applyFoodBuff, applyMedicineBuff } from '@/engine/food-medicine'
import { applyCrafterSoulBonus } from '@/services/specialist-state'
import { gearsetToBuffedStats } from '@/services/stat-stacking'
import { recipeToCraftParams } from '@/solver/config'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

const recipe: Recipe = {
  id: 1, itemId: 100, name: 'Parity', icon: '', job: 'CRP',
  level: 90, stars: 0, canHq: true, materialQualityFactor: 75, amountResult: 1,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
    durability: 80, suggestedCraftsmanship: 0,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 80,
  },
}

describe('Cross-caller stacking parity (#34)', () => {
  // Exercise the three independent paths that all need to agree:
  //   A. gearsetToBuffedStats (canonical helper)
  //   B. recipeToCraftParams(recipe, gearset, buffs) (solver/batch path)
  //   C. The simulator-style sequence FoodMedicine.vue uses:
  //      applyCrafterSoulBonus → applyFoodBuff → applyMedicineBuff
  //
  // All three MUST produce identical { craftsmanship, control, cp }.

  it.each([
    { isSpecialist: false, craft: 4000, control: 3800, cp: 600 },
    { isSpecialist: true,  craft: 4000, control: 3800, cp: 600 },
    { isSpecialist: true,  craft: 4000, control: 100,  cp: 100 },   // food not capped
    { isSpecialist: true,  craft: 5000, control: 5000, cp: 700 },   // food capped
  ])('parity for gearset %j', (gs) => {
    const gearset: GearsetStats = {
      level: 100, craftsmanship: gs.craft, control: gs.control, cp: gs.cp,
      isSpecialist: gs.isSpecialist,
    }
    const food = COMMON_FOODS.find(f => f.id === 36060)!
    const medicine = COMMON_MEDICINES.find(m => m.id === 44168)!
    const buffs = { food, medicine }

    // A
    const a = gearsetToBuffedStats(gearset, buffs)

    // B
    const params = recipeToCraftParams(recipe, gearset, buffs)
    const b = { craftsmanship: params.craftsmanship, control: params.control, cp: params.cp }

    // C — what FoodMedicine.vue + useSimulator does (inline)
    const withSoul = applyCrafterSoulBonus(gearset)
    const afterFood = applyFoodBuff(
      { craftsmanship: withSoul.craftsmanship, control: withSoul.control, cp: withSoul.cp },
      food,
    )
    const c = applyMedicineBuff(afterFood, medicine)

    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/stat-stacking-parity.test.ts`
Expected: PASS — all three callers agree across the four gearset shapes.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/services/stat-stacking-parity.test.ts
git commit -m "test(stat-stacking): lock cross-caller parity for Soul/food/medicine order (#34)"
```

---

## Task 8: Doc-comment pointers to ADR

**Files:**
- Modify: `src/engine/food-medicine.ts`
- Modify: `src/services/specialist-state.ts`

- [ ] **Step 1: Add pointer to ADR in `food-medicine.ts`**

Add doc comment above `applyBuffsToStats` (currently the only `Apply food and medicine buffs to base stats. Applies food buff first, then medicine buff, in sequence.` comment):

```ts
/**
 * Apply food and medicine buffs to base stats.
 *
 * NOTE: This helper does NOT apply the Soul of the Crafter (+20/+20/+15)
 * bonus. Non-test callers that take a `GearsetStats` should use
 * `gearsetToBuffedStats` from `@/services/stat-stacking` instead — see
 * docs/adr/0001-stat-stacking-order.md. Direct use of this function on a
 * raw gearset will silently drop the specialist Soul bonus.
 *
 * Applies food buff first, then medicine buff, in sequence.
 */
```

- [ ] **Step 2: Add pointer to ADR in `specialist-state.ts`**

Update the doc comment above `applyCrafterSoulBonus`:

```ts
/**
 * Returns a copy of `gearset` with the Soul of the Crafter bonus folded into
 * craftsmanship / control / cp when `isSpecialist` is true. When false,
 * returns a shallow copy with the same stats — never the input reference,
 * so callers can mutate freely.
 *
 * Most callers should NOT use this directly — go through
 * `gearsetToBuffedStats` (or `recipeToCraftParams(recipe, gearset, buffs)`)
 * which composes Soul + food + medicine in the canonical order (ADR 0001).
 * This function is exported only for that helper and for the simulator's
 * inline FoodMedicine widget, which composes the sequence explicitly.
 */
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/food-medicine.ts src/services/specialist-state.ts
git commit -m "docs: point food-medicine and specialist-state at ADR 0001 (#34)"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass. Specifically confirm these files have green tests:
- `src/__tests__/services/stat-stacking.test.ts`
- `src/__tests__/services/stat-stacking-parity.test.ts`
- `src/__tests__/solver/config.test.ts`
- `src/__tests__/services/feasibility-prefilter.test.ts`
- `src/__tests__/services/self-craft-candidates.test.ts`
- `src/__tests__/services/buff-recommender.test.ts`
- `src/__tests__/services/batch-optimizer.test.ts` (unchanged behaviour expected)

- [ ] **Step 2: Type-check**

Run: `npx vue-tsc --noEmit`
Expected: No errors. Watch for stale imports of `applyBuffsToStats` we removed.

- [ ] **Step 3: Manual smoke**

Run: `npm run dev`, then in a browser:
- Pick a specialist gearset (toggle `isSpecialist` on in GearsetSheet).
- On the simulator: select a recipe + a food + a medicine, confirm the displayed `enhancedStats` matches `gearsetToBuffedStats(...)` you can compute by hand.
- On the batch page: queue the same recipe + same buffs, confirm the optimisation result matches the simulator.
- Toggle `isSpecialist` off; confirm both views drop the +20/+20/+15 immediately.

If everything checks out, the issue is closed.

- [ ] **Step 4: Update Issue #34**

```bash
gh issue comment 34 --body "Fixed on branch fix/stat-stacking-order. Canonical order pinned in docs/adr/0001-stat-stacking-order.md; gearsetToBuffedStats is the single source of truth; cross-caller parity locked by test."
```

Do NOT close yet — wait for review / merge.

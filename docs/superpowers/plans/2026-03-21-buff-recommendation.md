# Buff Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically recommend food/medicine buffs when they would be cheaper than buying HQ materials during batch optimization.

**Architecture:** New `buff-recommender.ts` service evaluates food/medicine combos using simulation pre-filter + solver verification. Integrates as Phase 4.6-buff in the existing batch pipeline. Results displayed via independent `BuffRecommendationCard.vue` component.

**Tech Stack:** Vue 3, TypeScript, Pinia, Element Plus, raphael-rs WASM solver

**Spec:** `docs/superpowers/specs/2026-03-21-buff-recommendation-design.md`

---

### Task 1: Extend RecipeOptimizeResult with qualityDeficit

**Files:**
- Modify: `src/services/batch-optimizer.ts:15-23` (interface) and `src/services/batch-optimizer.ts:54-76` (return values)
- Test: `src/__tests__/services/batch-optimizer.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/__tests__/services/batch-optimizer.test.ts` inside `describe('optimizeRecipe')`:

```typescript
it('returns qualityDeficit = 0 when double-max', async () => {
  vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory', 'groundwork'], progress: 3500, quality: 7200, steps: 2 })
  vi.mocked(simulateCraft).mockResolvedValue(doubleMaxSim as any)

  const result = await optimizeRecipe(mockRecipe, mockGearset)
  expect(result.qualityDeficit).toBe(0)
})

it('returns qualityDeficit when quality < max', async () => {
  vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory'], progress: 3500, quality: 5000, steps: 1 })
  vi.mocked(simulateCraft).mockResolvedValue(qualityDeficitSim as any)

  const result = await optimizeRecipe(mockRecipe, mockGearset)
  expect(result.qualityDeficit).toBe(2200) // 7200 - 5000
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/batch-optimizer.test.ts`
Expected: FAIL — `qualityDeficit` not in result

- [ ] **Step 3: Implement**

In `src/services/batch-optimizer.ts`, add `qualityDeficit` to the interface:

```typescript
export interface RecipeOptimizeResult {
  recipe: Recipe
  quantity: number
  actions: string[]
  hqAmounts: number[]
  initialQuality: number
  isDoubleMax: boolean
  materials: MaterialBase[]
  qualityDeficit: number  // max_quality - simResult.quality (0 if isDoubleMax)
}
```

Update the return in `optimizeRecipe()` — isDoubleMax case (line 55-58):

```typescript
  if (isDoubleMax) {
    return {
      recipe, quantity: 1, actions: solverResult.actions,
      hqAmounts: [], initialQuality: 0, isDoubleMax: true, materials,
      qualityDeficit: 0,
    }
  }
```

And the non-isDoubleMax return (line 71-76). Note: `qualityDeficit` is already computed at line 61 (`const qualityDeficit = simResult.max_quality - simResult.quality`) — just add it to the return object:

```typescript
  return {
    recipe, quantity: 1, actions: solverResult.actions,
    hqAmounts: bestCombo?.hqAmounts ?? [],
    initialQuality: bestCombo?.initialQuality ?? 0,
    isDoubleMax: false, materials,
    qualityDeficit,
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/batch-optimizer.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/batch-optimizer.ts src/__tests__/services/batch-optimizer.test.ts
git commit -m "feat(batch): add qualityDeficit to RecipeOptimizeResult"
```

---

### Task 2: Add BuffRecommendation type to BatchResults

**Files:**
- Modify: `src/stores/batch.ts:41-50` (BatchResults interface)

- [ ] **Step 1: Add BuffRecommendation interface and extend BatchResults**

In `src/stores/batch.ts`, add after the `BuyFinishedDecision` interface (line 39):

```typescript
export interface BuffRecommendation {
  food: { buff: FoodBuff; isHq: boolean } | null
  medicine: { buff: FoodBuff; isHq: boolean } | null
  buffCost: number
  hqMaterialSavings: number
  affectedRecipes: Array<{ id: number; name: string }>
}
```

Add the import at the top of the file:

```typescript
import type { FoodBuff } from '@/engine/food-medicine'
```

Add to `BatchResults` interface:

```typescript
export interface BatchResults {
  // ... existing fields ...
  buffRecommendation?: BuffRecommendation
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/stores/batch.ts
git commit -m "feat(batch): add BuffRecommendation type to BatchResults"
```

---

### Task 3: Implement buff-recommender.ts core logic

**Files:**
- Create: `src/services/buff-recommender.ts`
- Test: `src/__tests__/services/buff-recommender.test.ts`

- [ ] **Step 1: Write tests for combo generation and dedup**

Create `src/__tests__/services/buff-recommender.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GearsetStats } from '@/stores/gearsets'
import type { RecipeOptimizeResult } from '@/services/batch-optimizer'
import type { MarketData } from '@/api/universalis'

vi.mock('@/solver/worker', () => ({
  solveCraft: vi.fn(),
  simulateCraft: vi.fn(),
}))

import { generateCandidateCombos, evaluateBuffRecommendation } from '@/services/buff-recommender'
import { simulateCraft, solveCraft } from '@/solver/worker'

const mockGearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600 }

describe('generateCandidateCombos', () => {
  it('generates 44 combos (excluding null/null)', () => {
    const combos = generateCandidateCombos()
    expect(combos.length).toBe(44)
    // No (null, null) entry
    expect(combos.every(c => c.food !== null || c.medicine !== null)).toBe(true)
  })

  it('all combos have resolveBuff-generated buffs', () => {
    const combos = generateCandidateCombos()
    for (const c of combos) {
      if (c.food) expect(c.food.buff.id).toBeGreaterThan(0)
      if (c.medicine) expect(c.medicine.buff.id).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/buff-recommender.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement generateCandidateCombos**

Create `src/services/buff-recommender.ts`:

```typescript
import type { RecipeOptimizeResult } from '@/services/batch-optimizer'
import type { GearsetStats } from '@/stores/gearsets'
import type { MarketData } from '@/api/universalis'
import type { FoodBuff, EnhancedStats } from '@/engine/food-medicine'
import type { BuffRecommendation } from '@/stores/batch'
import {
  COMMON_FOODS, COMMON_MEDICINES,
  resolveBuff, applyFoodBuff, applyMedicineBuff,
} from '@/engine/food-medicine'
import { solveCraft, simulateCraft } from '@/solver/worker'
import { craftParamsToSolverConfig, recipeToCraftParams } from '@/solver/config'
import type { Recipe } from '@/stores/recipe'

export interface BuffCombo {
  food: { buff: FoodBuff; isHq: boolean } | null
  medicine: { buff: FoodBuff; isHq: boolean } | null
}

/**
 * Generate all 44 valid food/medicine combinations (excluding null+null).
 */
export function generateCandidateCombos(): BuffCombo[] {
  const foods: BuffCombo['food'][] = [null]
  for (const f of COMMON_FOODS) {
    foods.push({ buff: f, isHq: true })
    foods.push({ buff: resolveBuff(COMMON_FOODS, f.id, false)!, isHq: false })
  }

  const medicines: BuffCombo['medicine'][] = [null]
  for (const m of COMMON_MEDICINES) {
    medicines.push({ buff: m, isHq: true })
    medicines.push({ buff: resolveBuff(COMMON_MEDICINES, m.id, false)!, isHq: false })
  }

  const combos: BuffCombo[] = []
  for (const food of foods) {
    for (const medicine of medicines) {
      if (!food && !medicine) continue
      combos.push({ food, medicine })
    }
  }
  return combos
}

/**
 * Apply a buff combo to base stats and return enhanced stats.
 */
export function applyCombo(
  baseStats: EnhancedStats,
  combo: BuffCombo,
): EnhancedStats {
  const afterFood = applyFoodBuff(baseStats, combo.food?.buff ?? null)
  return applyMedicineBuff(afterFood, combo.medicine?.buff ?? null)
}

/**
 * Get item IDs for all food/medicine items (for price query).
 */
export function getBuffItemIds(): number[] {
  const ids: number[] = []
  for (const f of COMMON_FOODS) ids.push(f.id)
  for (const m of COMMON_MEDICINES) ids.push(m.id)
  return ids
}

/**
 * Get the market price of a buff combo.
 * Uses NQ price for NQ items, HQ price for HQ items.
 */
function getComboPrice(combo: BuffCombo, priceMap: Map<number, MarketData>): number {
  let cost = 0
  if (combo.food) {
    const md = priceMap.get(combo.food.buff.id)
    if (!md) return Infinity
    cost += combo.food.isHq ? (md.minPriceHQ || Infinity) : (md.minPriceNQ || Infinity)
  }
  if (combo.medicine) {
    const md = priceMap.get(combo.medicine.buff.id)
    if (!md) return Infinity
    cost += combo.medicine.isHq ? (md.minPriceHQ || Infinity) : (md.minPriceNQ || Infinity)
  }
  return cost
}

/**
 * Dedup combos that produce identical enhanced stats for a given base stat set.
 * Keeps the cheapest combo per unique stat triplet.
 */
function dedupCombos(
  combos: BuffCombo[],
  baseStats: EnhancedStats,
  priceMap: Map<number, MarketData>,
): Array<BuffCombo & { price: number }> {
  const statMap = new Map<string, BuffCombo & { price: number }>()

  for (const combo of combos) {
    const enhanced = applyCombo(baseStats, combo)
    const key = `${enhanced.craftsmanship}-${enhanced.control}-${enhanced.cp}`
    const price = getComboPrice(combo, priceMap)
    if (price === Infinity) continue

    const existing = statMap.get(key)
    if (!existing || price < existing.price) {
      statMap.set(key, { ...combo, price })
    }
  }

  return Array.from(statMap.values()).sort((a, b) => a.price - b.price)
}

/**
 * Check if existing actions achieve isDoubleMax with buffed stats using cheap simulation.
 */
async function simulateWithBuffedStats(
  recipe: Recipe,
  gearset: GearsetStats,
  combo: BuffCombo,
  existingActions: string[],
): Promise<boolean> {
  const craftParams = recipeToCraftParams(recipe, gearset)
  const enhanced = applyCombo(
    { craftsmanship: craftParams.craftsmanship, control: craftParams.control, cp: craftParams.cp },
    combo,
  )
  craftParams.craftsmanship = enhanced.craftsmanship
  craftParams.control = enhanced.control
  craftParams.cp = enhanced.cp
  craftParams.initialQuality = 0

  const config = craftParamsToSolverConfig(craftParams)
  const simResult = await simulateCraft(config, existingActions)

  return simResult.progress >= simResult.max_progress &&
    simResult.quality >= simResult.max_quality
}

/**
 * Full solve with buffed stats to check if isDoubleMax is achievable.
 */
async function solveWithBuffedStats(
  recipe: Recipe,
  gearset: GearsetStats,
  combo: BuffCombo,
): Promise<boolean> {
  const craftParams = recipeToCraftParams(recipe, gearset)
  const enhanced = applyCombo(
    { craftsmanship: craftParams.craftsmanship, control: craftParams.control, cp: craftParams.cp },
    combo,
  )
  craftParams.craftsmanship = enhanced.craftsmanship
  craftParams.control = enhanced.control
  craftParams.cp = enhanced.cp
  craftParams.initialQuality = 0

  const config = craftParamsToSolverConfig(craftParams)
  const solverResult = await solveCraft(config)
  const simResult = await simulateCraft(config, solverResult.actions)

  return simResult.progress >= simResult.max_progress &&
    simResult.quality >= simResult.max_quality
}

/**
 * Calculate total HQ material cost savings if all affected recipes become isDoubleMax.
 * Savings = sum of (hqAmount * hqPrice - hqAmount * nqPrice) * quantity.
 */
function calculateHqSavings(
  deficitRecipes: RecipeOptimizeResult[],
  priceMap: Map<number, MarketData>,
): number {
  let total = 0
  for (const r of deficitRecipes) {
    for (let j = 0; j < r.materials.length; j++) {
      const hqCount = r.hqAmounts[j] ?? 0
      if (hqCount === 0) continue
      const md = priceMap.get(r.materials[j].itemId)
      const hqPrice = md?.minPriceHQ ?? 0
      const nqPrice = md?.minPriceNQ ?? 0
      total += (hqPrice - nqPrice) * hqCount * r.quantity
    }
  }
  return total
}

/**
 * Main entry point: evaluate whether food/medicine buffs can replace HQ materials.
 *
 * Phase 4.6-buff in the batch pipeline.
 */
export async function evaluateBuffRecommendation(
  recipeResults: RecipeOptimizeResult[],
  buyFinishedIds: Set<number>,
  getGearset: (job: string) => GearsetStats | null,
  priceMap: Map<number, MarketData>,
  isCancelled: () => boolean,
): Promise<BuffRecommendation | null> {
  // Step 1: collect deficit recipes (exclude buy-finished and canHq=false)
  const deficitRecipes = recipeResults.filter(
    r => !r.isDoubleMax && r.recipe.canHq && !buyFinishedIds.has(r.recipe.id),
  )
  if (deficitRecipes.length === 0) return null

  // Sort by qualityDeficit descending — hardest first
  deficitRecipes.sort((a, b) => b.qualityDeficit - a.qualityDeficit)
  const hardest = deficitRecipes[0]

  const hardestGearset = getGearset(hardest.recipe.job)
  if (!hardestGearset) return null

  const baseStats: EnhancedStats = {
    craftsmanship: hardestGearset.craftsmanship,
    control: hardestGearset.control,
    cp: hardestGearset.cp,
  }

  // Step 0: stat ceiling pre-check — find the combo that produces the highest stats
  const allCombos = generateCandidateCombos()
  let bestCeilingCombo: BuffCombo = allCombos[0]
  let bestCeilingScore = 0
  for (const combo of allCombos) {
    const enhanced = applyCombo(baseStats, combo)
    const score = enhanced.control + enhanced.cp
    if (score > bestCeilingScore) {
      bestCeilingScore = score
      bestCeilingCombo = combo
    }
  }
  // Simulate existing actions with the strongest possible buff
  const ceilingSimPass = await simulateWithBuffedStats(
    hardest.recipe, hardestGearset, bestCeilingCombo, hardest.actions,
  )
  // If simulation fails, try full solver with strongest combo as final check
  if (!ceilingSimPass) {
    const ceilingSolvePass = await solveWithBuffedStats(
      hardest.recipe, hardestGearset, bestCeilingCombo,
    )
    if (!ceilingSolvePass) return null // Even the best combo can't fix the hardest recipe
  }

  // Step 2: generate, dedup, sort by price
  const candidates = dedupCombos(allCombos, baseStats, priceMap)
  if (candidates.length === 0) return null

  // Step 2.5 + Step 3 + Step 4: try combos cheapest-first
  for (const candidate of candidates) {
    if (isCancelled()) return null
    const combo: BuffCombo = { food: candidate.food, medicine: candidate.medicine }

    // Try simulation first on hardest recipe (cheap)
    let hardestPasses = await simulateWithBuffedStats(
      hardest.recipe, hardestGearset, combo, hardest.actions,
    )

    // If simulation fails, try full solver
    if (!hardestPasses) {
      if (isCancelled()) return null
      hardestPasses = await solveWithBuffedStats(hardest.recipe, hardestGearset, combo)
    }

    if (!hardestPasses) continue

    // Step 4: verify remaining recipes
    let allPass = true
    for (const r of deficitRecipes.slice(1)) {
      if (isCancelled()) return null
      const gs = getGearset(r.recipe.job)
      if (!gs) { allPass = false; break }

      // Simulation first
      let passes = await simulateWithBuffedStats(r.recipe, gs, combo, r.actions)
      if (!passes) {
        if (isCancelled()) return null
        passes = await solveWithBuffedStats(r.recipe, gs, combo)
      }
      if (!passes) { allPass = false; break }
    }

    if (!allPass) continue

    // Step 5: cost comparison
    const hqSavings = calculateHqSavings(deficitRecipes, priceMap)
    if (candidate.price >= hqSavings) continue

    return {
      food: combo.food,
      medicine: combo.medicine,
      buffCost: candidate.price,
      hqMaterialSavings: hqSavings,
      affectedRecipes: deficitRecipes.map(r => ({ id: r.recipe.id, name: r.recipe.name })),
    }
  }

  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/services/buff-recommender.test.ts`
Expected: PASS

- [ ] **Step 5: Write tests for evaluateBuffRecommendation**

Add to `src/__tests__/services/buff-recommender.test.ts`:

```typescript
import type { Recipe } from '@/stores/recipe'

const mockRecipe: Recipe = {
  id: 1, itemId: 100, name: 'Test Recipe', icon: '', job: 'CRP',
  level: 90, stars: 0, canHq: true, materialQualityFactor: 75,
  ingredients: [
    { itemId: 200, name: 'Mat A', icon: '', amount: 3, canHq: true, level: 50 },
  ],
  recipeLevelTable: {
    classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
    durability: 80, suggestedCraftsmanship: 0,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 80,
  },
}

function makeDeficitResult(recipe: Recipe, qualityDeficit: number): RecipeOptimizeResult {
  return {
    recipe, quantity: 2, actions: ['muscle_memory'],
    hqAmounts: [3], initialQuality: 500, isDoubleMax: false,
    materials: [{ itemId: 200, name: 'Mat A', icon: '', amount: 3 }],
    qualityDeficit,
  }
}

const priceMap = new Map<number, MarketData>([
  // Food/medicine prices
  [36060, { minPriceNQ: 500, minPriceHQ: 2000 } as MarketData],
  [38929, { minPriceNQ: 600, minPriceHQ: 2500 } as MarketData],
  [37282, { minPriceNQ: 400, minPriceHQ: 1800 } as MarketData],
  [44091, { minPriceNQ: 700, minPriceHQ: 3000 } as MarketData],
  [44169, { minPriceNQ: 300, minPriceHQ: 1500 } as MarketData],
  [44168, { minPriceNQ: 350, minPriceHQ: 1600 } as MarketData],
  // Material prices
  [200, { minPriceNQ: 100, minPriceHQ: 5000 } as MarketData],
])

describe('evaluateBuffRecommendation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when no deficit recipes exist', async () => {
    const result = await evaluateBuffRecommendation(
      [], new Set(), () => mockGearset, priceMap, () => false,
    )
    expect(result).toBeNull()
  })

  it('returns recommendation when buff enables HQ and saves money', async () => {
    // Simulation says pass for any buffed stats
    vi.mocked(simulateCraft).mockResolvedValue({
      progress: 3500, max_progress: 3500,
      quality: 7200, max_quality: 7200,
    } as any)

    const deficitResult = makeDeficitResult(mockRecipe, 1000)
    const result = await evaluateBuffRecommendation(
      [deficitResult], new Set(), () => mockGearset, priceMap, () => false,
    )

    expect(result).not.toBeNull()
    expect(result!.buffCost).toBeGreaterThan(0)
    expect(result!.hqMaterialSavings).toBeGreaterThan(result!.buffCost)
    expect(result!.affectedRecipes).toHaveLength(1)
  })

  it('returns null when cancelled', async () => {
    const result = await evaluateBuffRecommendation(
      [makeDeficitResult(mockRecipe, 1000)],
      new Set(), () => mockGearset, priceMap, () => true,
    )
    expect(result).toBeNull()
  })

  it('excludes buy-finished recipes', async () => {
    const result = await evaluateBuffRecommendation(
      [makeDeficitResult(mockRecipe, 1000)],
      new Set([1]),  // recipe id=1 is buy-finished
      () => mockGearset, priceMap, () => false,
    )
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/__tests__/services/buff-recommender.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/services/buff-recommender.ts src/__tests__/services/buff-recommender.test.ts
git commit -m "feat(batch): add buff-recommender service with simulation pre-filter"
```

---

### Task 4: Integrate Phase 4.6-buff into batch pipeline

**Files:**
- Modify: `src/services/batch-optimizer.ts:177-192` (Phase 4 price query) and after line 239 (Phase 4.5)

- [ ] **Step 1: Write integration test**

Add to `src/__tests__/services/batch-optimizer.test.ts`:

```typescript
import { getAggregatedPrices } from '@/api/universalis'

describe('runBatchOptimization buff recommendation', () => {
  beforeEach(() => vi.clearAllMocks())

  const defaultSettings = {
    crossServer: false, recursivePricing: false, maxRecursionDepth: 3,
    exceptionStrategy: 'skip' as const, server: 'Chocobo', dataCenter: 'Mana',
  }

  it('does not run buff evaluation when food is selected', async () => {
    vi.mocked(solveCraft).mockResolvedValue({ actions: ['muscle_memory'], progress: 3500, quality: 5000, steps: 1 })
    vi.mocked(simulateCraft).mockResolvedValue(qualityDeficitSim as any)

    const result = await runBatchOptimization(
      [{ recipe: mockRecipe, quantity: 1 }],
      () => mockGearset,
      { ...defaultSettings, foodId: 44091, foodIsHq: true },
      () => {}, () => false,
    )
    expect(result.buffRecommendation).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/services/batch-optimizer.test.ts`
Expected: FAIL — `buffRecommendation` not in result

- [ ] **Step 3: Implement integration**

In `src/services/batch-optimizer.ts`, add import:

```typescript
import { evaluateBuffRecommendation, getBuffItemIds } from '@/services/buff-recommender'
```

In Phase 4 price query (around line 190), add food/medicine IDs when no buff is selected:

```typescript
  // Add food/medicine item IDs for buff recommendation (only when user hasn't selected any)
  const noBuffSelected = !settings.foodId && !settings.medicineId
  if (noBuffSelected) {
    for (const id of getBuffItemIds()) allMaterialIds.add(id)
  }
```

After Phase 4.5 (after line 239, before Phase 5), add Phase 4.6-buff:

```typescript
  // === Phase 4.6-buff: Evaluate food/medicine recommendation ===
  let buffRecommendation: BuffRecommendation | undefined
  if (noBuffSelected && !isCancelled()) {
    const buyFinishedIds = new Set(buyFinishedItems.map(bf => bf.recipe.id))
    const hasDeficit = recipesToCraft.some(r => !r.isDoubleMax && r.recipe.canHq)
    if (hasDeficit) {
      const recommendation = await evaluateBuffRecommendation(
        recipesToCraft, buyFinishedIds, getGearset as (job: string) => GearsetStats | null,
        priceMap, isCancelled,
      )
      if (recommendation) buffRecommendation = recommendation
    }
  }
```

Add the import for the type:

```typescript
import type { BuffRecommendation } from '@/stores/batch'
```

Update the return statement (line 387) to include `buffRecommendation`:

```typescript
  return { serverGroups, crystals, selfCraftItems, todoList, exceptions, buyFinishedItems, grandTotal, crossWorldCache, buffRecommendation }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/services/batch-optimizer.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/batch-optimizer.ts src/__tests__/services/batch-optimizer.test.ts
git commit -m "feat(batch): integrate Phase 4.6-buff recommendation into pipeline"
```

---

### Task 5: Create BuffRecommendationCard component

**Files:**
- Create: `src/components/batch/BuffRecommendationCard.vue`

- [ ] **Step 1: Create the component**

Create `src/components/batch/BuffRecommendationCard.vue`:

```vue
<script setup lang="ts">
import type { BuffRecommendation } from '@/stores/batch'
import { formatGil } from '@/utils/format'
import { computed } from 'vue'

const props = defineProps<{
  recommendation: BuffRecommendation
}>()

const netSavings = computed(() =>
  props.recommendation.hqMaterialSavings - props.recommendation.buffCost,
)

const buffLabel = computed(() => {
  const parts: string[] = []
  if (props.recommendation.food) {
    const suffix = props.recommendation.food.isHq ? '(HQ)' : '(NQ)'
    parts.push(`${props.recommendation.food.buff.name.replace(' HQ', '')}${suffix}`)
  }
  if (props.recommendation.medicine) {
    const suffix = props.recommendation.medicine.isHq ? '(HQ)' : '(NQ)'
    parts.push(`${props.recommendation.medicine.buff.name.replace(' HQ', '')}${suffix}`)
  }
  return parts.join(' + ')
})
</script>

<template>
  <div class="buff-recommendation">
    <span class="buff-icon">💡</span>
    <div class="buff-body">
      <div class="buff-title">省錢小提示</div>
      <div class="buff-main">
        使用 <strong class="buff-name">{{ buffLabel }}</strong>
        可讓 {{ recommendation.affectedRecipes.length }} 個配方免用 HQ 材料
      </div>
      <div class="buff-detail">
        <span>食物/藥水成本：<strong>{{ formatGil(recommendation.buffCost) }} Gil</strong></span>
        <span>節省 HQ 材料：<strong class="buff-savings">{{ formatGil(recommendation.hqMaterialSavings) }} Gil</strong></span>
        <span>淨省：<strong class="buff-savings">{{ formatGil(netSavings) }} Gil</strong></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.buff-recommendation {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(64, 158, 255, 0.08);
  border: 1px solid rgba(64, 158, 255, 0.2);
  border-radius: 8px;
  padding: 14px 18px;
  margin-bottom: 20px;
}

.buff-icon {
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 1px;
}

.buff-body {
  flex: 1;
}

.buff-title {
  font-size: 14px;
  font-weight: 600;
  color: #a0cfff;
  margin-bottom: 4px;
}

.buff-main {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.buff-name {
  color: #e9c176;
}

.buff-detail {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.buff-savings {
  color: var(--app-success, #67c23a);
}

@media (max-width: 768px) {
  .buff-detail {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/batch/BuffRecommendationCard.vue
git commit -m "feat(batch): add BuffRecommendationCard UI component"
```

---

### Task 6: Render BuffRecommendationCard in BatchView

**Files:**
- Modify: `src/views/BatchView.vue:1-16` (imports) and `src/views/BatchView.vue:170-177` (stepper layout) and `src/views/BatchView.vue:296-310` (classic layout)

- [ ] **Step 1: Add import**

In `src/views/BatchView.vue`, add to the imports:

```typescript
import BuffRecommendationCard from '@/components/batch/BuffRecommendationCard.vue'
```

- [ ] **Step 2: Add to stepper layout**

After `CostSummaryPanel` (line 177) and before Section 3, add:

```vue
      <BuffRecommendationCard
        v-if="batchStore.results?.buffRecommendation"
        :recommendation="batchStore.results.buffRecommendation"
      />
```

- [ ] **Step 3: Add to classic layout**

In the classic layout left column, after the `BatchProgress` component and before the exception card, add:

```vue
          <BuffRecommendationCard
            v-if="batchStore.results?.buffRecommendation"
            :recommendation="batchStore.results.buffRecommendation"
          />
```

- [ ] **Step 4: Verify the app builds**

Run: `npx vite build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/views/BatchView.vue
git commit -m "feat(batch): render buff recommendation card in both layouts"
```

---

### Task 7: Manual verification and cleanup

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run TypeScript type check**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Manual test — dev server**

Run: `npx vite dev`
1. Open batch view, add a recipe known to have quality deficit
2. Do NOT select food/medicine
3. Click "開始最佳化計算"
4. Verify: if a buff can fix it, the recommendation card appears between CostSummaryPanel and Section 3
5. Verify: card shows correct food/medicine names, costs, and savings

- [ ] **Step 4: Manual test — with food selected**

1. Select a food in batch settings
2. Run optimization
3. Verify: no recommendation card appears

- [ ] **Step 5: Manual test — all recipes already HQ**

1. Use a recipe that the solver can reach isDoubleMax without buffs
2. Run optimization without food/medicine
3. Verify: no recommendation card appears

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(batch): address issues found during manual testing"
```

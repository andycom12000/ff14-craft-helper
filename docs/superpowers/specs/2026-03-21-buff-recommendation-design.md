# Batch Food/Medicine Recommendation Feature

## Context

When running batch optimization without selecting food/medicine, some recipes may fail to achieve HQ (100% quality). Currently users must manually experiment with food/medicine selections and re-run the optimizer. This feature automatically evaluates whether food/medicine buffs could enable HQ for those recipes, and recommends the cheapest option when the buff cost is lower than the HQ material cost.

## Trigger Conditions

- User has NOT selected any food or medicine in batch settings
- At least one recipe result has `isDoubleMax === false` and `canHq === true`
- Recipe was not already decided as "buy finished" by Phase 4.5

## Algorithm: Simulation-Gated Hardest-First Filtering

Inserted as **Phase 4.6-buff** in `runBatchOptimization()`, after buy-vs-craft decisions (Phase 4.5) so all prices and buy decisions are available. (Phase 4.5 is the existing buy-vs-craft step.)

### Step 0: Stat Ceiling Pre-check (zero cost)

Compute the maximum possible stat boost from the strongest combo (highest control food + highest CP food + strongest medicine, all HQ). Run `simulateCraft()` with the existing no-buff action sequence using these max-buffed stats on the hardest recipe. If even this theoretical maximum cannot achieve `isDoubleMax`, skip the entire Phase 4.6-buff — no combo can help.

### Step 1: Collect Affected Recipes

```
deficitRecipes = results
  .filter(r => !r.isDoubleMax && r.recipe.canHq)
  .filter(r => not in buyFinishedItems)  // exclude recipes decided as "buy finished"
hardestRecipe = max(deficitRecipes, by: qualityDeficit)
```

Extend `RecipeOptimizeResult` to include `qualityDeficit` (already computed inside `optimizeRecipe()` at line 61 of `batch-optimizer.ts` — just return it). Also store the `actions` and `simResult` from the initial solve for the simulation pre-filter.

### Step 2: Generate Candidate Combos

- Food: 4 items × HQ/NQ + null = 9 options (use `resolveBuff(COMMON_FOODS, id, isHq)`)
- Medicine: 2 items × HQ/NQ + null = 5 options (use `resolveBuff(COMMON_MEDICINES, id, isHq)`)
- Exclude (null, null) = **44 valid combos**
- For each combo, compute enhanced stats per affected recipe's job gearset: `applyFoodBuff()` + `applyMedicineBuff()`
- **Dedup**: combos producing identical (craftsmanship, control, cp) for a given gearset → keep cheapest
- Sort by price ascending (food market price + medicine market price)

Note: different recipes may use different job gearsets (CRP/BSM/ARM etc.). The buff recommender must call `getGearset(recipe.job)` per recipe and apply buffs to the correct base stats.

### Step 2.5: Simulation Pre-filter (cheap, no solver)

For each candidate combo, simulate the **existing no-buff action sequence** (from Phase 1-3) with buffed stats using `simulateCraft()`:

- Run on the hardest recipe first
- If `quality >= max_quality` → this combo works for that recipe without re-solving
- If not → check: did quality improve meaningfully? If barely any improvement, mark combo as unlikely and deprioritize

This eliminates combos that clearly cannot help (no solver needed) and confirms combos that work without re-solving. `simulateCraft()` is sub-millisecond vs 1-10+ seconds for `solveCraft()`.

**Safety analysis — simulateCraft vs solveCraft 差異：**

`simulateCraft()` 和 `solveCraft()` 使用同一個 WASM 模擬引擎 (`raphael_sim::SimulationState`)，但有以下差異：
- Simulator 不處理 `initial_quality`（使用完整 `max_quality`），solver 會扣除
- Simulator 的 Condition 固定為 Normal，solver 也為 Normal 最佳化
- Simulator 使用 `ActionMask::all()`，但動作序列本身已由 solver 驗證過

**結論：此預篩只會產生 false negative（保守漏報），不會產生 false positive（危險誤報）。**
- 原始 rotation 可能為較低的 quality 目標（因 HQ 材料加成）而優化，模擬時 quality 不到 max_quality 是正常的
- 模擬不通過 → 回退到 solver 重新求解（正確性不受影響）
- 模擬通過 → 用更高 control 跑同樣的動作，每個品質技能產出更多 quality，結果必定正確
- 唯一的「損失」是無法利用額外 CP 來找更好的 rotation，但這不影響正確性，只影響效能（多跑幾次 solver）

### Step 3: Benchmark Solving (Hardest Recipe)

For combos not confirmed by simulation, cheapest first:
1. Call `solveCraft()` + `simulateCraft()` with enhanced stats on `hardestRecipe`
2. Check `isCancelled()` between each solver call
3. If `isDoubleMax` → proceed to Step 4
4. If not → record the failing stats to skip future combos with equal or weaker boosts; try next combo

Create a lightweight solve path that skips `findOptimalHqCombinations()` — during buff evaluation we only care about the `isDoubleMax` boolean, not about HQ material fallback optimization.

### Step 4: Verify Remaining Recipes

For remaining `deficitRecipes`:
1. First try `simulateCraft()` with the winning combo's action sequence from Step 3 — if it works on an easier recipe, no solver call needed
2. If simulation fails, run solver with same enhanced stats (using correct per-job gearset)
3. Check `isCancelled()` between each solver call
4. If ALL achieve `isDoubleMax` → this combo is the answer
5. If any fail → back to Step 3, try next combo

### Step 5: Cost Comparison

```
buffCost = foodMarketPrice + medicineMarketPrice  (one-time)
hqMaterialSavings = Σ over affected recipes × quantity:
  (hqAmount[i] × hqUnitPrice[i]) - (hqAmount[i] × nqUnitPrice[i])
```

Reuse the already-priced material data from the batch pipeline's `priceMap` — do not re-query prices.

If `hqMaterialSavings > buffCost` → produce recommendation. Otherwise, discard.

### Complexity Analysis

- **Pre-check skip**: 1 simulation call → skip entire feature if no buff can help
- **Simulation pre-filter**: up to 44 simulation calls (sub-ms each) → eliminates 50-80% of solver calls
- **Best case**: simulation confirms cheapest combo → 0 solver calls
- **Typical case**: 1-3 solver calls for benchmark + simulation verification
- **Worst case**: all combos tried × N recipes = 44N solver calls (extremely unlikely with simulation + dedup + cross-combo pruning)

## Data Structures

### New Interface

```typescript
interface BuffRecommendation {
  food: { buff: FoodBuff; isHq: boolean } | null   // null = no food needed
  medicine: { buff: FoodBuff; isHq: boolean } | null // null = no medicine needed
  buffCost: number             // food + medicine market price (one-time)
  hqMaterialSavings: number    // total HQ material cost saved across batch
  affectedRecipes: Array<{ id: number; name: string }>
}
// netSavings = hqMaterialSavings - buffCost (derived at point of use)
```

### Modified Interfaces

```typescript
// RecipeOptimizeResult — add fields for buff recommendation:
interface RecipeOptimizeResult {
  // ... existing fields ...
  qualityDeficit: number        // max_quality - simResult.quality
  solvedActions: string[]       // action sequence from initial solve (already exists as `actions`)
}

// BatchResults — add optional field:
interface BatchResults {
  // ... existing fields ...
  buffRecommendation?: BuffRecommendation
}
```

## Integration Points

### Files to Modify

| File | Change |
|------|--------|
| `src/services/batch-optimizer.ts` | Add Phase 4.6-buff call, extend `RecipeOptimizeResult` with `qualityDeficit`, add food/medicine IDs to Phase 4 price query (gated on trigger condition) |
| `src/views/BatchView.vue` | Render `BuffRecommendationCard` when recommendation exists |

Note: `COMMON_FOODS` and `COMMON_MEDICINES` are already exported from `src/engine/food-medicine.ts`. No change needed there.

### New Files

| File | Purpose |
|------|---------|
| `src/services/buff-recommender.ts` | `evaluateBuffRecommendation()` — Phase 4.6-buff logic. Imports `optimizeRecipe` (or a lighter variant) from batch-optimizer |
| `src/components/batch/BuffRecommendationCard.vue` | Independent tip card UI |

### Key Reuse Points

- Use `resolveBuff()` from `food-medicine.ts` to generate HQ/NQ combo variants
- Use `applyFoodBuff()` + `applyMedicineBuff()` for stat enhancement (already used by `optimizeRecipe`)
- Use `simulateCraft()` from `solver/worker.ts` for cheap pre-filtering
- Reuse `priceMap` from Phase 4 — no separate market queries
- Use `getGearset(recipe.job)` callback for per-job gearset resolution

### Market Price Query Expansion

Phase 4 price query must include food/medicine item IDs alongside material IDs. Gate this on the trigger condition: only add food/medicine IDs when the user has NOT selected food or medicine. This avoids unnecessary lookups in the common case.

## UI Design

### Independent Tip Card (below CostSummaryPanel)

Displayed only when `buffRecommendation` exists and `hqMaterialSavings > buffCost`.

**Visual style:**
- Background: `rgba(64, 158, 255, 0.08)` (subtle blue tint)
- Border: `1px solid rgba(64, 158, 255, 0.2)`
- Border-radius: `8px`
- Icon: 💡 lightbulb
- Header: "省錢小提示" in `#a0cfff`

**Content:**
- Main text: "使用 **{food}(HQ/NQ)** + **{medicine}(HQ/NQ)** 可讓 {N} 個配方免用 HQ 材料"
- Detail row: food/medicine cost | HQ material savings | net savings (computed)
- Food/medicine names in gold (#e9c176), savings in green (#67c23a)

**Placement:**
- Stepper layout: between `CostSummaryPanel` and Section 3 (採購材料)
- Classic layout: at the top of the left column, after BatchProgress

## Edge Cases

1. **User selected food/medicine** → skip Phase 4.6-buff entirely
2. **All recipes already isDoubleMax** → skip, no recommendation needed
3. **No combo fixes all deficit recipes** → no recommendation displayed
4. **Food/medicine has no market data** → skip that combo (treat as unavailable)
5. **Net savings ≤ 0** → no recommendation displayed
6. **canHq = false recipes** → excluded from deficit list
7. **Cancelled** → check `isCancelled` before Phase 4.6-buff AND between every solver call inside the loops
8. **Recipes decided as "buy finished"** → excluded from deficit list (already handled by Phase 4.5)
9. **Multi-job batches** → each recipe uses its own job gearset for stat enhancement and solver calls

## Out of Scope (YAGNI)

- No partial recommendations (fixing only some recipes)
- No "apply recommendation" button (text-only tip)
- No suggesting replacements when user already selected food/medicine
- No food/medicine price history or trends

## Verification Plan

1. **Unit test** `evaluateBuffRecommendation()` with mock solver results
2. **Manual test**: run batch with recipes that have small quality deficit (control-limited), verify recommendation appears
3. **Manual test**: run batch with recipes that have huge deficit (no food can fix), verify no recommendation
4. **Manual test**: run batch with food already selected, verify no recommendation
5. **Cost verification**: manually calculate expected savings, compare with displayed values
6. **Cancellation test**: cancel during buff recommendation phase, verify it stops promptly
7. **Multi-job test**: batch with CRP + BSM recipes, verify correct gearsets are used

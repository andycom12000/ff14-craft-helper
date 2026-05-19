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

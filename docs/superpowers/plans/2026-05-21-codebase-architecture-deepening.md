# Codebase Architecture Deepening — Review & Plan

**Generated:** 2026-05-21
**Skill:** `improve-codebase-architecture`
**Status:** Candidate #1 designed (ready to execute) · #2–#8 backlogged

**Goal:** Backlog of "deepening opportunities" — refactors that turn shallow modules into deep ones, improving testability and AI-navigability. Each candidate has been screened with the deletion test; the strongest one (#1 solver bridge) has been grilled to a concrete shape.

**Glossary:** `improve-codebase-architecture` LANGUAGE.md — module / interface / implementation / depth / seam / adapter / leverage / locality.

---

## Candidate Backlog (Strength-ordered)

| # | Name | Strength | Status |
|---|------|----------|--------|
| 1 | Solver bridge — service-layer façade | 🔥 strongest | **Design ready** ↓ |
| 2 | ~~Feasibility-prefilter + buff-recommender → viability assessment~~ | ❌ debunked | **Closed** — not a real coupling, see below |
| 3 | ~~BOM → shopping-list → self-craft-candidates → materials pipeline~~ | ❌ debunked | **Closed** — three independent deep modules, see below |
| 4 | ADR-0001 stat-stacking enforcement — close 3 remaining leaks | 🟠 strong (low risk, low reward) | backlog |
| 5 | ~~`stores/batch.ts` 576-line dumping ground — encapsulate mutations~~ | ⚠️ mostly debunked | **Closed** — only trivial hygiene left, see below |
| 6 | ~~`hq-optimizer` shallow shell — deepen into `hq-strategy`~~ | ❌ debunked | **Closed** — already a deep single-purpose module, see below |
| 7 | ~~`item-locations` + `item-acquisition` — extract shared fetch+cache factory~~ | ❌ debunked | **Closed** — asymmetric on purpose, see below |
| 8 | ~~`recipe` + `simulator` stores → `recipe-session`~~ | ❌ debunked | **Closed** — clear responsibility split, do not merge, see below |

## Post-grilling Verdict (2026-05-22)

After grilling each candidate against the actual code and applying the deletion test:

- **1 real deepening** — #1 Solver bridge (full design below, ready to execute).
- **2 trivial hygiene leftovers** — #4 has 1 (not 3) real ADR-0001 leak in `useSimulator.ts:78`; #5 has two ~5-line tidy-ups (extract result types, move 2 view computeds into store). Do these alongside #1 if convenient.
- **5 explorer false positives** — #2, #3, #6, #7, #8 all fail the deletion test on close reading. Each closure note below documents *why*, so a future explorer run won't re-suggest the same merges.

**Explorer hit rate: 1/8.** This is a positive signal about the codebase, not a failure of the skill — the architectural guardrails already in place (ADR-0001 canonical entry, worker-pool + telemetry consolidation already done, Pinia stores already have ~17 actions and ~7 getters, deep service modules each with their own caller cluster) leave very few shallow seams to deepen.

**Recurring explorer failure modes observed:**

1. **"Imported together" mistaken for "coupled"** (#2, #3) — verify call edges and shared internal usage, not just import lines in one orchestrator.
2. **Line-range hallucination** (#6) — "decision lives in batch-optimizer:62-86" was actually telemetry + domain-quality-target. Always read the cited lines.
3. **Surface-pattern duplication ignoring deliberate asymmetry** (#7) — different endpoint / cache / failure-mode are usually deliberate UX choices; factor-extracting them costs more than the repetition.
4. **Confusing "responsibility split" with "missing seam"** (#8) — distinct consumer sets is the *point* of separation, not a smell.

**Next steps:** Execute Candidate #1 (Chunk 1 → 2 → 3 below). Optionally fold #4 and #5 hygiene fixes into the same branch — they touch adjacent files and add ~10 lines of change.

---

## Backlog Detail (Candidates #2–#8)

### #2 — Feasibility-prefilter ↔ Buff-recommender (CLOSED — debunked during grilling)

**Original hypothesis:** Merge `feasibility-prefilter.ts` + `buff-recommender.ts` into `craft-viability.ts` — they were assumed to be an always-called pair where prefilter is a 1-solve fast veto for the 44-solve recommender.

**Why it fails on closer reading:**

1. **`feasibility-prefilter.canReachHQQuality` is not a "1-solve veto"** — it's a pure closed-form upper-bound estimate (`baseQuality × 25 × (cp/18) × 1.10 ≥ recipe.quality`). No WASM, no `async`, ~12 lines of arithmetic.
2. **`buff-recommender` does NOT call `canReachHQQuality`.** Grep confirms zero internal reference. The two modules are independent.
3. **`feasibility-prefilter` has a second caller** — `self-craft-candidates.ts:200` — using `canReachHQQuality` for its own quality pre-check. It is not buff-recommender's helper.
4. **`buff-recommender` (334 lines) is already a reasonably deep module** — 4 exports, 9 private helpers, single main entrypoint `evaluateBuffRecommendation`. Surface is not wide.

**What's actually here (smaller candidate, lower priority):** `feasibility-prefilter.ts`'s name leaks its batch-optimizer use context ("prefilter" is a phase name in `batch-optimizer`). Semantically the file is a quality-ceiling math toolkit, sibling to `engine/quality.ts`. A rename + move (e.g. `engine/quality-ceiling.ts`) would clarify locality but yields no behaviour change — leave it on the housekeeping shelf, not the deepening list.

**Lesson for explorer:** "Two modules imported together in one orchestrator" ≠ coupling. Verify call edges before claiming a pair.

### #3 — BOM → shopping-list → self-craft-candidates (CLOSED — debunked during grilling)

**Original hypothesis:** Collapse `bom-calculator` + `shopping-list` + `self-craft-candidates` into one `materials-pipeline.ts` — assumed to be a 3-segment pipeline `batch-optimizer` orchestrates.

**Why it fails on closer reading:**

1. **`batch-optimizer.ts` does NOT import `bom-calculator`** at all. Grep returns zero hits. The supposed "fixed call sequence in batch-optimizer" through all three is fiction.
2. **Each module has its own independent caller cluster:**
   - `bom-calculator.ts` → consumed primarily by `BomView` + 4 BOM components, *plus* `self-craft-candidates` internally. It is the BOM page's core service.
   - `self-craft-candidates.ts` → single caller (`batch-optimizer`), already a deep module with one main entrypoint `produceSelfCraftCandidates`.
   - `shopping-list.ts` → consumed by `batch-optimizer`, `self-craft-candidates`, `batch` store, and 3 batch components.
3. **All three pass the deletion test independently** — removing any of them concentrates complexity, not the *combined* complexity that the merge hypothesis required.

**Smaller real candidate found (hygiene, not deepening):** `shopping-list.ts` (284 lines) mixes two roles — 8 type/constant exports (consumed widely as shape carriers) and 10 logic functions. Splitting types into `services/shopping-list.types.ts` (or `types/batch-materials.ts`) would let stores and components import types without pulling logic in. Low risk, low yield, **not on the deepening track** — file under housekeeping.

**Lesson:** "Three files in the same batch flow" ≠ pipeline. Verify the import graph before claiming a sequence exists — `batch-optimizer` only imports two of the three, and both downstream modules each have their own independent reason to exist.

### #4 — ADR-0001 stat-stacking: enforcement leak in 1 spot (downgraded)

- **Files:** `src/composables/useSimulator.ts:78`
- **Symptom:** ADR-0001 says non-test callers must go through `gearsetToBuffedStats` / `recipeToCraftParams`. `useSimulator.ts:78` still composes Soul + food + medicine inline instead of going through `gearsetToBuffedStats`.
- **Re-verified during #2 grilling — the original list had 2 false positives:**
  - **`buff-recommender.ts:53` is NOT a leak.** Reading line 238 confirms `baseStats: EnhancedStats = gearsetToBuffedStats(ceilingGearset, undefined)` is computed first; `applyCombo` then stacks food+medicine on top of the souled base. This **is** the canonical ADR-0001 order (Soul → food → medicine), just split into two steps for combo enumeration.
  - **`FoodMedicine.vue:48,68-69` is intentional.** The UI legitimately displays the three-stage breakdown (after-Soul / after-food / after-medicine) — inline composition is the simplest way to show it. Only worth touching if we expose a `gearsetToBuffedStatsBreakdown` helper from `stat-stacking.ts` and the component consumes it (cosmetic — defer).
- **Deletion test:** N/A — this is an ADR-execution task, not a module merge.
- **Hypothesis / fix:** Replace inline stacking in `useSimulator.ts:78` with `gearsetToBuffedStats(gearset.value, buffs)`, or factor out a tiny `useBuffedStats(gearset, buffs)` composable.

### #5 — `stores/batch.ts` is a 576-line typed bag (CLOSED — mostly debunked, two trivial fixes remain)

**Original claims vs reality after reading the store:**

| Claim | Reality |
|---|---|
| "Views write `batchStore.results!.todoList[i].done = true`" | ❌ Grep finds zero such mutations. `BatchView.vue:272` does `batchStore.results = results` — a one-shot commit when the batch finishes, not a leak. |
| "Store has no actions" | ❌ Store exposes **17+ actions** — `addTarget` / `removeTarget` / `toggleSelfCraft` / `markSelfCraftDone` / `toggleNpcPurchase` / `markNpcPurchaseDone` / `setBulkQuality` / `setQualityOverride` / `clearResults` / `cancel` / `resetAll` / `toggleShoppingItem` / `selectAllSelfCraft` / `setCalcMode` / `toggleSelfMake` / etc. |
| "Store has no getters" | ❌ Store exposes **7 getters**, three of which (`finalShoppingItems`, `finalCrystals`, `finalTodoList`) are 30–70 lines each and already absorb the derived-state logic (quick-buy quality projection, NPC commit override, semi-finished injection). Quite deep, actually. |
| "Views do business logic the store should own" | ⚠️ Only 2 small computeds — `hasSuggestions` and `suggestionsCount` at `BatchView.vue:62/72`. Should move down to the store, but trivial. |

**Real residue (hygiene, not deepening):**

1. The 9 result-type interfaces (`BatchTarget`, `BatchException`, `TodoItem`, `BuyFinishedDecision`, `SelfCraftCandidate`, `BuffPriceInfo`, `BuffRecommendation`, `NpcPurchaseCandidate`, `BatchResults`) are co-located with store state, inflating the file to 576 lines. Move them to `src/types/batch-results.ts` so the store file is state + actions only.
2. Move `hasSuggestions` / `suggestionsCount` from `BatchView.vue` into the store as getters (~5 lines total).

**Deletion test:** Doing both fixes doesn't concentrate complexity — it just shuffles file boundaries and tidies import paths. **Not a deepening.** File under housekeeping; do alongside #1 execution if convenient.

**Lesson:** "Big store file with state ref typed as a complex result object" ≠ "no encapsulation". Read the API surface before claiming it has none.

### #6 — `hq-optimizer` shallow shell (CLOSED — debunked during grilling)

**Original hypothesis:** `hq-optimizer.ts` is a shallow shell; the real HQ decision (`recipe.canHq`, `solverConfig.hq_target`, double-max check, fallback-to-self-craft) is scattered across `batch-optimizer:62-86`. Widen into `hq-strategy.ts`.

**Why it fails on closer reading:**

1. **`hq-optimizer.ts` (109 lines) is already a single-purpose deep module.** One export (`findOptimalHqCombinations`), pure arithmetic — cartesian odometer, `calculateInitialQuality` check, cost rank, sort. Cleanly self-contained.
2. **`batch-optimizer:62-86` does not hold "HQ decision logic" as described:**
   - Lines 62-70 are a `[bperf-prefilter]` debug log comparing the closed-form prediction vs the actual solve. **Pure telemetry**, not decision logic.
   - Lines 72-86 compute the `isDoubleMax` quality target across three documented domain cases (`canHq` / tribe-quest `requiredQuality` / furniture progress-only). The inline comments explain why each case exists. **Domain semantics, not branching mess.**
3. **The actual call to `findOptimalHqCombinations` lives at lines 92-115** — a single `if (isDoubleMax) return ...; else <run hq-optimizer>`. Three lines, one decision.
4. **The "fallback to self-craft" referenced in the hypothesis is not in this region** — self-craft is a separate phase at `batch-optimizer:446`. Explorer conflated unrelated regions.

**Deletion test:** Deleting `hq-optimizer.ts` pushes ~60 lines of cartesian loop into `batch-optimizer`. Complexity concentrates → module earns its keep, **and** is already at the right depth. No deepening to do.

**Lesson:** A "shallow module + decision elsewhere" claim must point at concrete code. The decision-scattering described here doesn't exist — explorer hallucinated a coupling by reading line ranges without verifying what they actually contain.

### #7 — Garland-tools fetch duplication (CLOSED — debunked during grilling)

**Original hypothesis:** Both files hit the same garlandtools endpoint with the same inflight + cache pattern. Extract a `garland-item-fetch.ts` factory, or merge into one fetch returning `{ locations, acquisition }`.

**Why it fails on closer reading:**

| Axis | item-locations.ts (229) | item-acquisition.ts (112) | Why different |
|---|---|---|---|
| Endpoint | `garlandtools.cn/db/doc/item/chs/3` | `garlandtools.org/db/doc/item/en/3` | Explicit comment: chs schema includes `c` (coords) on partials; en/3 omits them. Locations need chs for gather-node coords. |
| Cache | LRU 500-cap with `accessOrder` array | Plain `Map`, no cap | Locations are bulky shape (coords × multiple sources); acquisition is 4 boolean flags + a price. Memory-pressure profiles diverge. |
| Failure mode | Do **not** cache failures (retry next call) | Cache a permissive default (`{canMarket:true, canGather:true, canNpc:true}`) | Locations: silence is safer than fake data. Acquisition: permissive avoids hiding valid chips in BOM UI. Both are deliberate UX choices. |
| Parser | 60 lines — vendors + 3 gather sources (nodes/fishingSpots/spearfishingSpots) + coord coercion + nodeType inference | 25 lines — boolean flags + `99999` sentinel filter for tradeShop-only items | Completely different domain shape. |

**Surface overlap is ~30 lines** — `inflight Map + concurrency=6 worker pool batch fetcher`. Extracting a generic factory to absorb the diverging cache/failure/parser axes would require ~6 generic parameters, ending up more complex than either file. Classic premature-abstraction trap.

**Deletion test on the (hypothetical) factory:** the factory would not concentrate complexity; the two consumers would each still hold their own cache impl, parser, and failure policy. The "common pattern" is too thin to deepen.

**Verdict:** The 30-line repetition is the right cost. Leave both files independent.

### #8 — `recipe` + `simulator` store split (CLOSED — debunked, do not merge)

**Original hypothesis:** The "session" concept is implicit and split across two stores; merge into `recipe-session.ts`.

**Why it fails on closer reading:**

The two stores have **clearly distinct responsibilities** with non-overlapping consumer sets:

- **`stores/recipe.ts` (122 lines)** — recipe **navigation**. Owns `currentRecipe` + `simulationQueue` + analytics. Consumed by batch flow, BOM drilldown, company-craft picker, simulator, deep-link routing.
- **`stores/simulator.ts` (253 lines)** — simulator **state machine**. Owns `actions`, `conditions`, 200-entry undo `history`/`future`, per-recipe `stateMap` cache, manual-mode stateful expert chips (`pendingBuffDurationBonus`, `forcedNextCondition`, Primed/GoodOmen plumbing). Consumed only by SimulatorView + `useSimulator`.

**Why merging is actively bad** — `batch`, `BOM`, `company-craft`, `dashboard` flows all consume `currentRecipe` but have **no business knowing about manual-mode undo history or Primed-buff timers**. Merging would force them to import a fat store containing simulator state machinery they don't use, leaking simulator concerns into unrelated flows.

**The `useSimulator.ts` watch (`watch(recipe.id, simStore.switchToRecipe)`) is exactly what composables are for** — coordinating multiple independent stores at the consumer site. It's not a code smell; it's the right shape.

**Deletion test:** merging the two would shuffle ~375 lines into one file *and* break the encapsulation that keeps simulator state away from non-simulator callers. Complexity moves outward (to all consumers), not inward.

**Verdict:** Do not merge. Original "defer" recommendation was correct — and on inspection, this isn't even a deferred-merge; it shouldn't be merged at all.

---

# Candidate #1 — Solver Bridge Deepening (Detailed Design)

**Goal:** Hide the WASM solver's `(Recipe + Gearset + Buffs) → CraftParams → SolverConfig → solveCraft / simulateCraft` marshalling from the 3 service callers. Move ADR-0001 canonical entry `recipeToCraftParams` to its semantic home. Replace `SOLVE_CANCELLED` magic string with an `Error` subclass.

**Scope (A1 — service layer only):** UI components (`SolverPanel`, `CraftRecommendation`, `BenchPanel`, `useSimulator`) keep using the low-level API because they need `waitForWasm` / `getWasmStatus` / progress wiring. Only the 3 service callers move to the high-level façade.

## Grilling Decisions

| Branch | Choice |
|---|---|
| **A — scope** | A1 — services only; UI keeps low-level imports |
| **S — API shape** | S1 — flat helper exports in one new file `src/solver/api.ts` |
| **C — `recipeToCraftParams` home** | C2 — move to `src/services/stat-stacking.ts` (ADR-0001's implementation file) |
| **D — cancel signal** | D2 — `class SolveCancelledError extends Error`; `SOLVE_CANCELLED` constant deleted after callers migrate |

## Caller-by-caller Use Matrix (current vs after)

| Caller | solve | simulate | simulate-detail | waitForWasm | cancel | Migration |
|---|---|---|---|---|---|---|
| batch-optimizer | ✅ many | ✅ | | ✅ | ✅ (string) | high-level + `SolveCancelledError` |
| buff-recommender | ✅ 44× | ✅ | | | | high-level |
| self-craft-candidates | | ✅ | | | | high-level (simulate only) |
| useSimulator | | | ✅ | ✅ | | unchanged (UI) |
| SolverPanel | ✅ | | | ✅ | ✅ | unchanged (UI) |
| CraftRecommendation | | ✅ | | ✅ | | unchanged (UI) |
| BenchPanel | | | | ✅ | | unchanged (UI) |
| BatchView / batch store | | | | | ✅ | only swap `SOLVE_CANCELLED` import → `SolveCancelledError` |

## File Structure

### New File

| File | Responsibility |
|------|----------------|
| `src/solver/api.ts` | High-level façade — `solveCraftForRecipe`, `simulateCraftForRecipe`, re-export `SolveCancelledError`. Owns the `Recipe + Gearset + Buffs → SolverConfig → worker` marshalling so service callers stop doing it. |

### Modified Files

| File | Change |
|------|--------|
| `src/solver/worker.ts` | Add `export class SolveCancelledError extends Error`; `cancelSolve()` rejects pending promises with `new SolveCancelledError()` instead of `new Error(SOLVE_CANCELLED)`; **delete** `SOLVE_CANCELLED` export after all callers migrated. |
| `src/solver/config.ts` | **Remove** `recipeToCraftParams` (move to `services/stat-stacking.ts`). Keep `craftParamsToSolverConfig` + `SolverSkillOptions` (pure marshal). |
| `src/services/stat-stacking.ts` | **Add** `recipeToCraftParams` (migrated from `solver/config.ts`). This file becomes the ADR-0001 implementation home for both `gearsetToBuffedStats` and `recipeToCraftParams`. |
| `src/services/batch-optimizer.ts` | Replace imports: `solveCraft` / `simulateCraft` / `SOLVE_CANCELLED` from `@/solver/worker` + `craftParamsToSolverConfig` / `recipeToCraftParams` from `@/solver/config` → `solveCraftForRecipe` / `simulateCraftForRecipe` / `SolveCancelledError` from `@/solver/api`. Replace `err.message === SOLVE_CANCELLED` with `err instanceof SolveCancelledError`. |
| `src/services/buff-recommender.ts` | Same migration pattern. |
| `src/services/self-craft-candidates.ts` | Replace `simulateCraft` + `craftParamsToSolverConfig` + `recipeToCraftParams` imports with `simulateCraftForRecipe` from `@/solver/api`. |
| `src/views/BatchView.vue` (line 11) | `import { SOLVE_CANCELLED }` → `import { SolveCancelledError }`; update `err.message ===` site to `instanceof`. |

### Test File Changes

| File | Change |
|------|--------|
| `src/__tests__/solver/config.test.ts` | Update `recipeToCraftParams` import path to `@/services/stat-stacking`. `craftParamsToSolverConfig` test path unchanged. |
| `src/__tests__/services/stat-stacking-parity.test.ts` | Same import-path update for `recipeToCraftParams`. |
| `src/__tests__/services/batch-optimizer.test.ts` | Continue mocking `solveCraft` / `simulateCraft` at the worker layer (the façade is pure marshalling — no value testing it). Update `SOLVE_CANCELLED` assertion to `SolveCancelledError`. |
| `src/__tests__/services/buff-recommender.test.ts` | Same — keep mock at worker layer. |
| `src/__tests__/services/self-craft-candidates.test.ts` | Same. |
| `src/__tests__/services/buff-verify.test.ts` | Same. |

**No new test files.** `solveCraftForRecipe` / `simulateCraftForRecipe` are pure marshalling — correctness is covered by the type system + existing parity tests (`stat-stacking-parity.test.ts`) + `config.test.ts`. An extra façade-level test would have no leverage.

## Deepened Module Shape (sketch)

```ts
// src/solver/api.ts
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { FoodBuff } from '@/engine/food-medicine'
import type { SolverResultWithTiming, SimulateResult } from './raphael'
import { solveCraft, simulateCraft } from './worker'
import { craftParamsToSolverConfig, type SolverSkillOptions } from './config'
import { recipeToCraftParams } from '@/services/stat-stacking'

export { SolveCancelledError } from './worker'

export interface CraftRequestOptions extends SolverSkillOptions {
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null }
  strictQuality?: boolean              // → SolverConfig.strict_quality
  onProgress?: (percent: number) => void
}

export function solveCraftForRecipe(
  recipe: Recipe,
  gearset: GearsetStats,
  options: CraftRequestOptions = {},
): Promise<SolverResultWithTiming> {
  const { buffs, onProgress, strictQuality, ...skills } = options
  const params = recipeToCraftParams(recipe, gearset, buffs)
  const config = craftParamsToSolverConfig(params, skills)
  if (strictQuality) (config as any).strict_quality = true
  return solveCraft(config, onProgress)
}

export interface SimulateRequestOptions
  extends Omit<CraftRequestOptions, 'onProgress' | 'strictQuality'> {
  actions: string[]
  conditions?: string[]
}

export function simulateCraftForRecipe(
  recipe: Recipe,
  gearset: GearsetStats,
  options: SimulateRequestOptions,
): Promise<SimulateResult> {
  const { buffs, actions, conditions, ...skills } = options
  const params = recipeToCraftParams(recipe, gearset, buffs)
  const config = craftParamsToSolverConfig(params, skills)
  return simulateCraft(config, actions, conditions)
}
```

```ts
// src/solver/worker.ts — additions
export class SolveCancelledError extends Error {
  constructor(message = '求解已取消') { super(message); this.name = 'SolveCancelledError' }
}

// cancelSolve(): for (const [, pending] of pendingRequests) pending.reject(new SolveCancelledError())
// disposeWorker() can keep generic Error — it's not triggered by user cancel.
```

## What sits behind the seam after deepening

| Service callers previously had to know | After |
|---|---|
| `recipeToCraftParams` ADR-0001 stacking order | hidden in `api.ts` |
| `craftParamsToSolverConfig` TrainedEye / expert / adversarial rules | hidden in `api.ts` |
| `SolverConfig` snake_case field names / `strict_quality` | hidden in `api.ts` |
| `solveCraft(config, onProgress)` progress callback signature | hidden in `api.ts` |
| `SOLVE_CANCELLED` magic string | replaced by `instanceof SolveCancelledError` |
| `waitForWasm` / `getWasmStatus` | **NOT hidden** — UI components still consume |
| worker pool / telemetry / fail-state | already hidden today, no change |

## Deletion Test Verification

If `src/solver/api.ts` were deleted:
- Each of the 3 service callers re-acquires 3–4 lines of `recipeToCraftParams + craftParamsToSolverConfig + solveCraft` marshalling.
- `SolveCancelledError` import is lost; callers regress to string comparison.
- ADR-0001 canonical entry's single point of consumption from service layer is lost.

**Complexity concentrates** if kept → confirms the module earns its keep.

## Documentation Side-effects

- **No new domain vocabulary** — recipe / gearset / buffs / craft are all existing. **No `CONTEXT.md` update needed.**
- Consistent with ADR-0001 (in fact, this refactor *strengthens* the ADR by moving `recipeToCraftParams` into the implementation file). **No new ADR needed.**

---

## Execution Chunks

### Chunk 1: Move `recipeToCraftParams` + add `SolveCancelledError`

- [ ] **Task 1.1** — Move `recipeToCraftParams` from `src/solver/config.ts` to `src/services/stat-stacking.ts`. Keep the existing JSDoc referring to ADR-0001 with it.
- [ ] **Task 1.2** — Update the 2 test files' import paths:
  - `src/__tests__/solver/config.test.ts`
  - `src/__tests__/services/stat-stacking-parity.test.ts`
- [ ] **Task 1.3** — Add `export class SolveCancelledError extends Error` in `src/solver/worker.ts`; change `cancelSolve()` to reject with `new SolveCancelledError()`. Keep `SOLVE_CANCELLED` constant for now (delete in Chunk 3).
- [ ] **Task 1.4** — Run unit tests; verify all green.

### Chunk 2: Build `src/solver/api.ts` and migrate the 3 service callers

- [ ] **Task 2.1** — Create `src/solver/api.ts` with `solveCraftForRecipe`, `simulateCraftForRecipe`, re-exported `SolveCancelledError`. (See sketch above; finalise `CraftRequestOptions` field naming during impl — esp. `strictQuality` vs `strict_quality`.)
- [ ] **Task 2.2** — Migrate `src/services/batch-optimizer.ts`: replace imports + call sites; swap `err.message === SOLVE_CANCELLED` → `err instanceof SolveCancelledError`.
- [ ] **Task 2.3** — Migrate `src/services/buff-recommender.ts`.
- [ ] **Task 2.4** — Migrate `src/services/self-craft-candidates.ts`.
- [ ] **Task 2.5** — Update affected test files (`batch-optimizer.test.ts`, `buff-recommender.test.ts`, `self-craft-candidates.test.ts`, `buff-verify.test.ts`) — they keep mocking `solveCraft` / `simulateCraft` at the worker layer; just update the `SOLVE_CANCELLED` assertion to `SolveCancelledError`.
- [ ] **Task 2.6** — Run unit tests; verify all green.

### Chunk 3: Finalise — drop `SOLVE_CANCELLED`

- [ ] **Task 3.1** — Update `src/views/BatchView.vue` (line 11) — swap `SOLVE_CANCELLED` import for `SolveCancelledError`; update the comparison site.
- [ ] **Task 3.2** — Delete `export const SOLVE_CANCELLED` from `src/solver/worker.ts`.
- [ ] **Task 3.3** — Grep the repo for any remaining `SOLVE_CANCELLED` references; they should all be gone (including tests, batch store, batch view).
- [ ] **Task 3.4** — Run unit tests + dev server smoke check (batch a simple recipe, cancel mid-flight, verify the cancellation UX still triggers correctly).

### Chunk 4 (optional): Lint pass

- [ ] **Task 4.1** — Verify `src/solver/config.ts` only exports `craftParamsToSolverConfig` and `SolverSkillOptions` — no other dead exports.
- [ ] **Task 4.2** — Confirm no service file still imports from `@/solver/worker` or `@/solver/config` directly (only `@/solver/api`).

## Verification Checklist

- [ ] All existing tests pass (no new tests added).
- [ ] `npm run dev` boots; batch optimization runs end-to-end on a real recipe.
- [ ] Cancelling a batch mid-flight surfaces as expected (no console errors, batch view shows the cancellation state correctly).
- [ ] Grep confirms zero remaining `SOLVE_CANCELLED` references after Chunk 3.
- [ ] `recipeToCraftParams` is exported from `@/services/stat-stacking` only.

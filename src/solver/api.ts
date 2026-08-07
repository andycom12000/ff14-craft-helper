/**
 * Service-layer façade for the WASM solver.
 *
 * Hides the `Recipe + Gearset + Buffs → CraftParams → SolverConfig → worker`
 * marshalling from service callers (batch-optimizer, buff-recommender,
 * self-craft-candidates). Stat stacking goes through the ADR-0001 canonical
 * entry `recipeToCraftParams` in `services/stat-stacking.ts`.
 *
 * UI components that need `waitForWasm` / `getWasmStatus` / progress wiring
 * keep consuming `@/solver/worker` directly — they're out of scope for this
 * façade.
 */
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { FoodBuff } from '@/engine/food-medicine'
import type { SolverResultWithTiming, SimulateResult } from './raphael'
import { solveCraft, simulateCraft } from './worker'
import { craftParamsToSolverConfig, type SolverSkillOptions } from './config'
import { recipeToCraftParams } from '@/services/stat-stacking'
import { computeRecipeTaxonomy } from '@/utils/recipe-taxonomy'

export { SolveCancelledError } from './worker'

export interface CraftRequestOptions extends SolverSkillOptions {
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null }
  /** Override initial quality from HQ sub-materials (default 0). */
  initialQuality?: number
  /** When true, sets SolverConfig.strict_quality (disables non-max-quality solutions). */
  strictQuality?: boolean
  onProgress?: (percent: number) => void
  /** Abort handle (#132): aborting terminates the worker slot running this
   *  request and frees the pool, instead of letting a runaway WASM solve hold it. */
  signal?: AbortSignal
  /**
   * Override the human/machine `source` tag (#198). Defaults to `'machine'` —
   * MOST callers are machine loops (batch-optimizer, buff-recommender,
   * meld-advisor's reverse search) — but that is NOT a hard invariant of this
   * façade. `useMeldPlayground`'s forward "試算台" is a direct, one-shot
   * user action (one click → one solve, no loop/watcher — `markStaleAfterEdit`
   * even forces the user to press "重新試算" after every edit, same shape as
   * SolverPanel's own "求解" button) and MUST pass `source: 'user'` here.
   */
  source?: 'user' | 'machine'
}

export function solveCraftForRecipe(
  recipe: Recipe,
  gearset: GearsetStats,
  options: CraftRequestOptions = {},
): Promise<SolverResultWithTiming> {
  const { buffs, onProgress, strictQuality, initialQuality, signal, source, ...skills } = options
  const params = recipeToCraftParams(recipe, gearset, buffs, initialQuality)
  const config = craftParamsToSolverConfig(params, skills)
  if (strictQuality !== undefined) config.strict_quality = strictQuality
  // #198: taxonomy is set for every façade caller (previously never set at
  // all). `source` defaults to 'machine' — the common case for this façade —
  // but callers whose solve is actually user-initiated MUST override via
  // `options.source` (see CraftRequestOptions.source doc above). Tagging
  // explicitly rather than relying on an implicit invariant keeps the
  // pipeline's human/machine discriminator honest now that taxonomy is
  // universal.
  const tax = computeRecipeTaxonomy(recipe)
  config.taxonomy = {
    rlv: tax.rlv, stars: tax.stars, is_expert: tax.is_expert,
    is_collectable: tax.is_collectable, craft_kind: tax.craft_kind,
  }
  config.source = source ?? 'machine'
  return solveCraft(config, onProgress, signal)
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
  const { buffs, actions, conditions, initialQuality, signal, ...skills } = options
  const params = recipeToCraftParams(recipe, gearset, buffs, initialQuality)
  const config = craftParamsToSolverConfig(params, skills)
  return simulateCraft(config, actions, conditions, signal)
}

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

export { SolveCancelledError } from './worker'

export interface CraftRequestOptions extends SolverSkillOptions {
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null }
  /** When true, sets SolverConfig.strict_quality (disables non-max-quality solutions). */
  strictQuality?: boolean
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
  if (strictQuality) config.strict_quality = true
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

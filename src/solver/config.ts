import type { CraftParams } from '@/engine/simulator'
import type { SolverConfig } from '@/solver/raphael'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

export interface SolverSkillOptions {
  useManipulation?: boolean
  useHeartAndSoul?: boolean
  useQuickInnovation?: boolean
  useTrainedEye?: boolean
}

/**
 * Convert CraftParams to SolverConfig for the WASM solver.
 *
 * Skill defaults match SolverPanel.vue:
 * - Manipulation, HeartAndSoul, QuickInnovation are expert-only skills → default OFF
 * - TrainedEye → default ON but auto-disabled if crafter level < recipe level + 10
 */
export function craftParamsToSolverConfig(
  params: CraftParams,
  skills: SolverSkillOptions = {},
): SolverConfig {
  const {
    useManipulation = false,
    useHeartAndSoul = false,
    useQuickInnovation = false,
    useTrainedEye = true,
  } = skills

  // TrainedEye requires crafter level >= recipe level + 10
  const canUseTrainedEye = params.crafterLevel >= params.recipeLevelTable.classJobLevel + 10

  return {
    recipe_level: params.recipeLevelTable.classJobLevel,
    stars: params.recipeLevelTable.stars,
    progress: params.recipeLevelTable.difficulty,
    quality: params.recipeLevelTable.quality,
    durability: params.recipeLevelTable.durability,
    cp: params.cp,
    craftsmanship: params.craftsmanship,
    control: params.control,
    crafter_level: params.crafterLevel,
    progress_divider: params.recipeLevelTable.progressDivider,
    quality_divider: params.recipeLevelTable.qualityDivider,
    progress_modifier: params.recipeLevelTable.progressModifier,
    quality_modifier: params.recipeLevelTable.qualityModifier,
    hq_target: params.canHq,
    initial_quality: params.initialQuality,
    use_manipulation: useManipulation,
    use_heart_and_soul: useHeartAndSoul,
    use_quick_innovation: useQuickInnovation,
    use_trained_eye: useTrainedEye && canUseTrainedEye,
  }
}

export function recipeToCraftParams(recipe: Recipe, gearset: GearsetStats): CraftParams {
  return {
    craftsmanship: gearset.craftsmanship,
    control: gearset.control,
    cp: gearset.cp,
    crafterLevel: gearset.level,
    recipeLevelTable: recipe.recipeLevelTable,
    canHq: recipe.canHq,
    initialQuality: 0,
  }
}

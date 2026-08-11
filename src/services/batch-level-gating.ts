import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { BatchTarget } from '@/stores/batch.types'
import type { LevelSyncTables } from '@/services/local-data-source'
import { syncRecipeToCrafterLevel } from '@/engine/level-sync'
import { checkLevelGate } from '@/services/recipe-gating'

export interface LeveledTarget {
  recipe: Recipe
  gearsetLevel: number
}

export interface PartitionedLevelTargets {
  hard: LeveledTarget[]
  soft: LeveledTarget[]
}

/**
 * Targets below recipe level, partitioned by whether the recipe has hard gates.
 * - hard: starred / expert / stat-gated — synthesis blocked in-game.
 * - soft: standard 0-star — synthesis allowed, just penalized.
 *
 * ADR 0003 (level-sync junction): batch targets carry canonical (unsynced)
 * recipes. Each target must be synced to *its own job's* gearset level before
 * being classified — otherwise a level-synced recipe (all 768 of which ship
 * as Lv100 / rlv 690 / 0-star / no hard gates) reads as "soft" gated against
 * a low-level gearset even though the synced form is fully within the
 * crafter's reach. That produces a false "等級偏低" banner in BatchView that
 * contradicts BatchRecipeCard below it, which already syncs for display.
 */
export function partitionLevelTargets(
  targets: BatchTarget[],
  getGearset: (job: string) => GearsetStats | null,
  levelSyncTables: LevelSyncTables | null,
): PartitionedLevelTargets {
  const hard: LeveledTarget[] = []
  const soft: LeveledTarget[] = []
  for (const t of targets) {
    const gs = getGearset(t.recipe.job)
    if (!gs) continue
    if (gs.craftsmanship === 0 && gs.control === 0) continue
    const synced = syncRecipeToCrafterLevel(t.recipe, gs.level, levelSyncTables)
    const kind = checkLevelGate(synced, gs.level).kind
    if (kind === 'hard') hard.push({ recipe: synced, gearsetLevel: gs.level })
    else if (kind === 'soft') soft.push({ recipe: synced, gearsetLevel: gs.level })
  }
  return { hard, soft }
}

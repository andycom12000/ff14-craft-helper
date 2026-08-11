import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { trackEvent } from '@/utils/analytics'
import { emitLargeQueueInSimulator } from '@/composables/useFunnelMisuseDetector'
import { computeRecipeTaxonomy, flattenTaxonomyForEvent } from '@/utils/recipe-taxonomy'

export type RecipeOpenSource =
  | 'search' | 'queue' | 'batch_target' | 'bom_drilldown'
  | 'company_craft' | 'deep_link' | 'changelog'
  | 'cross_page_send'
  | 'unknown'

export interface Ingredient {
  itemId: number
  name: string
  icon: string
  amount: number
  canHq: boolean
  level: number
}

export interface RecipeLevelTable {
  classJobLevel: number
  stars: number
  difficulty: number
  quality: number
  durability: number
  suggestedCraftsmanship: number
  progressDivider: number
  qualityDivider: number
  progressModifier: number
  qualityModifier: number
}

export interface Recipe {
  id: number
  itemId: number
  name: string
  icon: string
  job: string
  level: number
  stars: number
  canHq: boolean
  materialQualityFactor: number
  // Items produced per craft (food/medicine typically yield 3). Defaults to 1.
  amountResult: number
  ingredients: Ingredient[]
  recipeLevelTable: RecipeLevelTable
  // Sentinel for user-authored recipes; downstream skips Universalis + BOM lookups.
  isCustom?: boolean
  // Hard-gate signals — FFXIV blocks synthesis when any of these are set
  // and the player is below recipe level. Standard 0-star recipes have none
  // of these and only suffer the progress/quality modifier as a soft penalty.
  isExpert?: boolean
  requiredCraftsmanship?: number
  requiredControl?: number
  // Minimum quality required for a non-canHq recipe to be accepted (tribe-quest
  // / event "建造組件" deliverables). 0 means quality is irrelevant; only used
  // when canHq=false. canHq=true recipes always use full max_quality as the
  // double-max threshold and ignore this field.
  requiredQuality?: number
  // GA taxonomy passthrough from RecipeRecord (build-time-derived).
  // Optional for forward compat with future schema additions.
  requiresSpecialist?: boolean
  isCollectable?: boolean      // ← derived from result Item.IsCollectable
  craftKind?: 'normal' | 'quick' | 'expert' | 'company'
  // Real recipe level (RLV index, e.g. 640) from RecipeRecord.rlv — distinct
  // from recipeLevelTable.classJobLevel (the crafter job level, ≤90/100).
  rlv?: number
  // Level-sync passthrough from RecipeRecord. Non-zero = 等級同步配方
  // （宇宙探索 D／C／B 級）：難度依製作者職業等級重新換算，上限為此值。
  maxAdjustableJobLevel?: number
  // Raw RecipeLevelTable multipliers (percent). Needed to recompute
  // difficulty/quality/durability against a different rlv row when syncing.
  difficultyFactor?: number
  qualityFactor?: number
  durabilityFactor?: number
  // The pre-sync `rlv`, carried on a level-synced recipe so GA taxonomy can
  // keep reporting the canonical value. The /admin/ga ToolUsageByRlv chart
  // groups select/simulator by the client-sent rlv but batch/bom by joining
  // recipe_id against today's recipes.json (see ga-snapshot.ts); emitting the
  // synced rlv would scatter these 768 recipes across buckets no row in
  // recipes.json has. Idempotent: re-syncing an already-synced recipe keeps
  // the original. Absent on ordinary recipes, where `rlv` is already canonical.
  canonicalRlv?: number
  // Set by syncRecipeToCrafterLevel ONLY when an actual downgrade happened
  // (synced classJobLevel < original recipe.level — issue #234's badge
  // condition). Drives the recipe-detail badge.
  levelSync?: { syncedLevel: number; originalLevel: number }
}

export const useRecipeStore = defineStore('recipe', () => {
  const currentRecipe = ref<Recipe | null>(null)
  const simulationQueue = ref<Recipe[]>([])

  watch(
    () => simulationQueue.value.length,
    (len) => emitLargeQueueInSimulator(len),
  )

  function setRecipe(recipe: Recipe, source: RecipeOpenSource = 'unknown') {
    currentRecipe.value = recipe
    const taxonomy = flattenTaxonomyForEvent(computeRecipeTaxonomy(recipe))
    trackEvent('recipe_select', {
      recipe_id: recipe.id,
      job: recipe.job,
      level: recipe.level,
      source,
      ...taxonomy,
    })
  }

  function clearRecipe() {
    currentRecipe.value = null
  }

  function addToQueue(recipe: Recipe) {
    if (simulationQueue.value.some(r => r.id === recipe.id)) return
    simulationQueue.value.push(recipe)
    trackEvent('queue_add_recipe', {
      recipe_id: recipe.id,
      queue_size: simulationQueue.value.length,
    })
  }

  function removeFromQueue(recipeId: number) {
    simulationQueue.value = simulationQueue.value.filter(r => r.id !== recipeId)
  }

  function clearQueue() {
    simulationQueue.value = []
  }

  return {
    currentRecipe,
    simulationQueue,
    setRecipe,
    clearRecipe,
    addToQueue,
    removeFromQueue,
    clearQueue,
  }
})

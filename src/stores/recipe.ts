import { defineStore } from 'pinia'
import { ref } from 'vue'
import { trackEvent } from '@/utils/analytics'
import { useMilestonesStore } from '@/stores/milestones'

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
}

export const useRecipeStore = defineStore('recipe', () => {
  const currentRecipe = ref<Recipe | null>(null)
  const simulationQueue = ref<Recipe[]>([])

  function setRecipe(recipe: Recipe) {
    currentRecipe.value = recipe
    trackEvent('recipe_select', {
      recipe_id: recipe.id,
      job: recipe.job,
      level: recipe.level,
    })
    useMilestonesStore().markMilestoneOnce('viewed_recipe')
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

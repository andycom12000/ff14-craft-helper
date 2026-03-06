import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Ingredient {
  itemId: number
  name: string
  icon: string
  amount: number
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
  name: string
  icon: string
  job: string
  level: number
  stars: number
  canHq: boolean
  materialQualityFactor: number
  ingredients: Ingredient[]
  recipeLevelTable: RecipeLevelTable
}

export const useRecipeStore = defineStore('recipe', () => {
  const currentRecipe = ref<Recipe | null>(null)
  const simulationQueue = ref<Recipe[]>([])

  function setRecipe(recipe: Recipe) {
    currentRecipe.value = recipe
  }

  function clearRecipe() {
    currentRecipe.value = null
  }

  function addToQueue(recipe: Recipe) {
    if (simulationQueue.value.some(r => r.id === recipe.id)) return
    simulationQueue.value.push(recipe)
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

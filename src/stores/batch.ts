import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Recipe } from '@/stores/recipe'
import type { MaterialWithPrice as ShoppingItem, ServerGroup, CrystalSummary } from '@/services/shopping-list'
import type { WorldPriceSummary } from '@/api/universalis'

export type { ShoppingItem, ServerGroup, CrystalSummary }

export interface BatchTarget {
  recipe: Recipe
  quantity: number
}

export interface BatchException {
  type: 'level-insufficient' | 'quality-unachievable'
  recipe: Recipe
  message: string
  details: string
  action: 'skipped' | 'buy-finished'
  buyPrice?: number
  buyServer?: string
}

export interface TodoItem {
  recipe: Recipe
  quantity: number
  actions: string[]
  hqAmounts: number[]
  isSemiFinished: boolean
  done: boolean
}

export interface BuyFinishedDecision {
  recipe: Recipe
  quantity: number
  craftCost: number    // per-unit craft cost
  buyPrice: number     // per-unit buy price
  buyServer?: string
}

export interface BatchResults {
  serverGroups: ServerGroup[]
  crystals: CrystalSummary[]
  selfCraftItems: ShoppingItem[]
  todoList: TodoItem[]
  exceptions: BatchException[]
  buyFinishedItems: BuyFinishedDecision[]
  grandTotal: number
  crossWorldCache: Map<number, WorldPriceSummary[]>
}

const defaultProgress = () => ({
  current: 0,
  total: 0,
  currentName: '',
  phase: 'idle' as 'idle' | 'solving' | 'pricing' | 'done',
  solverPercent: 0,
})

export const useBatchStore = defineStore('batch', () => {
  const targets = ref<BatchTarget[]>([])
  const isRunning = ref(false)
  const isCancelled = ref(false)
  const progress = ref(defaultProgress())
  const results = ref<BatchResults | null>(null)

  function addTarget(recipe: Recipe) {
    const existing = targets.value.find(t => t.recipe.id === recipe.id)
    if (existing) {
      existing.quantity += 1
    } else {
      targets.value.push({ recipe, quantity: 1 })
    }
  }

  function removeTarget(recipeId: number) {
    targets.value = targets.value.filter(t => t.recipe.id !== recipeId)
  }

  function updateQuantity(recipeId: number, quantity: number) {
    const target = targets.value.find(t => t.recipe.id === recipeId)
    if (target) target.quantity = quantity
  }

  function clearTargets() {
    targets.value = []
  }

  function clearResults() {
    results.value = null
  }

  function cancel() {
    isCancelled.value = true
  }

  function resetAll() {
    isCancelled.value = true
    targets.value = []
    results.value = null
    isRunning.value = false
    progress.value = defaultProgress()
  }

  return {
    targets,
    isRunning,
    isCancelled,
    progress,
    results,
    addTarget,
    removeTarget,
    updateQuantity,
    clearTargets,
    clearResults,
    cancel,
    resetAll,
  }
})

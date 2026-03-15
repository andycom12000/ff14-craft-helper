import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Recipe } from '@/stores/recipe'
import type { MaterialWithPrice as ShoppingItem, ServerGroup, CrystalSummary } from '@/services/shopping-list'

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

export interface BatchResults {
  serverGroups: ServerGroup[]
  crystals: CrystalSummary[]
  selfCraftItems: ShoppingItem[]
  todoList: TodoItem[]
  exceptions: BatchException[]
  grandTotal: number
}

export const useBatchStore = defineStore('batch', () => {
  const targets = ref<BatchTarget[]>([])
  const isRunning = ref(false)
  const isCancelled = ref(false)
  const progress = ref({ current: 0, total: 0, currentName: '' })
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
  }
}, {
  persist: {
    pick: ['targets'],
  },
})

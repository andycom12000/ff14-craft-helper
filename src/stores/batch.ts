import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Recipe } from '@/stores/recipe'
import type { MaterialWithPrice as ShoppingItem, ServerGroup, CrystalSummary } from '@/services/shopping-list'
import type { WorldPriceSummary } from '@/api/universalis'
import type { FoodBuff } from '@/engine/food-medicine'

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

export interface BuffRecommendation {
  food: { buff: FoodBuff; isHq: boolean } | null
  medicine: { buff: FoodBuff; isHq: boolean } | null
  buffCost: number
  hqMaterialSavings: number
  affectedRecipes: Array<{ id: number; name: string }>
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
  buffRecommendation?: BuffRecommendation
}

const defaultProgress = () => ({
  current: 0,
  total: 0,
  currentName: '',
  phase: 'idle' as 'idle' | 'solving' | 'pricing' | 'evaluating-buffs' | 'aggregating' | 'done',
  solverPercent: 0,
})

export const useBatchStore = defineStore('batch', () => {
  const targets = ref<BatchTarget[]>([])
  const isRunning = ref(false)
  const isCancelled = ref(false)
  const progress = ref(defaultProgress())
  const results = ref<BatchResults | null>(null)
  const checkedShoppingKeys = ref(new Set<string>())

  const foodId = ref<number | null>(null)
  const foodIsHq = ref(true)
  const medicineId = ref<number | null>(null)
  const medicineIsHq = ref(true)

  /** Total number of shopping items (server groups + self-craft) */
  const shoppingItemCount = computed(() => {
    if (!results.value) return 0
    const keys = new Set<string>()
    for (const g of results.value.serverGroups) {
      for (const item of g.items) keys.add(shoppingKey(item.itemId, item.type, item.isFinishedProduct))
    }
    for (const item of results.value.selfCraftItems) keys.add(shoppingKey(item.itemId, item.type))
    return keys.size
  })

  const shoppingCheckedCount = computed(() => checkedShoppingKeys.value.size)

  const allShoppingDone = computed(() =>
    shoppingItemCount.value > 0 && checkedShoppingKeys.value.size >= shoppingItemCount.value,
  )

  function shoppingKey(itemId: number, type: string, isFinished?: boolean) {
    return isFinished ? `${itemId}-${type}-fp` : `${itemId}-${type}`
  }

  function toggleShoppingItem(itemId: number, type: string, isFinished?: boolean) {
    const key = shoppingKey(itemId, type, isFinished)
    if (checkedShoppingKeys.value.has(key)) {
      checkedShoppingKeys.value.delete(key)
    } else {
      checkedShoppingKeys.value.add(key)
    }
    // Trigger reactivity
    checkedShoppingKeys.value = new Set(checkedShoppingKeys.value)
  }

  function isShoppingChecked(itemId: number, type: string, isFinished?: boolean) {
    return checkedShoppingKeys.value.has(shoppingKey(itemId, type, isFinished))
  }

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
    checkedShoppingKeys.value = new Set()
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
    checkedShoppingKeys.value = new Set()
    foodId.value = null
    foodIsHq.value = true
    medicineId.value = null
    medicineIsHq.value = true
  }

  return {
    targets,
    isRunning,
    isCancelled,
    progress,
    results,
    checkedShoppingKeys,
    foodId,
    foodIsHq,
    medicineId,
    medicineIsHq,
    shoppingItemCount,
    shoppingCheckedCount,
    allShoppingDone,
    addTarget,
    removeTarget,
    updateQuantity,
    clearTargets,
    clearResults,
    cancel,
    resetAll,
    toggleShoppingItem,
    isShoppingChecked,
  }
})

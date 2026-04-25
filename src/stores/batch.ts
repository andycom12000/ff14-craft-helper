import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Recipe } from '@/stores/recipe'
import type { MaterialWithPrice as ShoppingItem, ServerGroup, CrystalSummary, QuickBuyMaterial } from '@/services/shopping-list'
import { isCrystal } from '@/services/shopping-list'
import type { WorldPriceSummary } from '@/api/universalis'
import type { FoodBuff } from '@/engine/food-medicine'
import { cancelSolve } from '@/solver/worker'

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

export interface SelfCraftCandidate {
  itemId: number
  /**
   * @deprecated name is no longer the source of truth for rendering.
   * Components should resolve the current-locale name via useItemName(itemId).
   * This field is kept only as a fallback/debug hint and may be stale after locale change.
   * Kept non-optional pending I-3 consumer migration.
   */
  name: string
  icon: string
  amount: number
  recipe: Recipe
  job: string
  buyCost: number
  craftCost: number
  savings: number
  savingsRatio: number
  actions: string[]
  hqAmounts: number[]
  rawMaterials: ShoppingItem[]
  hqRequired: boolean
  depth: number
}

export interface BuffPriceInfo {
  price: number
  server?: string
}

export interface BuffRecommendation {
  food: { buff: FoodBuff; isHq: boolean } | null
  medicine: { buff: FoodBuff; isHq: boolean } | null
  buffCost: number
  foodPrice?: BuffPriceInfo
  medicinePrice?: BuffPriceInfo
  hqMaterialSavings: number
  /**
   * @deprecated name on affected/enabled recipe entries is no longer the source of truth for rendering.
   * Components should resolve the current-locale name via useItemName(recipeItemId).
   * These fields are kept only as a fallback/debug hint and may be stale after locale change.
   * Kept non-optional pending I-3 consumer migration.
   */
  affectedRecipes: Array<{ id: number; name: string }>
  /** Recipes that were quality-unachievable without buffs but become craftable with them */
  enabledRecipes: Array<{ id: number; name: string }>
}

export interface BatchResults {
  serverGroups: ServerGroup[]
  crystals: CrystalSummary[]
  selfCraftCandidates: SelfCraftCandidate[]
  todoList: TodoItem[]
  exceptions: BatchException[]
  buyFinishedItems: BuyFinishedDecision[]
  grandTotal: number
  crossWorldCache: Map<number, WorldPriceSummary[]>
  buffRecommendation?: BuffRecommendation
  /**
   * Populated only in quick-buy mode. Each entry stores both NQ and HQ
   * pre-priced variants so the ShoppingList view can toggle quality
   * without re-running the pipeline.
   */
  quickBuyMaterials?: QuickBuyMaterial[]
}

const defaultProgress = () => ({
  current: 0,
  total: 0,
  currentName: '',
  phase: 'idle' as 'idle' | 'solving' | 'pricing' | 'evaluating-buffs' | 'evaluating-self-craft' | 'aggregating' | 'done',
  solverPercent: 0,
})

export const useBatchStore = defineStore('batch', () => {
  const targets = ref<BatchTarget[]>([])
  const isRunning = ref(false)
  const isCancelled = ref(false)
  const progress = ref(defaultProgress())
  const results = ref<BatchResults | null>(null)
  const checkedShoppingKeys = ref(new Set<string>())
  const selectedSelfCraftIds = ref<Set<number>>(new Set())
  const doneSelfCraftIds = ref<Set<number>>(new Set())

  const foodId = ref<number | null>(null)
  const foodIsHq = ref(true)
  const medicineId = ref<number | null>(null)
  const medicineIsHq = ref(true)

  // Calculation mode: macro (solver + HQ optimization) vs quick-buy (flat shopping list)
  const calcMode = ref<'macro' | 'quick-buy'>('macro')
  // Per-material overrides to force self-make regardless of optimizer decision
  const selfMakeOverrides = ref<Record<number, boolean>>({})
  // Bulk quality toggle used in quick-buy mode
  const bulkQualityMode = ref<'nq' | 'hq'>('nq')
  // Per-material quality overrides (overrides bulkQualityMode)
  const qualityOverrides = ref<Record<number, 'nq' | 'hq'>>({})
  // Whether to automatically evaluate food/medicine recommendations
  const autoEvaluateBuffs = ref(true)

  /** Total number of shopping items (server groups + self-craft) */
  const shoppingItemCount = computed(() => {
    if (!results.value) return 0
    const keys = new Set<string>()
    for (const g of results.value.serverGroups) {
      for (const item of g.items) keys.add(shoppingKey(item.itemId, item.type, item.isFinishedProduct))
    }
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

  function reorderTargets(fromIndex: number, toIndex: number) {
    const [item] = targets.value.splice(fromIndex, 1)
    targets.value.splice(toIndex, 0, item)
  }

  function clearTargets() {
    targets.value = []
  }

  function clearResults() {
    results.value = null
    checkedShoppingKeys.value = new Set()
    selectedSelfCraftIds.value = new Set()
    doneSelfCraftIds.value = new Set()
  }

  const finalShoppingItems = computed(() => {
    if (!results.value) return [] as ShoppingItem[]
    const selected = selectedSelfCraftIds.value

    // Aggregate by (itemId, type, server) so the same material needed by
    // multiple selected candidates (or by candidates + remaining targets)
    // shows as one row with a summed amount.
    const merged = new Map<string, ShoppingItem>()
    const key = (i: ShoppingItem) => `${i.itemId}|${i.type}|${i.server ?? ''}`
    const push = (item: ShoppingItem) => {
      const k = key(item)
      const existing = merged.get(k)
      if (existing) existing.amount += item.amount
      else merged.set(k, { ...item })
    }

    // Quick-buy mode: project quickBuyMaterials through current quality overrides.
    // Materials without market data at the effective quality are skipped so
    // the row count matches what the pricing pipeline actually found.
    if (results.value.quickBuyMaterials) {
      for (const m of results.value.quickBuyMaterials) {
        const wantHq = !!m.canHq && (qualityOverrides.value[m.itemId] ?? bulkQualityMode.value) === 'hq'
        const priced = wantHq ? m.hq : m.nq
        if (!priced) continue
        push({
          itemId: m.itemId, name: m.name, icon: m.icon, amount: m.amount,
          type: wantHq ? 'hq' : 'nq',
          unitPrice: priced.unitPrice, server: priced.server,
        })
      }
      return Array.from(merged.values())
    }

    for (const g of results.value.serverGroups) {
      for (const item of g.items) {
        if (!selected.has(item.itemId)) push(item)
      }
    }

    // Crystals are surfaced via finalCrystals, not the shopping list.
    for (const c of results.value.selfCraftCandidates) {
      if (!selected.has(c.itemId)) continue
      for (const raw of c.rawMaterials) {
        if (isCrystal(raw.itemId)) continue
        push(raw)
      }
    }
    return Array.from(merged.values())
  })

  // In quick-buy mode serverGroups/grandTotal are computed view-side from
  // finalShoppingItems so the user can toggle NQ/HQ without re-running.
  // Macro mode falls through to the pre-computed results.grandTotal.
  const effectiveGrandTotal = computed(() => {
    if (!results.value) return 0
    if (results.value.quickBuyMaterials) {
      return finalShoppingItems.value.reduce(
        (sum, it) => sum + it.unitPrice * it.amount, 0,
      )
    }
    return results.value.grandTotal
  })

  const finalCrystals = computed<CrystalSummary[]>(() => {
    if (!results.value) return []
    const selected = selectedSelfCraftIds.value
    const map = new Map<number, CrystalSummary>()
    for (const c of results.value.crystals) {
      map.set(c.itemId, { ...c })
    }
    for (const c of results.value.selfCraftCandidates) {
      if (!selected.has(c.itemId)) continue
      for (const raw of c.rawMaterials) {
        if (!isCrystal(raw.itemId)) continue
        const existing = map.get(raw.itemId)
        if (existing) existing.amount += raw.amount
        else map.set(raw.itemId, { itemId: raw.itemId, name: raw.name, amount: raw.amount })
      }
    }
    return Array.from(map.values())
  })

  const finalTodoList = computed<TodoItem[]>(() => {
    if (!results.value) return []
    const selected = selectedSelfCraftIds.value
    const semiFinished: TodoItem[] = []
    for (const c of results.value.selfCraftCandidates) {
      if (!selected.has(c.itemId)) continue
      semiFinished.push({
        recipe: c.recipe,
        quantity: c.amount,
        actions: c.actions,
        hqAmounts: c.hqAmounts,
        isSemiFinished: true,
        done: doneSelfCraftIds.value.has(c.itemId),
      })
    }
    // Sort semi-finished by depth descending so deeper dependencies come first
    semiFinished.sort((a, b) => {
      const da = results.value!.selfCraftCandidates.find(c => c.itemId === a.recipe.itemId)?.depth ?? 0
      const db = results.value!.selfCraftCandidates.find(c => c.itemId === b.recipe.itemId)?.depth ?? 0
      return db - da
    })
    return [...semiFinished, ...results.value.todoList]
  })

  function toggleSelfCraft(itemId: number) {
    const next = new Set(selectedSelfCraftIds.value)
    if (next.has(itemId)) next.delete(itemId)
    else next.add(itemId)
    selectedSelfCraftIds.value = next
  }

  function selectAllSelfCraft() {
    if (!results.value) return
    selectedSelfCraftIds.value = new Set(
      results.value.selfCraftCandidates.map(c => c.itemId),
    )
  }

  function clearSelfCraftSelection() {
    selectedSelfCraftIds.value = new Set()
  }

  function markSelfCraftDone(itemId: number, done: boolean) {
    const next = new Set(doneSelfCraftIds.value)
    if (done) next.add(itemId)
    else next.delete(itemId)
    doneSelfCraftIds.value = next
  }

  function setCalcMode(mode: 'macro' | 'quick-buy') {
    calcMode.value = mode
  }

  function toggleSelfMake(itemId: number) {
    const next = { ...selfMakeOverrides.value }
    next[itemId] = !next[itemId]
    if (!next[itemId]) delete next[itemId]
    selfMakeOverrides.value = next
  }

  function setBulkQuality(mode: 'nq' | 'hq') {
    bulkQualityMode.value = mode
    qualityOverrides.value = {}
  }

  function setQualityOverride(itemId: number, mode: 'nq' | 'hq') {
    const next = { ...qualityOverrides.value }
    next[itemId] = mode
    qualityOverrides.value = next
  }

  function cancel() {
    isCancelled.value = true
    cancelSolve()
  }

  function resetAll() {
    isCancelled.value = true
    cancelSolve()
    targets.value = []
    results.value = null
    isRunning.value = false
    progress.value = defaultProgress()
    checkedShoppingKeys.value = new Set()
    selectedSelfCraftIds.value = new Set()
    doneSelfCraftIds.value = new Set()
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
    calcMode,
    selfMakeOverrides,
    bulkQualityMode,
    qualityOverrides,
    autoEvaluateBuffs,
    shoppingItemCount,
    shoppingCheckedCount,
    allShoppingDone,
    addTarget,
    removeTarget,
    updateQuantity,
    reorderTargets,
    clearTargets,
    clearResults,
    cancel,
    resetAll,
    toggleShoppingItem,
    isShoppingChecked,
    selectedSelfCraftIds,
    doneSelfCraftIds,
    finalShoppingItems,
    finalCrystals,
    effectiveGrandTotal,
    finalTodoList,
    toggleSelfCraft,
    selectAllSelfCraft,
    clearSelfCraftSelection,
    markSelfCraftDone,
    setCalcMode,
    toggleSelfMake,
    setBulkQuality,
    setQualityOverride,
  }
}, {
  persist: {
    pick: [
      'calcMode',
      'selfMakeOverrides',
      'bulkQualityMode',
      'qualityOverrides',
      'autoEvaluateBuffs',
    ],
  },
})

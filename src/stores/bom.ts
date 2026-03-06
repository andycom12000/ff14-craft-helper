import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { PriceDisplayMode } from '@/stores/settings'
import { flattenMaterialTree } from '@/services/bom-calculator'

export interface BomTarget {
  itemId: number
  recipeId: number
  name: string
  icon: string
  quantity: number
}

export interface MaterialNode {
  itemId: number
  name: string
  icon: string
  amount: number
  recipeId?: number
  children?: MaterialNode[]
  collapsed?: boolean  // true = user chose to buy instead of craft
}

export interface FlatMaterial {
  itemId: number
  name: string
  icon: string
  totalAmount: number
  isRaw: boolean
}

export interface PriceInfo {
  itemId: number
  minPrice: number
  avgPrice: number
  hqMinPrice: number
  hqAvgPrice: number
  lastUpdated: number
}

export function getPrice(price: PriceInfo, mode: PriceDisplayMode): number {
  switch (mode) {
    case 'hq': return price.hqMinPrice
    case 'minOf': {
      const nq = price.minPrice || Infinity
      const hq = price.hqMinPrice || Infinity
      const min = Math.min(nq, hq)
      return min === Infinity ? 0 : min
    }
    default: return price.minPrice
  }
}

export const useBomStore = defineStore('bom', () => {
  const targets = ref<BomTarget[]>([])
  const materialTree = ref<MaterialNode[]>([])
  const flatMaterials = ref<FlatMaterial[]>([])
  const prices = ref<Map<number, PriceInfo>>(new Map())

  function addTarget(target: BomTarget) {
    const existing = targets.value.find(t => t.recipeId === target.recipeId)
    if (existing) {
      existing.quantity += target.quantity
    } else {
      targets.value.push(target)
    }
  }

  function removeTarget(recipeId: number) {
    targets.value = targets.value.filter(t => t.recipeId !== recipeId)
  }

  function updateTargetQuantity(recipeId: number, quantity: number) {
    const target = targets.value.find(t => t.recipeId === recipeId)
    if (target) {
      target.quantity = quantity
    }
  }

  function clearTargets() {
    targets.value = []
    materialTree.value = []
    flatMaterials.value = []
  }

  const totalCost = computed(() => {
    const settings = useSettingsStore()
    let total = 0
    for (const mat of flatMaterials.value) {
      const price = prices.value.get(mat.itemId)
      if (price) {
        total += getPrice(price, settings.priceDisplayMode) * mat.totalAmount
      }
    }
    return total
  })

  function toggleCollapsed(node: MaterialNode) {
    node.collapsed = !node.collapsed
  }

  function recalcFlat() {
    flatMaterials.value = flattenMaterialTree(materialTree.value)
  }

  return {
    targets,
    materialTree,
    flatMaterials,
    prices,
    totalCost,
    addTarget,
    removeTarget,
    updateTargetQuantity,
    clearTargets,
    toggleCollapsed,
    recalcFlat,
  }
})

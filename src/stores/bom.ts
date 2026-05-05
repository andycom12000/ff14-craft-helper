import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { PriceDisplayMode } from '@/stores/settings'
import { flattenMaterialTree } from '@/services/bom-calculator'
import {
  fetchItemAcquisitionBatch,
  type ItemAcquisition,
} from '@/services/item-acquisition'

export type AcquisitionSource = 'market' | 'craft' | 'gather' | 'npc'

export interface BomTarget {
  itemId: number
  recipeId: number
  /**
   * @deprecated name is no longer the source of truth for rendering.
   * Components should resolve the current-locale name via useItemName(itemId).
   * This field is kept only as a fallback/debug hint and may be stale after locale change.
   * The TypeScript type is still `string` (not optional) to avoid a cascade of
   * type errors in consumers that will be migrated in I-3; once consumers are
   * updated, this field can be dropped entirely.
   */
  name: string
  icon: string
  /** # of finished items the user wants. */
  quantity: number
  /** Items produced per craft. Optional for legacy data; treat undefined as 1. */
  amountResult?: number
}

export interface MaterialNode {
  itemId: number
  /**
   * @deprecated name is no longer the source of truth for rendering.
   * Components should resolve the current-locale name via useItemName(itemId).
   * This field is kept only as a fallback/debug hint and may be stale after locale change.
   * Kept non-optional to avoid breaking consumers pending I-3 migration.
   */
  name: string
  icon: string
  amount: number
  recipeId?: number
  children?: MaterialNode[]
  collapsed?: boolean  // true = user chose to buy instead of craft
}

export interface FlatMaterial {
  itemId: number
  /**
   * @deprecated name is no longer the source of truth for rendering.
   * Components should resolve the current-locale name via useItemName(itemId).
   * This field is kept only as a fallback/debug hint and may be stale after locale change.
   * Kept non-optional to avoid breaking consumers pending I-3 migration.
   */
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

  /**
   * Per-itemId acquisition mode for non-craft sources. The tree's `collapsed`
   * flag is the source of truth for "is the user crafting this row?"; this
   * map stores the *fallback* mode so toggling craft → market remembers the
   * previously chosen non-craft source (gather/npc) instead of always
   * defaulting to market.
   */
  const acquisitionMode = ref<Map<number, AcquisitionSource>>(new Map())

  /** Item IDs whose drill-down (sub-craft tree) is currently expanded in the UI. */
  const expandedRows = ref<Set<number>>(new Set())

  /**
   * Per-itemId availability (market / gather / NPC). Populated lazily after
   * a calculate by hitting garlandtools. Missing entries fall back to
   * permissive — the row shows every chip until we know better.
   */
  const acquisitionAvailability = ref<Map<number, ItemAcquisition>>(new Map())

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
    acquisitionMode.value = new Map()
    expandedRows.value = new Set()
    acquisitionAvailability.value = new Map()
  }

  async function fetchAcquisitionAvailability(itemIds: number[]) {
    if (itemIds.length === 0) return
    try {
      const fresh = await fetchItemAcquisitionBatch(itemIds)
      const merged = new Map(acquisitionAvailability.value)
      for (const [id, info] of fresh) merged.set(id, info)
      acquisitionAvailability.value = merged
    } catch (err) {
      console.error('[BOM] availability fetch failed:', err)
    }
  }

  /**
   * After prices + availability are loaded, walk the tree post-order and pick
   * the cheapest gil-positive option per node from {market, craft, npc}.
   * Gather is excluded: it's free to the wallet but isn't "cheaper", it's
   * just a different category, and forcing it as default would hide the
   * comparison the user is here to make. Targets stay on craft.
   */
  function applyOptimalDefaults() {
    const settings = useSettingsStore()
    const targetSet = new Set(targets.value.map((t) => t.itemId))
    const costCache = new Map<number, number>()
    const newModeMap = new Map(acquisitionMode.value)
    const collapsedUpdates: Array<{ node: MaterialNode; collapsed: boolean }> = []

    function settle(node: MaterialNode): number {
      const cached = costCache.get(node.itemId)
      if (cached !== undefined) return cached

      const priceInfo = prices.value.get(node.itemId)
      const marketUnit = priceInfo
        ? getPrice(priceInfo, settings.priceDisplayMode)
        : 0
      const marketCost = marketUnit > 0 ? marketUnit * node.amount : Infinity
      const npcUnit = acquisitionAvailability.value.get(node.itemId)?.npcPrice ?? null
      const npcCost = npcUnit != null ? npcUnit * node.amount : Infinity

      const isCraftable = !!(node.recipeId && node.children && node.children.length > 0)
      const isTarget = targetSet.has(node.itemId)

      let craftCost = Infinity
      if (isCraftable) {
        let sum = 0
        let allKnown = true
        for (const child of node.children!) {
          const c = settle(child)
          if (!Number.isFinite(c)) {
            allKnown = false
            break
          }
          sum += c
        }
        craftCost = allKnown ? sum : Infinity
      }

      if (isTarget) {
        const cost = Number.isFinite(craftCost)
          ? craftCost
          : Number.isFinite(marketCost)
            ? marketCost
            : 0
        costCache.set(node.itemId, cost)
        return cost
      }

      const candidates: Array<{ mode: AcquisitionSource; cost: number }> = []
      if (Number.isFinite(marketCost)) candidates.push({ mode: 'market', cost: marketCost })
      if (Number.isFinite(craftCost)) candidates.push({ mode: 'craft', cost: craftCost })
      if (Number.isFinite(npcCost)) candidates.push({ mode: 'npc', cost: npcCost })

      const best = candidates.length > 0
        ? candidates.reduce((a, b) => (b.cost < a.cost ? b : a))
        : { mode: 'market' as AcquisitionSource, cost: 0 }

      if (best.mode === 'craft') {
        if (node.collapsed) collapsedUpdates.push({ node, collapsed: false })
      } else {
        newModeMap.set(node.itemId, best.mode)
        if (isCraftable && !node.collapsed) collapsedUpdates.push({ node, collapsed: true })
      }

      costCache.set(node.itemId, best.cost)
      return best.cost
    }

    for (const root of materialTree.value) settle(root)

    for (const u of collapsedUpdates) u.node.collapsed = u.collapsed
    acquisitionMode.value = newModeMap
    recalcFlat()
  }

  /**
   * Memoized itemId → first-occurrence MaterialNode index. Rebuilt only when
   * the tree changes; consumed by getEffectiveMode/findNode so per-row
   * lookups in the decision table stay O(1) instead of O(tree-size).
   */
  const nodeIndex = computed(() => {
    const map = new Map<number, MaterialNode>()
    function walk(nodes: MaterialNode[]) {
      for (const n of nodes) {
        if (!map.has(n.itemId)) map.set(n.itemId, n)
        if (n.children) walk(n.children)
      }
    }
    walk(materialTree.value)
    return map
  })

  /** Find a node by itemId in the tree (first match across all roots). */
  function findNode(itemId: number): MaterialNode | null {
    return nodeIndex.value.get(itemId) ?? null
  }

  function isCraftableInTree(itemId: number): boolean {
    const node = findNode(itemId)
    return !!(node && node.recipeId && node.children && node.children.length > 0)
  }

  /**
   * Effective mode for a row, resolving the tree's collapsed state vs. the
   * user-stored fallback. A craftable node that is currently expanded is
   * always 'craft'.
   */
  function getEffectiveMode(itemId: number): AcquisitionSource {
    const node = findNode(itemId)
    if (node && node.recipeId && node.children && node.children.length > 0 && !node.collapsed) {
      return 'craft'
    }
    return acquisitionMode.value.get(itemId) ?? 'market'
  }

  /**
   * Set acquisition mode for an item. When switching to/from 'craft',
   * also flip the tree node's collapsed state so flattenMaterialTree
   * walks the right subtree on the next recalc.
   */
  function setAcquisitionMode(itemId: number, mode: AcquisitionSource) {
    const node = findNode(itemId)
    if (mode === 'craft') {
      if (!node || !node.recipeId || !node.children || node.children.length === 0) {
        return
      }
      if (node.collapsed) node.collapsed = false
    } else {
      acquisitionMode.value.set(itemId, mode)
      acquisitionMode.value = new Map(acquisitionMode.value)
      if (node && node.recipeId && node.children && node.children.length > 0 && !node.collapsed) {
        node.collapsed = true
      }
    }
    recalcFlat()
  }

  function toggleRowExpanded(itemId: number) {
    if (expandedRows.value.has(itemId)) {
      expandedRows.value.delete(itemId)
    } else {
      expandedRows.value.add(itemId)
    }
    expandedRows.value = new Set(expandedRows.value)
  }

  function isRowExpanded(itemId: number): boolean {
    return expandedRows.value.has(itemId)
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

  /**
   * Cost grand total honoring per-row acquisition mode.
   *  - market: market price × amount
   *  - npc: NPC vendor price × amount (when known; falls through when not)
   *  - gather: 0 (user fulfills outside of gil)
   *  - craft: contributes nothing on the parent row; the children's leaf rows
   *    carry the actual cost (flatMaterials already reflects the expanded tree)
   */
  const effectiveGrandTotal = computed(() => {
    const settings = useSettingsStore()
    let total = 0
    for (const mat of flatMaterials.value) {
      if (!mat.isRaw) continue
      const mode = getEffectiveMode(mat.itemId)
      if (mode === 'gather') continue
      if (mode === 'npc') {
        const npc = acquisitionAvailability.value.get(mat.itemId)?.npcPrice
        if (npc != null) total += npc * mat.totalAmount
        continue
      }
      const price = prices.value.get(mat.itemId)
      if (!price) continue
      total += getPrice(price, settings.priceDisplayMode) * mat.totalAmount
    }
    return total
  })

  /**
   * Baseline = price of buying every target finished item directly from the market.
   * Used to compute "estimated saving %" against the user's chosen acquisition mix.
   */
  const marketBaselineTotal = computed(() => {
    const settings = useSettingsStore()
    let total = 0
    for (const t of targets.value) {
      const price = prices.value.get(t.itemId)
      if (!price) continue
      total += getPrice(price, settings.priceDisplayMode) * t.quantity
    }
    return total
  })

  const savingPercent = computed(() => {
    const baseline = marketBaselineTotal.value
    if (baseline <= 0) return 0
    const diff = baseline - effectiveGrandTotal.value
    return (diff / baseline) * 100
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
    acquisitionMode,
    expandedRows,
    acquisitionAvailability,
    totalCost,
    effectiveGrandTotal,
    marketBaselineTotal,
    savingPercent,
    addTarget,
    removeTarget,
    updateTargetQuantity,
    clearTargets,
    toggleCollapsed,
    recalcFlat,
    fetchAcquisitionAvailability,
    applyOptimalDefaults,
    findNode,
    isCraftableInTree,
    getEffectiveMode,
    setAcquisitionMode,
    toggleRowExpanded,
    isRowExpanded,
  }
})

import { getRecipe, findRecipesByItemName } from '@/api/xivapi'
import type { BomTarget, MaterialNode, FlatMaterial } from '@/stores/bom'

// Cache fetched recipes to avoid redundant API calls
const recipeCache = new Map<number, Awaited<ReturnType<typeof getRecipe>>>()
const recipeByItemCache = new Map<number, { recipeId: number; job: string } | null>()

/**
 * Items with IDs below this threshold are treated as crystals / base materials (raw).
 * For the MVP we skip recipe lookup for these.
 */
const RAW_ITEM_ID_THRESHOLD = 20

const DEFAULT_RECURSION_DEPTH = 10
/** Minimum fractional savings (buyCost → craftCost) for a node to qualify as a self-craft candidate. */
export const SELF_CRAFT_SAVINGS_THRESHOLD = 0.05

/**
 * Look up the first recipe that produces this item.
 * Returns null if the item is not craftable.
 * Results are cached by itemId.
 */
async function findFirstRecipe(
  itemId: number,
  itemName: string,
): Promise<{ recipeId: number; job: string } | null> {
  if (recipeByItemCache.has(itemId)) {
    return recipeByItemCache.get(itemId)!
  }
  if (itemId < RAW_ITEM_ID_THRESHOLD) {
    recipeByItemCache.set(itemId, null)
    return null
  }
  const results = await findRecipesByItemName(itemName, itemId)
  const first = results.length > 0 ? results[0] : null
  recipeByItemCache.set(itemId, first)
  return first
}

/**
 * Recursively expand a single ingredient node.
 */
async function expandNode(
  itemId: number,
  name: string,
  icon: string,
  amount: number,
  depth: number,
  maxDepth: number,
  ancestorIds: Set<number>,
): Promise<MaterialNode> {
  // Stop conditions: max depth, cycle detection, or crystal/base material
  if (depth >= maxDepth || ancestorIds.has(itemId) || itemId < RAW_ITEM_ID_THRESHOLD) {
    return { itemId, name, icon, amount }
  }

  const recipeInfo = await findFirstRecipe(itemId, name)
  if (!recipeInfo) {
    return { itemId, name, icon, amount }
  }

  const recipe = await fetchRecipeCached(recipeInfo.recipeId)
  const newAncestors = new Set(ancestorIds)
  newAncestors.add(itemId)

  const children = await Promise.all(
    recipe.ingredients.map((ing) =>
      expandNode(
        ing.itemId,
        ing.name,
        ing.icon,
        ing.amount * amount,
        depth + 1,
        maxDepth,
        newAncestors,
      ),
    ),
  )

  return {
    itemId,
    name,
    icon,
    amount,
    recipeId: recipeInfo.recipeId,
    children,
  }
}

/**
 * Recursively expand recipe ingredients into a material tree.
 */
export async function buildMaterialTree(
  targets: BomTarget[],
  maxDepth: number = DEFAULT_RECURSION_DEPTH,
): Promise<MaterialNode[]> {
  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const recipe = await fetchRecipeCached(target.recipeId)
      const ancestorIds = new Set([target.itemId])

      const children = await Promise.all(
        recipe.ingredients.map((ing) =>
          expandNode(
            ing.itemId,
            ing.name,
            ing.icon,
            ing.amount * target.quantity,
            1,
            maxDepth,
            ancestorIds,
          ),
        ),
      )

      return {
        itemId: target.itemId,
        name: target.name,
        icon: target.icon,
        amount: target.quantity,
        recipeId: target.recipeId,
        children,
      } as MaterialNode
    }),
  )

  return results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value
    console.error(`[BOM] Failed to expand recipe ${targets[i].recipeId}:`, result.reason)
    return {
      itemId: targets[i].itemId,
      name: targets[i].name,
      icon: targets[i].icon,
      amount: targets[i].quantity,
      recipeId: targets[i].recipeId,
    }
  })
}

/**
 * Flatten the tree into a deduplicated material list.
 * Collapsed nodes are treated as purchasable raw materials.
 */
export function flattenMaterialTree(tree: MaterialNode[]): FlatMaterial[] {
  const map = new Map<number, FlatMaterial>()

  function walk(nodes: MaterialNode[]) {
    for (const node of nodes) {
      const hasExpandedChildren = node.children && node.children.length > 0 && !node.collapsed
      if (hasExpandedChildren) {
        // Craftable intermediate that user wants to craft
        upsert(map, node, false)
        walk(node.children!)
      } else {
        // Leaf node, collapsed node, or raw material — treat as purchasable
        const isRaw = !node.recipeId || node.itemId < RAW_ITEM_ID_THRESHOLD || !!node.collapsed
        upsert(map, node, isRaw)
      }
    }
  }

  walk(tree)
  return Array.from(map.values())
}

function upsert(
  map: Map<number, FlatMaterial>,
  node: MaterialNode,
  isRaw: boolean,
) {
  const existing = map.get(node.itemId)
  if (existing) {
    existing.totalAmount += node.amount
  } else {
    map.set(node.itemId, {
      itemId: node.itemId,
      name: node.name,
      icon: node.icon,
      totalAmount: node.amount,
      isRaw,
    })
  }
}

/**
 * Topological sort for crafting order.
 * Returns items bottom-up: raw materials first, final products last.
 */
export function getCraftingOrder(
  tree: MaterialNode[],
): { itemId: number; name: string; amount: number }[] {
  const order: { itemId: number; name: string; amount: number }[] = []
  const visited = new Set<number>()

  function walk(nodes: MaterialNode[]) {
    for (const node of nodes) {
      if (visited.has(node.itemId)) continue
      if (node.children && node.children.length > 0) {
        walk(node.children)
      }
      visited.add(node.itemId)
      order.push({
        itemId: node.itemId,
        name: node.name,
        amount: node.amount,
      })
    }
  }

  walk(tree)
  return order
}

async function fetchRecipeCached(recipeId: number) {
  if (recipeCache.has(recipeId)) {
    return recipeCache.get(recipeId)!
  }
  const recipe = await getRecipe(recipeId)
  recipeCache.set(recipeId, recipe)
  return recipe
}

export interface CostDecision {
  itemId: number
  name: string
  icon: string
  amount: number
  buyCost: number
  craftCost: number
  optimalCost: number
  recommendation: 'buy' | 'craft'
}

export interface OptimalCostResult {
  totalCost: number
  decisions: CostDecision[]
}

export function computeOptimalCosts(
  tree: MaterialNode[],
  getUnitPrice: (itemId: number) => number,
): OptimalCostResult {
  const decisionsMap = new Map<number, CostDecision>()

  function getNodeOptimalCost(node: MaterialNode): number {
    const unitPrice = getUnitPrice(node.itemId)
    const buyCost = unitPrice * node.amount

    if (
      !node.children || node.children.length === 0 ||
      node.collapsed ||
      node.itemId < RAW_ITEM_ID_THRESHOLD
    ) {
      return buyCost
    }

    const craftCost = node.children.reduce(
      (sum, child) => sum + getNodeOptimalCost(child), 0,
    )

    let recommendation: 'buy' | 'craft'
    let optimalCost: number

    if (buyCost <= 0) {
      recommendation = 'craft'
      optimalCost = craftCost
    } else if (craftCost <= 0) {
      recommendation = 'buy'
      optimalCost = buyCost
    } else if (buyCost <= craftCost) {
      recommendation = 'buy'
      optimalCost = buyCost
    } else {
      recommendation = 'craft'
      optimalCost = craftCost
    }

    const existing = decisionsMap.get(node.itemId)
    if (existing) {
      existing.amount += node.amount
      existing.buyCost += buyCost
      existing.craftCost += craftCost
      existing.optimalCost += optimalCost
    } else {
      decisionsMap.set(node.itemId, {
        itemId: node.itemId,
        name: node.name,
        icon: node.icon,
        amount: node.amount,
        buyCost,
        craftCost,
        optimalCost,
        recommendation,
      })
    }

    return optimalCost
  }

  let totalCost = 0
  for (const root of tree) {
    totalCost += getNodeOptimalCost(root)
  }

  return {
    totalCost,
    decisions: Array.from(decisionsMap.values()),
  }
}

export function clearCaches() {
  recipeCache.clear()
  recipeByItemCache.clear()
}

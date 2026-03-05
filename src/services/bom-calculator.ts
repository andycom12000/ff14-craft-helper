import { getRecipe } from '@/api/xivapi'
import type { BomTarget, MaterialNode, FlatMaterial } from '@/stores/bom'

// Cache fetched recipes to avoid redundant API calls
const recipeCache = new Map<number, Awaited<ReturnType<typeof getRecipe>>>()

/**
 * Items with IDs below this threshold are treated as crystals / base materials (raw).
 * For the MVP we skip recipe lookup for these.
 */
const RAW_ITEM_ID_THRESHOLD = 20000

/**
 * Recursively expand recipe ingredients into a material tree.
 *
 * MVP: one level of expansion – fetch the recipe's direct ingredients and
 * mark everything else as raw.
 *
 * TODO: deep recursion with configurable depth limit (max 5).
 */
export async function buildMaterialTree(
  targets: BomTarget[],
): Promise<MaterialNode[]> {
  const tree: MaterialNode[] = []

  for (const target of targets) {
    try {
      const recipe = await fetchRecipeCached(target.recipeId)

      const children: MaterialNode[] = recipe.ingredients.map((ing) => ({
        itemId: ing.itemId,
        name: ing.name,
        icon: ing.icon,
        amount: ing.amount * target.quantity,
        // Mark as raw if below threshold (crystals / base mats)
        recipeId: undefined,
        children: undefined,
      }))

      tree.push({
        itemId: target.itemId,
        name: target.name,
        icon: target.icon,
        amount: target.quantity,
        recipeId: target.recipeId,
        children,
      })
    } catch (err) {
      console.error(`[BOM] Failed to expand recipe ${target.recipeId}:`, err)
      // Still add the target as a leaf so the user can see it
      tree.push({
        itemId: target.itemId,
        name: target.name,
        icon: target.icon,
        amount: target.quantity,
        recipeId: target.recipeId,
      })
    }
  }

  return tree
}

/**
 * Flatten the tree into a deduplicated material list.
 * Raw materials are leaf nodes (no children or itemId < RAW_ITEM_ID_THRESHOLD).
 */
export function flattenMaterialTree(tree: MaterialNode[]): FlatMaterial[] {
  const map = new Map<number, FlatMaterial>()

  function walk(nodes: MaterialNode[]) {
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        // This is a craftable intermediate – still record it
        upsert(map, node, false)
        walk(node.children)
      } else {
        // Leaf node – raw material
        const isRaw = !node.recipeId || node.itemId < RAW_ITEM_ID_THRESHOLD
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

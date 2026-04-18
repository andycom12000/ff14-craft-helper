import type { CostDecision } from '@/services/bom-calculator'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { MaterialNode } from '@/stores/bom'
import type { MaterialBase } from '@/services/shopping-list'
import { SELF_CRAFT_SAVINGS_THRESHOLD, buildMaterialTree, computeOptimalCosts } from '@/services/bom-calculator'
import type { MarketData } from '@/api/universalis'
import { findRecipesByItemName, getRecipe } from '@/api/xivapi'
import type { RecipeOptimizeResult } from '@/services/batch-optimizer'
import type { FoodBuff } from '@/engine/food-medicine'
import type { SelfCraftCandidate } from '@/stores/batch'

export interface PrelimCandidate {
  itemId: number
  name: string
  icon: string
  amount: number
  recipe: Recipe
  job: string
  buyCost: number
  craftCost: number
  savings: number
  savingsRatio: number
  depth: number
  rawChildIds: number[]  // immediate child ids for rawMaterials reconstruction
}

export function filterCandidatesByThreshold(decisions: CostDecision[]): CostDecision[] {
  return decisions.filter(
    d => d.recommendation === 'craft' && d.savingsRatio >= SELF_CRAFT_SAVINGS_THRESHOLD,
  )
}

export function filterCandidatesByLevel(
  candidates: Array<{ recipe: Recipe } & Record<string, unknown>>,
  getGearset: (job: string) => GearsetStats | null,
): typeof candidates {
  return candidates.filter(c => {
    const gs = getGearset(c.recipe.job)
    return gs !== null && gs.level >= c.recipe.level
  })
}

export interface TreeNodeInfo {
  itemId: number
  name: string
  icon: string
  amount: number
  recipeId: number
  depth: number
  childItemIds: number[]
  childNodes: MaterialNode[]  // for rawMaterials reconstruction later
}

export function walkTreeForCandidates(tree: MaterialNode[]): TreeNodeInfo[] {
  const out: TreeNodeInfo[] = []

  function visit(node: MaterialNode, depth: number) {
    if (node.collapsed) return
    if (!node.children || node.children.length === 0) return
    if (!node.recipeId) return

    // Root batch targets have depth 0; their children start at depth 1.
    if (depth > 0) {
      out.push({
        itemId: node.itemId,
        name: node.name,
        icon: node.icon,
        amount: node.amount,
        recipeId: node.recipeId,
        depth,
        childItemIds: node.children.map(c => c.itemId),
        childNodes: node.children,
      })
    }

    for (const child of node.children) {
      visit(child, depth + 1)
    }
  }

  for (const root of tree) {
    visit(root, 0)
  }
  return out
}

export function computeRawMaterials(childNodes: MaterialNode[]): MaterialBase[] {
  return childNodes.map(c => ({
    itemId: c.itemId, name: c.name, icon: c.icon, amount: c.amount,
  }))
}

type OptimizeRecipeFn = (
  recipe: Recipe,
  gearset: GearsetStats,
  onSolverProgress?: (pct: number) => void,
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null },
) => Promise<RecipeOptimizeResult>

interface ProduceArgs {
  recipesToCraft: RecipeOptimizeResult[]
  priceMap: Map<number, MarketData>
  getGearset: (job: string) => GearsetStats | null
  maxDepth: number
  buffs: { food: FoodBuff | null; medicine: FoodBuff | null } | undefined
  optimizeRecipe: OptimizeRecipeFn  // injected to avoid circular import
  onProgress: (info: { current: number; total: number; name: string }) => void
  isCancelled: () => boolean
}

export async function produceSelfCraftCandidates(args: ProduceArgs): Promise<SelfCraftCandidate[]> {
  const { recipesToCraft, priceMap, getGearset, maxDepth, buffs, optimizeRecipe, onProgress, isCancelled } = args

  if (recipesToCraft.length === 0) return []

  // Step 1: Collect BOM targets — one per recipesToCraft entry
  const bomTargets: Array<{ itemId: number; recipeId: number; name: string; icon: string; quantity: number }> = []
  for (const r of recipesToCraft) {
    bomTargets.push({
      itemId: r.recipe.itemId,
      recipeId: r.recipe.id,
      name: r.recipe.name,
      icon: r.recipe.icon,
      quantity: r.quantity,
    })
  }

  // Step 2: Build the tree
  const tree = await buildMaterialTree(bomTargets, maxDepth)
  if (isCancelled()) return []

  // Step 3: Price lookup already complete via priceMap; compute costs
  const costResult = computeOptimalCosts(tree, (id) => {
    const md = priceMap.get(id)
    return md?.minPriceNQ ?? 0
  })

  // Step 4: threshold filter
  const viableDecisions = filterCandidatesByThreshold(costResult.decisions)
  if (viableDecisions.length === 0) return []

  // Step 5: for each viable decision, find matching tree node for childNodes + recipeId
  const treeNodes = walkTreeForCandidates(tree)
  const nodeByItem = new Map<number, typeof treeNodes[number]>()
  for (const n of treeNodes) nodeByItem.set(n.itemId, n)

  // Step 6: attach recipe data + filter by level
  const withRecipes: Array<{
    decision: typeof viableDecisions[number]
    node: typeof treeNodes[number]
    recipe: Recipe
    job: string
  }> = []

  for (const decision of viableDecisions) {
    const node = nodeByItem.get(decision.itemId)
    if (!node) continue

    const recipeInfo = await findRecipesByItemName(decision.name, decision.itemId)
    if (!recipeInfo.length) continue

    const first = recipeInfo[0]
    const gs = getGearset(first.job)
    if (!gs) continue

    const recipe = await getRecipe(first.recipeId)
    if (gs.level < recipe.level) continue

    withRecipes.push({ decision, node, recipe, job: first.job })
  }

  if (withRecipes.length === 0) return []
  if (isCancelled()) return []

  // Step 7: solver validation (Task 12)
  // Build a map of parent HQ requirements: itemId → whether any parent requires HQ of this material
  const hqRequiredMap = new Map<number, boolean>()
  for (const r of recipesToCraft) {
    for (let i = 0; i < r.materials.length; i++) {
      if ((r.hqAmounts[i] ?? 0) > 0) hqRequiredMap.set(r.materials[i].itemId, true)
    }
  }

  const candidates: SelfCraftCandidate[] = []
  for (let i = 0; i < withRecipes.length; i++) {
    if (isCancelled()) return candidates
    const { decision, node, recipe, job } = withRecipes[i]
    onProgress({ current: i + 1, total: withRecipes.length, name: recipe.name })

    const gs = getGearset(job)
    if (!gs) continue
    const hqRequired = hqRequiredMap.get(decision.itemId) === true

    let optResult: RecipeOptimizeResult
    try {
      optResult = await optimizeRecipe(recipe, gs, undefined, buffs)
    } catch (err) {
      console.warn(`[self-craft] solver failed for ${recipe.name}:`, err)
      continue
    }

    // optimizeRecipe does NOT throw when progress is unreachable; it returns whatever
    // the solver found. Signals: isDoubleMax=true means both progress and quality are
    // maxed; !isDoubleMax with hqAmounts.length===0 is batch-optimizer's "unachievable"
    // signal (no HQ combination closes the quality gap). Mirror that here so crafts the
    // solver could not complete aren't offered as self-craft candidates.
    if (!optResult.isDoubleMax && optResult.hqAmounts.length === 0) continue
    if (hqRequired && !optResult.isDoubleMax) continue

    candidates.push({
      itemId: decision.itemId,
      name: decision.name,
      icon: decision.icon,
      amount: decision.amount,
      recipe,
      job,
      buyCost: decision.buyCost,
      craftCost: decision.craftCost,
      savings: decision.buyCost - decision.craftCost,
      savingsRatio: decision.savingsRatio,
      actions: optResult.actions,
      hqAmounts: optResult.hqAmounts,
      rawMaterials: computeRawMaterials(node.childNodes),
      hqRequired,
      depth: node.depth,
    })
  }

  return candidates
}

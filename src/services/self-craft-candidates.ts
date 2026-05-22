import type { CostDecision } from '@/services/bom-calculator'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'
import type { MaterialNode } from '@/stores/bom'
import type { MaterialWithPrice } from '@/services/shopping-list'
import { aggregateMaterials, calculateBestPurchase, findCheapestServerPurchase, isCrystal } from '@/services/shopping-list'
import { SELF_CRAFT_SAVINGS_THRESHOLD, buildMaterialTree, computeOptimalCosts } from '@/services/bom-calculator'
import { getAggregatedPrices, type MarketData } from '@/api/universalis'
import { findRecipesByItemName, getRecipe } from '@/api/xivapi'
import type { RecipeOptimizeResult } from '@/services/batch-optimizer'
import type { FoodBuff } from '@/engine/food-medicine'
import type { SelfCraftCandidate } from '@/stores/batch'
import { simulateCraftForRecipe, SolveCancelledError } from '@/solver/api'
import { canReachHQQuality } from '@/services/feasibility-prefilter'

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

/**
 * Cheapest listing-fulfilment price for buying `amount` of `itemId`.
 * Falls back to `minPriceNQ` (or 0) when listings can't fulfil — same fallback
 * the shopping list uses, so cart totals and reprice math stay in lock-step.
 */
function priceItemFromListings(
  itemId: number,
  amount: number,
  priceMap: Map<number, MarketData>,
  crossServer: boolean,
  fallbackServer: string,
): { unitPrice: number; server: string } {
  if (isCrystal(itemId)) return { unitPrice: 0, server: fallbackServer }
  const md = priceMap.get(itemId)
  const fallback = { unitPrice: md?.minPriceNQ ?? 0, server: fallbackServer }
  if (!md?.listings?.length || amount <= 0) return fallback

  if (crossServer) {
    const result = findCheapestServerPurchase(md.listings, amount, false, fallbackServer)
    return Number.isFinite(result.bestCost)
      ? { unitPrice: Math.round(result.bestCost / amount), server: result.bestServer }
      : fallback
  }

  const purchase = calculateBestPurchase(md.listings, amount, false)
  return purchase.fulfilled
    ? { unitPrice: purchase.effectiveUnitPrice, server: fallbackServer }
    : fallback
}

export function computeRawMaterials(
  childNodes: MaterialNode[],
  priceMap: Map<number, MarketData>,
  crossServer: boolean,
  server: string,
): MaterialWithPrice[] {
  return childNodes.map(c => {
    const priced = priceItemFromListings(c.itemId, c.amount, priceMap, crossServer, server)
    return {
      itemId: c.itemId, name: c.name, icon: c.icon, amount: c.amount,
      type: 'nq' as const,
      unitPrice: priced.unitPrice,
      server: priced.server,
    }
  })
}

type OptimizeRecipeFn = (
  recipe: Recipe,
  gearset: GearsetStats,
  onSolverProgress?: (pct: number) => void,
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null },
) => Promise<RecipeOptimizeResult>

function nqTemplate(level: number): string[] {
  if (level < 54) return new Array(15).fill('BasicSynthesis')
  if (level <= 70) return ['MuscleMemory', ...new Array(10).fill('BasicSynthesis')]
  if (level <= 90) return ['MuscleMemory', ...new Array(8).fill('CarefulSynthesis')]
  return ['MuscleMemory', 'Veneration', ...new Array(7).fill('CarefulSynthesis')]
}

type ValidateOutcome =
  | { kind: 'accepted'; via: 'template' | 'solver'; actions: string[]; hqAmounts: number[]; solveDur?: number }
  | { kind: 'failed' }
  | { kind: 'prefilter-rejected' }

async function validateNQ(
  recipe: Recipe,
  gearset: GearsetStats,
  buffs: { food: FoodBuff | null; medicine: FoodBuff | null } | undefined,
  optimizeRecipe: OptimizeRecipeFn,
): Promise<ValidateOutcome> {
  // Façade owns the buffs marshalling so stacking order matches
  // batch-optimizer (Soul → food → medicine, see ADR 0001).
  const template = nqTemplate(recipe.level)

  try {
    const sim = await simulateCraftForRecipe(recipe, gearset, { actions: template, buffs })
    if (sim.progress >= sim.max_progress) {
      return { kind: 'accepted', via: 'template', actions: template, hqAmounts: [] }
    }
  } catch (err) {
    if (err instanceof SolveCancelledError) throw err
    console.warn(`[self-craft] simulate failed for ${recipe.name}, falling back to solver`, err)
  }

  const t0 = performance.now()
  try {
    const opt = await optimizeRecipe(recipe, gearset, undefined, buffs)
    if (!opt.isDoubleMax && opt.hqAmounts.length === 0) return { kind: 'failed' }
    return {
      kind: 'accepted', via: 'solver',
      actions: opt.actions, hqAmounts: opt.hqAmounts,
      solveDur: performance.now() - t0,
    }
  } catch (err) {
    if (err instanceof SolveCancelledError) throw err
    console.warn(`[self-craft] solver failed for ${recipe.name}:`, err)
    return { kind: 'failed' }
  }
}

async function validateHQ(
  recipe: Recipe,
  gearset: GearsetStats,
  buffs: { food: FoodBuff | null; medicine: FoodBuff | null } | undefined,
  optimizeRecipe: OptimizeRecipeFn,
): Promise<ValidateOutcome> {
  if (!canReachHQQuality(recipe, gearset, buffs)) {
    return { kind: 'prefilter-rejected' }
  }
  const t0 = performance.now()
  try {
    const opt = await optimizeRecipe(recipe, gearset, undefined, buffs)
    if (!opt.isDoubleMax) return { kind: 'failed' }
    return {
      kind: 'accepted', via: 'solver',
      actions: opt.actions, hqAmounts: opt.hqAmounts,
      solveDur: performance.now() - t0,
    }
  } catch (err) {
    if (err instanceof SolveCancelledError) throw err
    console.warn(`[self-craft] solver failed for ${recipe.name}:`, err)
    return { kind: 'failed' }
  }
}

interface ProduceArgs {
  recipesToCraft: RecipeOptimizeResult[]
  priceMap: Map<number, MarketData>
  priceSource: string  // server or DC used for price lookups
  crossServer: boolean
  server: string
  getGearset: (job: string) => GearsetStats | null
  maxDepth: number
  buffs: { food: FoodBuff | null; medicine: FoodBuff | null } | undefined
  optimizeRecipe: OptimizeRecipeFn  // injected to avoid circular import
  onProgress: (info: { completed: number; total: number; name: string }) => void
  isCancelled: () => boolean
}

function collectTreeItemIds(tree: MaterialNode[]): Set<number> {
  const ids = new Set<number>()
  function visit(n: MaterialNode) {
    if (!isCrystal(n.itemId)) ids.add(n.itemId)
    if (n.children) for (const c of n.children) visit(c)
  }
  for (const r of tree) visit(r)
  return ids
}

export async function produceSelfCraftCandidates(args: ProduceArgs): Promise<SelfCraftCandidate[]> {
  const { recipesToCraft, priceMap, priceSource, crossServer, server, getGearset, maxDepth, buffs, optimizeRecipe, onProgress, isCancelled } = args

  if (recipesToCraft.length === 0) return []

  // Step 1: Collect BOM targets — one per recipesToCraft entry.
  // bomTargets[].quantity is "# of finished items the user wants" — buildMaterialTree
  // converts to crafts internally using recipe.amountResult.
  const bomTargets: import('@/stores/bom').RecipeBomTarget[] = []
  for (const r of recipesToCraft) {
    bomTargets.push({
      kind: 'recipe',
      itemId: r.recipe.itemId,
      recipeId: r.recipe.id,
      name: r.recipe.name,
      icon: r.recipe.icon,
      quantity: r.outputAmount,
    })
  }

  // Step 2: Build the tree
  const tree = await buildMaterialTree(bomTargets, maxDepth)
  if (isCancelled()) return []

  // Step 3: Backfill prices for BOM-expanded descendants (grand-children and deeper)
  // that weren't in the original priceMap (Phase 4 only fetched direct materials).
  const treeItemIds = collectTreeItemIds(tree)
  const missingIds: number[] = []
  for (const id of treeItemIds) if (!priceMap.has(id)) missingIds.push(id)
  if (missingIds.length > 0) {
    try {
      const extra = await getAggregatedPrices(priceSource, missingIds)
      for (const [id, md] of extra) priceMap.set(id, md)
    } catch (err) {
      console.warn('[self-craft] price backfill failed:', err)
    }
  }
  if (isCancelled()) return []

  // Step 4: Compute costs from completed priceMap
  const costResult = computeOptimalCosts(tree, (id) => {
    const md = priceMap.get(id)
    return md?.minPriceNQ ?? 0
  })

  // Step 5: threshold filter — exclude root targets (those are the batch targets themselves,
  // not self-craft substitutes). Root-level buy-vs-craft is handled by Phase 4.5.
  const rootItemIds = new Set(bomTargets.map(t => t.itemId))
  const viableDecisions = filterCandidatesByThreshold(costResult.decisions)
    .filter(d => !rootItemIds.has(d.itemId))
  if (viableDecisions.length === 0) return []

  // walkTreeForCandidates emits one entry per tree occurrence; merge by itemId so
  // childNodes.amount sums across all branches the intermediate appears under.
  const treeNodes = walkTreeForCandidates(tree)
  const nodeByItem = new Map<number, typeof treeNodes[number]>()
  for (const n of treeNodes) {
    const existing = nodeByItem.get(n.itemId)
    if (!existing) {
      nodeByItem.set(n.itemId, { ...n, childNodes: aggregateMaterials([n.childNodes]) as MaterialNode[] })
    } else {
      existing.childNodes = aggregateMaterials([existing.childNodes, n.childNodes]) as MaterialNode[]
    }
  }

  // Step 7: attach recipe data + filter by level
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

  // Step 8: solver validation
  // Build a map of parent HQ requirements: itemId → whether any parent requires HQ of this material
  const hqRequiredMap = new Map<number, boolean>()
  for (const r of recipesToCraft) {
    for (let i = 0; i < r.materials.length; i++) {
      if ((r.hqAmounts[i] ?? 0) > 0) hqRequiredMap.set(r.materials[i].itemId, true)
    }
  }

  const candidates: SelfCraftCandidate[] = []
  let completedCount = 0

  const settled = await Promise.allSettled(withRecipes.map(async ({ decision, node, recipe, job }) => {
    if (isCancelled()) throw new Error('cancelled')
    const gs = getGearset(job)
    if (!gs) return null
    const hqRequired = hqRequiredMap.get(decision.itemId) === true

    const validated = hqRequired
      ? await validateHQ(recipe, gs, buffs, optimizeRecipe)
      : await validateNQ(recipe, gs, buffs, optimizeRecipe)

    completedCount++
    onProgress({ completed: completedCount, total: withRecipes.length, name: recipe.name })

    if (validated.kind === 'prefilter-rejected') return null
    if (validated.kind === 'failed') return null

    // computeOptimalCosts prices everything at `minPriceNQ × amount`, but the
    // shopping list uses listing fulfilment — the two diverge once the cheapest
    // stack runs out. Reprice against what the cart will actually charge, then
    // re-apply the savings threshold so we never recommend a "saving" that
    // becomes a loss on accept. Empty market data → no reality check possible,
    // keep the decision values.
    const rawMaterials = computeRawMaterials(node.childNodes, priceMap, crossServer, server)
    const realPrice = priceItemFromListings(decision.itemId, decision.amount, priceMap, crossServer, server)
    const realBuyCost = realPrice.unitPrice * decision.amount

    let buyCost = decision.buyCost
    let craftCost = decision.craftCost
    let savings = decision.buyCost - decision.craftCost
    let savingsRatio = decision.savingsRatio

    if (realBuyCost > 0) {
      const realCraftCost = rawMaterials.reduce((sum, m) => sum + m.unitPrice * m.amount, 0)
      const realSavings = realBuyCost - realCraftCost
      const realRatio = realSavings / realBuyCost
      if (realRatio < SELF_CRAFT_SAVINGS_THRESHOLD) return null
      buyCost = realBuyCost
      craftCost = realCraftCost
      savings = realSavings
      savingsRatio = realRatio
    }

    return {
      itemId: decision.itemId,
      name: decision.name,
      icon: decision.icon,
      amount: decision.amount,
      recipe,
      job,
      buyCost,
      craftCost,
      savings,
      savingsRatio,
      actions: validated.actions,
      hqAmounts: validated.hqAmounts,
      rawMaterials,
      hqRequired,
      depth: node.depth,
    } as SelfCraftCandidate
  }))

  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value !== null) candidates.push(s.value)
  }

  return candidates
}

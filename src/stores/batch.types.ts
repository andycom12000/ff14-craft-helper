/**
 * Result-shape types for the batch store.
 *
 * These describe the pipeline output the store holds in `results` and the
 * candidate / decision rows the view layer consumes. They live in a sibling
 * type module so the store file (`stores/batch.ts`) stays focused on state +
 * actions, and so service modules (e.g. `services/batch-optimizer`) can
 * import the shapes without pulling the Pinia store wiring with them.
 *
 * The store re-exports everything here for backwards compatibility with
 * existing `import type { ... } from '@/stores/batch'` call sites.
 */
import type { Recipe } from '@/stores/recipe'
import type { MaterialWithPrice as ShoppingItem, ServerGroup, CrystalSummary, QuickBuyMaterial } from '@/services/shopping-list'
import type { WorldPriceSummary } from '@/api/universalis'
import type { FoodBuff } from '@/engine/food-medicine'
import type { MeldAdvice } from '@/services/meld-advisor'

export interface BatchTarget {
  recipe: Recipe
  quantity: number
}

/**
 * Per-target live status reported by `runBatchOptimization`'s optional
 * `onTargetUpdate` callback during Phase 1 (solve + HQ optimize). Lets the
 * UI render progressive per-row state (queued → solving → done/failed)
 * instead of waiting for the whole batch to settle.
 */
export type BatchTargetStatus =
  | { state: 'queued' }
  | { state: 'solving'; percent: number }
  | { state: 'done'; steps: number; isDoubleMax: boolean }
  | { state: 'failed'; reason: string }

export interface BatchException {
  type: 'level-insufficient' | 'quality-unachievable'
  recipe: Recipe
  quantity: number
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

export interface NpcPurchaseCandidate {
  itemId: number
  name: string
  icon: string
  amount: number
  marketPrice: number          // per unit, baseline for comparison
  npcPrice: number             // per unit, NPC one-shot price
  savings: number              // (marketPrice - npcPrice) * amount
  savingsRatio: number         // savings / (marketPrice * amount), 0..1
  npcId: number                // chosen vendor (cheapest, tiebreak by major city)
  zoneId: number
  coords: { x: number; y: number }
  /**
   * Aetheryte name for `/tp` command. Resolved from public/data/aetherytes.json
   * (zh-TW only — FFXIV client accepts zh-TW aetheryte strings regardless of
   * UI locale). Null when the zone has no aetheryte entry in the data file.
   */
  aetheryteName: string | null
  isFinishedProduct: boolean   // material vs finished good (different tag in UI)
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
  npcPurchaseCandidates: NpcPurchaseCandidate[]
  /**
   * Populated in macro mode after Phase 6 (meld advice). One entry per
   * crafting job present in recipesToCraft. Absent in quick-buy mode and
   * when cancelled before Phase 6 completes.
   */
  meldAdvicePerJob?: Map<string, MeldAdvice>
}

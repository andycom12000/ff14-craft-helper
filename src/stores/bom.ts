import { defineStore } from 'pinia'
import { ref, computed, watch, getCurrentScope, onScopeDispose } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { PriceDisplayMode } from '@/stores/settings'
import { flattenMaterialTree } from '@/services/bom-calculator'
import { getAggregatedPrices } from '@/api/universalis'
import {
  fetchItemAcquisitionBatch,
  type ItemAcquisition,
} from '@/services/item-acquisition'
import type { ItemLocations } from '@/services/item-locations'
import { fetchItemLocationsBatch } from '@/services/item-locations'
import { fetchZoneMetaBulk, fetchNpcNameBulk } from '@/services/zone-meta'
import { trackEvent } from '@/utils/analytics'
import { useCrossWorldPricing } from '@/composables/useCrossWorldPricing'
import type { AcquisitionSource } from '@/types/acquisition'
import { computeRecipeTaxonomy, flattenTaxonomyForEvent } from '@/utils/recipe-taxonomy'
import type { Recipe, RecipeOpenSource } from '@/stores/recipe'

export type PriceFetchStatus = 'ok' | 'failed'

export interface CrossWorldBest {
  worldName: string
  minPrice: number
  fetchedAt: number
}

export type { AcquisitionSource }

export type TargetDefaultMode = Extract<AcquisitionSource, 'craft' | 'market'>

interface BaseBomTarget {
  itemId: number
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
}

export interface RecipeBomTarget extends BaseBomTarget {
  kind: 'recipe'
  recipeId: number
  /** Items produced per craft. Optional for legacy data; treat undefined as 1. */
  amountResult?: number
  /**
   * Full recipe object used to derive analytics taxonomy at add-time.
   * Not persisted — optional so legacy/import targets remain valid.
   */
  recipe?: Recipe
}

export interface CompanyCraftProjectBomTarget extends BaseBomTarget {
  kind: 'company-craft-project'
  projectId: string
}

export interface NoRecipeBomTarget extends BaseBomTarget {
  kind: 'no-recipe'
}

/**
 * A discriminated union over all target kinds. The `kind` field is the
 * discriminant; use it to narrow before accessing kind-specific fields.
 *
 * Legacy data (without `kind`) can be up-converted via `migrateLegacyTarget`.
 */
export type BomTarget = RecipeBomTarget | CompanyCraftProjectBomTarget | NoRecipeBomTarget

/**
 * A `company-craft-project` target is a "完成品 meta" row that links a workshop
 * project to the BOM. It carries a placeholder `itemId: -1` (the project is
 * not a single market item) and must NEVER reach Universalis — sending -1
 * produces 404s, dead retry chips, and dead /market/-1 links. Use this
 * helper everywhere a per-target market query is about to fire.
 *
 * Centralised so the rule lives in one place instead of sprinkling
 * `t.kind !== 'company-craft-project'` (or worse: `itemId === -1` magic
 * numbers) across stores, components, and composables.
 */
export function isMarketableTarget(t: BomTarget): boolean {
  return t.kind !== 'company-craft-project'
}

/**
 * Item-id-level counterpart to `isMarketableTarget`. Use at the boundary of
 * `fetchPrices` / acquisition lookups so a placeholder id (the company-craft
 * meta target's -1) can never reach Universalis or Garlandtools regardless
 * of which intermediate path (targets union, flatMaterials default, caller-
 * supplied list) the id arrived through. FFXIV item ids are always positive,
 * so `id > 0` is a safe gate.
 */
export function isMarketableItemId(id: number): boolean {
  return id > 0
}

/**
 * Up-converts a legacy target object (pre-discriminant-union) to a typed
 * `BomTarget`. If the object already has a `kind` field it is returned
 * as-is (idempotent). Exported for test access and future persist migration.
 */
export function migrateLegacyTarget(t: unknown): BomTarget {
  const obj = t as Record<string, unknown>
  if (obj && typeof obj === 'object' && 'kind' in obj) return obj as unknown as BomTarget
  const itemId = Number(obj.itemId)
  const name = String(obj.name ?? '')
  const icon = String(obj.icon ?? '')
  const quantity = Number(obj.quantity ?? 1)
  const recipeId = obj.recipeId
  const base: BaseBomTarget = { itemId, name, icon, quantity }
  if (recipeId == null) return { ...base, kind: 'no-recipe' }
  return {
    ...base,
    kind: 'recipe',
    recipeId: Number(recipeId),
    amountResult: obj.amountResult !== undefined ? Number(obj.amountResult) : undefined,
  }
}

/**
 * Stable, unique identity key for a target row. `company-craft-project`
 * targets share a placeholder `itemId` (-1) across multiple submarines, so
 * itemId can't identify them — they are keyed by their unique `projectId`
 * instead. recipe / no-recipe targets keep their itemId identity (the same
 * craftable/raw item never appears twice). Used as the v-for `:key` and as
 * the lookup key for `updateTargetQuantity` / `removeTarget`.
 */
export function targetKey(target: BomTarget): string {
  return target.kind === 'company-craft-project'
    ? `project:${target.projectId}`
    : `item:${target.itemId}`
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

// ---------------------------------------------------------------------------
// Route planner — localStorage helpers (module-scope, one store per session)
// ---------------------------------------------------------------------------

const PREFS_KEY = 'bom-route-prefs'
const ROUTE_KEY_PREFIX = 'bom-route::'
const ROUTE_LRU_LIMIT = 8
const WRITE_DEBOUNCE_MS = 500

// ---------------------------------------------------------------------------
// BOM 材料明細「已完成」追蹤 — localStorage helpers
// ---------------------------------------------------------------------------
// Keyed by bomKey = targetSig + acquisitionModeSig hash, so that:
//   - changing target qty / acquisition override → new key → progress自然歸零
//   - F5 / 切頁切回 → same key → progress 保留
// LRU + 14d GC keeps the keyspace bounded across many BOMs over time.

const COMPLETED_KEY_PREFIX = 'bom-completed::'
const COMPLETED_LRU_LIMIT = 16
const COMPLETED_MAX_AGE_MS = 14 * 24 * 3600 * 1000

function completedLsKey(sig: string) { return `${COMPLETED_KEY_PREFIX}${sig}` }

function loadCompleted(sig: string): Set<number> {
  try {
    const raw = localStorage.getItem(completedLsKey(sig))
    if (!raw) return new Set()
    const v = JSON.parse(raw)
    return new Set(Array.isArray(v.items) ? v.items.filter((n: unknown) => typeof n === 'number') : [])
  } catch { return new Set() }
}

function persistCompleted(sig: string, items: Set<number>) {
  try {
    if (items.size === 0) {
      // Empty Set ≠ "user cleared everything" worth persisting; treat as
      // absent so the key doesn't squat in LS forever for empty data.
      localStorage.removeItem(completedLsKey(sig))
      return
    }
    localStorage.setItem(completedLsKey(sig), JSON.stringify({
      items: [...items],
      _mtime: Date.now(),
    }))
    evictLruByPrefix(COMPLETED_KEY_PREFIX, COMPLETED_LRU_LIMIT)
  } catch {}
}

/**
 * Sweep BOM-completed entries older than maxAgeMs. Called once at store init
 * so the LS keyspace doesn't grow unbounded across many BOMs over time.
 * Exported for test access.
 */
export function pruneStaleCompletedEntries(maxAgeMs = COMPLETED_MAX_AGE_MS, now = Date.now()) {
  try {
    const stale: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (!k.startsWith(COMPLETED_KEY_PREFIX)) continue
      try {
        const v = JSON.parse(localStorage.getItem(k)!)
        const mtime = typeof v._mtime === 'number' ? v._mtime : 0
        if (now - mtime > maxAgeMs) stale.push(k)
      } catch {
        stale.push(k)
      }
    }
    for (const k of stale) localStorage.removeItem(k)
  } catch {}
}

interface RoutePrefs {
  optimizeBy: 'gil' | 'hop'
  targetDefaultMode: TargetDefaultMode
}

function readPrefsFromLs(): RoutePrefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const optimizeBy = parsed?.optimizeBy === 'hop' ? 'hop' : 'gil'
    const targetDefaultMode: TargetDefaultMode =
      parsed?.targetDefaultMode === 'market' ? 'market' : 'craft'
    return { optimizeBy, targetDefaultMode }
  } catch { return null }
}

function writePrefsToLs(prefs: RoutePrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch {}
}

function lsKey(sig: string) { return `${ROUTE_KEY_PREFIX}${sig}` }

function loadSession(sig: string): { excluded: Set<number>; checked: Set<number>; collapsedGroups: Set<number> } {
  try {
    const raw = localStorage.getItem(lsKey(sig))
    if (!raw) return { excluded: new Set(), checked: new Set(), collapsedGroups: new Set() }
    const v = JSON.parse(raw)
    return {
      excluded: new Set(v.excluded ?? []),
      checked: new Set(v.checked ?? []),
      collapsedGroups: new Set(v.collapsedGroups ?? []),
    }
  } catch { return { excluded: new Set(), checked: new Set(), collapsedGroups: new Set() } }
}

/**
 * Generic LRU evictor for any `{ _mtime }` JSON entry under a key prefix.
 * Two-pass: count cheaply first, only JSON.parse mtime when over limit —
 * the common case is "nothing to do" and we shouldn't pay parse cost for it.
 */
function evictLruByPrefix(prefix: string, limit: number) {
  try {
    const matchingKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (k.startsWith(prefix)) matchingKeys.push(k)
    }
    if (matchingKeys.length <= limit) return

    const keys: Array<[string, number]> = []
    for (const k of matchingKeys) {
      try {
        const v = JSON.parse(localStorage.getItem(k)!)
        keys.push([k, v._mtime ?? 0])
      } catch {
        localStorage.removeItem(k)
      }
    }
    keys.sort((a, b) => a[1] - b[1])
    const toRemove = keys.length - limit
    for (let i = 0; i < toRemove; i++) localStorage.removeItem(keys[i][0])
  } catch {}
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

  // Session dedupe for `bom_breakdown_expand` — same item should only fire
  // the event once per store lifetime, even if the user collapses + re-expands.
  // Lives inside the store setup so `setActivePinia(createPinia())` in tests
  // resets it automatically; no test-only export needed.
  const trackedExpands = new Set<number>()

  /**
   * Item IDs the user has explicitly picked an acquisition mode for. The
   * decision row collapses the segmented picker into a single "active mode"
   * chip once the row is touched — the user has made their call and
   * doesn't need 4 chips of always-on options anymore.
   *
   * applyOptimalDefaults does NOT add to this set (auto-defaults shouldn't
   * count as a user decision); only an explicit setAcquisitionMode call from
   * the UI does. clearTargets / a fresh calc reset it.
   */
  const userTouchedModes = ref<Set<number>>(new Set())

  /**
   * Per-itemId availability (market / gather / NPC). Populated lazily after
   * a calculate by hitting garlandtools. Missing entries fall back to
   * permissive — the row shows every chip until we know better.
   */
  const acquisitionAvailability = ref<Map<number, ItemAcquisition>>(new Map())

  /**
   * Per-itemId Universalis fetch status. 'ok' once a fetch has returned a
   * price record (even an empty one); 'failed' when the network/server call
   * threw. Untouched items have no entry — that's "unknown / not-yet-asked".
   * The decision row uses this to render an inline retry affordance only
   * when retry would actually help (i.e., we know the item is marketable
   * and the last fetch threw).
   */
  const priceFetchStatus = ref<Map<number, PriceFetchStatus>>(new Map())
  const fetchingPriceIds = ref<Set<number>>(new Set())

  /**
   * For each craftable target, the cheapest world in the user's DC and its
   * price. Populated by fetchCrossWorldBestForTargets when targetDefaultMode
   * is 'market' and settings.crossServer is on. May store the home server
   * when home itself is the cheapest in the DC.
   */
  const crossWorldBestPriceMap = ref<Map<number, CrossWorldBest>>(new Map())
  const crossWorldFetchStatus = ref<Map<number, PriceFetchStatus>>(new Map())

  // ---------------------------------------------------------------------------
  // Route planner state
  // ---------------------------------------------------------------------------

  /** Per-itemId location data (NPC vendors + gather nodes). Populated lazily. */
  const itemLocations = ref<Map<number, ItemLocations>>(new Map())

  const initialPrefs: RoutePrefs = readPrefsFromLs() ?? { optimizeBy: 'gil', targetDefaultMode: 'craft' }
  const routeViewPrefs = ref<{ optimizeBy: 'gil' | 'hop' }>({ optimizeBy: initialPrefs.optimizeBy })
  const targetDefaultMode = ref<TargetDefaultMode>(initialPrefs.targetDefaultMode)

  const routeViewSession = ref<{
    excluded: Set<number>
    checked: Set<number>
    collapsedGroups: Set<number>
  }>({ excluded: new Set(), checked: new Set(), collapsedGroups: new Set() })

  /** Stable, order-independent signature of the current target list. */
  const targetSig = computed(() => {
    return targets.value
      .slice()
      .sort((a, b) => a.itemId - b.itemId)
      .map(t => `${t.itemId}:${t.quantity}`)
      .join(',')
  })

  /**
   * Signature of all per-itemId acquisition overrides. Combined with
   * `targetSig` to form `bomCompletedKey` — so changing 直購/自製 also
   * resets the BOM checked progress (different row set = different work).
   */
  const acquisitionModeSig = computed(() => {
    return [...acquisitionMode.value.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, mode]) => `${id}:${mode}`)
      .join(',')
  })

  /**
   * Key under which the BOM-completed Set is persisted. Stable hash of the
   * row set that would render in 材料明細 — when it changes, the user has
   * recomputed a different BOM and progress legitimately resets to zero.
   */
  const bomCompletedKey = computed(() => {
    return `${targetSig.value}|${acquisitionModeSig.value}`
  })

  const bomCompleted = ref<Set<number>>(loadCompleted(`${targetSig.value}|${acquisitionModeSig.value}`))

  let completedWriteTimer: ReturnType<typeof setTimeout> | null = null

  // Drop pending writes if the store is disposed (test teardown, HMR) so a
  // pending 500ms timer doesn't fire after the next pinia instance has taken
  // over and write LS for the wrong key.
  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (completedWriteTimer) { clearTimeout(completedWriteTimer); completedWriteTimer = null }
    })
  }

  watch(bomCompletedKey, (next) => {
    bomCompleted.value = loadCompleted(next)
  }, { flush: 'sync' })

  // flush:'sync' so user-action time IS the debounce-window start (matches
  // routeViewSession's timing contract — tests rely on it).
  watch(bomCompleted, (next) => {
    const key = bomCompletedKey.value
    if (!key) return
    if (completedWriteTimer) clearTimeout(completedWriteTimer)
    completedWriteTimer = setTimeout(() => {
      persistCompleted(key, next)
      completedWriteTimer = null
    }, WRITE_DEBOUNCE_MS)
  }, { flush: 'sync' })

  function isBomCompleted(itemId: number): boolean {
    return bomCompleted.value.has(itemId)
  }

  function toggleBomCompleted(itemId: number) {
    const next = new Set(bomCompleted.value)
    const willBe = !next.has(itemId)
    if (willBe) next.add(itemId); else next.delete(itemId)
    bomCompleted.value = next
    trackEvent('bom_item_completed_toggle', { item_id: itemId, completed: willBe })
  }

  function clearBomCompleted() {
    bomCompleted.value = new Set()
  }

  // Scoped to each store instance — prevents HMR / multi-instance timer collisions.
  let writeTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleWrite(sig: string, session: { excluded: Set<number>; checked: Set<number>; collapsedGroups: Set<number> }) {
    if (writeTimer) clearTimeout(writeTimer)
    writeTimer = setTimeout(() => {
      try {
        localStorage.setItem(lsKey(sig), JSON.stringify({
          excluded: [...session.excluded],
          checked: [...session.checked],
          collapsedGroups: [...session.collapsedGroups],
          _mtime: Date.now(),
        }))
        evictLruByPrefix(ROUTE_KEY_PREFIX, ROUTE_LRU_LIMIT)
      } catch {}
      writeTimer = null
    }, WRITE_DEBOUNCE_MS)
  }

  // Reload session from localStorage whenever the target list changes.
  watch(targetSig, (next) => {
    routeViewSession.value = loadSession(next)
  }, { immediate: true, flush: 'sync' })

  // Debounce-persist session mutations back to localStorage. `flush: 'sync'`
  // keeps scheduleWrite firing in the same tick as the mutation so the
  // debounce window starts at user-action time, not 1 microtask later.
  // Tests with fake timers also rely on this sync chain.
  watch(routeViewSession, (next) => {
    if (targetSig.value) scheduleWrite(targetSig.value, next)
  }, { deep: true, flush: 'sync' })

  // Persist prefs immediately on change. Same fake-timer reasoning as above.
  watch(
    [routeViewPrefs, targetDefaultMode],
    () => writePrefsToLs({
      optimizeBy: routeViewPrefs.value.optimizeBy,
      targetDefaultMode: targetDefaultMode.value,
    }),
    { deep: true, flush: 'sync' },
  )

  function addTarget(target: BomTarget, source: RecipeOpenSource = 'unknown') {
    if (target.kind === 'company-craft-project') {
      // Company craft projects are keyed by projectId — the same project
      // can share an itemId placeholder (-1) across multiple entries.
      const existing = targets.value.find(
        t => t.kind === 'company-craft-project' && t.projectId === target.projectId,
      )
      if (existing) return
      targets.value.push(target)
      trackEvent('bom_target_add', { item_id: target.itemId, quantity: target.quantity, source })
      return
    }
    // recipe / no-recipe: dedupe by itemId (existing behavior).
    // itemId is the only stable key for non-craftable targets, and the same
    // craftable item shouldn't appear twice even with different recipe choices.
    const existing = targets.value.find(t => t.itemId === target.itemId)
    if (existing) {
      existing.quantity += target.quantity
    } else {
      targets.value.push(target)
    }
    const base: Record<string, string | number | boolean | undefined> = {
      item_id: target.itemId,
      quantity: target.quantity,
      source,
    }
    if (target.kind === 'recipe') {
      base.recipe_id = target.recipeId
      if (target.recipe) {
        Object.assign(base, flattenTaxonomyForEvent(computeRecipeTaxonomy(target.recipe)))
      }
    }
    trackEvent('bom_target_add', base)
  }

  /**
   * Remove a target by its stable key (see `targetKey`). Keying by itemId
   * would delete *every* company-craft-project at once since they share the
   * placeholder itemId (-1); the key disambiguates them by projectId.
   */
  function removeTarget(key: string) {
    targets.value = targets.value.filter(t => targetKey(t) !== key)
  }

  function removeProjectTarget(projectId: string) {
    targets.value = targets.value.filter(
      t => !(t.kind === 'company-craft-project' && t.projectId === projectId),
    )
  }

  /**
   * Update a single target's quantity by its stable key (see `targetKey`).
   * Keying by itemId would always hit the first company-craft-project since
   * they share the placeholder itemId (-1), leaving the others stuck at 1.
   */
  function updateTargetQuantity(key: string, quantity: number) {
    const target = targets.value.find(t => targetKey(t) === key)
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
    userTouchedModes.value = new Set()
    acquisitionAvailability.value = new Map()
    priceFetchStatus.value = new Map()
    fetchingPriceIds.value = new Set()
    crossWorldBestPriceMap.value = new Map()
    crossWorldFetchStatus.value = new Map()
    useCrossWorldPricing().invalidateCrossWorldCache()
  }

  /**
   * Fetch market prices for the given itemIds (or every flat material + every
   * target if omitted). On a successful response, items present in the
   * response get status='ok'; items the user asked about but were missing
   * from the response also get 'ok' (Universalis returns empty arrays for
   * items with no listings — that's not a failure). On a thrown error,
   * every requested id flips to 'failed' so the UI can show a retry chip.
   */
  async function fetchPrices(itemIds?: number[]): Promise<{ ok: boolean }> {
    const settings = useSettingsStore()
    // Filter -1 (and any other non-positive placeholder) out *up front*.
    // Without this, `flatMaterials` can contain the company-craft meta
    // target's -1 (calculator falls back to treating it as a raw material
    // when no workshop-projects entry resolves), and BomView passes that
    // list straight in as `itemIds` — so the per-target skip below was not
    // enough on its own. The batch would then 404 and flip every id in
    // `ids` to status='failed', producing a "N 列查價失敗" totals alert.
    const ids = (itemIds ?? flatMaterials.value.map((m) => m.itemId)).filter(
      isMarketableItemId,
    )
    for (const t of targets.value) {
      // Skip company-craft-project meta targets — their placeholder itemId
      // (-1) is not a real Universalis id; sending it produces 404s and
      // poisons priceFetchStatus with a 'failed' entry that has no retry path.
      if (!isMarketableTarget(t)) continue
      if (!ids.includes(t.itemId)) ids.push(t.itemId)
    }
    if (ids.length === 0) return { ok: true }

    const fetchingNext = new Set(fetchingPriceIds.value)
    for (const id of ids) fetchingNext.add(id)
    fetchingPriceIds.value = fetchingNext

    // When the user has 跨服採購 on we have to query the data center, not their
    // home world — Universalis returns 404 for an empty path segment, which
    // is exactly what `${BASE_URL}/${''}/${ids}` produces. Fall back to the
    // other field if one is unset.
    const effectiveScope =
      (settings.crossServer ? settings.dataCenter || settings.server : settings.server || settings.dataCenter)
    if (!effectiveScope) {
      // No server / data-center configured. Don't mark as 'failed' — the
      // failure was on the user side, not the API. Leave priceFetchStatus
      // untouched so 100+ retry chips don't scream "broken" at the user.
      // The TotalsBar surfaces this via priceServerNotConfigured instead.
      console.warn('[BOM] No server/data-center configured; skipping price fetch')
      const finalSet = new Set(fetchingPriceIds.value)
      for (const id of ids) finalSet.delete(id)
      fetchingPriceIds.value = finalSet
      return { ok: false }
    }

    try {
      const marketDataMap = await getAggregatedPrices(effectiveScope, ids)

      const priceMap = new Map(prices.value)
      for (const [id, data] of marketDataMap) {
        priceMap.set(id, {
          itemId: id,
          minPrice: data.minPriceNQ,
          avgPrice: data.currentAveragePriceNQ,
          hqMinPrice: data.minPriceHQ,
          hqAvgPrice: data.currentAveragePriceHQ,
          lastUpdated: data.lastUploadTime,
        })
      }
      prices.value = priceMap

      const statusNext = new Map(priceFetchStatus.value)
      for (const id of ids) statusNext.set(id, 'ok')
      priceFetchStatus.value = statusNext
      return { ok: true }
    } catch (err) {
      console.error('[BOM] Price fetch failed:', err)
      const statusNext = new Map(priceFetchStatus.value)
      for (const id of ids) statusNext.set(id, 'failed')
      priceFetchStatus.value = statusNext
      return { ok: false }
    } finally {
      const finalSet = new Set(fetchingPriceIds.value)
      for (const id of ids) finalSet.delete(id)
      fetchingPriceIds.value = finalSet
    }
  }

  function isPriceFetching(itemId: number): boolean {
    return fetchingPriceIds.value.has(itemId)
  }

  /**
   * Count of rows the user can see and act on whose last price fetch failed.
   * Restricted to flat (raw) materials — intermediate craftable nodes are
   * computed costs, not market lookups, so a failure on them doesn't surface.
   */
  const failedPriceCount = computed(() => {
    let n = 0
    for (const mat of flatMaterials.value) {
      if (priceFetchStatus.value.get(mat.itemId) === 'failed') n++
    }
    return n
  })

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

      if (isTarget && isCraftable) {
        // When targetDefaultMode is 'craft', a craftable target stays on
        // craft regardless of cost — that's the whole point of putting it
        // in the BOM. When mode is 'market', we let it fall through to the
        // cheapest-mode logic below so applyOptimalDefaults can flip it
        // alongside other rows.
        if (targetDefaultMode.value === 'craft') {
          const cost = Number.isFinite(craftCost)
            ? craftCost
            : Number.isFinite(marketCost)
              ? marketCost
              : 0
          costCache.set(node.itemId, cost)
          return cost
        }
      }

      // Honor the "原料準備" setting: when the user has chosen 自採 as the
      // default for raw materials, gatherable non-craftable nodes default
      // to gather (cost 0). Crystals (itemId < 20) and craftable nodes
      // bypass this — crystals can't be gathered, and craftable nodes have
      // their own cheapest-mode logic that includes craft.
      const canGather = acquisitionAvailability.value.get(node.itemId)?.canGather === true
      const isCrystal = node.itemId < 20
      const preferGather =
        settings.rawMaterialDefault === 'gather' &&
        !isCraftable &&
        !isCrystal &&
        canGather

      const candidates: Array<{ mode: AcquisitionSource; cost: number }> = []
      if (preferGather) candidates.push({ mode: 'gather', cost: 0 })
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
    applyTargetDefault()
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
   *
   * `fromUser=true` (default) marks the row as user-touched so the
   * decision row collapses to a single chip. applyOptimalDefaults
   * passes fromUser=false so auto-picked rows stay open until the
   * user explicitly chooses.
   */
  function setAcquisitionMode(itemId: number, mode: AcquisitionSource, fromUser = true) {
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
    if (fromUser) {
      userTouchedModes.value.add(itemId)
      userTouchedModes.value = new Set(userTouchedModes.value)
      trackEvent('bom_acquisition_mode_set', { mode })
    }
    recalcFlat()
  }

  function isModeUserSettled(itemId: number): boolean {
    return userTouchedModes.value.has(itemId)
  }

  /**
   * Walk targets and flip every craftable, non-user-touched target according
   * to the global targetDefaultMode. Batches mode updates into a single
   * acquisitionMode replacement and runs recalcFlat once at the end (vs.
   * the N inner recalcs that would result from looping setAcquisitionMode).
   */
  function applyTargetDefault() {
    const mode = targetDefaultMode.value
    let nextAcq: Map<number, AcquisitionSource> | null = null
    let changed = false
    for (const t of targets.value) {
      if (t.kind !== 'recipe') continue
      if (userTouchedModes.value.has(t.itemId)) continue
      const node = findNode(t.itemId)
      if (!node || !node.recipeId || !node.children || node.children.length === 0) continue

      if (mode === 'craft') {
        if (node.collapsed) {
          node.collapsed = false
          if (!nextAcq) nextAcq = new Map(acquisitionMode.value)
          nextAcq.delete(t.itemId)
          changed = true
        }
      } else {
        if (!node.collapsed) {
          node.collapsed = true
          if (!nextAcq) nextAcq = new Map(acquisitionMode.value)
          nextAcq.set(t.itemId, 'market')
          changed = true
        }
      }
    }
    if (nextAcq) acquisitionMode.value = nextAcq
    if (changed) recalcFlat()
  }

  function toggleRowExpanded(itemId: number) {
    const willBeExpanded = !expandedRows.value.has(itemId)
    if (willBeExpanded) {
      expandedRows.value.add(itemId)
      if (!trackedExpands.has(itemId)) {
        trackedExpands.add(itemId)
        trackEvent('bom_breakdown_expand', { item_id: itemId })
      }
    } else {
      expandedRows.value.delete(itemId)
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

  // ---------------------------------------------------------------------------
  // Route planner actions
  // ---------------------------------------------------------------------------

  /**
   * Loads location data AND the zone/NPC name metadata it references, in that
   * order, so consumers reading via the non-reactive `getZoneMetaSync` /
   * `getNpcNameSync` getters at render time see real names on the very first
   * render after `itemLocations` updates. Without bundling these, the reactive
   * write on `itemLocations` triggers a re-render before the name caches are
   * populated, leaving rows showing `#zone:146` / `#npc:1008907` placeholders.
   */
  async function fetchItemLocationsForRoute(itemIds: number[]) {
    const fresh = await fetchItemLocationsBatch(itemIds)

    const zoneIds = new Set<number>()
    const npcIds = new Set<number>()
    for (const [, info] of fresh) {
      for (const v of info.npcVendors) {
        zoneIds.add(v.zoneId)
        npcIds.add(v.npcId)
      }
      for (const n of info.gatherNodes) zoneIds.add(n.zoneId)
    }
    await Promise.all([
      zoneIds.size > 0 ? fetchZoneMetaBulk([...zoneIds]) : Promise.resolve(),
      npcIds.size > 0 ? fetchNpcNameBulk([...npcIds]) : Promise.resolve(),
    ])

    const merged = new Map(itemLocations.value)
    for (const [id, info] of fresh) merged.set(id, info)
    itemLocations.value = merged
  }

  function setTargetDefaultMode(mode: TargetDefaultMode) {
    if (targetDefaultMode.value === mode) return
    targetDefaultMode.value = mode
    trackEvent('bom_target_default_set', { mode })
    applyTargetDefault()
    if (mode === 'market' && useSettingsStore().crossServer) {
      void fetchCrossWorldBestForTargets()
    }
  }

  /**
   * For every target row (craftable or not) without a cached cross-world
   * entry, ask useCrossWorldPricing to fetch the DC's listings and project
   * the cheapest world into the bom store's caches. The composable handles
   * dedupe + in-flight tracking + the actual network call; this function
   * just batches per-target calls and computes the cheapest projection.
   */
  async function fetchCrossWorldBestForTargets() {
    const settings = useSettingsStore()
    if (!settings.dataCenter) return

    const targetIds = targets.value
      // Exclude company-craft-project meta rows: their placeholder itemId
      // (-1) 404s on Universalis and would render a permanent "跨服查價失敗
      // 重試" chip on a row that has no market price by definition.
      .filter(isMarketableTarget)
      .map((t) => t.itemId)
      .filter((id) => !crossWorldBestPriceMap.value.has(id))

    if (targetIds.length === 0) return

    const { fetchCrossWorldData, crossWorldData } = useCrossWorldPricing()
    await Promise.allSettled(
      targetIds.map((id) => fetchCrossWorldData(id, undefined, { silent: true })),
    )

    // Collect updates locally then commit once — concurrent writes via
    // .value on each closure would race. Composable swallows errors and
    // just leaves data unset, so missing-after-fetch === failure for the
    // row's retry chip.
    const bestUpdates = new Map<number, CrossWorldBest>()
    const statusUpdates = new Map<number, PriceFetchStatus>()
    for (const itemId of targetIds) {
      const rows = crossWorldData.value.get(itemId)
      if (!rows) {
        statusUpdates.set(itemId, 'failed')
        continue
      }
      // aggregateByWorld returns rows sorted by minPriceNQ ascending;
      // first non-zero row IS the cheapest.
      const cheapest = rows.find((r) => r.minPriceNQ > 0)
      if (cheapest) {
        bestUpdates.set(itemId, {
          worldName: cheapest.worldName,
          minPrice: cheapest.minPriceNQ,
          fetchedAt: Date.now(),
        })
      }
      statusUpdates.set(itemId, 'ok')
    }

    if (bestUpdates.size > 0) {
      crossWorldBestPriceMap.value = new Map([...crossWorldBestPriceMap.value, ...bestUpdates])
    }
    if (statusUpdates.size > 0) {
      crossWorldFetchStatus.value = new Map([...crossWorldFetchStatus.value, ...statusUpdates])
    }
  }

  async function retryCrossWorldFetch(itemId: number) {
    const next = new Map(crossWorldBestPriceMap.value)
    next.delete(itemId)
    crossWorldBestPriceMap.value = next
    const status = new Map(crossWorldFetchStatus.value)
    status.delete(itemId)
    crossWorldFetchStatus.value = status
    useCrossWorldPricing().invalidateCrossWorldCache(itemId)
    await fetchCrossWorldBestForTargets()
  }

  function setOptimizeBy(mode: 'gil' | 'hop') {
    if (routeViewPrefs.value.optimizeBy === mode) return
    routeViewPrefs.value = { optimizeBy: mode }
    trackEvent('bom_route_optimize_set', { mode })
  }

  function toggleChecked(itemId: number) {
    const next = new Set(routeViewSession.value.checked)
    const willBeChecked = !next.has(itemId)
    if (willBeChecked) next.add(itemId); else next.delete(itemId)
    routeViewSession.value = { ...routeViewSession.value, checked: next }
    trackEvent('bom_item_check', { item_id: itemId, checked: willBeChecked })
  }

  function toggleExcluded(itemId: number) {
    const next = new Set(routeViewSession.value.excluded)
    if (next.has(itemId)) next.delete(itemId); else next.add(itemId)
    routeViewSession.value = { ...routeViewSession.value, excluded: next }
  }

  function toggleGroupCollapsed(zoneId: number) {
    const next = new Set(routeViewSession.value.collapsedGroups)
    if (next.has(zoneId)) next.delete(zoneId); else next.add(zoneId)
    routeViewSession.value = { ...routeViewSession.value, collapsedGroups: next }
  }

  function recalcFlat() {
    flatMaterials.value = flattenMaterialTree(materialTree.value)
  }

  // Sync composable cache → store projection. BomMarketDetail's onMounted
  // fetches via the composable too; without this watcher, a successful
  // mid-render fetch would leave the bom store's stale 'failed' status
  // intact and the retry chip would stay visible despite data existing.
  watch(
    () => useCrossWorldPricing().crossWorldData.value,
    (data) => {
      let mapChanged = false
      let statusChanged = false
      const nextMap = new Map(crossWorldBestPriceMap.value)
      const nextStatus = new Map(crossWorldFetchStatus.value)
      for (const [itemId, rows] of data) {
        if (!nextMap.has(itemId)) {
          const cheapest = rows.find((r) => r.minPriceNQ > 0)
          if (cheapest) {
            nextMap.set(itemId, {
              worldName: cheapest.worldName,
              minPrice: cheapest.minPriceNQ,
              fetchedAt: Date.now(),
            })
            mapChanged = true
          }
        }
        if (nextStatus.get(itemId) === 'failed') {
          nextStatus.set(itemId, 'ok')
          statusChanged = true
        }
      }
      if (mapChanged) crossWorldBestPriceMap.value = nextMap
      if (statusChanged) crossWorldFetchStatus.value = nextStatus
    },
  )

  // dataCenter change invalidates cache (wrong DC). Re-fetch if still
  // in market mode + crossServer.
  watch(
    () => useSettingsStore().dataCenter,
    () => {
      crossWorldBestPriceMap.value = new Map()
      crossWorldFetchStatus.value = new Map()
      useCrossWorldPricing().invalidateCrossWorldCache()
      if (targetDefaultMode.value === 'market' && useSettingsStore().crossServer) {
        void fetchCrossWorldBestForTargets()
      }
    },
  )

  // crossServer ON → fetch. OFF → keep cache; consumers gate visibility on
  // settings.crossServer, so a flip back ON reuses the warm cache.
  watch(
    () => useSettingsStore().crossServer,
    (on) => {
      if (on && targetDefaultMode.value === 'market') {
        void fetchCrossWorldBestForTargets()
      }
    },
  )

  // Target list changes → fetch new targets (covers calculate path).
  watch(
    () => targetSig.value,
    () => {
      if (targetDefaultMode.value === 'market' && useSettingsStore().crossServer) {
        void fetchCrossWorldBestForTargets()
      }
    },
  )

  return {
    targets,
    materialTree,
    flatMaterials,
    prices,
    acquisitionMode,
    expandedRows,
    userTouchedModes,
    acquisitionAvailability,
    priceFetchStatus,
    fetchingPriceIds,
    failedPriceCount,
    totalCost,
    effectiveGrandTotal,
    marketBaselineTotal,
    savingPercent,
    addTarget,
    removeTarget,
    removeProjectTarget,
    updateTargetQuantity,
    clearTargets,
    toggleCollapsed,
    recalcFlat,
    fetchPrices,
    fetchAcquisitionAvailability,
    isPriceFetching,
    applyOptimalDefaults,
    findNode,
    isCraftableInTree,
    getEffectiveMode,
    setAcquisitionMode,
    isModeUserSettled,
    toggleRowExpanded,
    isRowExpanded,
    // Target default mode
    targetDefaultMode,
    setTargetDefaultMode,
    applyTargetDefault,
    // Cross-world price state
    crossWorldBestPriceMap,
    crossWorldFetchStatus,
    fetchCrossWorldBestForTargets,
    retryCrossWorldFetch,
    // Route planner
    itemLocations,
    routeViewPrefs,
    routeViewSession,
    targetSig,
    fetchItemLocationsForRoute,
    setOptimizeBy,
    toggleChecked,
    toggleExcluded,
    toggleGroupCollapsed,
    // BOM-completed tracking (材料明細 tab)
    bomCompletedKey,
    isBomCompleted,
    toggleBomCompleted,
    clearBomCompleted,
  }
})

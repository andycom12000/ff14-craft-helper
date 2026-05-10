import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
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

export type PriceFetchStatus = 'ok' | 'failed'

export interface CrossWorldBest {
  worldName: string
  minPrice: number
  fetchedAt: number
}

export type AcquisitionSource = 'market' | 'craft' | 'gather' | 'npc'

export type TargetDefaultMode = Extract<AcquisitionSource, 'craft' | 'market'>

export interface BomTarget {
  itemId: number
  /**
   * Recipe id when the target is a craftable item. `null` for items the user
   * wants to procure but can't craft (NPC vendor, FATE rewards, gathered
   * goods imported from a Teamcraft list). Non-craftable targets bypass
   * material expansion and live in flatMaterials as a single raw entry.
   */
  recipeId: number | null
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

// ---------------------------------------------------------------------------
// Route planner — localStorage helpers (module-scope, one store per session)
// ---------------------------------------------------------------------------

const PREFS_KEY = 'bom-route-prefs'
const ROUTE_KEY_PREFIX = 'bom-route::'
const ROUTE_LRU_LIMIT = 8
const WRITE_DEBOUNCE_MS = 500

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

function evictLru() {
  try {
    // First pass: count matching keys cheaply, no JSON parse. Bail out if
    // we're under the limit — the common case after every session mutation
    // is "nothing to do" and we shouldn't be paying parse cost for it.
    const matchingKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (k.startsWith(ROUTE_KEY_PREFIX)) matchingKeys.push(k)
    }
    if (matchingKeys.length <= ROUTE_LRU_LIMIT) return

    // Over limit — only now parse mtime to decide who to evict.
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
    const toRemove = keys.length - ROUTE_LRU_LIMIT
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
  const fetchingCrossWorldIds = ref<Set<number>>(new Set())

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
        evictLru()
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

  function addTarget(target: BomTarget) {
    // Dedupe by itemId — same item shouldn't appear twice even with different
    // recipe choices, and itemId is the only stable key for non-craftable
    // targets (recipeId is null for those).
    const existing = targets.value.find(t => t.itemId === target.itemId)
    if (existing) {
      existing.quantity += target.quantity
    } else {
      targets.value.push(target)
    }
  }

  function removeTarget(itemId: number) {
    targets.value = targets.value.filter(t => t.itemId !== itemId)
  }

  function updateTargetQuantity(itemId: number, quantity: number) {
    const target = targets.value.find(t => t.itemId === itemId)
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
    fetchingCrossWorldIds.value = new Set()
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
    const ids = itemIds ?? flatMaterials.value.map((m) => m.itemId)
    for (const t of targets.value) {
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
      if (t.recipeId === null) continue
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
   * For each craftable target without a cached cross-world entry, fetch
   * the DC's listings and pick the cheapest world (incl. home).
   */
  async function fetchCrossWorldBestForTargets() {
    const settings = useSettingsStore()
    if (!settings.dataCenter) return

    const targetIds = targets.value
      .filter((t) => t.recipeId !== null)
      .map((t) => t.itemId)
      .filter((id) => !crossWorldBestPriceMap.value.has(id))
      .filter((id) => !fetchingCrossWorldIds.value.has(id))

    if (targetIds.length === 0) return

    const inflight = new Set(fetchingCrossWorldIds.value)
    for (const id of targetIds) inflight.add(id)
    fetchingCrossWorldIds.value = inflight

    // Collect into local maps then commit ONCE — assigning .value inside
    // each Promise.allSettled closure races: each closure captures the
    // current .value at write time, so concurrent writes lose entries.
    // Mirrors the fetchPrices pattern.
    const bestUpdates = new Map<number, CrossWorldBest>()
    const statusUpdates = new Map<number, PriceFetchStatus>()

    const { fetchCrossWorldData, crossWorldData } = useCrossWorldPricing()

    // Go through the composable so its dedupe/loading state is shared with
    // BomMarketDetail. If the user expands a row mid-fetch, the composable's
    // `loading.has(id)` short-circuits the redundant call.
    await Promise.allSettled(
      targetIds.map((id) => fetchCrossWorldData(id, undefined, { silent: true })),
    )

    // Composable swallows errors and just leaves data unset. Treat
    // missing-after-fetch as failure for the row's retry chip.
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

    const after = new Set(fetchingCrossWorldIds.value)
    for (const id of targetIds) after.delete(id)
    fetchingCrossWorldIds.value = after
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
    if (next.has(itemId)) next.delete(itemId); else next.add(itemId)
    routeViewSession.value = { ...routeViewSession.value, checked: next }
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
    fetchingCrossWorldIds,
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
  }
})

<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import BomTargetList from '@/components/bom/BomTargetList.vue'
import BomSettingsCard from '@/components/bom/BomSettingsCard.vue'
import BomTotalsBar from '@/components/bom/BomTotalsBar.vue'
import BomTotalsReceipt from '@/components/bom/BomTotalsReceipt.vue'
import BomDecisionTable from '@/components/bom/BomDecisionTable.vue'
import BomRoutePlanner from '@/components/bom/BomRoutePlanner.vue'
import BomImportDialog from '@/components/bom/BomImportDialog.vue'
import RecipeSearchSidebar from '@/components/recipe/RecipeSearchSidebar.vue'
import FlowBreadcrumb from '@/components/common/FlowBreadcrumb.vue'
import { useStickyToolbarHeight } from '@/composables/useStickyToolbarHeight'
import { useBomStore } from '@/stores/bom'
import { useBatchStore } from '@/stores/batch'
import { useLocaleStore } from '@/stores/locale'
import { loadingState } from '@/services/local-data-source'
import { buildMaterialTree, flattenMaterialTree } from '@/services/bom-calculator'
import { getRecipe } from '@/api/xivapi'

const bomStore = useBomStore()
const batchStore = useBatchStore()
const localeStore = useLocaleStore()
const router = useRouter()

const isLoadingData = computed(() => {
  const s = loadingState[localeStore.current]
  return s.recipes || s.items || s.rlt
})

const searchSidebarOpen = ref(false)
const importDialogOpen = ref(false)
const calculating = ref(false)

const fetchingPrices = computed(() => bomStore.fetchingPriceIds.size > 0)
const calculated = computed(() => bomStore.materialTree.length > 0)
const loadingMessage = ref('正在計算材料需求...')

// ─── Section / step flow ───────────────────────────────────────────────────
// 2-step flow mirroring BatchView's prepare → shopping pattern.
//   0 = 準備清單 (targets + settings, calc not yet run)
//   1 = 採買清單 (totals + 材料明細 / 採買路線), reached after calc
// "Calculating" is a transient state surfaced via the FlowBreadcrumb pending
// rail and a transient skeleton panel — it's not a navigable step.

const sectionPrepare = ref<HTMLElement>()
const sectionResults = ref<HTMLElement>()

// Mobile sticky offset: track FlowBreadcrumb height for scroll-margin-top.
const { targetRef: flowBreadcrumbRef, height: flowHeight } = useStickyToolbarHeight()

// Tracks which already-completed sections the user has manually re-expanded.
const expandedSections = ref(new Set<number>())

const currentStep = computed(() => (calculated.value ? 1 : 0))

function isSectionCollapsed(sectionStep: number): boolean {
  return sectionStep < currentStep.value && !expandedSections.value.has(sectionStep)
}

function toggleSection(sectionStep: number): void {
  const next = new Set(expandedSections.value)
  if (next.has(sectionStep)) next.delete(sectionStep)
  else next.add(sectionStep)
  expandedSections.value = next
}

function navigateToStep(step: number): void {
  const target = step === 0 ? sectionPrepare : sectionResults
  if (!target.value) return
  if (step === 0 && !expandedSections.value.has(0)) {
    expandedSections.value = new Set(expandedSections.value).add(0)
  }
  nextTick(() => {
    target.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

function clearAndStartOver(): void {
  bomStore.clearTargets()
  expandedSections.value = new Set()
  nextTick(() => {
    sectionPrepare.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

const targetItemIds = computed(() => bomStore.targets.map((t) => t.itemId))

const nonCraftableCount = computed(
  () => bomStore.targets.filter((t) => t.recipeId === null).length,
)

async function handleCalculate() {
  if (bomStore.targets.length === 0) {
    ElMessage.warning('請先加入至少一個製作目標')
    return
  }

  calculating.value = true
  // Re-running calc starts a fresh section-collapse state — any "i'd
  // re-opened section 0" toggle becomes stale once new results land.
  expandedSections.value = new Set()

  try {
    loadingMessage.value = '正在展開子配方...'
    const tree = await buildMaterialTree(bomStore.targets)
    bomStore.materialTree = tree

    loadingMessage.value = '正在整理購物清單...'
    const flat = flattenMaterialTree(tree)
    bomStore.flatMaterials = flat

    loadingMessage.value = '正在比對市價、NPC、自製...'
    const [priceResult] = await Promise.all([
      bomStore.fetchPrices(flat.map((m) => m.itemId)),
      bomStore.fetchAcquisitionAvailability(flat.map((m) => m.itemId)),
    ])
    bomStore.applyOptimalDefaults()

    if (priceResult.ok) {
      ElMessage.success('材料計算完成')
    } else {
      ElMessage.warning('部分價格查詢失敗，可在該列點「重試」')
    }

    // primeRouteData runs reactively via the npcGatherSig watcher whenever
    // flatMaterials or acquisitionMode change, so no manual trigger here.

    await nextTick()
    sectionResults.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (err) {
    console.error('[BOM] Calculation failed:', err)
    ElMessage.error('材料計算失敗，請稍後再試')
  } finally {
    calculating.value = false
  }
}

function handleAddFromSearch(recipe: import('@/stores/recipe').Recipe) {
  bomStore.addTarget({
    itemId: recipe.itemId,
    recipeId: recipe.id,
    name: recipe.name,
    icon: recipe.icon,
    quantity: 1,
    amountResult: recipe.amountResult,
  })
  ElMessage.success(`已加入「${recipe.name}」`)
}

async function handleRefreshPrices() {
  const r = await bomStore.fetchPrices()
  if (!r.ok) ElMessage.error('價格取得失敗，請稍後再試')
}

async function handleSendToBatch() {
  // Batch is craft-only; non-craftable targets (recipeId === null) have no
  // recipe to optimize and are silently filtered. The user can still see
  // them in BOM for purchase planning.
  const craftableTargets = bomStore.targets.filter(
    (t): t is typeof t & { recipeId: number } => t.recipeId !== null,
  )
  if (craftableTargets.length === 0) {
    ElMessage.warning(
      bomStore.targets.length === 0 ? '清單為空' : '清單中沒有可批量製作的目標',
    )
    return
  }
  try {
    const recipes = await Promise.all(
      craftableTargets.map((t) => getRecipe(t.recipeId)),
    )
    for (let i = 0; i < recipes.length; i++) {
      batchStore.addTarget(recipes[i])
      batchStore.updateQuantity(craftableTargets[i].recipeId, craftableTargets[i].quantity)
    }
    const skipped = bomStore.targets.length - craftableTargets.length
    ElMessage.success(
      skipped > 0
        ? `已送出 ${craftableTargets.length} 筆到批量（${skipped} 筆非製作物品已跳過）`
        : `已送出 ${craftableTargets.length} 筆到批量計算`,
    )
    router.push('/batch')
  } catch (err) {
    console.error('[BOM] Send to batch failed:', err)
    ElMessage.error('送出到批量失敗')
  }
}

function handleImported() {
  if (bomStore.targets.length > 0) {
    ElMessage.success('已匯入，按「計算」開始拆解素材')
  }
}

// ─── Route tab state ───────────────────────────────────────────────────────

const VIEW_TAB_KEY = 'bom-view-tab'
type ViewTab = 'detail' | 'route'

const bomViewTab = ref<ViewTab>(
  (sessionStorage.getItem(VIEW_TAB_KEY) as ViewTab) || 'detail',
)
watch(bomViewTab, (v) => {
  try { sessionStorage.setItem(VIEW_TAB_KEY, v) } catch {}
})

const routeBadgeCount = computed(() => {
  let n = 0
  for (const m of bomStore.flatMaterials) {
    if (!m.isRaw) continue
    if (m.itemId < 20) continue // crystals
    const mode = bomStore.getEffectiveMode(m.itemId)
    if (mode !== 'npc' && mode !== 'gather') continue
    if (bomStore.routeViewSession.excluded.has(m.itemId)) continue
    if (!bomStore.routeViewSession.checked.has(m.itemId)) n++
  }
  return n
})

const tabOptions = computed(() => [
  { label: '材料明細', value: 'detail' as const },
  {
    label: `採買路線${routeBadgeCount.value > 0 ? ` · ${routeBadgeCount.value}` : ''}`,
    value: 'route' as const,
  },
])

// ─── Lazy prime route data ──────────────────────────────────────────────────

/**
 * Fetch location data for any npc/gather raw materials that aren't already
 * cached in `bomStore.itemLocations`. Idempotent — called whenever the
 * route-relevant set might have changed (calc finished, user toggled a row
 * to npc/gather, route tab opened). The store's underlying LRU dedupes
 * already-fetched ids, so cheap re-runs are fine.
 */
async function primeRouteData() {
  const missing: number[] = []
  for (const m of bomStore.flatMaterials) {
    if (!m.isRaw) continue
    if (m.itemId < 20) continue
    const mode = bomStore.getEffectiveMode(m.itemId)
    if (mode !== 'npc' && mode !== 'gather') continue
    if (bomStore.itemLocations.has(m.itemId)) continue
    missing.push(m.itemId)
  }
  if (missing.length > 0) {
    await bomStore.fetchItemLocationsForRoute(missing)
  }
}

// Build a stable signature of "npc/gather rows in flatMaterials" so the
// watcher below fires exactly once per relevant change — switching a single
// row from market → gather, recalculating, restoring a session, etc.
const npcGatherSig = computed(() => {
  const ids: string[] = []
  for (const m of bomStore.flatMaterials) {
    if (!m.isRaw) continue
    if (m.itemId < 20) continue
    const mode = bomStore.getEffectiveMode(m.itemId)
    if (mode === 'npc' || mode === 'gather') ids.push(`${m.itemId}:${mode}`)
  }
  return ids.sort().join(',')
})

// Fire on actual changes only — the route-tab watcher below covers the
// case where the user opens the route tab without having toggled any rows.
// `immediate: true` here used to spend ~100–300ms fetching zone-meta at
// mount even when the user never visited the route tab.
watch(npcGatherSig, () => {
  void primeRouteData()
})

watch(bomViewTab, async (v) => {
  if (v === 'route') await primeRouteData()
}, { immediate: true })

// ─── Receipt ↔ Strip swap ─────────────────────────────────────────────────
// The full Receipt sits in flow at the top of Section 2; the slim Strip
// lives in the sticky band that follows the user. Show the strip only
// after the receipt scrolls out of view, so they never compete for space.

const receiptEl = ref<HTMLElement | null>(null)
const stripVisible = ref(false)
let receiptObserver: IntersectionObserver | null = null

watch(receiptEl, (el, prev) => {
  if (prev) receiptObserver?.unobserve(prev)
  if (!el) {
    stripVisible.value = false
    return
  }
  if (!receiptObserver) {
    receiptObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // The receipt's bottom edge has crossed above the viewport top —
          // the user has scrolled past it, so the strip can take over.
          stripVisible.value = !entry.isIntersecting && entry.boundingClientRect.bottom < 0
        }
      },
      { threshold: 0, rootMargin: '0px' },
    )
  }
  receiptObserver.observe(el)
})

onBeforeUnmount(() => {
  receiptObserver?.disconnect()
  receiptObserver = null
})
</script>

<template>
  <div class="bom-view" v-loading="isLoadingData" :style="{ '--bom-flow-h': `${flowHeight}px` }">
    <!-- Page header — always visible so the BOM page reads as a sibling
         of Batch / Simulator / Gearset, all of which keep their title
         row throughout the flow. The welcome copy below the title only
         shows in the empty state so post-calc the chrome stays slim. -->
    <header class="bom-view__header">
      <h2>
        購物清單
        <span class="bom-view__beta" aria-label="實驗中">實驗中</span>
      </h2>
      <p v-if="!calculated" class="view-desc">想做什麼就加進來，我會幫你算好材料、查市價、估省下多少錢。</p>
    </header>

    <FlowBreadcrumb
      ref="flowBreadcrumbRef"
      class="mobile-sticky-toolbar bom-flow"
      :steps="[
        { label: '準備清單', icon: '1' },
        { label: '採買清單', icon: '2' },
      ]"
      :active-step="currentStep"
      :pending="calculating"
      pending-label="計算中…"
      @navigate="navigateToStep"
    >
      <template v-if="calculated" #trailing>
        <el-button text size="small" class="bom-flow__reset" @click="clearAndStartOver">
          <span aria-hidden="true">⟳</span> 重新開始
        </el-button>
      </template>
    </FlowBreadcrumb>

    <!-- Section 1 — 準備清單 (targets + settings + calc CTA). Auto-collapses
         once results exist; user can re-expand from the header. -->
    <section
      ref="sectionPrepare"
      class="bom-section"
      :class="{ 'bom-section--collapsed': isSectionCollapsed(0) }"
    >
      <component
        :is="currentStep > 0 ? 'button' : 'div'"
        type="button"
        class="section-header"
        :class="{ 'section-header--clickable': currentStep > 0 }"
        :aria-expanded="currentStep > 0 ? !isSectionCollapsed(0) : undefined"
        @click="currentStep > 0 ? toggleSection(0) : undefined"
      >
        <span
          class="section-step"
          :class="{ 'section-step--active': currentStep === 0, 'section-step--done': currentStep > 0 }"
          aria-hidden="true"
        >
          <template v-if="currentStep > 0">✓</template>
          <template v-else>1</template>
        </span>
        <h2 class="section-title">準備清單</h2>
        <span class="section-desc">
          {{ currentStep > 0 ? `${bomStore.targets.length} 個目標` : '加入要製作的物品並設定查價條件' }}
        </span>
        <span v-if="currentStep > 0" class="section-toggle">
          {{ isSectionCollapsed(0) ? '展開' : '收起' }}
        </span>
      </component>

      <div v-if="!isSectionCollapsed(0)" class="prepare-grid">
        <div class="prepare-main">
          <BomTargetList
            @calculate="handleCalculate"
            @open-search="searchSidebarOpen = true"
            @open-import="importDialogOpen = true"
          />
        </div>
        <div class="prepare-side">
          <BomSettingsCard />

          <div v-if="bomStore.targets.length > 0" class="prepare-cta">
            <el-button
              type="primary"
              size="large"
              class="prepare-cta__btn"
              :loading="calculating"
              @click="handleCalculate"
            >
              {{ calculating ? '計算中…' : '計算材料需求' }}
            </el-button>
            <p v-if="nonCraftableCount > 0" class="prepare-cta__note">
              {{ nonCraftableCount }} 件無配方會直接列為採買
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Calculation transient panel — surfaced separately so the user gets
         a visible progress affordance even when section 1 is collapsed. -->
    <section v-if="calculating" class="bom-section bom-section--transient">
      <div class="section-header section-header--transient">
        <span class="section-spinner" aria-hidden="true" />
        <h2 class="section-title">材料計算中</h2>
        <span class="section-desc">{{ loadingMessage }}</span>
      </div>
      <div class="bom-loading">
        <el-skeleton :rows="5" animated />
      </div>
    </section>

    <!-- Section 2 — 採買清單 (totals + 材料明細 / 採買路線). Reached after
         calc; nothing renders here until results exist.

         FlowBreadcrumb above already owns the "you are on step 2" rail,
         so this section drops its inline step badge to keep wayfinding
         single-railed and reclaim the height for the receipt. -->
    <section v-if="calculated && !calculating" ref="sectionResults" class="bom-section bom-section--results">
      <!-- Sticky band leads: view tabs (always) + condensed totals
           strip (only on 材料明細, only when the receipt has scrolled
           out). Putting tabs at the top of the section gives the user
           a constant wayfinding rail; the receipt sits below as the
           tab's primary content. Single sticky element keeps the
           chrome flush — no scroll content leaks between slabs. -->
      <div
        class="results-sticky"
        :class="{ 'results-sticky--with-strip': stripVisible && bomViewTab === 'detail' }"
      >
        <el-segmented
          v-if="!(fetchingPrices && bomStore.prices.size === 0)"
          v-model="bomViewTab"
          :options="tabOptions"
          class="results-tabs"
        />

        <Transition name="strip-fade">
          <div v-if="stripVisible && bomViewTab === 'detail'" class="results-strip">
            <BomTotalsBar
              :fetching-prices="fetchingPrices"
              @refresh-prices="handleRefreshPrices"
              @send-to-batch="handleSendToBatch"
            />
          </div>
        </Transition>
      </div>

      <!-- Wide receipt — only on 材料明細. Lives below the sticky tabs
           so the tabs stay pinned while the receipt scrolls naturally.
           The strip above takes over once the receipt is out of view. -->
      <div ref="receiptEl">
        <BomTotalsReceipt
          v-if="!(fetchingPrices && bomStore.prices.size === 0) && bomViewTab === 'detail'"
          :fetching-prices="fetchingPrices"
          @refresh-prices="handleRefreshPrices"
          @send-to-batch="handleSendToBatch"
        />
      </div>

      <div v-if="fetchingPrices && bomStore.prices.size === 0" class="bom-loading">
        <el-skeleton :rows="4" animated />
        <p class="loading-text">正在取得市場價格...</p>
      </div>
      <template v-else>
        <BomDecisionTable
          v-if="bomViewTab === 'detail'"
          :materials="bomStore.flatMaterials"
          :material-tree="bomStore.materialTree"
          :target-item-ids="targetItemIds"
        />
        <BomRoutePlanner v-else-if="bomViewTab === 'route'" />
      </template>
    </section>

    <RecipeSearchSidebar
      v-model="searchSidebarOpen"
      context="加入購物清單"
      @add="handleAddFromSearch"
    />
    <BomImportDialog v-model="importDialogOpen" @imported="handleImported" />
  </div>
</template>

<style scoped>
.bom-view {
  /* Match BatchView's reading-width ladder so both pages read as siblings
   * across viewports. The route planner inside Section 2 uses container
   * queries so it adapts to whatever width the cap leaves it. */
  max-width: 1200px;
  --page-accent: var(--app-craft);
  --page-accent-dim: var(--app-craft-dim);
}

@media (min-width: 1440px) {
  .bom-view {
    max-width: 1400px;
  }
}

@media (min-width: 1920px) {
  .bom-view {
    max-width: 1700px;
  }
}

@media (min-width: 2560px) {
  .bom-view {
    max-width: 2100px;
  }
}

.bom-view__header {
  margin-bottom: 12px;
}

.bom-view__header h2 {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.bom-view__beta {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-toast-gold, oklch(0.78 0.14 78)) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-toast-gold, oklch(0.78 0.14 78)) 50%, transparent);
  color: var(--app-toast-gold, oklch(0.78 0.14 78));
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.04em;
  line-height: 1;
  /* CJK optical centerline — Latin italic glyphs sit higher in the line-box
   * than CJK; nudge the pill down so it visually aligns with the title. */
  margin-top: 6px;
}

.view-desc {
  color: var(--app-text-muted);
  font-size: 14px;
  margin: 4px 0 0;
}

.bom-flow {
  margin-bottom: 8px;
}

:deep(.bom-flow__reset) {
  font-size: 13px;
  padding-inline: 8px;
}

:deep(.bom-flow__reset:focus-visible) {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
  border-radius: 4px;
}

@media (max-width: 640px) {
  :deep(.bom-flow__reset) {
    font-size: 12px;
    padding-inline: 6px;
    min-height: var(--touch-target-min, 44px);
  }
}

/* ── Section shell — mirrors BatchView's section pattern so the prepare /
   results step rhythm reads consistently across both pages. ───────────── */
.bom-section {
  scroll-margin-top: 24px;
  margin-bottom: 8px;
  padding-top: 24px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.bom-section:first-of-type {
  border-top: none;
  padding-top: 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  width: 100%;
  text-align: left;
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 0;
  min-height: 44px;
  flex-wrap: wrap;
}

.section-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  border: 2px solid var(--el-border-color);
}

.section-step--active {
  background: var(--app-toast-gold, var(--el-color-primary));
  color: var(--el-bg-color);
  border-color: var(--app-toast-gold, var(--el-color-primary));
}

.section-step--done {
  background: var(--el-color-success-light-3);
  color: var(--el-color-success-dark-2);
  border-color: var(--el-color-success-light-3);
  font-size: 11px;
}

.section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  white-space: nowrap;
}

.section-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.section-toggle {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.section-header--clickable {
  cursor: pointer;
  border-radius: 6px;
  padding: 8px 12px;
  margin: 0 -12px 16px;
  transition: background-color 0.15s;
}

.section-header--clickable:hover {
  background: var(--el-fill-color-light);
}

.section-header--clickable:focus-visible {
  outline: 2px solid var(--page-accent, var(--app-craft));
  outline-offset: 2px;
}

.bom-section--collapsed {
  padding-bottom: 0;
  margin-bottom: 0;
}

.bom-section--collapsed .section-header--clickable {
  margin-bottom: 0;
}

/* Calculation transient panel — dashed top border distinguishes it from
 * the navigable numbered sections. */
.bom-section--transient {
  border-top-style: dashed;
  border-top-color: var(--page-accent-dim, var(--el-border-color));
}

.section-header--transient {
  margin-bottom: 12px;
}

.section-spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--page-accent, var(--app-craft));
  border-top-color: transparent;
  animation: section-spin 0.9s linear infinite;
  flex-shrink: 0;
}

@keyframes section-spin {
  to { transform: rotate(360deg); }
}

/* ── Prepare grid — single-column by default, two-column @ ≥1440px to match
   BatchView's threshold. Below 1440 the targets list owns the full width
   and the settings card stacks underneath. ─────────────────────────────── */
.prepare-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.prepare-main {
  flex: 1;
  min-width: 0;
}

.prepare-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.prepare-cta {
  display: flex;
}

.prepare-cta__btn {
  flex: 1;
  background: var(--app-craft);
  border-color: var(--app-craft);
}

.prepare-cta__btn:hover {
  background: oklch(from var(--app-craft) calc(l + 0.06) c h);
  border-color: oklch(from var(--app-craft) calc(l + 0.06) c h);
}

.prepare-cta__note {
  margin: 8px 4px 0;
  font-size: 12px;
  color: var(--app-text-muted);
  line-height: 1.5;
}

@media (min-width: 1440px) {
  .prepare-grid {
    flex-direction: row;
    gap: 20px;
    align-items: flex-start;
  }
  .prepare-side {
    flex: 0 0 340px;
    position: sticky;
    top: 100px;
  }
}

@media (min-width: 1920px) {
  .prepare-side {
    flex: 0 0 380px;
  }
}

@media (min-width: 2560px) {
  .prepare-side {
    flex: 0 0 420px;
  }
}

/* ── Results sticky stack — tabs lead (always pinned at the top of
   the section), strip joins them only when the receipt has scrolled
   out of view (driven by IntersectionObserver). Single sticky element
   keeps the chrome flush so no scroll content leaks between slabs. ─ */
.results-sticky {
  position: sticky;
  /* `top: -20px` (matching .app-main's 20px padding) pins the wrapper at
   * y=0 of the viewport instead of y=20. Without it, content scrolls
   * through the 20px padding band above the wrapper because overflow:auto
   * containers don't clip content out of their padding zone.
   *
   * Padding-top compensates the negative `top` so the inner tabs sit
   * at the same visual offset they would with top:0 + padding-top:0
   * — no extra cream "frame" around the pill bar. */
  top: -20px;
  z-index: 5;
  scroll-margin-top: -20px;
  background: var(--app-bg);
  padding: 20px 0 0;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Only paint the boundary shadow once the strip has materialized — when
 * the receipt is still on-screen, the band is just the tabs and we
 * don't need the heavier "pinned chrome" cue. */
.results-sticky--with-strip {
  padding-bottom: 8px;
  box-shadow:
    0 1px 0 var(--app-border),
    0 8px 18px -10px oklch(0.28 0.04 55 / 0.22);
}

.results-strip {
  /* Inherits gap from .results-sticky's flex */
}

.strip-fade-enter-active,
.strip-fade-leave-active {
  transition: opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.strip-fade-enter-from,
.strip-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Tabs honor the Jam-Jar Rule (BOM = crafting → cocoa). Fully pill-
 * shaped (999px) on both the container and the active item so the
 * inner pill's curvature matches the outer frame instead of reading
 * as a square inside a rounded rectangle. */
.results-tabs {
  background: color-mix(in srgb, var(--app-craft) 6%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-craft) 22%, var(--app-border));
  padding: 3px;
  border-radius: 999px;
  --el-color-primary: var(--app-craft);
  display: inline-flex;
  width: auto;
  align-self: flex-start;
}

.results-tabs :deep(.el-segmented__item) {
  color: var(--app-text);
  font-family: 'Noto Serif TC', serif;
  font-size: 15px;
  font-weight: 600;
  padding: 6px 20px;
  letter-spacing: 0.02em;
  border-radius: 999px;
  transition: background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1),
    color 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

.results-tabs :deep(.el-segmented__item.is-selected) {
  background: var(--app-craft);
  color: var(--app-cream-surface, #faf7f2);
  /* No box-shadow — drop shadow under a pill creates a visible "edge"
   * that can read as a square corner against the rounded container. */
}

.results-tabs :deep(.el-segmented__item:hover:not(.is-selected)) {
  background: color-mix(in srgb, var(--app-craft) 12%, transparent);
  color: var(--app-craft);
}

.bom-loading {
  padding: 24px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 12px;
}

.loading-text {
  text-align: center;
  color: var(--app-text-muted);
  margin-top: 12px;
  font-size: 13px;
}

@media (max-width: 900px) {
  .results-sticky {
    position: static;
    padding: 0;
    box-shadow: none;
  }

  .bom-section {
    padding-top: 16px;
    margin-bottom: 4px;
  }

  .section-header {
    gap: 8px;
    margin-bottom: 10px;
  }

  .section-step {
    width: 24px;
    height: 24px;
    font-size: 12px;
    border-width: 1.5px;
  }

  .section-title {
    font-size: 16px;
  }

  .section-desc {
    flex-basis: 100%;
    margin-left: 32px;
  }

  .section-toggle {
    flex-basis: 100%;
    margin-left: 32px;
    padding: 10px 0;
    font-size: 13px;
    text-align: left;
  }

  .section-header--clickable {
    padding: 6px 8px;
    margin: 0 -8px 10px;
  }
}

/* Mobile (≤768): page title is shown in the global app bar; hide the
 * in-view title row to mirror BatchView's behavior and reclaim space.
 * Sections also need to clear the sticky FlowBreadcrumb when scrolled to,
 * tracked dynamically via --bom-flow-h. */
@media (max-width: 768px) {
  .bom-view__header {
    display: none;
  }

  .bom-flow {
    padding-top: 10px;
    padding-bottom: 10px;
    margin-bottom: 8px;
  }

  .bom-section {
    scroll-margin-top: calc(var(--mobile-app-bar-h, 52px) + var(--bom-flow-h, 100px) + 8px);
  }
}

/* Mobile (≤640): flatten any nested el-card inside a section so the
 * section-header owns the title and the body sits directly on the page. */
@media (max-width: 640px) {
  .bom-section :deep(.el-card),
  .bom-section :deep(.el-card.is-never-shadow) {
    border: none;
    background: transparent;
    box-shadow: none;
    border-radius: 0;
    overflow: visible;
  }

  .bom-section :deep(.el-card__header) {
    padding: 0 0 8px;
    border-bottom: 1px dashed var(--el-border-color-lighter);
    margin-bottom: 12px;
  }

  .bom-section :deep(.el-card__body) {
    padding: 0;
  }
}
</style>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useBatchStore } from '@/stores/batch'
import { useSettingsStore } from '@/stores/settings'
import { useGearsetsStore } from '@/stores/gearsets'
import { runBatchOptimization } from '@/services/batch-optimizer'
import { SOLVE_CANCELLED } from '@/solver/worker'
import { trackEvent, trackError } from '@/utils/analytics'
import CostSummaryPanel from '@/components/batch/CostSummaryPanel.vue'
import BatchList from '@/components/batch/BatchList.vue'
import BatchSettings from '@/components/batch/BatchSettings.vue'
import BatchProgress from '@/components/batch/BatchProgress.vue'
import ShoppingList from '@/components/batch/ShoppingList.vue'
import SelfCraftSuggestions from '@/components/batch/SelfCraftSuggestions.vue'
import VendorRoster from '@/components/batch/VendorRoster.vue'
import TodoList from '@/components/batch/TodoList.vue'
import ExceptionList from '@/components/batch/ExceptionList.vue'
import RecipeSearchSidebar from '@/components/recipe/RecipeSearchSidebar.vue'
import BuffRecommendationCard from '@/components/batch/BuffRecommendationCard.vue'
import FlowBreadcrumb from '@/components/common/FlowBreadcrumb.vue'
import ConfirmNewBatch from '@/components/batch/ConfirmNewBatch.vue'
import GearsetSheet from '@/components/gearset/GearsetSheet.vue'
import { useStickyToolbarHeight } from '@/composables/useStickyToolbarHeight'
import { JOB_NAMES } from '@/utils/jobs'

const batchStore = useBatchStore()
const settings = useSettingsStore()
const gearsets = useGearsetsStore()

const sidebarOpen = ref(false)

// Section refs for scroll navigation (3 navigable steps; calculation panel is transient)
const sectionPrepare = ref<HTMLElement>()
const sectionShopping = ref<HTMLElement>()
const sectionTodo = ref<HTMLElement>()

// Track which completed sections are manually expanded
const expandedSections = ref(new Set<number>())

function isSectionCollapsed(sectionStep: number) {
  return sectionStep < currentStep.value && !expandedSections.value.has(sectionStep)
}

function toggleSection(sectionStep: number) {
  const next = new Set(expandedSections.value)
  if (next.has(sectionStep)) {
    next.delete(sectionStep)
  } else {
    next.add(sectionStep)
  }
  expandedSections.value = next
}

// Sub-section toggle state under step 2 (採購建議 / 採購清單).
type SubKey = 'suggestions' | 'shopping'
const collapsedSubsections = ref<Set<SubKey>>(new Set())

function isSubsectionCollapsed(key: SubKey) {
  return collapsedSubsections.value.has(key)
}

function toggleSubsection(key: SubKey) {
  const next = new Set(collapsedSubsections.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedSubsections.value = next
}

const hasSuggestions = computed(() => {
  const r = batchStore.results
  if (!r) return false
  return (
    r.npcPurchaseCandidates.length > 0 ||
    r.selfCraftCandidates.length > 0 ||
    !!r.buffRecommendation
  )
})

const suggestionsCount = computed(() => {
  const r = batchStore.results
  if (!r) return 0
  return (
    r.npcPurchaseCandidates.length +
    r.selfCraftCandidates.length +
    (r.buffRecommendation ? 1 : 0)
  )
})

// 3-step flow: 0=prepare, 1=shopping, 2=todo, 3=all done (overflow → all dots ✓).
// Calculation is a transient state, surfaced via `pending` instead of a step slot.
const currentStep = computed(() => {
  if (batchStore.results) {
    const allTodoDone = batchStore.results.todoList.length > 0
      && batchStore.results.todoList.every(t => t.done)
    if (allTodoDone) return 3
    if (batchStore.allShoppingDone) return 2
    return 1
  }
  return 0
})

// Cost summary computed values
const singleServerTotal = computed(() => {
  if (!batchStore.results?.crossWorldCache || batchStore.results.crossWorldCache.size === 0) return null
  const server = settings.server
  let total = 0
  for (const group of batchStore.results.serverGroups) {
    for (const item of group.items) {
      const worlds = batchStore.results.crossWorldCache.get(item.itemId)
      if (!worlds) {
        total += item.unitPrice * item.amount
        continue
      }
      const myWorld = worlds.find(w => w.worldName === server)
      const localPrice = myWorld
        ? (item.type === 'hq' ? myWorld.minPriceHQ : myWorld.minPriceNQ)
        : 0
      total += (localPrice > 0 ? localPrice : item.unitPrice) * item.amount
    }
  }
  return total
})

const savingPercent = computed(() => {
  const single = singleServerTotal.value
  const gt = batchStore.effectiveGrandTotal
  if (!single || single === 0 || gt === 0) return null
  return Math.round((1 - gt / single) * 100)
})


function navigateToStep(step: number) {
  const sections = [sectionPrepare, sectionShopping, sectionTodo]
  const target = sections[step]
  if (!target) return
  // Ensure the target section is expanded before scrolling so we land on
  // visible content rather than a collapsed header.
  if (!expandedSections.value.has(step)) {
    expandedSections.value = new Set(expandedSections.value).add(step)
  }
  nextTick(() => {
    target.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

function startNewBatch() {
  batchStore.resetAll()
  expandedSections.value = new Set()
  nextTick(() => {
    sectionPrepare.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

// Mobile sticky offset: measure FlowBreadcrumb height into a CSS var so
// scroll-margin-top tracks the real toolbar height (which changes with
// active label length / pending state).
const { targetRef: flowBreadcrumbRef, height: flowHeight } = useStickyToolbarHeight()

// Auto-scroll to shopping section when optimization finishes
watch(() => batchStore.isRunning, (running, wasRunning) => {
  if (wasRunning && !running && batchStore.results) {
    nextTick(() => {
      sectionShopping.value?.scrollIntoView({ behavior: 'smooth' })
    })
  }
})

/* === Gearset sheet === */
const gearsetSheetOpen = ref(false)
const gearsetSheetFocusJob = ref<string | null>(null)

function openGearsetSheet(focusJob?: string | null) {
  gearsetSheetFocusJob.value = focusJob ?? null
  gearsetSheetOpen.value = true
}

/* Jobs used by current batch */
const usedJobs = computed(() => {
  const set = new Set<string>()
  for (const t of batchStore.targets) {
    if (t.recipe.job) set.add(t.recipe.job)
  }
  return set
})

/* Missing-gearset jobs in the batch (no craftsmanship & control set) */
const missingGearsetJobs = computed<string[]>(() => {
  const result: string[] = []
  for (const job of usedJobs.value) {
    const gs = gearsets.getGearsetForJob(job)
    if (!gs || (gs.craftsmanship === 0 && gs.control === 0)) {
      result.push(job)
    }
  }
  return result
})

/* Targets where gearset.level < recipe.level (but not missing). Soft warn only. */
const lowLevelTargets = computed(() => {
  const out: { recipe: import('@/stores/recipe').Recipe; gearsetLevel: number }[] = []
  for (const t of batchStore.targets) {
    const gs = gearsets.getGearsetForJob(t.recipe.job)
    if (!gs) continue
    if (gs.craftsmanship === 0 && gs.control === 0) continue
    if (gs.level < t.recipe.level) {
      out.push({ recipe: t.recipe, gearsetLevel: gs.level })
    }
  }
  return out
})

const missingJobsLabel = computed(() => missingGearsetJobs.value
  .map(j => JOB_NAMES[j] ?? j).join('、'))

async function startOptimization() {
  if (batchStore.targets.length === 0) return

  /* Hard block if any required job has no gearset configured. */
  if (missingGearsetJobs.value.length > 0) {
    openGearsetSheet(missingGearsetJobs.value[0] ?? null)
    return
  }

  batchStore.isRunning = true
  batchStore.isCancelled = false
  batchStore.clearResults()
  expandedSections.value = new Set()

  const startedAt = performance.now()
  trackEvent('batch_optimization_start', {
    target_count: batchStore.targets.length,
    total_quantity: batchStore.targets.reduce((sum, t) => sum + t.quantity, 0),
    calc_mode: batchStore.calcMode,
    cross_server: settings.crossServer,
  })

  try {
    const results = await runBatchOptimization(
      batchStore.targets,
      (job) => gearsets.getGearsetForJob(job),
      {
        crossServer: settings.crossServer,
        recursivePricing: settings.recursivePricing,
        maxRecursionDepth: settings.maxRecursionDepth,
        exceptionStrategy: settings.exceptionStrategy,
        server: settings.server,
        dataCenter: settings.dataCenter,
        foodId: batchStore.foodId,
        foodIsHq: batchStore.foodIsHq,
        medicineId: batchStore.medicineId,
        medicineIsHq: batchStore.medicineIsHq,
        autoEvaluateBuffs: batchStore.autoEvaluateBuffs,
        calcMode: batchStore.calcMode,
        bulkQualityMode: batchStore.bulkQualityMode,
        qualityOverrides: batchStore.qualityOverrides,
        selfMakeOverrides: batchStore.selfMakeOverrides,
      },
      (info) => {
        batchStore.progress = {
          current: info.current,
          total: info.total,
          currentName: info.name,
          phase: info.phase,
          solverPercent: info.solverPercent,
        }
      },
      () => batchStore.isCancelled,
    )
    batchStore.results = results
    trackEvent('batch_optimization_complete', {
      duration_ms: Math.round(performance.now() - startedAt),
      target_count: batchStore.targets.length,
      todo_count: results.todoList.length,
    })
  } catch (err) {
    if (err instanceof Error && err.message === SOLVE_CANCELLED) {
      ElMessage.info('已取消計算')
      trackEvent('batch_optimization_cancelled')
    } else {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[BatchView] Optimization failed:', err)
      ElMessage.error(`最佳化計算失敗：${message}`)
      trackEvent('batch_optimization_failed', { reason: message })
      trackError(`batch_optimization_failed: ${message}`)
    }
  } finally {
    batchStore.isRunning = false
  }
}

function handleAddRecipe(recipe: import('@/stores/recipe').Recipe) {
  batchStore.addTarget(recipe)
  trackEvent('batch_add_recipe', {
    recipe_id: recipe.id,
    target_count: batchStore.targets.length,
  })
  ElMessage.success(`已加入「${recipe.name}」`)
}

function handleTodoDone(index: number, done: boolean) {
  if (!batchStore.results) return
  const item = batchStore.finalTodoList[index]
  if (!item) return
  if (item.isSemiFinished) {
    batchStore.markSelfCraftDone(item.recipe.itemId, done)
    return
  }
  const semiCount = batchStore.finalTodoList.filter(i => i.isSemiFinished).length
  const adjusted = index - semiCount
  const target = batchStore.results.todoList[adjusted]
  if (target) target.done = done
}

function handleTodoReorder(fromIndex: number, toIndex: number) {
  if (!batchStore.results) return
  const semiCount = batchStore.finalTodoList.filter(i => i.isSemiFinished).length
  // Disallow reordering that touches the semi-finished prefix — semi-finished
  // items are ordered by dependency depth and must stay before the regular todos.
  if (fromIndex < semiCount || toIndex < semiCount) return
  const list = batchStore.results.todoList
  const adjustedFrom = fromIndex - semiCount
  const adjustedTo = toIndex - semiCount
  if (adjustedFrom < 0 || adjustedFrom >= list.length) return
  if (adjustedTo < 0 || adjustedTo >= list.length) return
  const [item] = list.splice(adjustedFrom, 1)
  list.splice(adjustedTo, 0, item)
}
</script>

<template>
  <div class="view-container batch-view" :style="{ '--batch-flow-h': `${flowHeight}px` }">
    <div class="batch-title-row">
      <div class="batch-title-block">
        <h2>批量製作</h2>
        <p class="view-desc">一次搞定多個配方，自動幫你規劃採購和製作順序。</p>
      </div>
    </div>

    <FlowBreadcrumb
      ref="flowBreadcrumbRef"
      class="mobile-sticky-toolbar batch-flow"
      :steps="[
        { label: '準備清單', icon: '📋' },
        { label: '採購材料', icon: '🛒' },
        { label: '開始製作', icon: '🔨' },
      ]"
      :active-step="currentStep"
      :pending="batchStore.isRunning"
      pending-label="計算中..."
      @navigate="navigateToStep"
    >
      <template v-if="batchStore.results" #trailing>
        <ConfirmNewBatch @confirm="startNewBatch">
          <el-button text size="small" class="flow-new-batch" aria-label="重設目前批次並開始新一輪">
            <span aria-hidden="true">⟳</span> 新批次
          </el-button>
        </ConfirmNewBatch>
      </template>
    </FlowBreadcrumb>

    <!-- Section 1: 準備清單 -->
    <section ref="sectionPrepare" class="batch-section" :class="{ 'batch-section--collapsed': isSectionCollapsed(0) }">
      <component
        :is="currentStep > 0 ? 'button' : 'div'"
        type="button"
        class="section-header"
        :class="{ 'section-header--clickable': currentStep > 0 }"
        :aria-expanded="currentStep > 0 ? !isSectionCollapsed(0) : undefined"
        @click="currentStep > 0 ? toggleSection(0) : undefined"
      >
        <span class="section-step" :class="{ 'section-step--active': currentStep === 0, 'section-step--done': currentStep > 0 }" aria-hidden="true">
          <template v-if="currentStep > 0">✓</template>
          <template v-else>1</template>
        </span>
        <h3 class="section-title">準備清單</h3>
        <span class="section-desc">{{ currentStep > 0 ? `${batchStore.targets.length} 個配方` : '加入要製作的配方並設定計算參數' }}</span>
        <span v-if="currentStep > 0" class="section-toggle">{{ isSectionCollapsed(0) ? '展開' : '收起' }}</span>
      </component>
      <div v-if="!isSectionCollapsed(0)" class="prepare-grid">
        <div class="prepare-main">
          <BatchList
            @open-search="sidebarOpen = true"
            @open-gearset="(job) => openGearsetSheet(job)"
          />
        </div>
        <div class="prepare-side">
          <BatchSettings />

          <div v-if="missingGearsetJobs.length > 0" class="batch-gs-banner">
            <div class="batch-gs-banner-icon" aria-hidden="true">⚠</div>
            <div class="batch-gs-banner-body">
              <div class="batch-gs-banner-title">{{ missingGearsetJobs.length }} 職還沒設定數值</div>
              <div class="batch-gs-banner-desc">{{ missingJobsLabel }}</div>
            </div>
            <button
              type="button"
              class="batch-gs-banner-cta"
              @click="openGearsetSheet(missingGearsetJobs[0] ?? null)"
            >
              補完 {{ missingGearsetJobs.length }} 職 ▾
            </button>
          </div>

          <div v-else-if="lowLevelTargets.length > 0" class="batch-lvl-alert">
            <div class="batch-lvl-alert-icon" aria-hidden="true">ℹ</div>
            <div class="batch-lvl-alert-body">
              <div class="batch-lvl-alert-title">{{ lowLevelTargets.length }} 件目標 · 遊戲目前禁止製作</div>
              <div class="batch-lvl-alert-desc">等級不夠的職業還無法在遊戲內開始這配方，可以保留為未來規劃，或先調整配裝</div>
            </div>
            <button
              type="button"
              class="batch-lvl-alert-cta"
              @click="openGearsetSheet(lowLevelTargets[0]?.recipe.job ?? null)"
            >
              調整配裝
            </button>
          </div>

          <div class="batch-action">
            <el-button
              type="primary"
              size="large"
              :loading="batchStore.isRunning"
              :disabled="batchStore.targets.length === 0 || batchStore.isRunning"
              @click="startOptimization"
            >
              {{ batchStore.isRunning ? '計算中...' : '▶ 開始最佳化計算' }}
            </el-button>
          </div>
        </div>
      </div>
    </section>

    <!-- Calculation progress: transient panel, not a navigation step -->
    <section v-if="batchStore.isRunning" class="batch-section batch-section--transient">
      <div class="section-header section-header--transient">
        <span class="section-spinner" aria-hidden="true" />
        <h3 class="section-title">計算最佳化</h3>
        <span class="section-desc">正在求解最佳製作方案與查價</span>
      </div>
      <BatchProgress />
    </section>

    <!-- Section 2: 採購材料 -->
    <section v-if="batchStore.results" ref="sectionShopping" class="batch-section" :class="{ 'batch-section--collapsed': isSectionCollapsed(1) }">
      <component
        :is="currentStep > 1 ? 'button' : 'div'"
        type="button"
        class="section-header"
        :class="{ 'section-header--clickable': currentStep > 1 }"
        :aria-expanded="currentStep > 1 ? !isSectionCollapsed(1) : undefined"
        @click="currentStep > 1 ? toggleSection(1) : undefined"
      >
        <span class="section-step" :class="{ 'section-step--active': currentStep === 1, 'section-step--done': currentStep > 1 }" aria-hidden="true">
          <template v-if="currentStep > 1">✓</template>
          <template v-else>2</template>
        </span>
        <h3 class="section-title">採購材料</h3>
        <span class="section-desc">{{ currentStep > 1 ? `${batchStore.shoppingCheckedCount} 項已採購` : '按伺服器分組購買所需素材' }}</span>
        <template v-if="currentStep <= 1">
          <el-text size="small" type="info" class="section-hint">點擊素材行可複製品名</el-text>
        </template>
        <span v-if="currentStep > 1" class="section-toggle">{{ isSectionCollapsed(1) ? '展開' : '收起' }}</span>
      </component>

      <template v-if="!isSectionCollapsed(1)">
        <!-- Cost banner — covers the whole step 2 so the total reads as the
             closing summary for "採購材料". -->
        <CostSummaryPanel
          :grand-total="batchStore.effectiveGrandTotal"
          :saving-percent="savingPercent"
          :single-server-total="singleServerTotal"
          :server="settings.server"
        />

        <div
          v-if="batchStore.results.exceptions.length > 0"
          class="exception-block"
          role="region"
          aria-label="例外提示"
        >
          <div class="exception-header">
            <span class="exception-title">例外提示</span>
            <el-badge :value="batchStore.results.exceptions.length" :max="99" type="danger" />
          </div>
          <ExceptionList :exceptions="batchStore.results.exceptions" />
        </div>

        <!-- Sub-section 2.1: 採購建議 -->
        <section class="batch-subsection" :class="{ 'batch-subsection--collapsed': isSubsectionCollapsed('suggestions') }">
          <button
            type="button"
            class="subsection-header"
            :aria-expanded="!isSubsectionCollapsed('suggestions')"
            @click="toggleSubsection('suggestions')"
          >
            <span class="subsection-step" aria-hidden="true">2.1</span>
            <h4 class="subsection-title">採購建議</h4>
            <span class="subsection-desc">
              {{ hasSuggestions ? `${suggestionsCount} 項可採納` : '此次計算沒有可採納的建議' }}
            </span>
            <span class="subsection-toggle">{{ isSubsectionCollapsed('suggestions') ? '展開' : '收起' }}</span>
          </button>
          <div v-if="!isSubsectionCollapsed('suggestions')" class="subsection-body">
            <template v-if="hasSuggestions">
              <BuffRecommendationCard
                v-if="batchStore.results.buffRecommendation"
                :recommendation="batchStore.results.buffRecommendation"
                @apply="startOptimization"
              />
              <VendorRoster :candidates="batchStore.results.npcPurchaseCandidates" />
              <SelfCraftSuggestions :candidates="batchStore.results.selfCraftCandidates" />
            </template>
            <p v-else class="subsection-empty">
              此次計算沒有可採納的建議，當前的市場價、巨集與配裝已經是最佳組合。
            </p>
          </div>
        </section>

        <!-- Sub-section 2.2: 採購清單 -->
        <section class="batch-subsection" :class="{ 'batch-subsection--collapsed': isSubsectionCollapsed('shopping') }">
          <button
            type="button"
            class="subsection-header"
            :aria-expanded="!isSubsectionCollapsed('shopping')"
            @click="toggleSubsection('shopping')"
          >
            <span class="subsection-step" aria-hidden="true">2.2</span>
            <h4 class="subsection-title">採購清單</h4>
            <span class="subsection-desc">{{ batchStore.shoppingItemCount }} 項素材 · 按伺服器分組</span>
            <span class="subsection-toggle">{{ isSubsectionCollapsed('shopping') ? '展開' : '收起' }}</span>
          </button>
          <div v-if="!isSubsectionCollapsed('shopping')" class="subsection-body">
            <ShoppingList
              :crystals="batchStore.finalCrystals"
              :server-groups="batchStore.results.serverGroups"
              :self-craft-candidates="batchStore.results.selfCraftCandidates"
              :buy-finished-items="batchStore.results.buyFinishedItems"
              :grand-total="batchStore.effectiveGrandTotal"
              :cross-world-cache="batchStore.results.crossWorldCache"
            />
          </div>
        </section>
      </template>
    </section>

    <!-- Section 3: 製作待辦 -->
    <section v-if="batchStore.results" ref="sectionTodo" class="batch-section">
      <div class="section-header">
        <span class="section-step" :class="{ 'section-step--active': currentStep === 2, 'section-step--done': currentStep > 2 }" aria-hidden="true">
          <template v-if="currentStep > 2">✓</template>
          <template v-else>3</template>
        </span>
        <h3 class="section-title">開始製作</h3>
        <span class="section-desc">依相依順序逐一完成製作</span>
      </div>
      <TodoList
        :items="batchStore.finalTodoList"
        @update:done="handleTodoDone"
        @reorder="handleTodoReorder"
        @request-new-batch="startNewBatch"
      />
    </section>

    <!-- Search Sidebar (shared) -->
    <RecipeSearchSidebar v-model="sidebarOpen" context="加入批量清單" @add="handleAddRecipe" />

    <GearsetSheet
      v-model:open="gearsetSheetOpen"
      :focus-job="gearsetSheetFocusJob"
      :missing-jobs="missingGearsetJobs"
    />
  </div>
</template>

<style scoped>
.view-container { --page-accent: var(--app-craft); --page-accent-dim: var(--app-craft-dim); }

.batch-view {
  max-width: 1200px;
}

/* "⟳ 新批次" trigger sitting in the FlowBreadcrumb trailing slot.
   Uses :deep so el-button's internal span gets the same compact treatment
   on the mobile sticky toolbar. */
:deep(.flow-new-batch) {
  font-size: 13px;
  padding-inline: 8px;
}

@media (max-width: 640px) {
  :deep(.flow-new-batch) {
    font-size: 12px;
    padding-inline: 6px;
    min-height: var(--touch-target-min, 44px);
  }
}

.batch-section {
  /* Desktop: FlowBreadcrumb is not sticky; small offset is plenty */
  scroll-margin-top: 24px;
  margin-bottom: 8px;
  padding-top: 24px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.batch-section:first-of-type {
  border-top: none;
  padding-top: 0;
}

/* Section header with step number */
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

.section-title {
  white-space: nowrap;
}

@media (max-width: 640px) {
  .batch-section {
    padding-top: var(--section-padding-mobile, 12px);
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
  background: var(--accent-gold);
  color: var(--el-bg-color);
  border-color: var(--accent-gold);
}

.section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.section-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.section-hint {
  margin-left: auto;
}

/* Collapsible sections */
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
  outline: 2px solid var(--page-accent, var(--accent-gold));
  outline-offset: 2px;
}

.batch-section--collapsed {
  padding-bottom: 0;
  margin-bottom: 0;
}

.batch-section--collapsed .section-header--clickable {
  margin-bottom: 0;
}

.section-step--done {
  background: var(--el-color-success-light-3);
  color: var(--el-color-success-dark-2);
  border-color: var(--el-color-success-light-3);
  font-size: 11px;
}

.section-toggle {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

/* === Sub-section (step 2.1 / 2.2) === */
.batch-subsection {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.batch-subsection:first-of-type {
  margin-top: 12px;
  padding-top: 12px;
}

.batch-subsection--collapsed {
  padding-bottom: 0;
}

.subsection-header {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background: transparent;
  border: 0;
  padding: 6px 8px;
  margin: 0 -8px 10px;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  flex-wrap: wrap;
  transition: background-color 0.15s;
}

.subsection-header:hover {
  background: var(--el-fill-color-light);
}

.subsection-header:focus-visible {
  outline: 2px solid var(--page-accent, var(--accent-gold));
  outline-offset: 2px;
}

.batch-subsection--collapsed .subsection-header {
  margin-bottom: 0;
}

.subsection-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 22px;
  padding: 0 7px;
  border-radius: 11px;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  background: var(--el-fill-color-light);
  color: var(--app-text-muted);
  border: 1.5px solid var(--el-border-color);
  flex-shrink: 0;
}

.subsection-title {
  margin: 0;
  font-family: 'Noto Serif TC', serif;
  font-size: 15.5px;
  font-weight: 600;
  color: var(--app-text);
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.subsection-desc {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  min-width: 0;
}

.subsection-toggle {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.subsection-body {
  /* Children (BuffRecommendationCard / VendorRoster / SelfCraftSuggestions /
     ShoppingList) carry their own margins; subsection wrapper just provides
     the toggle chrome above. */
}

.subsection-empty {
  margin: 6px 4px 12px;
  padding: 14px 16px;
  background: color-mix(in oklch, var(--app-craft) 6%, transparent);
  border-radius: 10px;
  border: 1px dashed color-mix(in oklch, var(--app-craft) 28%, transparent);
  font-size: 13.5px;
  color: var(--app-text-muted);
  line-height: 1.6;
  max-width: 620px;
}

@media (max-width: 640px) {
  .batch-subsection {
    margin-top: 14px;
    padding-top: 10px;
  }

  .subsection-title {
    font-size: 14.5px;
  }

  .subsection-toggle {
    flex-basis: 100%;
    margin-left: 38px;
    padding: 8px 0;
    font-size: 13px;
    text-align: left;
  }
}

/* Transient calculation panel — visually distinct from numbered nav steps */
.batch-section--transient {
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
  border: 2px solid var(--page-accent, var(--accent-gold));
  border-top-color: transparent;
  animation: section-spin 0.9s linear infinite;
  flex-shrink: 0;
}

@keyframes section-spin {
  to { transform: rotate(360deg); }
}

.batch-action {
  text-align: center;
  padding: var(--space-md) 0;
}

.batch-card {
  margin-bottom: 16px;
}

/* Exception block — flat, full border + tinted bg (no side-stripe border) */
.exception-block {
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid color-mix(in oklch, var(--app-danger) 32%, transparent);
  border-radius: 8px;
  background: color-mix(in oklch, var(--app-danger) 8%, transparent);
}

@media (max-width: 640px) {
  .exception-block {
    border-radius: 6px;
    padding: 10px 12px;
  }
}

.exception-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.exception-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* Prepare section: single column by default */
.prepare-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.prepare-main {
  flex: 1;
  min-width: 0;
}

/* Title row */
.batch-title-row {
  margin-bottom: 12px;
}

.batch-title-block h2 {
  margin-bottom: 0;
}

@media (max-width: 768px) {
  .batch-action {
    padding: 12px 0;
  }

  .batch-section {
    /* Mobile: FlowBreadcrumb is sticky under the app bar; offset tracks
       the measured toolbar height so the section header lands clear of it */
    scroll-margin-top: calc(var(--mobile-app-bar-h, 52px) + var(--batch-flow-h, 100px) + 8px);
  }

  /* Page title is shown in the global app bar; hide the in-view title row */
  .batch-title-row {
    display: none;
  }

  /* FlowBreadcrumb gets sticky-toolbar bleed; tighten its vertical padding */
  .batch-flow {
    padding-top: 10px;
    padding-bottom: 10px;
    margin-bottom: 8px;
  }
}

/* mobile: flatten nested el-card — section-header owns the title */
@media (max-width: 640px) {
  .batch-section :deep(.el-card),
  .batch-section :deep(.el-card.is-never-shadow) {
    border: none;
    background: transparent;
    box-shadow: none;
    border-radius: 0;
    overflow: visible;
  }

  .batch-section :deep(.el-card__header) {
    padding: 0 0 8px;
    border-bottom: 1px dashed var(--el-border-color-lighter);
    margin-bottom: 12px;
  }

  .batch-section :deep(.el-card__body) {
    padding: 0;
  }

  .prepare-grid {
    gap: 16px;
  }

  .prepare-side :deep(.settings-card) {
    margin-top: 0;
    padding-top: 16px;
    border-top: 1px solid var(--el-border-color-lighter);
  }
}

/* Wide screen: expand container + 2-column prepare section */
@media (min-width: 1440px) {
  .batch-view {
    max-width: 1400px;
  }

  .prepare-grid {
    flex-direction: row;
    gap: 20px;
    align-items: flex-start;
  }

  .prepare-main {
    flex: 1;
  }

  .prepare-side {
    flex: 0 0 340px;
    position: sticky;
    top: 100px;
  }

  .prepare-side :deep(.settings-card) {
    margin-top: 0;
  }
}

@media (min-width: 1920px) {
  .batch-view {
    max-width: 1700px;
  }

  .prepare-side {
    flex: 0 0 380px;
  }
}

@media (min-width: 2560px) {
  .batch-view {
    max-width: 2100px;
  }

  .prepare-side {
    flex: 0 0 420px;
  }
}

/* === Missing-gearset hard banner (warning) === */
.batch-gs-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 12px 14px;
  background: oklch(0.58 0.17 45 / 0.10);
  border: 1px solid oklch(0.58 0.17 45 / 0.32);
  border-radius: 12px;
}
.batch-gs-banner-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: oklch(0.58 0.17 45);
  color: oklch(0.99 0.01 90);
  display: grid; place-items: center;
  font-size: 16px;
  flex-shrink: 0;
}
.batch-gs-banner-body { flex: 1; min-width: 0; }
.batch-gs-banner-title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 700;
  font-size: 14.5px;
  color: oklch(0.32 0.14 45);
  margin-bottom: 2px;
}
.batch-gs-banner-desc {
  font-size: 12.5px;
  color: oklch(0.42 0.16 45);
  line-height: 1.5;
}
.batch-gs-banner-cta {
  flex-shrink: 0;
  padding: 9px 16px;
  border: 0;
  border-radius: 8px;
  background: oklch(0.58 0.17 45);
  color: oklch(0.99 0.01 90);
  font: inherit;
  font-weight: 600;
  font-size: 12.5px;
  cursor: pointer;
  transition: background-color 0.18s var(--ease-out-quart), transform 0.12s var(--ease-out-quart);
}
.batch-gs-banner-cta:hover {
  background: oklch(0.42 0.16 45);
  transform: translateY(-1px);
}

/* === Low-level soft alert (cocoa info) === */
.batch-lvl-alert {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--app-craft) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-craft) 28%, transparent);
  border-radius: 12px;
}
.batch-lvl-alert-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--app-craft) 18%, transparent);
  color: var(--app-craft);
  display: grid; place-items: center;
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
}
.batch-lvl-alert-body { flex: 1; min-width: 0; }
.batch-lvl-alert-title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 13.5px;
  color: var(--app-craft);
  margin-bottom: 2px;
}
.batch-lvl-alert-desc {
  font-size: 12px;
  color: var(--app-text-muted);
  line-height: 1.5;
}
.batch-lvl-alert-cta {
  flex-shrink: 0;
  padding: 7px 12px;
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--app-craft) 40%, transparent);
  border-radius: 8px;
  color: var(--app-craft);
  font: inherit;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.18s var(--ease-out-quart);
}
.batch-lvl-alert-cta:hover {
  background: color-mix(in srgb, var(--app-craft) 12%, transparent);
}
</style>

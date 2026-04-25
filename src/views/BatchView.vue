<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { useBatchStore } from '@/stores/batch'
import { useSettingsStore } from '@/stores/settings'
import { useGearsetsStore } from '@/stores/gearsets'
import { runBatchOptimization } from '@/services/batch-optimizer'
import CostSummaryPanel from '@/components/batch/CostSummaryPanel.vue'
import BatchList from '@/components/batch/BatchList.vue'
import BatchSettings from '@/components/batch/BatchSettings.vue'
import BatchProgress from '@/components/batch/BatchProgress.vue'
import ShoppingList from '@/components/batch/ShoppingList.vue'
import TodoList from '@/components/batch/TodoList.vue'
import ExceptionList from '@/components/batch/ExceptionList.vue'
import RecipeSearchSidebar from '@/components/recipe/RecipeSearchSidebar.vue'
import BuffRecommendationCard from '@/components/batch/BuffRecommendationCard.vue'
import FlowBreadcrumb from '@/components/common/FlowBreadcrumb.vue'

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

// Mobile sticky offset: measure FlowBreadcrumb height into a CSS var so
// scroll-margin-top tracks the real toolbar height (which changes with
// active label length / pending state).
const flowBreadcrumbRef = ref<{ $el?: HTMLElement } | HTMLElement>()
const flowHeight = ref(0)
let flowResizeObserver: ResizeObserver | null = null

onMounted(() => {
  const node = flowBreadcrumbRef.value as { $el?: HTMLElement } | HTMLElement | undefined
  const el = (node && '$el' in node ? node.$el : node) as HTMLElement | undefined
  if (!el || typeof ResizeObserver === 'undefined') return
  flowResizeObserver = new ResizeObserver(([entry]) => {
    if (entry) flowHeight.value = entry.contentRect.height
  })
  flowResizeObserver.observe(el)
})

onBeforeUnmount(() => {
  flowResizeObserver?.disconnect()
  flowResizeObserver = null
})

// Auto-scroll to shopping section when optimization finishes
watch(() => batchStore.isRunning, (running, wasRunning) => {
  if (wasRunning && !running && batchStore.results) {
    nextTick(() => {
      sectionShopping.value?.scrollIntoView({ behavior: 'smooth' })
    })
  }
})

async function startOptimization() {
  if (batchStore.targets.length === 0) return

  batchStore.isRunning = true
  batchStore.isCancelled = false
  batchStore.clearResults()

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
  } catch (err) {
    console.error('[BatchView] Optimization failed:', err)
    ElMessage.error(`最佳化計算失敗：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    batchStore.isRunning = false
  }
}

function handleAddRecipe(recipe: import('@/stores/recipe').Recipe) {
  batchStore.addTarget(recipe)
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
    />

    <CostSummaryPanel
      v-if="batchStore.results"
      :grand-total="batchStore.effectiveGrandTotal"
      :saving-percent="savingPercent"
      :single-server-total="singleServerTotal"
      :server="settings.server"
    />

    <BuffRecommendationCard
      v-if="batchStore.results?.buffRecommendation"
      :recommendation="batchStore.results.buffRecommendation"
    />

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
          <BatchList @open-search="sidebarOpen = true" />
        </div>
        <div class="prepare-side">
          <BatchSettings />
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

        <ShoppingList
          :crystals="batchStore.finalCrystals"
          :server-groups="batchStore.results.serverGroups"
          :self-craft-candidates="batchStore.results.selfCraftCandidates"
          :buy-finished-items="batchStore.results.buyFinishedItems"
          :grand-total="batchStore.effectiveGrandTotal"
          :cross-world-cache="batchStore.results.crossWorldCache"
        />
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
      />
    </section>

    <!-- Search Sidebar (shared) -->
    <RecipeSearchSidebar v-model="sidebarOpen" context="加入批量清單" @add="handleAddRecipe" />
  </div>
</template>

<style scoped>
.view-container { --page-accent: var(--app-craft); --page-accent-dim: var(--app-craft-dim); }

.batch-view {
  max-width: 1200px;
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

/* Exception block — flat, no nested card */
.exception-block {
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid var(--el-color-danger-light-5, rgba(245, 108, 108, 0.25));
  border-left: 3px solid var(--el-color-danger, #F56C6C);
  border-radius: 6px;
  background: rgba(245, 108, 108, 0.06);
}

@media (max-width: 640px) {
  .exception-block {
    background: transparent;
    border: none;
    border-left: 3px solid var(--el-color-danger, #F56C6C);
    border-radius: 0;
    padding: 4px 0 10px 12px;
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
</style>

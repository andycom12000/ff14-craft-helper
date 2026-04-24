<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
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
import AppEmptyState from '@/components/common/AppEmptyState.vue'
import FlowBreadcrumb from '@/components/common/FlowBreadcrumb.vue'

const batchStore = useBatchStore()
const settings = useSettingsStore()
const gearsets = useGearsetsStore()

const sidebarOpen = ref(false)
const isClassic = computed(() => settings.batchLayout === 'classic')
function toggleLayout() {
  settings.batchLayout = isClassic.value ? 'stepper' : 'classic'
}

// Section refs for scroll navigation
const sectionPrepare = ref<HTMLElement>()
const sectionProgress = ref<HTMLElement>()
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

// currentStep: 0-3 = active step, 4 = all done (exceeds step count to mark all finished)
const currentStep = computed(() => {
  if (batchStore.results) {
    const allTodoDone = batchStore.results.todoList.length > 0
      && batchStore.results.todoList.every(t => t.done)
    if (allTodoDone) return 4
    if (batchStore.allShoppingDone) return 3
    return 2
  }
  if (batchStore.isRunning) return 1
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
  const sections = [sectionPrepare, sectionProgress, sectionShopping, sectionTodo]
  sections[step]?.value?.scrollIntoView({ behavior: 'smooth' })
}

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
  <div class="view-container batch-view" :class="{ 'batch-view--classic': isClassic }">
    <FlowBreadcrumb
      v-if="!isClassic"
      :steps="[
        { label: '準備清單', icon: '📋' },
        { label: '計算最佳化', icon: '⚙️' },
        { label: '採購材料', icon: '🛒' },
        { label: '開始製作', icon: '🔨' },
      ]"
      :active-step="currentStep"
      @navigate="navigateToStep"
    />
    <div class="batch-title-row">
      <div>
        <h2>批量製作</h2>
        <p class="view-desc">一次搞定多個配方，自動幫你規劃採購和製作順序。</p>
      </div>
      <el-button text size="small" @click="toggleLayout">
        {{ isClassic ? '切換新版介面' : '切換經典介面' }}
      </el-button>
    </div>

    <!-- ==================== New stepper layout ==================== -->
    <template v-if="!isClassic">
      <!-- Flow breadcrumb replaces BatchStepper -->

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

      <!-- Section 2: 計算進度 -->
      <section v-if="batchStore.isRunning" ref="sectionProgress" class="batch-section">
        <div class="section-header">
          <span class="section-step section-step--active" aria-hidden="true">2</span>
          <h3 class="section-title">計算最佳化</h3>
          <span class="section-desc">正在求解最佳製作方案與查價</span>
        </div>
        <BatchProgress />
      </section>

      <!-- Section 3: 採購材料 -->
      <section v-if="batchStore.results" ref="sectionShopping" class="batch-section" :class="{ 'batch-section--collapsed': isSectionCollapsed(2) }">
        <component
          :is="currentStep > 2 ? 'button' : 'div'"
          type="button"
          class="section-header"
          :class="{ 'section-header--clickable': currentStep > 2 }"
          :aria-expanded="currentStep > 2 ? !isSectionCollapsed(2) : undefined"
          @click="currentStep > 2 ? toggleSection(2) : undefined"
        >
          <span class="section-step" :class="{ 'section-step--active': currentStep === 2, 'section-step--done': currentStep > 2 }" aria-hidden="true">
            <template v-if="currentStep > 2">✓</template>
            <template v-else>3</template>
          </span>
          <h3 class="section-title">採購材料</h3>
          <span class="section-desc">{{ currentStep > 2 ? `${batchStore.shoppingCheckedCount} 項已採購` : '按伺服器分組購買所需素材' }}</span>
          <template v-if="currentStep <= 2">
            <el-text size="small" type="info" class="section-hint">點擊素材行可複製品名</el-text>
          </template>
          <span v-if="currentStep > 2" class="section-toggle">{{ isSectionCollapsed(2) ? '展開' : '收起' }}</span>
        </component>

        <template v-if="!isSectionCollapsed(2)">
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

      <!-- Section 4: 製作待辦 -->
      <section v-if="batchStore.results" ref="sectionTodo" class="batch-section">
        <div class="section-header">
          <span class="section-step" :class="{ 'section-step--active': currentStep === 3 }" aria-hidden="true">4</span>
          <h3 class="section-title">開始製作</h3>
          <span class="section-desc">依相依順序逐一完成製作</span>
        </div>
        <TodoList
          :items="batchStore.finalTodoList"
          @update:done="handleTodoDone"
          @reorder="handleTodoReorder"
        />
      </section>
    </template>

    <!-- ==================== Classic two-column layout ==================== -->
    <template v-else>
      <div class="classic-layout">
        <div class="classic-left">
          <BatchList @open-search="sidebarOpen = true" />
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

          <BatchProgress />

          <BuffRecommendationCard
            v-if="batchStore.results?.buffRecommendation"
            :recommendation="batchStore.results.buffRecommendation"
          />

          <div
            v-if="batchStore.results && batchStore.results.exceptions.length > 0"
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

          <div v-if="batchStore.results" class="classic-todo-block">
            <div class="classic-todo-header">
              <span class="classic-todo-title">製作待辦</span>
            </div>
            <TodoList
              :items="batchStore.finalTodoList"
              @update:done="handleTodoDone"
            />
          </div>
        </div>

        <div class="classic-right classic-right--empty" v-if="!batchStore.results">
          <AppEmptyState
            icon="🛒"
            title="採購清單"
            description="完成計算後，最佳採購方案會出現在這裡"
          />
        </div>
        <div v-if="batchStore.results" class="classic-right">
          <div class="classic-shopping-header">
            <span class="classic-shopping-title">採購清單</span>
            <el-text size="small" type="info">點擊素材行可複製品名</el-text>
          </div>
          <ShoppingList
            :crystals="batchStore.finalCrystals"
            :server-groups="batchStore.results.serverGroups"
            :self-craft-candidates="batchStore.results.selfCraftCandidates"
            :buy-finished-items="batchStore.results.buyFinishedItems"
            :grand-total="batchStore.effectiveGrandTotal"
            :cross-world-cache="batchStore.results.crossWorldCache"
          />
        </div>
      </div>
    </template>

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
  scroll-margin-top: 100px;
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

/* Classic layout sub-headers — also flat, no el-card */
.classic-todo-block,
.classic-right {
  margin-bottom: 16px;
}

.classic-todo-header,
.classic-shopping-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.classic-todo-title,
.classic-shopping-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* Prepare section: single column by default */
.prepare-grid {
  display: flex;
  flex-direction: column;
}

.prepare-main {
  flex: 1;
  min-width: 0;
}

.prepare-side :deep(.settings-card) {
  margin-top: 16px;
}

/* Title row with layout toggle */
.batch-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.batch-title-row h2 {
  margin-bottom: 0;
}

/* ===== Classic two-column layout ===== */
.batch-view--classic {
  max-width: none !important;
}

.classic-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.classic-left {
  flex: 0 0 auto;
  width: 740px;
  min-width: 0;
}

.classic-right {
  flex: 1;
  min-width: 0;
  position: sticky;
  top: 16px;
}

.classic-right--empty {
  display: none;
}

@media (min-width: 1601px) {
  .classic-right--empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 300px;
  }
}

@media (max-width: 1600px) {
  .classic-layout {
    flex-direction: column;
  }

  .classic-left {
    width: 100%;
  }

  .classic-right {
    position: static;
    width: 100%;
  }
}

@media (max-width: 768px) {
  .batch-action {
    padding: 12px 0;
  }

  .batch-section {
    scroll-margin-top: 80px;
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

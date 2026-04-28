<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
// CSS side-effect for ElMessage already loads via useSimulator.ts (which is
// imported below). No need to duplicate the import here.
import { useIsMobile, useMediaQuery } from '@/composables/useMediaQuery'
import { JOB_NAMES, JOB_ABBR } from '@/utils/jobs'
import { type SimulatorMode } from '@/stores/simulator'
import { useLocaleStore } from '@/stores/locale'
import { formatMacros } from '@/services/macro-formatter'
import { useSimulator } from '@/composables/useSimulator'
import type { Recipe } from '@/stores/recipe'

import StatusBar from '@/components/simulator/StatusBar.vue'
import BuffDisplay from '@/components/simulator/BuffDisplay.vue'
import ActionList from '@/components/simulator/ActionList.vue'
import MacroExport from '@/components/simulator/MacroExport.vue'
import SolverPanel from '@/components/simulator/SolverPanel.vue'
import InitialQuality from '@/components/simulator/InitialQuality.vue'
import FoodMedicine from '@/components/simulator/FoodMedicine.vue'
import CraftRecommendation from '@/components/simulator/CraftRecommendation.vue'
import SkillPanel from '@/components/simulator/SkillPanel.vue'
import ConditionChips from '@/components/simulator/ConditionChips.vue'
import ManualControls from '@/components/simulator/ManualControls.vue'
import RecipeSearchSidebar from '@/components/recipe/RecipeSearchSidebar.vue'
import AppEmptyState from '@/components/common/AppEmptyState.vue'
import ItemName from '@/components/common/ItemName.vue'

const router = useRouter()
const isMobile = useIsMobile()
const localeStore = useLocaleStore()

/* Desktop-specific state */
const macroExpanded = ref(false)
/* At 2-col viewport, the HQ-related panels (初期品質 + 最佳手法 / HQ 推薦)
   render as sections of b-main directly, not as a side-rail row pushed below. */
const isTwoCol = useMediaQuery('(max-width: 1720px)')

/* Mobile-specific state */
const setupOpen = ref(false)
const macroOpen = ref(false)
const queueSheetOpen = ref(false)

const {
  recipeStore, simStore,
  recipe, gearset, canSimulate, recipeJobAbbr,
  effectiveStats, craftParams, currentState,
  initialQuality, initialQualityHqAmounts, enhancedStats,
  searchSidebarOpen, solverResult, modeOptions,
  onInitialQualityUpdate, onEnhancedStatsUpdate, onHqAmountsUpdate,
  handleAddFromSearch, handleRemoveFromQueue, handleClearQueue,
  handleRemoveAction, handleClearActions,
  handleUseSkill, onSolveComplete, handleApplyHq,
  handleAddToBom, handleSelfCraft,
} = useSimulator()

/* Macro list — compact "巨集 1 / 巨集 2 / 展開" buttons in the cockpit's
   sequence column. Full text only renders when expanded. */
const macros = computed(() =>
  formatMacros(simStore.actions, {
    waitTime: 3,
    includeEcho: true,
    locale: localeStore.current,
  }),
)

async function copyMacro(text: string, index: number) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`巨集 ${index + 1} 已複製`)
  } catch {
    ElMessage.error('複製失敗，請手動複製')
  }
}

/* Flow breadcrumb steps: 配方 → 模式 → 食藥(選填) → 模擬 → 巨集.
   Step 2 (模式) is auto-done with recipe pick (mode always defaults to solver).
   Step 3 (食藥) is optional and never blocks step 4 activation. */
type FlowStep = { num: number; label: string; done: boolean; optional?: boolean }

/* "Food/medicine configured" = user picked a buff (or 專家之證), so
   enhancedStats diverges from the raw gearset stats. FoodMedicine emits
   enhancedStats on mount even with nothing selected, so a null check
   would always be true. */
const hasFoodConfigured = computed(() => {
  const e = enhancedStats.value
  const g = gearset.value
  if (!e || !g) return false
  return e.craftsmanship !== g.craftsmanship
    || e.control !== g.control
    || e.cp !== g.cp
})

const flowSteps = computed<FlowStep[]>(() => {
  const hasRecipe = !!recipe.value
  const hasActions = simStore.actions.length > 0
  return [
    { num: 1, label: '配方', done: hasRecipe },
    { num: 2, label: '模式', done: hasRecipe },
    { num: 3, label: '食藥', done: hasFoodConfigured.value, optional: true },
    { num: 4, label: '模擬', done: hasActions },
    { num: 5, label: '巨集', done: false },
  ]
})
const flowActiveIdx = computed(() => {
  if (!recipe.value) return 0
  if (simStore.actions.length === 0) return 3
  return 4
})

/* Macro completion cue: one-shot pulse on macro section when actions
   transition empty → populated (solver done / first manual click).
   Acts as the "peak-end" signal for the flow. */
const macroJustFilled = ref(false)
let macroCueTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => simStore.actions.length,
  (next, prev) => {
    if ((prev ?? 0) === 0 && next > 0) {
      macroJustFilled.value = true
      if (macroCueTimer) clearTimeout(macroCueTimer)
      macroCueTimer = setTimeout(() => {
        macroJustFilled.value = false
      }, 1800)
    }
  },
)
onBeforeUnmount(() => {
  if (macroCueTimer) clearTimeout(macroCueTimer)
})

/* Mobile helpers */
const foodMedicineSummary = computed(() => (enhancedStats.value ? '已設定' : '未設定'))
const jobFullName = computed(() => {
  const j = recipe.value?.job
  if (!j) return ''
  return JOB_NAMES[j] ?? JOB_NAMES[JOB_ABBR[j] ?? j] ?? j
})

function openSearchFromSheet() {
  queueSheetOpen.value = false
  searchSidebarOpen.value = true
}

function pickQueueRecipe(r: Recipe) {
  recipeStore.setRecipe(r)
  queueSheetOpen.value = false
}
</script>

<template>
  <div class="view-container" :class="{ 'is-mobile': isMobile }">
    <!-- ============ Desktop layout (cockpit) ============ -->
    <template v-if="!isMobile">
      <header class="page-header">
        <div class="page-header-main">
          <h2 class="page-title">製作模擬</h2>
          <p class="page-desc">試試不同手法，找到你的最佳製作流程。</p>
        </div>
        <router-link to="/batch" class="page-header-link">批量製作 →</router-link>
      </header>

      <nav class="flow-breadcrumb" aria-label="製作流程">
        <template v-for="(step, idx) in flowSteps" :key="step.num">
          <span
            class="flow-step"
            :class="{ 'is-active': idx === flowActiveIdx, 'is-done': step.done }"
          >
            <span class="flow-step-num">{{ step.done ? '✓' : step.num }}</span>
            <span class="flow-step-label">
              {{ step.label }}<span v-if="step.optional" class="flow-step-optional">選填</span>
            </span>
          </span>
          <span v-if="idx < flowSteps.length - 1" class="flow-arrow" aria-hidden="true">→</span>
        </template>
      </nav>

      <div class="b-page-grid">
        <!-- Left rail: 配方 zone -->
        <aside class="rail rail-left">
          <section class="rail-section">
            <header class="rail-section-head">
              <span class="rail-section-label">模擬佇列</span>
              <el-button v-if="recipeStore.simulationQueue.length > 0" size="small" text type="danger" @click="handleClearQueue()">清空</el-button>
            </header>
            <ul v-if="recipeStore.simulationQueue.length > 0" class="queue-list" role="list">
              <li
                v-for="qr in recipeStore.simulationQueue"
                :key="qr.id"
                class="queue-row"
                :class="{ 'is-active': recipe?.id === qr.id }"
                role="button"
                tabindex="0"
                @click="recipeStore.setRecipe(qr)"
                @keydown.enter.prevent="recipeStore.setRecipe(qr)"
              >
                <img :src="qr.icon" alt="" aria-hidden="true" loading="lazy" class="queue-row-icon" />
                <span class="queue-row-name"><ItemName :item-id="qr.itemId" :fallback="qr.name" /></span>
                <span class="queue-row-job">{{ qr.job }}</span>
                <button
                  type="button"
                  class="queue-row-remove"
                  aria-label="移除配方"
                  @click.stop="handleRemoveFromQueue(qr.id)"
                >✕</button>
              </li>
            </ul>
            <button
              type="button"
              class="search-cta"
              :class="{ 'is-hero': recipeStore.simulationQueue.length === 0 }"
              @click="searchSidebarOpen = true"
            >
              <span class="search-cta-icon" aria-hidden="true">⌕</span>
              <span class="search-cta-label">{{ recipeStore.simulationQueue.length === 0 ? '搜尋配方' : '加入更多配方' }}</span>
              <span class="search-cta-arrow" aria-hidden="true">→</span>
            </button>
          </section>

          <section class="rail-section">
            <header class="rail-section-head">
              <span class="rail-section-label">
                食藥<span class="optional-tag">選填</span>
                <el-tooltip
                  content="食藥可在製作開始前永久加 作業精度 / 加工精度 / CP（依比例）。下方分別挑食物與藥水即可。"
                  placement="top"
                >
                  <span class="rail-help-icon" aria-label="食藥說明">?</span>
                </el-tooltip>
              </span>
            </header>
            <FoodMedicine @update:enhanced-stats="onEnhancedStatsUpdate" />
          </section>
        </aside>

        <!-- Center main: HUD + cockpit body + (2-col) HQ sections -->
        <section class="b-main">
          <template v-if="canSimulate">
            <div class="b-hud">
              <StatusBar :craft-state="currentState" />
              <BuffDisplay :buffs="currentState?.buffs ?? new Map()" />
            </div>

            <div class="cockpit-body">
              <section class="cockpit-section cockpit-section--tool">
                <header class="cockpit-tool-head">
                  <span class="cockpit-tool-eyebrow">模式</span>
                  <div class="mode-switch" role="tablist" aria-label="製作模式">
                    <span class="mode-switch-thumb" :data-mode="simStore.mode" aria-hidden="true" />
                    <button
                      v-for="opt in modeOptions"
                      :key="opt.value"
                      type="button"
                      role="tab"
                      class="mode-switch-option"
                      :class="{ 'is-active': simStore.mode === opt.value }"
                      :aria-selected="simStore.mode === opt.value"
                      @click="simStore.setMode(opt.value as SimulatorMode)"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                  <div v-if="simStore.mode === 'manual'" class="cockpit-tool-head-aside">
                    <ConditionChips :model-value="simStore.currentCondition" @change="(c) => (simStore.currentCondition = c)" />
                    <ManualControls />
                  </div>
                </header>

                <div class="cockpit-tool-body">
                  <SkillPanel
                    v-if="simStore.mode === 'manual' && gearset"
                    :level="gearset.level"
                    :craft-state="currentState"
                    :job="recipeJobAbbr"
                    @use-skill="handleUseSkill"
                  />
                  <SolverPanel
                    v-if="simStore.mode === 'solver'"
                    :craft-params="craftParams"
                    @solve-complete="onSolveComplete"
                  />
                </div>
              </section>

              <div class="cockpit-sequence-col">
                <section class="cockpit-section cockpit-section--sequence">
                  <header class="cockpit-section-head">
                    <span class="cockpit-section-label">技能序列<span v-if="simStore.actions.length" class="cockpit-section-count">{{ simStore.actions.length }}</span></span>
                    <el-button v-if="simStore.actions.length" size="small" text type="danger" @click="handleClearActions">清空</el-button>
                  </header>
                  <ActionList
                    v-if="simStore.actions.length > 0"
                    :actions="simStore.actions"
                    :results="simStore.simulationResults"
                    :job="recipeJobAbbr"
                    :show-header="false"
                    @remove="handleRemoveAction"
                    @clear="handleClearActions"
                  />
                  <!-- Progressive empty state: arrow points back to the
                       solver/skill panel in the left column so a first-time
                       user with no copy reads "the result will appear here". -->
                  <div v-else class="seq-empty-pointer" aria-hidden="true">
                    <span class="seq-empty-arrow">←</span>
                    <p class="seq-empty-copy">
                      <template v-if="simStore.mode === 'solver'">按啟動求解，序列會出現在這</template>
                      <template v-else>點左邊技能，依序加進來</template>
                    </p>
                  </div>
                </section>

                <section class="cockpit-section cockpit-section--macro" :class="{ 'just-filled': macroJustFilled }">
                  <header class="cockpit-section-head">
                    <span class="cockpit-section-label">
                      遊戲巨集
                      <span v-if="simStore.actions.length" class="cockpit-section-count">{{ macros.length }}</span>
                    </span>
                    <el-button
                      v-if="macros.length > 0"
                      size="small"
                      text
                      @click="macroExpanded = !macroExpanded"
                    >
                      {{ macroExpanded ? '收起' : '展開' }}
                    </el-button>
                  </header>
                  <div v-if="macros.length > 0" class="macro-cta-row">
                    <button
                      v-for="(_, mi) in macros"
                      :key="mi"
                      type="button"
                      class="macro-cta"
                      @click="copyMacro(macros[mi], mi)"
                    >
                      <span class="macro-cta-label">{{ macros.length === 1 ? '複製巨集' : `複製巨集 ${mi + 1}` }}</span>
                      <span class="macro-cta-icon" aria-hidden="true">⧉</span>
                    </button>
                  </div>
                  <p v-else class="rail-empty">技能序列出來後，巨集會自動生成</p>
                  <MacroExport v-if="macros.length > 0 && macroExpanded" />
                </section>
              </div>
            </div>

            <!-- 2-col mode: HQ-related panels render INSIDE b-main as cockpit
                 sections (not as a side rail pushed below).
                 At 3-col they live in rail-right instead. -->
            <template v-if="isTwoCol">
              <section class="cockpit-section cockpit-section--hq">
                <header class="cockpit-section-head">
                  <span class="cockpit-section-label">
                初期品質<span class="optional-tag">選填</span>
                <el-tooltip
                  content="把已備好的 HQ 素材換算成「製作開始就帶的品質」。HQ 素材越多、需加工的量越少。"
                  placement="top"
                >
                  <span class="rail-help-icon" aria-label="初期品質說明">?</span>
                </el-tooltip>
              </span>
                </header>
                <InitialQuality :hq-amounts="initialQualityHqAmounts" @update:initial-quality="onInitialQualityUpdate" @update:hq-amounts="onHqAmountsUpdate" />
              </section>

              <section class="cockpit-section cockpit-section--hq">
                <header class="cockpit-section-head">
                  <span class="cockpit-section-label">
                最佳手法 / HQ 推薦
                <el-tooltip
                  content="求解完成後，這裡顯示推薦的 HQ 素材組合（哪幾樣要 HQ、多少數量），可一鍵套用回初期品質。"
                  placement="top"
                >
                  <span class="rail-help-icon" aria-label="最佳手法說明">?</span>
                </el-tooltip>
              </span>
                </header>
                <CraftRecommendation
                  v-if="simStore.mode === 'solver'"
                  :craft-params="craftParams"
                  :recipe="recipe"
                  :solver-result="solverResult"
                  @apply-hq="handleApplyHq"
                  @self-craft="handleSelfCraft"
                />
                <p v-else class="rail-empty">切到自動求解、按啟動求解後顯示。</p>
              </section>
            </template>
          </template>

          <div v-else class="empty-pointer">
            <span class="empty-pointer-arrow" aria-hidden="true">←</span>
            <div class="empty-pointer-body">
              <h3 class="empty-pointer-title">先選個配方</h3>
              <p class="empty-pointer-desc">在左欄「模擬佇列」按搜尋、把想做的配方加進來，就能開始模擬。</p>
            </div>
          </div>
        </section>

        <!-- Right rail: only at 3-col mode (>1720); at 2-col these sections
             render inside b-main instead. -->
        <aside v-if="!isTwoCol" class="rail rail-right">
          <section class="rail-section">
            <header class="rail-section-head">
              <span class="rail-section-label">
                初期品質<span class="optional-tag">選填</span>
                <el-tooltip
                  content="把已備好的 HQ 素材換算成「製作開始就帶的品質」。HQ 素材越多、需加工的量越少。"
                  placement="top"
                >
                  <span class="rail-help-icon" aria-label="初期品質說明">?</span>
                </el-tooltip>
              </span>
            </header>
            <InitialQuality :hq-amounts="initialQualityHqAmounts" @update:initial-quality="onInitialQualityUpdate" @update:hq-amounts="onHqAmountsUpdate" />
          </section>

          <section class="rail-section">
            <header class="rail-section-head">
              <span class="rail-section-label">
                最佳手法 / HQ 推薦
                <el-tooltip
                  content="求解完成後，這裡顯示推薦的 HQ 素材組合（哪幾樣要 HQ、多少數量），可一鍵套用回初期品質。"
                  placement="top"
                >
                  <span class="rail-help-icon" aria-label="最佳手法說明">?</span>
                </el-tooltip>
              </span>
            </header>
            <CraftRecommendation
              v-if="canSimulate && simStore.mode === 'solver'"
              :craft-params="craftParams"
              :recipe="recipe"
              :solver-result="solverResult"
              @apply-hq="handleApplyHq"
              @self-craft="handleSelfCraft"
            />
            <p v-else class="rail-empty">切到自動求解、按啟動求解後顯示。</p>
          </section>
        </aside>
      </div>
    </template>

    <!-- ============ Mobile layout ============ -->
    <template v-else>
      <AppEmptyState
        v-if="!recipe"
        icon="⚗️"
        title="還沒有配方"
        description="搜尋你想製作的道具，開始模擬最佳技能序列吧！"
      >
        <el-button type="primary" @click="searchSidebarOpen = true">搜尋配方</el-button>
      </AppEmptyState>

      <template v-else>
        <section class="m-recipe-strip">
          <img :src="recipe.icon" alt="" class="m-rs-icon" loading="lazy" />
          <div class="m-rs-body">
            <div class="m-rs-title-row">
              <h3 class="m-rs-name">
                <ItemName :item-id="recipe.itemId" :fallback="recipe.name" />
              </h3>
              <button class="m-rs-switch" @click="queueSheetOpen = true">
                切換 <span class="m-chev">▾</span>
              </button>
            </div>
            <p class="m-rs-meta">
              Lv{{ recipe.level }}<span v-if="recipe.stars > 0" class="m-rs-stars">{{ '★'.repeat(recipe.stars) }}</span>
              <span class="m-rs-dot">·</span>{{ jobFullName }}
              <span v-if="gearset">
                <span class="m-rs-dot">·</span>難度 {{ recipe.recipeLevelTable.difficulty.toLocaleString() }}
              </span>
            </p>
            <p v-if="gearset && effectiveStats" class="m-rs-stats">
              作{{ effectiveStats.craftsmanship }}
              <span class="m-rs-dot">·</span>加{{ effectiveStats.control }}
              <span class="m-rs-dot">·</span>CP{{ effectiveStats.cp }}
              <span class="m-rs-dot">·</span>品質 {{ recipe.recipeLevelTable.quality.toLocaleString() }}
              <span class="m-rs-dot">·</span>耐久 {{ recipe.recipeLevelTable.durability }}
            </p>
          </div>
        </section>

        <div
          v-if="gearset && gearset.craftsmanship === 0 && gearset.control === 0"
          class="gearset-banner"
        >
          <div class="gearset-banner-icon" aria-hidden="true">⚠</div>
          <div class="gearset-banner-body">
            <div class="gearset-banner-title">尚未設定該職業的裝備數值</div>
            <div class="gearset-banner-desc">先填好作業精度、加工精度、CP 才能開始模擬</div>
          </div>
          <button class="gearset-banner-cta" type="button" @click="router.push('/gearset')">
            前往設定 →
          </button>
        </div>

        <button
          type="button"
          class="m-setup-row"
          :class="{ 'is-open': setupOpen }"
          :aria-expanded="setupOpen"
          @click="setupOpen = !setupOpen"
        >
          <span class="m-setup-summary">
            初期品質 <b>{{ initialQuality.toLocaleString() }}</b>
            <span class="m-rs-dot">·</span>
            食藥 <span :class="{ muted: !enhancedStats }">{{ foodMedicineSummary }}</span>
          </span>
          <span class="m-chev" :class="{ 'is-open': setupOpen }">▾</span>
        </button>
        <div v-if="setupOpen" class="m-setup-body">
          <div class="m-setup-group">
            <h4 class="m-setup-group-title">初期品質</h4>
            <InitialQuality :hq-amounts="initialQualityHqAmounts" @update:initial-quality="onInitialQualityUpdate" @update:hq-amounts="onHqAmountsUpdate" />
          </div>
          <div class="m-setup-group">
            <h4 class="m-setup-group-title">食藥</h4>
            <FoodMedicine @update:enhanced-stats="onEnhancedStatsUpdate" />
          </div>
        </div>

        <div v-if="canSimulate" class="m-mode-wrap">
          <el-segmented
            :model-value="simStore.mode"
            :options="modeOptions"
            size="default"
            class="m-mode-seg"
            @change="(v: string) => simStore.setMode(v as SimulatorMode)"
          />
        </div>

        <div v-if="canSimulate && simStore.mode === 'manual'" class="m-manual-row">
          <ConditionChips
            :model-value="simStore.currentCondition"
            @change="(c) => (simStore.currentCondition = c)"
          />
          <ManualControls />
        </div>

        <section v-if="canSimulate" class="m-status">
          <StatusBar :craft-state="currentState" />
          <BuffDisplay :buffs="currentState?.buffs ?? new Map()" />
        </section>

        <section v-if="canSimulate" class="m-flat">
          <div class="m-flat-head">
            <h3 class="m-flat-title">
              技能序列
              <span v-if="simStore.actions.length" class="m-count">{{ simStore.actions.length }}</span>
            </h3>
            <button
              v-if="simStore.actions.length"
              class="m-text-btn"
              @click="handleClearActions"
            >清空</button>
          </div>
          <ActionList
            :actions="simStore.actions"
            :results="simStore.simulationResults"
            :job="recipeJobAbbr"
            :show-header="false"
            @remove="handleRemoveAction"
            @clear="handleClearActions"
          />
        </section>

        <section v-if="canSimulate && simStore.mode === 'manual' && gearset" class="m-flat">
          <h3 class="m-flat-title">技能面板</h3>
          <SkillPanel
            :level="gearset.level"
            :craft-state="currentState"
            :job="recipeJobAbbr"
            @use-skill="handleUseSkill"
          />
        </section>

        <section v-if="canSimulate && simStore.mode === 'solver'" class="m-flat">
          <h3 class="m-flat-title">自動求解</h3>
          <SolverPanel
            :craft-params="craftParams"
            @solve-complete="onSolveComplete"
          />
        </section>

        <section v-if="canSimulate && simStore.mode === 'solver'" class="m-flat">
          <h3 class="m-flat-title">最佳手法</h3>
          <CraftRecommendation
            :craft-params="craftParams"
            :recipe="recipe"
            :solver-result="solverResult"
            @apply-hq="handleApplyHq"
            @self-craft="handleSelfCraft"
          />
        </section>

        <section v-if="canSimulate" class="m-flat">
          <button
            type="button"
            class="m-flat-head is-collapsible"
            :aria-expanded="macroOpen"
            @click="macroOpen = !macroOpen"
          >
            <h3 class="m-flat-title">遊戲巨集</h3>
            <span class="m-chev" :class="{ 'is-open': macroOpen }">▾</span>
          </button>
          <div v-if="macroOpen" class="m-macro-body">
            <MacroExport />
          </div>
        </section>
      </template>

      <el-drawer
        v-model="queueSheetOpen"
        direction="btt"
        size="auto"
        :with-header="false"
        :append-to-body="true"
        class="m-queue-sheet"
      >
        <div class="m-sheet">
          <div class="m-sheet-handle" aria-hidden="true" />
          <h3 class="m-sheet-title">模擬佇列</h3>

          <ul v-if="recipeStore.simulationQueue.length > 0" class="m-q-list" role="list">
            <li
              v-for="qr in recipeStore.simulationQueue"
              :key="qr.id"
              class="m-q-item"
              :class="{ 'is-active': recipe?.id === qr.id }"
              role="button"
              tabindex="0"
              @click="pickQueueRecipe(qr)"
              @keydown.enter.prevent="pickQueueRecipe(qr)"
              @keydown.space.prevent="pickQueueRecipe(qr)"
            >
              <img :src="qr.icon" alt="" class="m-q-icon" loading="lazy" />
              <span class="m-q-name">
                <ItemName :item-id="qr.itemId" :fallback="qr.name" />
              </span>
              <span class="m-q-job">{{ qr.job }}</span>
              <button
                class="m-q-remove"
                aria-label="移除配方"
                @click.stop="handleRemoveFromQueue(qr.id)"
              >✕</button>
            </li>
          </ul>
          <p v-else class="m-q-empty">佇列是空的，搜尋配方加進來吧。</p>

          <div class="m-sheet-actions">
            <button class="m-sheet-primary" @click="openSearchFromSheet">搜尋配方</button>
            <button
              v-if="recipe"
              class="m-sheet-secondary"
              @click="handleAddToBom"
            >加入購物清單</button>
            <button
              v-if="recipeStore.simulationQueue.length > 0"
              class="m-sheet-secondary m-sheet-danger"
              @click="handleClearQueue"
            >清空佇列</button>
          </div>
        </div>
      </el-drawer>
    </template>

    <RecipeSearchSidebar v-model="searchSidebarOpen" context="加入模擬佇列" @add="handleAddFromSearch" />
  </div>
</template>

<style scoped>
.view-container {
  --page-accent: var(--app-craft);
  --page-accent-dim: var(--app-craft-dim);
}

/* ============================================================
   Page header (desktop)
   ============================================================ */
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--app-border);
}
.page-header-main { min-width: 0; }
.page-title {
  margin: 0;
  font-family: 'Noto Serif TC', serif;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.page-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--app-text-muted);
}
.page-header-link {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-craft);
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--app-craft) 30%, transparent);
  transition: all 0.15s ease-out;
}
.page-header-link:hover {
  background: color-mix(in srgb, var(--app-craft) 10%, transparent);
}

/* ============================================================
   Flow breadcrumb (配方 → 模式 → 食藥 → 模擬 → 巨集)
   Capsule with arrows; reflects live state of recipe/actions/food.
   ============================================================ */
.flow-breadcrumb {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 18px 0 24px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--app-craft) 4%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-craft) 14%, var(--app-border));
  border-radius: 999px;
  width: fit-content;
}
.flow-step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--app-text-muted);
  font-size: 12px;
  transition: color 0.2s var(--ease-out-quart, ease-out);
}
.flow-step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: var(--app-text-muted);
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 600;
  transition: all 0.22s var(--ease-out-quart, ease-out);
}
.flow-step.is-done .flow-step-num {
  background: var(--app-craft);
  color: white;
}
.flow-step.is-done .flow-step-label {
  color: var(--app-text);
}
.flow-step.is-active .flow-step-num {
  background: var(--app-craft);
  color: white;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-craft) 22%, transparent);
}
.flow-step.is-active .flow-step-label {
  color: var(--app-craft);
  font-weight: 600;
}
.flow-arrow {
  color: color-mix(in srgb, var(--app-craft) 30%, var(--app-border));
  font-size: 11px;
}
.flow-step-optional {
  font-size: 10px;
  color: var(--app-text-muted);
  margin-left: 4px;
}

/* ============================================================
   Page grid: rail | main | rail
   Rails scale up to capped max so ultrawide doesn't leave dead air.
   ============================================================ */
.b-page-grid {
  display: grid;
  grid-template-columns:
    clamp(300px, 22%, 460px)
    minmax(0, 1fr)
    clamp(320px, 24%, 500px);
  gap: 24px;
  align-items: flex-start;
}

/* ============================================================
   Rails — single sticky container, sections inside are separated
   by dividers, NOT individual cards.
   ============================================================ */
.rail {
  position: sticky;
  top: 16px;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  min-width: 0;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 14px;
}

.rail-section {
  padding: 16px 18px;
  border-bottom: 1px solid var(--app-border);
}
.rail-section:last-child { border-bottom: 0; }

.rail-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.rail-section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--app-craft);
  position: relative;
  padding-left: 10px;
}
.rail-section-label::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--app-craft);
}
/* Marks an input section as optional. Lower visual weight than the label
   eyebrow itself so the user doesn't read it as a required step. */
.optional-tag {
  margin-left: 8px;
  padding: 1px 6px;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: none;
  color: var(--app-text-muted);
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
  border-radius: 999px;
  vertical-align: 1px;
}

/* Inline help icon next to non-self-explanatory section labels. Hover for
   tooltip; tap on touch. Lower-weight than the eyebrow so it reads as
   "extra help available" not "you need to know this". */
.rail-help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 6px;
  width: 14px;
  height: 14px;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  color: var(--app-text-muted);
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  border-radius: 50%;
  cursor: help;
  vertical-align: 1px;
  transition: all 0.15s var(--ease-out-quart, ease-out);
}
.rail-help-icon:hover {
  background: var(--app-craft);
  color: white;
}
.rail-empty {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-muted);
  padding: 4px 0;
}

.rail-section :deep(.macro-export) {
  margin-top: 12px;
}

/* Queue list inside left rail */
.queue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.queue-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease-out;
}
.queue-row:hover {
  background: color-mix(in srgb, var(--app-craft) 6%, transparent);
}
.queue-row.is-active {
  background: color-mix(in srgb, var(--app-craft) 12%, transparent);
}
.queue-row:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
}
.queue-row-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 6px;
  background: color-mix(in srgb, var(--app-craft) 8%, transparent);
}
.queue-row-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.queue-row-job {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--app-text-muted);
  font-family: 'Fira Code', ui-monospace, monospace;
}
.queue-row-remove {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: 0;
  background: transparent;
  color: var(--app-text-muted);
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  opacity: 0.4;
  transition: all 0.15s ease-out;
}
.queue-row:hover .queue-row-remove { opacity: 1; }
.queue-row-remove:hover {
  background: color-mix(in srgb, oklch(0.55 0.20 25) 12%, transparent);
  color: oklch(0.55 0.20 25);
}

/* ============================================================
   Center main: HUD + cockpit body + (2-col) HQ sections
   ============================================================ */
.b-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Empty state when no recipe is picked yet — points the user back at the
   left rail with a literal arrow. Replaces the generic "準備就緒" copy
   so first-timers know where step 1 lives. */
.empty-pointer {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  padding: 32px 28px;
  background: color-mix(in srgb, var(--app-craft) 5%, var(--app-surface));
  border: 1px dashed color-mix(in srgb, var(--app-craft) 32%, var(--app-border));
  border-radius: 14px;
}
.empty-pointer-arrow {
  flex-shrink: 0;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
  color: var(--app-craft);
  margin-top: 2px;
  animation: empty-pointer-nudge 1.6s var(--ease-out-quart, ease-out) infinite;
}
@keyframes empty-pointer-nudge {
  0%, 60%, 100% { transform: translateX(0); }
  30% { transform: translateX(-6px); }
}
.empty-pointer-body { flex: 1; min-width: 0; }
.empty-pointer-title {
  margin: 0;
  font-family: 'Noto Serif TC', serif;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.empty-pointer-desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--app-text-muted);
  line-height: 1.6;
}

/* HUD — flat surface, lets the data carry weight without decoration. */
.b-hud {
  padding: 14px 18px 12px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 12px;
}
.b-hud :deep(.status-bar) {
  background: transparent;
  border: 0;
  padding: 0;
}
.b-hud :deep(.buff-display) {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--app-border);
}

/* Cockpit body: tool column | 序列 + 巨集 column
   Left-to-right operation flow: pick skills/run solver (input) →
   skill sequence appears (output) → copy macro. */
.cockpit-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 30%);
  gap: 20px;
  align-items: flex-start;
}

.cockpit-section {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.cockpit-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
/* Cockpit-section labels drop the cocoa-dot eyebrow that rail sections use.
   The dot reads as "boxed container" branding; cockpit sections live in the
   open canvas and only need a quiet uppercase label. Removing the repeat
   reduces the page's eyebrow count from 7+ to the rail-only set. */
.cockpit-section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}
.cockpit-section-count {
  margin-left: 8px;
  padding: 1px 7px;
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0;
}

/* Sequence column wraps both 序列 and 巨集 sections, sticky as a whole */
.cockpit-sequence-col {
  position: sticky;
  top: 200px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: calc(100vh - 220px);
  min-width: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.cockpit-section--sequence > :deep(.action-list) { padding: 0; }
.cockpit-section--sequence,
.cockpit-section--macro { min-width: 0; }

/* Progressive empty state for the sequence section.
   Arrow nudges leftward toward the solver/skill panel; the copy is
   italic Cormorant matching the brand's "quiet hint" voice. The whole
   block disappears as soon as actions populate, so a returning user
   never sees it again in the same session. */
.seq-empty-pointer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 14px;
  background: color-mix(in srgb, var(--app-craft) 4%, transparent);
  border: 1px dashed color-mix(in srgb, var(--app-craft) 26%, var(--app-border));
  border-radius: 10px;
}
.seq-empty-arrow {
  flex-shrink: 0;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
  color: var(--app-craft);
  animation: seq-empty-nudge 1.8s var(--ease-out-quart, ease-out) infinite;
}
@keyframes seq-empty-nudge {
  0%, 60%, 100% { transform: translateX(0); }
  30% { transform: translateX(-5px); }
}
.seq-empty-copy {
  margin: 0;
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
  font-size: 14px;
  line-height: 1.5;
  color: var(--app-text-muted);
}
/* One-shot pulse when actions transition empty → populated (solver done /
   first manual click). Telegraphs "the result landed here, copy from this row". */
.cockpit-section--macro.just-filled {
  animation: macro-just-filled 1.6s var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
  border-radius: 12px;
}
@keyframes macro-just-filled {
  0% {
    box-shadow:
      0 0 0 0 color-mix(in srgb, var(--app-craft) 32%, transparent),
      0 0 24px 0 color-mix(in srgb, var(--app-craft) 22%, transparent);
  }
  100% {
    box-shadow:
      0 0 0 0 color-mix(in srgb, var(--app-craft) 0%, transparent),
      0 0 0 0 color-mix(in srgb, var(--app-craft) 0%, transparent);
  }
}


/* Tool section header: eyebrow + mode switch + (manual) condition/ctrl aside */
.cockpit-tool-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 18px;
}
.cockpit-tool-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}
/* Manual-mode aside (ConditionChips + ManualControls) sits flush with the
   mode switch instead of drifting to the right edge — at wide column widths,
   margin-left:auto fragmented the head into two distant clusters. A slim
   vertical divider keeps the visual separation without the spacing. */
.cockpit-tool-head-aside {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding-left: 14px;
  border-left: 1px solid var(--app-border);
}

/* Mode switch — recessed track + raised pill (iOS/macOS idiom). */
.mode-switch {
  position: relative;
  display: inline-grid;
  grid-template-columns: 1fr 1fr;
  padding: 4px;
  background: color-mix(in srgb, var(--app-craft) 10%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-craft) 16%, var(--app-border));
  border-radius: 12px;
  isolation: isolate;
}
.mode-switch-thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc(50% - 4px);
  background: var(--app-surface);
  border-radius: 8px;
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--app-text) 6%, transparent),
    0 2px 6px color-mix(in srgb, var(--app-craft) 18%, transparent);
  transition: transform 0.22s var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
  z-index: 0;
}
.mode-switch-thumb[data-mode="manual"] {
  transform: translateX(100%);
}
.mode-switch-option {
  position: relative;
  z-index: 1;
  padding: 7px 22px;
  background: transparent;
  border: 0;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-muted);
  cursor: pointer;
  transition: color 0.18s var(--ease-out-quart, ease-out);
  white-space: nowrap;
}
.mode-switch-option:hover { color: var(--app-text); }
.mode-switch-option:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
  border-radius: 8px;
}
.mode-switch-option.is-active { color: var(--app-craft); }

.cockpit-tool-body {
  display: flex;
  flex-direction: column;
}

/* SolverPanel chip restyle — pill checkboxes that match SkillPanel category nav */
.cockpit-tool-body :deep(.solver-panel) {
  display: flex;
  flex-direction: column;
}
.cockpit-tool-body :deep(.solver-panel .skill-toggles) {
  margin: 0 0 16px;
  padding: 0;
  background: transparent;
  border-radius: 0;
  gap: 8px;
}
.cockpit-tool-body :deep(.solver-panel .toggle-label) {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--app-text-muted);
  margin-right: 4px;
}
.cockpit-tool-body :deep(.solver-panel .el-checkbox) {
  margin: 0;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  transition: all 0.15s var(--ease-out-quart, ease-out);
}
.cockpit-tool-body :deep(.solver-panel .el-checkbox:hover) {
  border-color: color-mix(in srgb, var(--app-craft) 50%, var(--app-border));
}
.cockpit-tool-body :deep(.solver-panel .el-checkbox.is-checked) {
  background: color-mix(in srgb, var(--app-craft) 15%, var(--app-surface));
  border-color: var(--app-craft);
}
.cockpit-tool-body :deep(.solver-panel .el-checkbox__input) {
  display: none;
}
.cockpit-tool-body :deep(.solver-panel .el-checkbox__label) {
  padding-left: 0;
  font-size: 13px;
  color: var(--app-text);
}
.cockpit-tool-body :deep(.solver-panel .el-checkbox.is-checked .el-checkbox__label) {
  color: var(--app-craft);
  font-weight: 600;
}
.cockpit-tool-body :deep(.solver-panel .el-checkbox.is-disabled) {
  opacity: 0.4;
  cursor: not-allowed;
}

/* SolverPanel's hero hub now owns its own button styling — see
   SolverPanel.vue's .solver-cta block. The WASM "loading" hint rolls into
   the hub copy, so no separate status-tag override is needed here. */

/* SkillPanel — flatten the inner border-card el-tabs to a chip nav row */
.cockpit-tool-body :deep(.skill-panel) {
  margin-top: 0;
}
.cockpit-tool-body :deep(.skill-panel .el-tabs--border-card),
.cockpit-tool-body :deep(.skill-panel .el-tabs--border-card > .el-tabs__content),
.cockpit-tool-body :deep(.skill-panel .el-tabs--border-card > .el-tabs__header) {
  background: transparent;
  border: 0;
  box-shadow: none;
}
.cockpit-tool-body :deep(.skill-panel .el-tabs--border-card > .el-tabs__header) {
  margin-bottom: 14px;
  padding: 0;
}
.cockpit-tool-body :deep(.skill-panel .el-tabs__nav-wrap::after) {
  display: none;
}
.cockpit-tool-body :deep(.skill-panel .el-tabs__nav) {
  border: 0 !important;
  display: flex;
  gap: 4px;
}
.cockpit-tool-body :deep(.skill-panel .el-tabs__item:hover) {
  color: var(--app-text);
  background: color-mix(in srgb, var(--app-craft) 6%, transparent) !important;
}
.cockpit-tool-body :deep(.skill-panel .el-tabs__item.is-active) {
  color: var(--app-craft) !important;
  font-weight: 600;
  background: color-mix(in srgb, var(--app-craft) 12%, transparent) !important;
}
.cockpit-tool-body :deep(.skill-panel .el-tabs__content) {
  padding: 0;
}

/* Unify pill sizing — solver chips and SkillPanel category nav match exactly. */
.cockpit-tool-body :deep(.solver-panel .el-checkbox),
.cockpit-tool-body :deep(.skill-panel .el-tabs__item) {
  --el-checkbox-height: 36px;
  height: 36px !important;
  min-height: 36px;
  line-height: 1;
  padding: 0 16px !important;
  font-size: 13px;
  border-radius: 999px !important;
  display: inline-flex !important;
  align-items: center;
  box-sizing: border-box;
  border: 0;
  margin: 0;
  color: var(--app-text-muted);
  background: transparent;
  transition: all 0.15s var(--ease-out-quart, ease-out);
}
.cockpit-tool-body :deep(.solver-panel .el-checkbox) {
  border: 1px solid var(--app-border);
  background: var(--app-surface);
}

/* ============================================================
   Hero-secondary CTAs — search (left rail) + macro copy (sequence col)
   Together with SolverPanel's solver-cta, these form the visual
   triad of "the three actions you actually came here to do":
     搜尋配方 → 啟動求解 → 複製巨集
   All three share the toast-gold tone (--app-accent) and the lift+
   glow behaviour. Loudness is state-aware: only the CTA matching
   the current flow step glows; the others stay clearly clickable
   without competing.
   ============================================================ */
.search-cta,
.macro-cta {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 0 16px;
  background: var(--app-accent);
  border: 1px solid var(--app-accent);
  border-radius: 10px;
  color: oklch(0.99 0.005 80);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--app-accent) 24%, transparent);
  transition:
    transform 0.18s var(--ease-out-quart, ease-out),
    box-shadow 0.18s var(--ease-out-quart, ease-out),
    background-color 0.18s var(--ease-out-quart, ease-out),
    border-color 0.18s var(--ease-out-quart, ease-out);
}
.search-cta:hover,
.macro-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--app-accent) 34%, transparent);
}
.search-cta:active,
.macro-cta:active {
  transform: translateY(0);
}
.search-cta:focus-visible,
.macro-cta:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}

/* Search CTA lives at the bottom of the queue section. */
.search-cta {
  margin-top: 12px;
}

/* Empty queue = step 1 of the flow is active = full hero treatment.
   Slightly taller, soft outer halo telegraphs "this is where you start". */
.search-cta.is-hero {
  min-height: 52px;
  font-size: 15px;
  margin-top: 0;
  box-shadow:
    0 4px 14px color-mix(in srgb, var(--app-accent) 30%, transparent),
    0 0 0 4px color-mix(in srgb, var(--app-accent) 10%, transparent);
}
.search-cta.is-hero:hover {
  box-shadow:
    0 8px 22px color-mix(in srgb, var(--app-accent) 36%, transparent),
    0 0 0 4px color-mix(in srgb, var(--app-accent) 14%, transparent);
}

/* Queue has items = "add more" mode. Clearly clickable but not
   competing with whatever comes next in the flow (solver / macro). */
.search-cta:not(.is-hero) {
  background: transparent;
  color: var(--app-accent);
  border-color: color-mix(in srgb, var(--app-accent) 42%, var(--app-border));
  box-shadow: none;
}
.search-cta:not(.is-hero):hover {
  background: color-mix(in srgb, var(--app-accent) 10%, transparent);
  border-color: var(--app-accent);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--app-accent) 18%, transparent);
}

.search-cta-icon,
.macro-cta-icon {
  flex-shrink: 0;
  font-size: 15px;
  line-height: 1;
  opacity: 0.92;
}
.search-cta-arrow {
  margin-left: auto;
  font-size: 14px;
  transition: transform 0.18s var(--ease-out-quart, ease-out);
}
.search-cta:hover .search-cta-arrow {
  transform: translateX(3px);
}

/* Macro CTAs sit in their own row below the section header so they
   can grow without crowding the label. Multiple macros wrap onto
   shared rows of equal-width pills. */
.macro-cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
.macro-cta {
  flex: 1 1 140px;
  width: auto;
  justify-content: center;
  gap: 8px;
}
.macro-cta-icon {
  margin-left: 4px;
  font-size: 13px;
  opacity: 0.85;
}

/* ============================================================
   Responsive fallbacks
   ============================================================ */

/* < 1720: drop right rail to row 2 column 2; cockpit-body stays 2-col. */
@media (max-width: 1720px) {
  .b-page-grid {
    grid-template-columns: clamp(280px, 26%, 360px) minmax(0, 1fr);
  }

  .rail-left,
  .rail-right {
    position: static;
    max-height: none;
    overflow: visible;
  }

  .rail-right {
    grid-column: 2;
    grid-row: 2;
    flex-direction: row;
    flex-wrap: wrap;
    border-radius: 14px;
  }
  .rail-right .rail-section {
    flex: 1 1 320px;
    min-width: 0;
    border-bottom: 0;
    border-right: 1px solid var(--app-border);
  }
  .rail-right .rail-section:last-child {
    border-right: 0;
  }

  .cockpit-sequence-col {
    position: static;
    max-height: none;
    overflow: visible;
  }
  .cockpit-body {
    grid-template-columns: minmax(0, 1fr) minmax(200px, 32%);
    gap: 16px;
  }
}

/* < 1360: collapse the cockpit-body to a single column so the four
   skill-toggle chips (工匠的神速技巧 / 掌握 / 心靈之手 / 快速改革) stay
   on one line. Below ~460px tool-column width they wrap, which makes the
   row feel like two unrelated chunks. The page-grid stays 2-col here —
   only the inner cockpit collapses. Solver/skill panel stacks above
   sequence + macro, preserving the top-to-bottom input → output flow. */
@media (max-width: 1360px) {
  .cockpit-body { grid-template-columns: 1fr; }
}

/* < 900: stack everything single-column */
@media (max-width: 900px) {
  .b-page-grid { grid-template-columns: 1fr; }
  .rail,
  .rail-right {
    position: static;
    max-height: none;
    overflow: visible;
    flex-direction: column;
  }
  .rail-right .rail-section {
    border-right: 0;
    border-bottom: 1px solid var(--app-border);
  }
  .rail-right .rail-section:last-child { border-bottom: 0; }
}

/* ============================================================
   Mobile branch — flat sections, no el-card wrappers
   ============================================================ */
.view-container.is-mobile {
  padding: 0 16px 80px;
}

.m-chev {
  display: inline-block;
  transition: transform 0.18s var(--ease-out-quart, ease-out);
  color: var(--app-text-muted);
  font-size: 12px;
}
.m-chev.is-open {
  transform: rotate(180deg);
  color: var(--app-craft);
}
.muted { color: var(--app-text-muted); }
.m-rs-dot { color: var(--app-text-muted); opacity: 0.5; margin: 0 5px; }

.m-recipe-strip {
  display: flex;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--app-border);
}
.m-rs-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 10px;
  object-fit: contain;
  background: color-mix(in srgb, var(--app-craft) 12%, transparent);
  padding: 4px;
}
.m-rs-body { flex: 1; min-width: 0; }
.m-rs-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.m-rs-name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.m-rs-stars {
  color: var(--app-craft);
  letter-spacing: 1px;
  margin-left: 4px;
  font-size: 11px;
}
.m-rs-switch {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  color: var(--app-text-muted);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
}
.m-rs-meta,
.m-rs-stats {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--app-text-muted);
  font-family: 'Fira Code', ui-monospace, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.m-setup-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 2px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.m-setup-summary {
  font-size: 13px;
  color: var(--app-text-muted);
}
.m-setup-summary b { color: var(--app-text); font-weight: 600; }
.m-setup-body {
  padding: 8px 2px 16px;
  border-bottom: 1px solid var(--app-border);
}
.m-setup-group + .m-setup-group {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed var(--app-border);
}
.m-setup-group-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.m-mode-wrap {
  position: sticky;
  top: var(--mobile-app-bar-h);
  z-index: 10;
  padding: 10px 16px;
  margin: 0 -16px;
  background: color-mix(in srgb, var(--app-bg) 88%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .m-mode-wrap { background: var(--app-bg); }
}
.m-mode-seg { width: 100%; }
.m-mode-seg :deep(.el-segmented) { width: 100%; }
.m-mode-seg :deep(.el-segmented__group) {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.m-manual-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--app-border);
}

.m-status {
  padding: 14px 0;
  border-bottom: 1px solid var(--app-border);
}
.m-status :deep(.status-bar) {
  background: transparent;
  border: 0;
  padding: 0;
}

.m-flat {
  padding: 16px 0 14px;
  border-bottom: 1px solid var(--app-border);
}
.m-flat:last-child { border-bottom: 0; }
.m-flat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  width: 100%;
}
.m-flat-head.is-collapsible {
  background: transparent;
  border: 0;
  padding: 0;
  font: inherit;
  cursor: pointer;
  color: inherit;
  margin-bottom: 0;
}
.m-flat-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.m-count {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  background: color-mix(in srgb, var(--app-text) 8%, transparent);
  color: var(--app-text);
  border-radius: 999px;
  font-size: 10px;
  letter-spacing: 0;
  font-weight: 500;
  text-transform: none;
}
.m-text-btn {
  background: transparent;
  border: 0;
  color: var(--app-text-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
}
.m-macro-body { padding-top: 12px; }

.view-container.is-mobile :deep(.el-card) {
  background: transparent;
  border: 0;
  box-shadow: none;
}
.view-container.is-mobile :deep(.el-card__header),
.view-container.is-mobile :deep(.el-card__body) {
  padding: 0;
  border: 0;
}

:global(.m-queue-sheet.el-drawer) {
  border-radius: 20px 20px 0 0;
  background: var(--app-surface) !important;
  border-top: 1px solid var(--app-border);
}
:global(.m-queue-sheet .el-drawer__body) {
  padding: 0 !important;
}

.m-sheet {
  padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
  color: var(--app-text);
}
.m-sheet-handle {
  width: 36px;
  height: 4px;
  background: var(--app-border);
  border-radius: 999px;
  margin: 0 auto 14px;
}
.m-sheet-title {
  margin: 0 0 14px;
  font-size: 17px;
  font-weight: 700;
}

.m-q-list {
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
  border-top: 1px solid var(--app-border);
}
.m-q-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 2px;
  border-bottom: 1px solid var(--app-border);
  cursor: pointer;
}
.m-q-item.is-active {
  background: color-mix(in srgb, var(--app-craft) 8%, transparent);
  margin: 0 -20px;
  padding-left: 22px;
  padding-right: 22px;
}
.m-q-item:focus-visible {
  outline: 2px solid var(--app-accent-light);
  outline-offset: -2px;
}
.m-q-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 6px;
}
.m-q-name {
  flex: 1;
  font-weight: 600;
  font-size: 14px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.m-q-job {
  font-size: 11px;
  color: var(--app-text-muted);
}
.m-q-remove {
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  color: var(--app-text-muted);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.m-q-remove:hover {
  background: color-mix(in srgb, var(--app-text) 6%, transparent);
}
.m-q-empty {
  padding: 24px 0;
  text-align: center;
  color: var(--app-text-muted);
  font-size: 13px;
}

.m-sheet-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.m-sheet-primary {
  flex: 1;
  min-width: 140px;
  padding: 12px;
  background: var(--app-accent);
  border: 0;
  border-radius: 10px;
  color: white;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.m-sheet-secondary {
  flex: 1;
  min-width: 140px;
  padding: 12px;
  background: transparent;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  color: var(--app-text);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.m-sheet-danger { color: oklch(0.55 0.20 25); border-color: oklch(0.55 0.20 25 / 0.3); }

/* === Mobile gearset-not-set warning banner === */
.gearset-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
  padding: 18px 22px;
  background: oklch(0.58 0.17 45 / 0.10);
  border: 1.5px solid oklch(0.58 0.17 45 / 0.50);
  border-radius: 12px;
  box-shadow: 0 4px 14px oklch(0.58 0.17 45 / 0.10);
}
.gearset-banner-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: oklch(0.58 0.17 45);
  color: oklch(0.99 0.005 90);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}
.gearset-banner-body { flex: 1; min-width: 0; }
.gearset-banner-title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 700;
  font-size: 16px;
  color: oklch(0.32 0.14 45);
  margin-bottom: 3px;
}
.gearset-banner-desc {
  font-size: 13.5px;
  color: oklch(0.42 0.16 45);
}
.gearset-banner-cta {
  flex-shrink: 0;
  padding: 10px 20px;
  border: 0;
  border-radius: 10px;
  background: oklch(0.58 0.17 45);
  color: oklch(0.99 0.005 90);
  font-family: inherit;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 2px 6px oklch(0.58 0.17 45 / 0.30);
  transition:
    background-color 0.18s var(--ease-out-quart),
    box-shadow 0.18s var(--ease-out-quart),
    transform 0.18s var(--ease-out-quart);
}
.gearset-banner-cta:hover {
  background: oklch(0.42 0.16 45);
  transform: translateY(-1px);
  box-shadow: 0 6px 14px oklch(0.58 0.17 45 / 0.40);
}
.gearset-banner-cta:active { transform: translateY(0); }

@media (max-width: 640px) {
  .gearset-banner {
    flex-direction: column;
    align-items: stretch;
    text-align: center;
    padding: 16px;
  }
  .gearset-banner-icon { margin: 0 auto; }
}
</style>

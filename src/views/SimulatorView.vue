<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useRecipeStore } from '@/stores/recipe'
import { useGearsetsStore } from '@/stores/gearsets'
import { useBomStore } from '@/stores/bom'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { JOB_NAMES } from '@/utils/jobs'
import { useSimulatorStore } from '@/stores/simulator'
import { createInitialState, type CraftParams, type CraftState, type StepResult } from '@/engine/simulator'
import type { BuffType } from '@/engine/buffs'
import type { EnhancedStats } from '@/engine/food-medicine'
import { calculateInitialQuality } from '@/engine/quality'
import { getRecipe, findRecipesByItemName } from '@/api/xivapi'
import { simulateCraftDetail, waitForWasm } from '@/solver/worker'
import { craftParamsToSolverConfig } from '@/solver/config'
import type { WasmEffects, StepDetail } from '@/solver/raphael'
import { JOB_ORDER, type Job } from '@/engine/skill-icons-by-job'
import { JOB_ABBR } from '@/utils/jobs'

const VALID_JOBS = new Set<string>(JOB_ORDER)
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
const recipeStore = useRecipeStore()
const gearsetsStore = useGearsetsStore()
const bomStore = useBomStore()
const simStore = useSimulatorStore()

const recipe = computed(() => recipeStore.currentRecipe)
const searchSidebarOpen = ref(false)

const isMobile = useMediaQuery('(max-width: 640px)')
const setupOpen = ref(false)
const macroOpen = ref(false)
const queueSheetOpen = ref(false)

// Responsive columns for the recipe-info descriptions table
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024)
const infoDescColumns = computed(() => viewportWidth.value < 480 ? 1 : 2)
let widthListener: (() => void) | null = null
onMounted(() => {
  widthListener = () => { viewportWidth.value = window.innerWidth }
  window.addEventListener('resize', widthListener)
})
onUnmounted(() => {
  if (widthListener) window.removeEventListener('resize', widthListener)
})

const initialQuality = ref(0)
const enhancedStats = ref<EnhancedStats | null>(null)

// Switch per-recipe simulator state when active recipe changes
watch(() => recipe.value?.id ?? null, (id) => {
  // Reset initialQuality immediately so craftParams never uses a stale value
  // from the previous recipe (the InitialQuality component will also emit 0,
  // but its watcher runs later in the flush queue).
  initialQuality.value = 0
  simStore.switchToRecipe(id)
}, { immediate: true })
const gearset = computed(() => {
  if (!recipe.value) return null
  return gearsetsStore.getGearsetForJob(recipe.value.job)
})

const canSimulate = computed(() => !!recipe.value && !!gearset.value)

const foodMedicineSummary = computed(() => enhancedStats.value ? '已設定' : '未設定')
const jobFullName = computed(() => {
  const j = recipe.value?.job
  if (!j) return ''
  return JOB_NAMES[j] ?? JOB_NAMES[JOB_ABBR[j] ?? j] ?? j
})

function openSearchFromSheet() {
  queueSheetOpen.value = false
  searchSidebarOpen.value = true
}

function pickQueueRecipe(r: import('@/stores/recipe').Recipe) {
  recipeStore.setRecipe(r)
  queueSheetOpen.value = false
}

// recipe.job is persisted as the Chinese short-form ('木工', '烹調', ...);
// ICONS_BY_JOB keys on the 3-letter abbr, so map here and drop unknown values
// to null rather than type-lying a bogus string into the Job union.
const recipeJobAbbr = computed<Job | null>(() => {
  const j = recipe.value?.job
  if (!j) return null
  const abbr = JOB_ABBR[j] ?? j
  return VALID_JOBS.has(abbr) ? (abbr as Job) : null
})

function onInitialQualityUpdate(val: number) {
  initialQuality.value = val
}

function onEnhancedStatsUpdate(val: EnhancedStats) {
  enhancedStats.value = val
}

const effectiveStats = computed(() => {
  if (!gearset.value) return null
  if (enhancedStats.value) return enhancedStats.value
  return {
    craftsmanship: gearset.value.craftsmanship,
    control: gearset.value.control,
    cp: gearset.value.cp,
  }
})

const craftParams = computed<CraftParams | null>(() => {
  if (!recipe.value || !gearset.value || !effectiveStats.value) return null
  return {
    craftsmanship: effectiveStats.value.craftsmanship,
    control: effectiveStats.value.control,
    cp: effectiveStats.value.cp,
    recipeLevelTable: { ...recipe.value.recipeLevelTable },
    crafterLevel: gearset.value.level,
    initialQuality: initialQuality.value,
    canHq: recipe.value.canHq,
  }
})

const currentState = computed(() => {
  if (!craftParams.value) return null
  const initial = createInitialState(craftParams.value)
  if (simStore.simulationResults.length > 0) {
    return simStore.simulationResults[simStore.simulationResults.length - 1].state
  }
  return initial
})

// --- WASM effects → CraftState buff map conversion ---

function wasmEffectsToBuffs(effects: WasmEffects): Map<BuffType, { stacks: number; duration: number }> {
  const buffs = new Map<BuffType, { stacks: number; duration: number }>()
  if (effects.inner_quiet > 0) buffs.set('InnerQuiet', { stacks: effects.inner_quiet, duration: Infinity })
  if (effects.waste_not > 0) buffs.set('WasteNot', { stacks: 1, duration: effects.waste_not })
  if (effects.innovation > 0) buffs.set('Innovation', { stacks: 1, duration: effects.innovation })
  if (effects.veneration > 0) buffs.set('Veneration', { stacks: 1, duration: effects.veneration })
  if (effects.great_strides > 0) buffs.set('GreatStrides', { stacks: 1, duration: effects.great_strides })
  if (effects.muscle_memory > 0) buffs.set('MuscleMemory', { stacks: 1, duration: effects.muscle_memory })
  if (effects.manipulation > 0) buffs.set('Manipulation', { stacks: 1, duration: effects.manipulation })
  if (effects.trained_perfection_active) buffs.set('TrainedPerfection', { stacks: 1, duration: 0 })
  if (effects.heart_and_soul_active) buffs.set('HeartAndSoul', { stacks: 1, duration: 0 })
  return buffs
}

function wasmStepToStepResult(
  step: StepDetail,
  index: number,
  params: CraftParams,
): StepResult {
  const state: CraftState = {
    progress: step.progress,
    quality: step.quality + params.initialQuality,
    durability: step.durability,
    cp: step.cp,
    maxProgress: params.recipeLevelTable.difficulty,
    maxQuality: params.recipeLevelTable.quality,
    maxDurability: params.recipeLevelTable.durability,
    maxCp: params.cp,
    buffs: wasmEffectsToBuffs(step.effects),
    step: index + 1,
    condition: 'Normal',
    isComplete: step.is_finished,
    isSuccess: step.is_finished && step.progress >= params.recipeLevelTable.difficulty,
  }
  return { action: step.action, state, success: step.success }
}

// craftParamsToSolverConfig imported from shared util

// --- WASM simulation ---

let simulationVersion = 0

async function runSimulation() {
  if (!craftParams.value || simStore.actions.length === 0) {
    simStore.setSimulationResults([])
    return
  }

  const version = ++simulationVersion
  const params = craftParams.value
  const actions = [...simStore.actions]
  const conditions = simStore.mode === 'manual' && simStore.conditions.length > 0
    ? [...simStore.conditions]
    : undefined

  try {
    await waitForWasm()
    const config = craftParamsToSolverConfig(params)
    const detail = await simulateCraftDetail(config, actions, conditions)

    // Discard stale results if another simulation was triggered
    if (version !== simulationVersion) return

    const results: StepResult[] = detail.steps.map((step, i) =>
      wasmStepToStepResult(step, i, params),
    )
    simStore.setSimulationResults(results)
  } catch (err) {
    console.error('[SimulatorView] WASM simulation failed:', err)
    simStore.setSimulationResults([])
  }
}

// conditions are mutated in lockstep with actions (pushAction, undo, redo,
// resetManual) so watching actions alone is sufficient — adding conditions
// here would double-fire on every snapshot restore.
watch([craftParams, () => simStore.actions], runSimulation, { immediate: true })

function handleAddFromSearch(recipe: import('@/stores/recipe').Recipe) {
  recipeStore.addToQueue(recipe)
  recipeStore.setRecipe(recipe)
  ElMessage.success(`已將「${recipe.name}」加入模擬佇列`)
}

function handleRemoveFromQueue(recipeId: number) {
  simStore.removeRecipeState(recipeId)
  recipeStore.removeFromQueue(recipeId)
}

function handleClearQueue() {
  for (const r of recipeStore.simulationQueue) {
    simStore.removeRecipeState(r.id)
  }
  recipeStore.clearQueue()
}

function handleRemoveAction(index: number) {
  simStore.removeAction(index)
}

function handleClearActions() {
  simStore.clearActions()
}

const modeOptions = [
  { label: '自動求解', value: 'solver' },
  { label: '手動操作', value: 'manual' },
]

function handleUseSkill(skillId: string) {
  simStore.pushAction(skillId)
}

// --- Craft Recommendation integration ---
const solverResult = computed(() => simStore.solverResult)

function onSolveComplete(result: { actions: string[] }) {
  simStore.setSolverResult(result)
}

function handleApplyHq(hqAmounts: number[]) {
  // Update initialQuality by calculating quality from the HQ amounts
  if (!recipe.value) return
  const ingredients = recipe.value.ingredients.map((ing, i) => ({
    amount: ing.amount,
    hqAmount: hqAmounts[i] ?? 0,
    level: ing.level,
    canHq: ing.canHq,
  }))
  const quality = calculateInitialQuality(
    recipe.value.recipeLevelTable.quality,
    recipe.value.materialQualityFactor,
    ingredients,
  )
  initialQuality.value = quality
  // Clear solver result to re-trigger recommendation after re-solve
  simStore.setSolverResult(null)
  ElMessage.success(`已套用 HQ 組合，初期品質：${quality.toLocaleString()}`)
}

function handleAddToBom() {
  if (!recipe.value) return
  bomStore.addTarget({
    itemId: recipe.value.itemId,
    recipeId: recipe.value.id,
    name: recipe.value.name,
    icon: recipe.value.icon,
    quantity: 1,
  })
  ElMessage.success(`已將「${recipe.value.name}」加入購物清單`)
}

async function handleSelfCraft(itemId: number) {
  if (!recipe.value) return
  const ingredient = recipe.value.ingredients.find(ing => ing.itemId === itemId)
  if (!ingredient) return

  try {
    const results = await findRecipesByItemName(ingredient.name, itemId)
    if (results.length === 0) {
      ElMessage.warning(`找不到「${ingredient.name}」的配方`)
      return
    }
    const fullRecipe = await getRecipe(results[0].recipeId)
    recipeStore.addToQueue(fullRecipe)
    recipeStore.setRecipe(fullRecipe)
    ElMessage.success(`已將「${fullRecipe.name}」加入模擬佇列`)
  } catch (err) {
    console.error('[SimulatorView] Failed to load recipe for self-craft:', err)
    ElMessage.error('載入配方失敗')
  }
}
</script>

<template>
  <div class="view-container" :class="{ 'is-mobile': isMobile }">
    <template v-if="!isMobile">
    <h2>製作模擬</h2>
    <p class="view-desc">試試不同手法，找到你的最佳製作流程。</p>

    <!-- Queue selector -->
    <el-card shadow="never" class="queue-card">
      <template #header>
        <div class="queue-header">
          <span class="card-title">模擬佇列</span>
          <div class="queue-actions">
            <el-button size="small" type="primary" text @click="searchSidebarOpen = true">搜尋配方</el-button>
            <el-button v-if="recipeStore.simulationQueue.length > 0" size="small" text type="danger" @click="handleClearQueue()">清空佇列</el-button>
          </div>
        </div>
      </template>
      <div v-if="recipeStore.simulationQueue.length > 0" class="queue-items">
        <div
          v-for="queueRecipe in recipeStore.simulationQueue"
          :key="queueRecipe.id"
          class="queue-item"
          :class="{ active: recipe?.id === queueRecipe.id }"
          role="button"
          tabindex="0"
          :aria-pressed="recipe?.id === queueRecipe.id"
          :aria-label="`選擇配方：${queueRecipe.name}`"
          @click="recipeStore.setRecipe(queueRecipe)"
          @keydown.enter.prevent="recipeStore.setRecipe(queueRecipe)"
          @keydown.space.prevent="recipeStore.setRecipe(queueRecipe)"
        >
          <img :src="queueRecipe.icon" alt="" aria-hidden="true" loading="lazy" decoding="async" class="queue-icon" />
          <span><ItemName :item-id="queueRecipe.itemId" :fallback="queueRecipe.name" /></span>
          <el-tag size="small" type="info">{{ queueRecipe.job }}</el-tag>
          <el-button
            size="small"
            text
            type="danger"
            class="queue-remove"
            @click.stop="handleRemoveFromQueue(queueRecipe.id)"
          >
            移除
          </el-button>
        </div>
      </div>
      <AppEmptyState
        v-else
        icon="⚗️"
        title="還沒有配方"
        description="搜尋你想製作的道具，開始模擬最佳技能序列吧！"
      >
        <el-button type="primary" @click="searchSidebarOpen = true">搜尋配方</el-button>
      </AppEmptyState>
    </el-card>

    <!-- Recipe / Gearset Info -->
    <div class="info-section">

      <el-alert
        v-if="recipe && gearset && gearset.craftsmanship === 0 && gearset.control === 0"
        title="尚未設定該職業的裝備數值"
        type="warning"
        :closable="false"
        show-icon
        style="margin-top: 8px"
      >
        <el-link type="primary" @click="router.push('/')">前往裝備頁面設定配裝</el-link>
      </el-alert>

      <div v-if="recipe && gearset" class="info-header-row">
        <el-descriptions
          :column="infoDescColumns"
          border
          size="small"
          class="info-desc"
        >
        <el-descriptions-item label="配方">
          <ItemName :item-id="recipe.itemId" :fallback="recipe.name" /> (Lv.{{ recipe.level }}<template v-if="recipe.stars > 0"> {{ '\u2605'.repeat(recipe.stars) }}</template>)
        </el-descriptions-item>
        <el-descriptions-item label="職業 / 等級">
          {{ JOB_NAMES[gearset.job] ?? gearset.job }} Lv.{{ gearset.level }}
        </el-descriptions-item>
        <el-descriptions-item label="作業精度">
          {{ effectiveStats!.craftsmanship }}
          <span v-if="effectiveStats!.craftsmanship !== gearset.craftsmanship" class="stat-diff">
            (+{{ effectiveStats!.craftsmanship - gearset.craftsmanship }})
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="加工精度">
          {{ effectiveStats!.control }}
          <span v-if="effectiveStats!.control !== gearset.control" class="stat-diff">
            (+{{ effectiveStats!.control - gearset.control }})
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="CP">
          {{ effectiveStats!.cp }}
          <span v-if="effectiveStats!.cp !== gearset.cp" class="stat-diff">
            (+{{ effectiveStats!.cp - gearset.cp }})
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="難度 / 品質 / 耐久">
          {{ recipe.recipeLevelTable.difficulty }} / {{ recipe.recipeLevelTable.quality }} / {{ recipe.recipeLevelTable.durability }}
        </el-descriptions-item>
        </el-descriptions>
        <el-button size="small" @click="handleAddToBom()">加入購物清單</el-button>
      </div>
    </div>

    <!-- Shared status bars (progress / quality / buffs) -->
    <el-card v-if="canSimulate" shadow="never" class="shared-status">
      <StatusBar :craft-state="currentState" />
      <el-divider style="margin: 8px 0" />
      <BuffDisplay :buffs="currentState?.buffs ?? new Map()" />
    </el-card>

    <!-- Main Tabs -->
    <el-tabs type="border-card" class="main-tabs">
      <el-tab-pane label="模擬">
        <router-link to="/batch" class="batch-tip">
          一次要製作很多配方嗎？來回模擬複製貼上很累嗎？試試<span class="batch-tip-link">批量製作</span>吧！
        </router-link>
        <template v-if="canSimulate">
          <div class="mode-switch-row">
            <el-segmented
              :model-value="simStore.mode"
              :options="modeOptions"
              size="default"
              @change="(v: string) => simStore.setMode(v as 'solver' | 'manual')"
            />
            <div v-if="simStore.mode === 'manual'" class="manual-toolbar">
              <ConditionChips
                :model-value="simStore.currentCondition"
                @change="(c) => (simStore.currentCondition = c)"
              />
              <ManualControls />
            </div>
          </div>

          <div class="sim-layout">
            <div class="sim-left">
              <el-card shadow="never" class="sim-section">
                <template #header>
                  <span class="card-title">技能序列</span>
                </template>
                <ActionList
                  :actions="simStore.actions"
                  :results="simStore.simulationResults"
                  :job="recipeJobAbbr"
                  @remove="handleRemoveAction"
                  @clear="handleClearActions"
                />
              </el-card>

              <el-card
                v-if="simStore.mode === 'manual' && gearset"
                shadow="never"
                class="sim-section"
              >
                <template #header>
                  <span class="card-title">技能面板</span>
                </template>
                <SkillPanel
                  :level="gearset.level"
                  :craft-state="currentState"
                  :job="recipeJobAbbr"
                  @use-skill="handleUseSkill"
                />
              </el-card>

              <SolverPanel
                v-if="simStore.mode === 'solver'"
                :craft-params="craftParams"
                @solve-complete="onSolveComplete"
              />

              <CraftRecommendation
                v-if="simStore.mode === 'solver'"
                :craft-params="craftParams"
                :recipe="recipe"
                :solver-result="solverResult"
                @apply-hq="handleApplyHq"
                @self-craft="handleSelfCraft"
              />
            </div>

            <div class="sim-right">
              <el-card shadow="never" class="sim-section">
                <template #header>
                  <span class="card-title">遊戲巨集</span>
                </template>
                <MacroExport />
              </el-card>
            </div>
          </div>
        </template>

        <AppEmptyState
          v-else
          icon="🔮"
          title="準備就緒"
          description="從上方佇列選擇一個配方，再確認裝備組，就能開始模擬了"
        />
      </el-tab-pane>

      <el-tab-pane label="初期品質">
        <InitialQuality @update:initial-quality="onInitialQualityUpdate" />
      </el-tab-pane>

      <el-tab-pane label="食藥">
        <FoodMedicine @update:enhanced-stats="onEnhancedStatsUpdate" />
      </el-tab-pane>
    </el-tabs>

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
        <!-- Current recipe strip -->
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

        <el-alert
          v-if="gearset && gearset.craftsmanship === 0 && gearset.control === 0"
          title="尚未設定該職業的裝備數值"
          type="warning"
          :closable="false"
          show-icon
          class="m-alert"
        >
          <el-link type="primary" @click="router.push('/gearset')">前往裝備頁面設定配裝</el-link>
        </el-alert>

        <!-- Setup accordion: initial quality + food/medicine -->
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
            <InitialQuality @update:initial-quality="onInitialQualityUpdate" />
          </div>
          <div class="m-setup-group">
            <h4 class="m-setup-group-title">食藥</h4>
            <FoodMedicine @update:enhanced-stats="onEnhancedStatsUpdate" />
          </div>
        </div>

        <!-- Sticky mode segmented -->
        <div v-if="canSimulate" class="m-mode-wrap">
          <el-segmented
            :model-value="simStore.mode"
            :options="modeOptions"
            size="default"
            class="m-mode-seg"
            @change="(v: string) => simStore.setMode(v as 'solver' | 'manual')"
          />
        </div>

        <!-- Manual toolbar -->
        <div v-if="canSimulate && simStore.mode === 'manual'" class="m-manual-row">
          <ConditionChips
            :model-value="simStore.currentCondition"
            @change="(c) => (simStore.currentCondition = c)"
          />
          <ManualControls />
        </div>

        <!-- Status bars + buffs -->
        <section v-if="canSimulate" class="m-status">
          <StatusBar :craft-state="currentState" />
          <BuffDisplay :buffs="currentState?.buffs ?? new Map()" />
        </section>

        <!-- Action sequence -->
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
            @remove="handleRemoveAction"
            @clear="handleClearActions"
          />
        </section>

        <!-- Skill panel (manual) -->
        <section v-if="canSimulate && simStore.mode === 'manual' && gearset" class="m-flat">
          <h3 class="m-flat-title">技能面板</h3>
          <SkillPanel
            :level="gearset.level"
            :craft-state="currentState"
            :job="recipeJobAbbr"
            @use-skill="handleUseSkill"
          />
        </section>

        <!-- Solver / recommendation (solver mode) -->
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

        <!-- Macro (collapsed) -->
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

      <!-- Queue bottom sheet -->
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
.view-container { --page-accent: var(--app-craft); --page-accent-dim: var(--app-craft-dim); }

.info-section {
  margin-bottom: 16px;
}

.info-header-row {
  margin-top: 12px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.info-header-row .info-desc {
  flex: 1;
  min-width: 0;
}

.info-desc {
  margin-top: 0;
}

.shared-status {
  margin-top: 12px;
}

.main-tabs {
  margin-top: 12px;
}

.mode-switch-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.manual-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.sim-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.sim-left {
  flex: 1;
  min-width: 0;
}

.sim-right {
  flex: 1;
  min-width: 0;
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
}

.sim-right :deep(.el-card) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: 100%;
}

.sim-right :deep(.el-card__body) {
  overflow-y: auto;
  min-height: 0;
}

.sim-section {
  margin-bottom: 12px;
}

@media (max-width: 900px) {
  .sim-layout {
    flex-direction: column;
  }

  .sim-right {
    width: 100%;
    position: static;
    max-height: none;
  }
}

@media (max-width: 640px) {
  .mode-switch-row {
    gap: 8px;
  }

  .manual-toolbar {
    margin-left: 0;
    width: 100%;
    justify-content: flex-start;
  }

  .info-header-row {
    flex-direction: column;
    gap: 8px;
  }

  .sim-layout {
    gap: 12px;
  }
}

.stat-diff {
  color: var(--el-color-success);
  font-size: 12px;
  margin-left: 4px;
}

.queue-card {
  margin-bottom: 16px;
}

.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.queue-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.queue-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.queue-item:hover {
  background-color: var(--app-surface-hover);
}

.queue-item.active {
  background-color: var(--app-accent-glow);
  border: 1px solid var(--el-border-color-dark);
}

.queue-item:focus-visible {
  outline: 2px solid var(--app-accent-light);
  outline-offset: 2px;
}

.queue-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.queue-item > span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-item :deep(.el-tag) {
  flex-shrink: 0;
}

.queue-remove {
  margin-left: auto;
  flex-shrink: 0;
}

.batch-tip {
  display: block;
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 8px;
  padding: 10px 16px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  text-decoration: none;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
}

.batch-tip:hover {
  background: var(--el-color-primary-light-7);
  border-color: var(--el-color-primary-light-3);
}

.batch-tip:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.batch-tip-link {
  color: var(--el-color-primary);
  font-weight: 600;
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

/* --- Recipe strip --- */
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

.m-alert {
  margin: 10px 0;
}

/* --- Setup accordion --- */
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

/* --- Sticky mode segmented --- */
.m-mode-wrap {
  position: sticky;
  top: 52px; /* mobile app bar height */
  z-index: 10;
  padding: 10px 0;
  margin: 0 -16px;
  padding-left: 16px;
  padding-right: 16px;
  background: color-mix(in srgb, var(--app-bg) 88%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.m-mode-seg {
  width: 100%;
}

.m-mode-seg :deep(.el-segmented) {
  width: 100%;
}

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

/* --- Status section (flat, no card) --- */
.m-status {
  padding: 14px 0;
  border-bottom: 1px solid var(--app-border);
}

.m-status :deep(.status-bar) {
  background: transparent;
  border: 0;
  padding: 0;
}

/* --- Flat sections --- */
.m-flat {
  padding: 16px 0 14px;
  border-bottom: 1px solid var(--app-border);
}

.m-flat:last-child {
  border-bottom: 0;
}

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

/* Strip inner card borders from child components so they visually belong
 * to the flat section rather than becoming yet another boxed container. */
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

/* --- Queue bottom sheet --- */
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

.m-sheet-danger { color: #F87171; border-color: rgba(248, 113, 113, 0.3); }
</style>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useRecipeStore } from '@/stores/recipe'
import { useGearsetsStore } from '@/stores/gearsets'
import { useBomStore } from '@/stores/bom'
import { JOB_NAMES } from '@/utils/jobs'
import { useSimulatorStore } from '@/stores/simulator'
import { simulateAll, createInitialState, type CraftParams } from '@/engine/simulator'
import type { EnhancedStats } from '@/engine/food-medicine'
import { calculateInitialQuality } from '@/engine/quality'
import { getRecipe, findRecipesByItemName } from '@/api/xivapi'
import StatusBar from '@/components/simulator/StatusBar.vue'
import BuffDisplay from '@/components/simulator/BuffDisplay.vue'
import ActionList from '@/components/simulator/ActionList.vue'
import MacroExport from '@/components/simulator/MacroExport.vue'
import SolverPanel from '@/components/simulator/SolverPanel.vue'
import InitialQuality from '@/components/simulator/InitialQuality.vue'
import FoodMedicine from '@/components/simulator/FoodMedicine.vue'
import CraftRecommendation from '@/components/simulator/CraftRecommendation.vue'

const router = useRouter()
const recipeStore = useRecipeStore()
const gearsetsStore = useGearsetsStore()
const bomStore = useBomStore()
const simStore = useSimulatorStore()

const recipe = computed(() => recipeStore.currentRecipe)

// Switch per-recipe simulator state when active recipe changes
watch(() => recipe.value?.id ?? null, (id) => {
  simStore.switchToRecipe(id)
}, { immediate: true })
const gearset = computed(() => {
  if (!recipe.value) return null
  return gearsetsStore.getGearsetForJob(recipe.value.job)
})

const canSimulate = computed(() => !!recipe.value && !!gearset.value)

const initialQuality = ref(0)
const enhancedStats = ref<EnhancedStats | null>(null)

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

function runSimulation() {
  if (!craftParams.value) {
    simStore.setSimulationResults([])
    return
  }
  const initial = createInitialState(craftParams.value)
  const results = simulateAll(craftParams.value, initial, simStore.actions)
  simStore.setSimulationResults(results)
}

watch([craftParams, () => simStore.actions], runSimulation, { immediate: true })

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
  ElMessage.success(`已將「${recipe.value.name}」加入材料清單`)
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
  <div class="view-container">
    <h2>製作模擬</h2>
    <p class="view-desc">模擬製作過程，規劃最佳技能序列。</p>

    <!-- Queue selector -->
    <el-card v-if="recipeStore.simulationQueue.length > 0" shadow="never" class="queue-card">
      <template #header>
        <div class="queue-header">
          <span class="card-title">模擬佇列</span>
          <el-button size="small" text type="danger" @click="handleClearQueue()">清空佇列</el-button>
        </div>
      </template>
      <div class="queue-items">
        <div
          v-for="queueRecipe in recipeStore.simulationQueue"
          :key="queueRecipe.id"
          class="queue-item"
          :class="{ active: recipe?.id === queueRecipe.id }"
          @click="recipeStore.setRecipe(queueRecipe)"
        >
          <img :src="queueRecipe.icon" class="queue-icon" />
          <span>{{ queueRecipe.name }}</span>
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
    </el-card>

    <!-- Recipe / Gearset Info -->
    <div class="info-section">
      <el-alert
        v-if="!recipe"
        title="尚未選擇配方"
        type="warning"
        :closable="false"
        show-icon
      >
        <el-link type="primary" @click="router.push('/recipe')">前往配方頁面選擇配方</el-link>
      </el-alert>

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
          :column="2"
          border
          size="small"
          class="info-desc"
        >
        <el-descriptions-item label="配方">
          {{ recipe.name }} (Lv.{{ recipe.level }}<template v-if="recipe.stars > 0"> {{ '\u2605'.repeat(recipe.stars) }}</template>)
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
        <el-button size="small" @click="handleAddToBom()">加入材料清單</el-button>
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
        <template v-if="canSimulate">
          <div class="sim-layout">
            <div class="sim-left">
              <el-card shadow="never" class="sim-section">
                <template #header>
                  <span class="card-title">技能序列</span>
                </template>
                <ActionList
                  :actions="simStore.actions"
                  :results="simStore.simulationResults"
                  @remove="handleRemoveAction"
                  @clear="handleClearActions"
                />
              </el-card>

              <SolverPanel :craft-params="craftParams" @solve-complete="onSolveComplete" />

              <CraftRecommendation
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

        <el-empty v-else description="請先選擇配方與裝備組" />
      </el-tab-pane>

      <el-tab-pane label="初期品質">
        <InitialQuality @update:initial-quality="onInitialQualityUpdate" />
      </el-tab-pane>

      <el-tab-pane label="食藥">
        <FoodMedicine @update:enhanced-stats="onEnhancedStatsUpdate" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
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

.queue-icon {
  width: 24px;
  height: 24px;
}

.queue-remove {
  margin-left: auto;
}
</style>

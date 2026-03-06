<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRecipeStore } from '@/stores/recipe'
import { useGearsetsStore } from '@/stores/gearsets'
import { JOB_NAMES } from '@/utils/jobs'
import { useSimulatorStore } from '@/stores/simulator'
import { simulateAll, createInitialState, type CraftParams } from '@/engine/simulator'
import StatusBar from '@/components/simulator/StatusBar.vue'
import BuffDisplay from '@/components/simulator/BuffDisplay.vue'
import ActionList from '@/components/simulator/ActionList.vue'
import MacroExport from '@/components/simulator/MacroExport.vue'
import SolverPanel from '@/components/simulator/SolverPanel.vue'

const router = useRouter()
const recipeStore = useRecipeStore()
const gearsetsStore = useGearsetsStore()
const simStore = useSimulatorStore()

const recipe = computed(() => recipeStore.currentRecipe)
const gearset = computed(() => {
  if (!recipe.value) return null
  return gearsetsStore.getGearsetForJob(recipe.value.job)
})

const canSimulate = computed(() => !!recipe.value && !!gearset.value)

const craftParams = computed<CraftParams | null>(() => {
  if (!recipe.value || !gearset.value) return null
  return {
    craftsmanship: gearset.value.craftsmanship,
    control: gearset.value.control,
    cp: gearset.value.cp,
    recipeLevelTable: { ...recipe.value.recipeLevelTable },
    crafterLevel: gearset.value.level,
    initialQuality: 0,
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

function handleRemoveAction(index: number) {
  simStore.removeAction(index)
}

function handleClearActions() {
  simStore.clearActions()
}
</script>

<template>
  <div class="view-container">
    <h2>製作模擬</h2>

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

      <el-descriptions
        v-if="recipe && gearset"
        :column="2"
        border
        size="small"
        class="info-desc"
      >
        <el-descriptions-item label="配方">
          {{ recipe.name }} (Lv.{{ recipe.level }}<template v-if="recipe.stars > 0"> {{ '★'.repeat(recipe.stars) }}</template>)
        </el-descriptions-item>
        <el-descriptions-item label="職業 / 等級">
          {{ JOB_NAMES[gearset.job] ?? gearset.job }} Lv.{{ gearset.level }}
        </el-descriptions-item>
        <el-descriptions-item label="作業精度">{{ gearset.craftsmanship }}</el-descriptions-item>
        <el-descriptions-item label="加工精度">{{ gearset.control }}</el-descriptions-item>
        <el-descriptions-item label="CP">{{ gearset.cp }}</el-descriptions-item>
        <el-descriptions-item label="難度 / 品質 / 耐久">
          {{ recipe.recipeLevelTable.difficulty }} / {{ recipe.recipeLevelTable.quality }} / {{ recipe.recipeLevelTable.durability }}
        </el-descriptions-item>
      </el-descriptions>
    </div>

    <!-- Main Tabs -->
    <el-tabs type="border-card" class="main-tabs">
      <el-tab-pane label="模擬">
        <template v-if="canSimulate">
          <el-card shadow="never" class="sim-section">
            <template #header>
              <span>製作狀態</span>
            </template>
            <StatusBar :craft-state="currentState" />
            <el-divider style="margin: 8px 0" />
            <BuffDisplay :buffs="currentState?.buffs ?? new Map()" />
          </el-card>

          <el-card shadow="never" class="sim-section">
            <template #header>
              <span>技能序列</span>
            </template>
            <ActionList
              :actions="simStore.actions"
              :results="simStore.simulationResults"
              @remove="handleRemoveAction"
              @clear="handleClearActions"
            />
          </el-card>

          <SolverPanel />

          <el-collapse class="macro-collapse">
            <el-collapse-item title="遊戲巨集" name="macro">
              <MacroExport />
            </el-collapse-item>
          </el-collapse>
        </template>

        <el-empty v-else description="請先選擇配方與裝備組" />
      </el-tab-pane>

      <el-tab-pane label="初期品質">
        <div class="placeholder-tab">
          <el-text type="info" size="large">初期品質計算 (開發中)</el-text>
        </div>
      </el-tab-pane>

      <el-tab-pane label="食藥">
        <div class="placeholder-tab">
          <el-text type="info" size="large">食藥選擇 (開發中)</el-text>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.view-container {
  padding: 20px;
}

.info-section {
  margin-bottom: 16px;
}

.info-desc {
  margin-top: 12px;
}

.main-tabs {
  margin-top: 12px;
}

.sim-section {
  margin-bottom: 12px;
}

.macro-collapse {
  margin-top: 12px;
}

.placeholder-tab {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 60px 0;
}
</style>

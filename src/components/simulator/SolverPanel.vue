<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useRecipeStore } from '@/stores/recipe'
import { useGearsetsStore } from '@/stores/gearsets'
import { useSimulatorStore } from '@/stores/simulator'
import { solveCraft, cancelSolve, disposeWorker } from '@/solver/worker'
import type { SolverConfig, SolverResult, SolverStatus } from '@/solver/raphael'

const recipeStore = useRecipeStore()
const gearsetsStore = useGearsetsStore()
const simStore = useSimulatorStore()

const recipe = computed(() => recipeStore.currentRecipe)
const gearset = computed(() => gearsetsStore.activeGearset)
const canSolve = computed(() => !!recipe.value && !!gearset.value)

const status = ref<SolverStatus>('idle')
const progress = ref(0)
const solverResult = ref<SolverResult | null>(null)
const errorMessage = ref('')

const actionNameMap: Record<string, string> = {
  BasicSynthesis: '製作',
  CarefulSynthesis: '模範製作',
  RapidSynthesis: '高速製作',
  Groundwork: '坯料製作',
  IntensiveSynthesis: '集中製作',
  PrudentSynthesis: '儉約製作',
  MuscleMemory: '堅信',
  FocusedSynthesis: '注視製作',
  BasicTouch: '加工',
  StandardTouch: '中級加工',
  AdvancedTouch: '上級加工',
  PreciseTouch: '集中加工',
  PrudentTouch: '儉約加工',
  PreparatoryTouch: '坯料加工',
  HastyTouch: '倉促加工',
  FocusedTouch: '注視加工',
  TrainedFinesse: '工匠的神技',
  ByregotsBlessing: '比爾格的祝福',
  Reflect: '閒靜',
  TrainedEye: '工匠的神速技',
  Observe: '觀察',
  WasteNot: '儉約',
  WasteNotII: '長期儉約',
  Veneration: '崇敬',
  Innovation: '改革',
  GreatStrides: '闊步',
  MastersMend: '精修',
  Manipulation: '掌握',
  FinalAppraisal: '最終確認',
  TricksOfTheTrade: '秘訣',
  DelicateSynthesis: '精密製作',
}

function getActionLabel(action: string): string {
  return actionNameMap[action] ?? action
}

function buildConfig(): SolverConfig | null {
  if (!recipe.value || !gearset.value) return null
  const rlt = recipe.value.recipeLevelTable
  return {
    recipe_level: rlt.classJobLevel,
    stars: rlt.stars,
    progress: rlt.difficulty,
    quality: rlt.quality,
    durability: rlt.durability,
    cp: gearset.value.cp,
    craftsmanship: gearset.value.craftsmanship,
    control: gearset.value.control,
    crafter_level: gearset.value.level,
    progress_divider: rlt.progressDivider,
    quality_divider: rlt.qualityDivider,
    progress_modifier: rlt.progressModifier,
    quality_modifier: rlt.qualityModifier,
    hq_target: recipe.value.canHq,
  }
}

async function handleSolve() {
  const config = buildConfig()
  if (!config) return

  status.value = 'solving'
  progress.value = 0
  solverResult.value = null
  errorMessage.value = ''
  simStore.solverRunning = true

  try {
    const result = await solveCraft(config, (percent) => {
      progress.value = percent
    })
    solverResult.value = result
    status.value = 'done'
    ElMessage.success('求解完成')
  } catch (err) {
    if (err instanceof Error && err.message === '求解已取消') {
      status.value = 'cancelled'
    } else {
      status.value = 'error'
      errorMessage.value = err instanceof Error ? err.message : String(err)
      ElMessage.error('求解失敗: ' + errorMessage.value)
    }
  } finally {
    simStore.solverRunning = false
  }
}

function handleCancel() {
  cancelSolve()
  status.value = 'cancelled'
  simStore.solverRunning = false
  ElMessage.info('求解已取消')
}

function handleApply() {
  if (!solverResult.value) return
  simStore.setActions(solverResult.value.actions)
  ElMessage.success('已將求解結果套用至模擬器')
}

onUnmounted(() => {
  disposeWorker()
  simStore.solverRunning = false
})
</script>

<template>
  <div class="solver-panel">
    <!-- Config Summary -->
    <el-card v-if="canSolve" shadow="never" class="solver-section">
      <template #header>
        <span>求解參數</span>
      </template>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="配方">
          {{ recipe!.name }}
          (Lv.{{ recipe!.level }}<template v-if="recipe!.stars > 0"> {{ '\u2605'.repeat(recipe!.stars) }}</template>)
        </el-descriptions-item>
        <el-descriptions-item label="裝備組">
          {{ gearset!.name }} (Lv.{{ gearset!.level }})
        </el-descriptions-item>
        <el-descriptions-item label="作業精度">{{ gearset!.craftsmanship }}</el-descriptions-item>
        <el-descriptions-item label="加工精度">{{ gearset!.control }}</el-descriptions-item>
        <el-descriptions-item label="CP">{{ gearset!.cp }}</el-descriptions-item>
        <el-descriptions-item label="目標品質">
          {{ recipe!.canHq ? 'HQ' : '僅完成' }}
        </el-descriptions-item>
        <el-descriptions-item label="難度">{{ recipe!.recipeLevelTable.difficulty }}</el-descriptions-item>
        <el-descriptions-item label="最大品質">{{ recipe!.recipeLevelTable.quality }}</el-descriptions-item>
        <el-descriptions-item label="耐久">{{ recipe!.recipeLevelTable.durability }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- Actions -->
    <div class="solver-actions">
      <el-button
        v-if="status !== 'solving'"
        type="primary"
        size="large"
        :disabled="!canSolve"
        @click="handleSolve"
      >
        開始求解
      </el-button>
      <el-button
        v-if="status === 'solving'"
        type="danger"
        size="large"
        @click="handleCancel"
      >
        取消
      </el-button>
    </div>

    <!-- Progress -->
    <div v-if="status === 'solving'" class="solver-progress">
      <el-progress
        :percentage="progress"
        :indeterminate="progress === 0"
        :stroke-width="20"
        striped
        striped-flow
      />
      <el-text type="info" style="margin-top: 8px">正在求解中，請稍候...</el-text>
    </div>

    <!-- Error -->
    <el-alert
      v-if="status === 'error'"
      :title="'求解失敗'"
      :description="errorMessage"
      type="error"
      show-icon
      :closable="false"
      style="margin-top: 16px"
    />

    <!-- Cancelled -->
    <el-alert
      v-if="status === 'cancelled'"
      title="求解已取消"
      type="info"
      show-icon
      :closable="false"
      style="margin-top: 16px"
    />

    <!-- Result -->
    <el-card v-if="solverResult && status === 'done'" shadow="never" class="solver-section result-card">
      <template #header>
        <div class="result-header">
          <span>求解結果</span>
          <el-button type="success" @click="handleApply">套用至模擬器</el-button>
        </div>
      </template>

      <el-descriptions :column="3" border size="small" style="margin-bottom: 16px">
        <el-descriptions-item label="步數">{{ solverResult.steps }}</el-descriptions-item>
        <el-descriptions-item label="預估進展">{{ solverResult.progress }}</el-descriptions-item>
        <el-descriptions-item label="預估品質">{{ solverResult.quality }}</el-descriptions-item>
      </el-descriptions>

      <div class="action-sequence">
        <el-tag
          v-for="(action, index) in solverResult.actions"
          :key="index"
          size="default"
          class="action-tag"
        >
          {{ getActionLabel(action) }}
        </el-tag>
      </div>
    </el-card>

    <!-- No recipe/gearset -->
    <el-empty v-if="!canSolve" description="請先選擇配方與裝備組後再進行求解" />

    <el-alert
      type="info"
      :closable="false"
      show-icon
      style="margin-top: 16px"
    >
      <template #title>
        目前使用模擬求解器（基於啟發式規則），未來將整合 raphael-rs WASM 求解引擎以獲得最佳解。
      </template>
    </el-alert>
  </div>
</template>

<style scoped>
.solver-panel {
  padding: 8px 0;
}

.solver-section {
  margin-bottom: 16px;
}

.solver-actions {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.solver-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px;
}

.solver-progress .el-progress {
  width: 100%;
  max-width: 500px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.result-card {
  margin-top: 16px;
}

.action-sequence {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.action-tag {
  font-size: 13px;
}
</style>

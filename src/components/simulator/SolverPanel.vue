<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useRecipeStore } from '@/stores/recipe'
import { useGearsetsStore } from '@/stores/gearsets'
import { useSimulatorStore } from '@/stores/simulator'
import { solveCraft, cancelSolve, disposeWorker } from '@/solver/worker'
import type { SolverConfig, SolverStatus } from '@/solver/raphael'

const recipeStore = useRecipeStore()
const gearsetsStore = useGearsetsStore()
const simStore = useSimulatorStore()

const status = ref<SolverStatus>('idle')
const progress = ref(0)
const errorMessage = ref('')

function buildConfig(): SolverConfig | null {
  const recipe = recipeStore.currentRecipe
  if (!recipe) return null
  const gearset = gearsetsStore.getGearsetForJob(recipe.job)
  if (!gearset) return null
  const rlt = recipe.recipeLevelTable
  return {
    recipe_level: rlt.classJobLevel,
    stars: rlt.stars,
    progress: rlt.difficulty,
    quality: rlt.quality,
    durability: rlt.durability,
    cp: gearset.cp,
    craftsmanship: gearset.craftsmanship,
    control: gearset.control,
    crafter_level: gearset.level,
    progress_divider: rlt.progressDivider,
    quality_divider: rlt.qualityDivider,
    progress_modifier: rlt.progressModifier,
    quality_modifier: rlt.qualityModifier,
    hq_target: recipe.canHq,
  }
}

async function handleSolve() {
  const config = buildConfig()
  if (!config) return

  status.value = 'solving'
  progress.value = 0
  errorMessage.value = ''
  simStore.solverRunning = true

  try {
    const result = await solveCraft(config, (percent) => {
      progress.value = percent
    })
    simStore.setActions(result.actions)
    status.value = 'done'
    ElMessage.success('求解完成，已套用至模擬器')
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


onUnmounted(() => {
  disposeWorker()
  simStore.solverRunning = false
})
</script>

<template>
  <div class="solver-panel">
    <!-- Actions -->
    <div class="solver-actions">
      <el-button
        v-if="status !== 'solving'"
        type="warning"
        @click="handleSolve"
      >
        自動求解
      </el-button>
      <el-button
        v-if="status === 'solving'"
        type="danger"
        @click="handleCancel"
      >
        取消求解
      </el-button>
    </div>

    <!-- Progress -->
    <div v-if="status === 'solving'" class="solver-progress">
      <el-progress
        :percentage="progress"
        :indeterminate="progress === 0"
        :stroke-width="16"
        striped
        striped-flow
      />
      <el-text type="info" size="small" style="margin-top: 6px">正在求解中，請稍候...</el-text>
    </div>

    <!-- Error -->
    <el-alert
      v-if="status === 'error'"
      :title="'求解失敗'"
      :description="errorMessage"
      type="error"
      show-icon
      :closable="false"
      style="margin-top: 12px"
    />

    <!-- Cancelled -->
    <el-alert
      v-if="status === 'cancelled'"
      title="求解已取消"
      type="info"
      show-icon
      :closable="false"
      style="margin-top: 12px"
    />

  </div>
</template>

<style scoped>
.solver-actions {
  display: flex;
  gap: 8px;
}

.solver-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
}

.solver-progress .el-progress {
  width: 100%;
}
</style>

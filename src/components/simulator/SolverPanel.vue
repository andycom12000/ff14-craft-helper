<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useSimulatorStore } from '@/stores/simulator'
import { solveCraft, cancelSolve, disposeWorker, waitForWasm, getWasmStatus } from '@/solver/worker'
import type { CraftParams } from '@/engine/simulator'
import type { SolverConfig, SolverStatus } from '@/solver/raphael'

const props = defineProps<{
  craftParams: CraftParams | null
}>()

const emit = defineEmits<{
  'solve-complete': [result: { actions: string[] }]
}>()

const simStore = useSimulatorStore()

const status = ref<SolverStatus>('idle')
const progress = ref(0)
const errorMessage = ref('')
const wasmStatus = ref<'loading' | 'ready' | 'error'>('loading')
const wasmError = ref('')

// Skill availability toggles (matching bestcraft defaults)
const useTrainedEye = ref(true)
const useManipulation = ref(false)
const useHeartAndSoul = ref(false)
const useQuickInnovation = ref(false)

onMounted(async () => {
  const ws = getWasmStatus()
  wasmStatus.value = ws.status
  if (ws.status === 'ready') return
  if (ws.status === 'error') {
    wasmError.value = ws.error ?? 'WASM 初始化失敗'
    return
  }
  try {
    await waitForWasm()
    wasmStatus.value = 'ready'
  } catch (err) {
    wasmStatus.value = 'error'
    wasmError.value = err instanceof Error ? err.message : String(err)
  }
})

function buildConfig(): SolverConfig | null {
  const p = props.craftParams
  if (!p) return null
  const rlt = p.recipeLevelTable
  return {
    recipe_level: rlt.classJobLevel,
    stars: rlt.stars,
    progress: rlt.difficulty,
    quality: rlt.quality,
    durability: rlt.durability,
    cp: p.cp,
    craftsmanship: p.craftsmanship,
    control: p.control,
    crafter_level: p.crafterLevel,
    progress_divider: rlt.progressDivider,
    quality_divider: rlt.qualityDivider,
    progress_modifier: rlt.progressModifier,
    quality_modifier: rlt.qualityModifier,
    hq_target: rlt.quality > 0,
    initial_quality: p.initialQuality,
    use_manipulation: useManipulation.value,
    use_heart_and_soul: useHeartAndSoul.value,
    use_quick_innovation: useQuickInnovation.value,
    use_trained_eye: useTrainedEye.value,
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
    emit('solve-complete', { actions: result.actions })
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
    <!-- Skill toggles -->
    <div class="skill-toggles">
      <span class="toggle-label">可用技能：</span>
      <el-checkbox v-model="useTrainedEye">工匠的神速技巧</el-checkbox>
      <el-checkbox v-model="useManipulation">
        掌握
        <el-tag v-if="useManipulation" type="warning" size="small" style="margin-left: 4px">專家</el-tag>
      </el-checkbox>
      <el-checkbox v-model="useHeartAndSoul">
        心靈之手
        <el-tag v-if="useHeartAndSoul" type="warning" size="small" style="margin-left: 4px">專家</el-tag>
      </el-checkbox>
      <el-checkbox v-model="useQuickInnovation">
        快速改革
        <el-tag v-if="useQuickInnovation" type="warning" size="small" style="margin-left: 4px">專家</el-tag>
      </el-checkbox>
    </div>

    <!-- WASM Status -->
    <div v-if="wasmStatus === 'loading'" class="wasm-status">
      <el-tag type="info" size="small">WASM 求解器載入中...</el-tag>
    </div>
    <el-alert
      v-if="wasmStatus === 'error'"
      title="WASM 求解器載入失敗"
      :description="wasmError || '請確認瀏覽器支援 SharedArrayBuffer（需要 HTTPS 或 localhost）'"
      type="error"
      show-icon
      :closable="false"
      style="margin-bottom: 12px"
    />

    <!-- Actions -->
    <div class="solver-actions">
      <el-button
        v-if="status !== 'solving'"
        type="warning"
        :disabled="wasmStatus !== 'ready'"
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
.skill-toggles {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.toggle-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-right: 4px;
}

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

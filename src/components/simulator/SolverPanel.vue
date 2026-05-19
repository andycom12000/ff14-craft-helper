<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useSimulatorStore } from '@/stores/simulator'
import { useRecipeStore } from '@/stores/recipe'
import { useGearsetsStore } from '@/stores/gearsets'
import { solveCraft, cancelSolve, disposeWorker, waitForWasm, getWasmStatus } from '@/solver/worker'
import type { CraftParams } from '@/engine/simulator'
import type { SolverConfig, SolverStatus } from '@/solver/raphael'
import { getSkillName } from '@/engine/skills'
import { useMilestonesStore } from '@/stores/milestones'
import { canUseSpecialistAction } from '@/services/specialist-state'
import { computeRecipeTaxonomy } from '@/utils/recipe-taxonomy'

const props = defineProps<{
  craftParams: CraftParams | null
}>()

const emit = defineEmits<{
  'solve-complete': [result: { actions: string[] }]
}>()

const simStore = useSimulatorStore()
const milestones = useMilestonesStore()
const recipeStore = useRecipeStore()
const gearsetsStore = useGearsetsStore()

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
// "100% reliability" — raphael's adversarial flag. Default OFF (experimental,
// can balloon WASM heap past 4GB on hard recipes). Expert recipes force-off.
const useAdversarial = ref(false)

// TrainedEye requires crafter level >= recipe level + 10
const canUseTrainedEye = computed(() => {
  const p = props.craftParams
  if (!p) return false
  return p.crafterLevel >= p.recipeLevelTable.classJobLevel + 10
})

// Specialist gating — H&S and QI require the active gearset's `isSpecialist`
// flag. Watch the flag for transitions so we can force the refs to track
// (true → checked, false → unchecked) without preserving shadow state.
const currentGearset = computed(() => {
  const job = recipeStore.currentRecipe?.job
  if (!job) return null
  return gearsetsStore.getGearsetForJob(job)
})
const canUseHeartAndSoul = computed(() => canUseSpecialistAction(currentGearset.value, 'HeartAndSoul'))
const canUseQuickInnovation = computed(() => canUseSpecialistAction(currentGearset.value, 'QuickInnovation'))

watch(
  () => currentGearset.value?.isSpecialist === true,
  (isSpecialist) => {
    // On every transition: force-sync both refs to the specialist flag.
    // - false → checkboxes uncheck and stay disabled (no shadow state kept)
    // - true → checkboxes default to checked (matches Q2 spec)
    useHeartAndSoul.value = isSpecialist
    useQuickInnovation.value = isSpecialist
  },
  { immediate: true },
)

// Expert recipes hard-disable adversarial — matches raphael upstream contract.
const isExpertRecipe = computed(() => props.craftParams?.isExpert === true)

// Effective adversarial value: expert overrides user toggle.
const adversarialActive = computed(() => !isExpertRecipe.value && useAdversarial.value)

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
  const recipe = recipeStore.currentRecipe
  const tax = recipe ? computeRecipeTaxonomy(recipe) : undefined
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
    use_trained_eye: useTrainedEye.value && canUseTrainedEye.value,
    isExpert: isExpertRecipe.value,
    // Worker re-derives `isExpert ? false : adversarial`, but mirror the rule
    // here so logs/inspectors see the effective value.
    adversarial: adversarialActive.value,
    taxonomy: tax && {
      stars: tax.stars,
      is_expert: tax.is_expert,
      is_collectable: tax.is_collectable,
      craft_kind: tax.craft_kind,
    },
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
    milestones.markMilestoneOnce('ran_solver')
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
      <el-tooltip
        :content="canUseTrainedEye
          ? '工匠的神速技巧：一次將品質拉到滿，不消耗 CP；需工匠等級比配方等級高 10 等。'
          : '需要工匠等級比配方等級高 10 等以上才能使用'"
        placement="top"
      >
        <el-checkbox v-model="useTrainedEye" :disabled="!canUseTrainedEye">{{ getSkillName('TrainedEye') }}</el-checkbox>
      </el-tooltip>
      <el-tooltip
        content="掌握：8 步內每步自動回復 5 點耐久，是長手法的核心 buff。"
        placement="top"
      >
        <el-checkbox v-model="useManipulation">{{ getSkillName('Manipulation') }}</el-checkbox>
      </el-tooltip>
      <el-tooltip
        :content="canUseHeartAndSoul
          ? '心眼之手：需專家之證（specialist）才能使用。一次將普通狀態手動切到高品質，搶大波加工。'
          : '目前 gearset 未標記為專家之證（specialist），請到配裝頁面開啟。'"
        placement="top"
      >
        <!-- Span wrapper so el-tooltip's mouseenter still fires when the
             checkbox is disabled (Element Plus' disabled checkboxes swallow
             pointer events otherwise). -->
        <span class="specialist-toggle-wrap">
          <el-checkbox v-model="useHeartAndSoul" :disabled="!canUseHeartAndSoul">{{ getSkillName('HeartAndSoul') }}</el-checkbox>
        </span>
      </el-tooltip>
      <el-tooltip
        :content="canUseQuickInnovation
          ? '快速改革：需專家之證（specialist）才能使用。不耗 CP 觸發一次革新，求解器自動安排最佳時點。'
          : '目前 gearset 未標記為專家之證（specialist），請到配裝頁面開啟。'"
        placement="top"
      >
        <span class="specialist-toggle-wrap">
          <el-checkbox v-model="useQuickInnovation" :disabled="!canUseQuickInnovation">{{ getSkillName('QuickInnovation') }}</el-checkbox>
        </span>
      </el-tooltip>
      <el-tooltip
        :content="isExpertRecipe
          ? '專家配方不支援 100% 可靠性模式（與 raphael upstream 對齊）'
          : '100% 可靠性：求解器要求手法在最壞狀態序列下仍能達成雙滿，而不是只看平均期望。'"
        placement="top"
      >
        <!-- el-tooltip needs a non-disabled wrapper to fire on hover when the
             checkbox is disabled, so wrap in a span. -->
        <span class="adversarial-toggle-wrap">
          <el-checkbox v-model="useAdversarial" :disabled="isExpertRecipe">
            100% 可靠性
          </el-checkbox>
        </span>
      </el-tooltip>
    </div>
    <p v-if="adversarialActive" class="adversarial-warning">
      ⚠ 實驗性功能：可能讓 WASM solver 用掉 4GB 以上記憶體並 crash 瀏覽器
    </p>

    <!-- WASM error stays as full alert; "loading" rolls into the hub hint -->
    <el-alert
      v-if="wasmStatus === 'error'"
      title="WASM 求解器載入失敗"
      :description="wasmError || '請確認瀏覽器支援 SharedArrayBuffer（需要 HTTPS 或 localhost）'"
      type="error"
      show-icon
      :closable="false"
      style="margin-bottom: 12px"
    />

    <!-- Hero hub — the focal point of the wide tool column.
         Idle: oversized CTA + italic hint.
         Solving: progress bar takes the same space + cancel.
         A first-time user with no instruction lands here first. -->
    <div class="solver-hub" :data-state="status">
      <template v-if="status !== 'solving'">
        <el-button
          class="solver-cta"
          type="warning"
          :disabled="wasmStatus !== 'ready'"
          @click="handleSolve"
        >
          <span class="solver-cta-label">啟動求解</span>
          <span class="solver-cta-arrow" aria-hidden="true">→</span>
        </el-button>
        <p class="solver-hint">
          <template v-if="wasmStatus === 'ready'">推算最佳手法 · 通常 5–10 秒</template>
          <template v-else-if="wasmStatus === 'loading'">求解器載入中⋯ 馬上就好</template>
          <template v-else>求解器無法啟動，請查看錯誤訊息</template>
        </p>
      </template>

      <template v-else>
        <div class="solver-running">
          <el-progress
            :percentage="progress"
            :indeterminate="progress === 0"
            :stroke-width="12"
            striped
            striped-flow
          />
          <div class="solver-running-meta">
            <span class="solver-hint">正在算最佳手法⋯</span>
            <el-button class="solver-cancel" size="small" plain type="danger" @click="handleCancel">取消</el-button>
          </div>
        </div>
      </template>
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

/* Span wrapper so el-tooltip's mouseenter still fires when the checkbox
   itself is disabled (Element Plus' disabled checkboxes don't propagate
   pointer events to wrapping tooltip otherwise). */
.adversarial-toggle-wrap,
.specialist-toggle-wrap {
  display: inline-flex;
  align-items: center;
}

/* OOM warning helper. Only rendered when adversarial is actually active
   (v-if=adversarialActive), so it vanishes the moment the user unchecks
   or switches to an expert recipe. */
.adversarial-warning {
  margin: -8px 0 16px;
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--app-warning);
  background: var(--app-warning-tint);
  border-left: 3px solid var(--app-warning-border);
  border-radius: 4px;
}

/* On narrow phones, el-tooltip wrappers break flex-wrap with long checkbox
 * labels. Force the label to take a full line and each checkbox wrapper to
 * claim the full width so they stack vertically. */
@media (max-width: 640px) {
  .skill-toggles {
    gap: 8px;
    padding: 0;
    background: transparent;
    border-radius: 0;
    margin-bottom: 12px;
  }

  .toggle-label {
    flex-basis: 100%;
    margin-right: 0;
  }

  .skill-toggles > :deep(*:not(.toggle-label)) {
    flex-basis: 100%;
  }

  .solver-cta {
    width: 100%;
    justify-content: center;
  }
}

/* ============================================================
   Hero hub — the wide-column focal point.
   The CTA dominates the cockpit's tool column so a first-time
   user looking at the simulator with no instruction lands their
   eye on this button.
   ============================================================ */
.solver-hub {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0 4px;
}

/* Oversized warning-tone CTA. Element Plus' size="large" caps below what we
   want for a hero button, so we overrride min-height + padding directly. */
.solver-hub :deep(.solver-cta) {
  min-height: 56px;
  padding: 0 32px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.04em;
  border-radius: 12px;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--app-craft) 28%, transparent);
  transition:
    transform 0.18s var(--ease-out-quart),
    box-shadow 0.18s var(--ease-out-quart);
}
.solver-hub :deep(.solver-cta:not(.is-disabled):hover) {
  transform: translateY(-1px);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--app-craft) 34%, transparent);
}
.solver-hub :deep(.solver-cta.is-disabled) {
  box-shadow: none;
  opacity: 0.55;
}
.solver-cta-label { display: inline-block; }
.solver-cta-arrow {
  display: inline-block;
  margin-left: 10px;
  transition: transform 0.18s var(--ease-out-quart);
}
.solver-hub :deep(.solver-cta:not(.is-disabled):hover) .solver-cta-arrow {
  transform: translateX(3px);
}

.solver-hint {
  margin: 0;
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
  font-size: 15px;
  color: var(--el-text-color-secondary);
  letter-spacing: 0.01em;
}

.solver-running {
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.solver-running :deep(.el-progress) { width: 100%; }
.solver-running-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.solver-running-meta .solver-hint { margin: 0; }
</style>

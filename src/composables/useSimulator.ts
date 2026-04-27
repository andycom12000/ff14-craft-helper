import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
// AutoImport's ElementPlusResolver only injects CSS for symbols it auto-imports.
// Since we explicitly import ElMessage, the style side-effect import must be
// declared manually; otherwise the toast renders as position:static and pushes
// the document scrollHeight by ~64px (the toast's height) on every show.
import 'element-plus/es/components/message/style/css'
import { useRecipeStore, type Recipe } from '@/stores/recipe'
import { useGearsetsStore } from '@/stores/gearsets'
import { useBomStore } from '@/stores/bom'
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

/**
 * Shared script-setup logic for SimulatorView (desktop cockpit + mobile).
 * Owns the recipe/gearset wiring, craft params, WASM simulation watcher,
 * and all the queue/action/HQ/self-craft handlers the template binds.
 */
export function useSimulator() {
  const recipeStore = useRecipeStore()
  const gearsetsStore = useGearsetsStore()
  const bomStore = useBomStore()
  const simStore = useSimulatorStore()

  const recipe = computed(() => recipeStore.currentRecipe)
  const searchSidebarOpen = ref(false)
  const initialQuality = ref(0)
  const enhancedStats = ref<EnhancedStats | null>(null)
  /* HQ amounts hoisted here so apply-hq from recommendations can push values
     down into the InitialQuality component (which would otherwise own them
     internally and ignore external writes). */
  const initialQualityHqAmounts = ref<number[]>([])

  watch(() => recipe.value?.id ?? null, (id) => {
    initialQuality.value = 0
    initialQualityHqAmounts.value = []
    simStore.switchToRecipe(id)
  }, { immediate: true })

  const gearset = computed(() => {
    if (!recipe.value) return null
    return gearsetsStore.getGearsetForJob(recipe.value.job)
  })

  const canSimulate = computed(() => !!recipe.value && !!gearset.value)

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

  watch([craftParams, () => simStore.actions], runSimulation, { immediate: true })

  function handleAddFromSearch(r: Recipe) {
    recipeStore.addToQueue(r)
    recipeStore.setRecipe(r)
    ElMessage.success(`已將「${r.name}」加入模擬佇列`)
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

  const solverResult = computed(() => simStore.solverResult)

  function onSolveComplete(result: { actions: string[] }) {
    simStore.setSolverResult(result)
  }

  function handleApplyHq(hqAmounts: number[]) {
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
    // Push the HQ array down so the InitialQuality component's NQ/HQ buttons
    // visually reflect what was applied; otherwise its internal hqAmounts ref
    // stays at zero and the UI lies about the active selection.
    initialQualityHqAmounts.value = [...hqAmounts]
    simStore.setSolverResult(null)
    ElMessage.success(`已套用 HQ 組合，初期品質：${quality.toLocaleString()}`)
  }

  function onHqAmountsUpdate(value: number[]) {
    initialQualityHqAmounts.value = value
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

  return {
    // stores
    recipeStore,
    bomStore,
    simStore,
    // refs
    recipe,
    gearset,
    canSimulate,
    recipeJobAbbr,
    effectiveStats,
    craftParams,
    currentState,
    initialQuality,
    initialQualityHqAmounts,
    enhancedStats,
    searchSidebarOpen,
    solverResult,
    modeOptions,
    // handlers
    onInitialQualityUpdate,
    onEnhancedStatsUpdate,
    onHqAmountsUpdate,
    handleAddFromSearch,
    handleRemoveFromQueue,
    handleClearQueue,
    handleRemoveAction,
    handleClearActions,
    handleUseSkill,
    onSolveComplete,
    handleApplyHq,
    handleAddToBom,
    handleSelfCraft,
  }
}

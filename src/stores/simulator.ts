import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { StepResult, CraftCondition } from '@/engine/simulator'
import { getActionAppliedBuff, PRIMED_ELIGIBLE_BUFF_SET } from '@/engine/simulator'
import { applyConditionToAction } from '@/engine/expert-conditions'

interface RecipeSimState {
  actions: string[]
  simulationResults: StepResult[]
  solverResult: { actions: string[] } | null
}

export type SimulatorMode = 'solver' | 'manual'
export type ManualCondition = Extract<
  CraftCondition,
  | 'Normal'
  | 'Good'
  | 'Excellent'
  | 'Poor'
  | 'Centered'
  | 'Sturdy'
  | 'Pliant'
  | 'Malleable'
  | 'Primed'
  | 'GoodOmen'
>

interface ManualSnapshot {
  actions: string[]
  conditions: ManualCondition[]
  /**
   * `pendingBuffDurationBonus` and `forcedNextCondition` captured at the
   * time of the snapshot. Without these, undo would correctly roll back
   * the action list but leave the stateful expert chips in a stale state
   * (e.g. cleared lock UX would not reappear on undo of a GoodOmen step).
   */
  pendingBuffDurationBonus: number
  forcedNextCondition: ManualCondition | null
}

// Cap the undo/redo stack so long manual sessions don't grow unbounded.
const MANUAL_HISTORY_LIMIT = 200

export const useSimulatorStore = defineStore('simulator', () => {
  const actions = ref<string[]>([])
  const simulationResults = ref<StepResult[]>([])
  const solverRunning = ref(false)
  const solverResult = ref<{ actions: string[] } | null>(null)

  // --- Manual simulation mode ---
  const mode = ref<SimulatorMode>('solver')
  const conditions = ref<ManualCondition[]>([])
  const history = ref<ManualSnapshot[]>([])
  const future = ref<ManualSnapshot[]>([])
  const currentCondition = ref<ManualCondition>('Normal')

  // Stateful expert-condition tracking (Primed / GoodOmen).
  // The values here drive the picker lock UX and the WASM submission
  // conditions array. They are *only* relevant in manual mode; solver mode
  // does not touch them.
  const pendingBuffDurationBonus = ref(0)
  const forcedNextCondition = ref<ManualCondition | null>(null)

  // Per-recipe storage: saves/restores state when switching recipes
  const stateMap = new Map<number, RecipeSimState>()
  let activeRecipeId: number | null = null

  function saveCurrentState() {
    if (activeRecipeId != null) {
      stateMap.set(activeRecipeId, {
        actions: [...actions.value],
        simulationResults: [...simulationResults.value],
        solverResult: solverResult.value,
      })
    }
  }

  function switchToRecipe(recipeId: number | null) {
    if (recipeId === activeRecipeId) return
    saveCurrentState()
    activeRecipeId = recipeId
    // Always clear simulationResults – they will be recalculated by
    // runSimulation() with the current craftParams so we never show stale
    // results computed against a different recipe's parameters.
    simulationResults.value = []
    history.value = []
    future.value = []
    if (recipeId != null && stateMap.has(recipeId)) {
      const saved = stateMap.get(recipeId)!
      actions.value = [...saved.actions]
      solverResult.value = saved.solverResult
    } else {
      actions.value = []
      solverResult.value = null
    }
  }

  function removeRecipeState(recipeId: number) {
    stateMap.delete(recipeId)
    if (activeRecipeId === recipeId) {
      activeRecipeId = null
      actions.value = []
      simulationResults.value = []
      solverResult.value = null
      history.value = []
      future.value = []
    }
  }

  function setActions(newActions: string[]) {
    actions.value = newActions
  }

  function addAction(action: string) {
    actions.value = [...actions.value, action]
  }

  function removeAction(index: number) {
    actions.value = actions.value.filter((_, i) => i !== index)
  }

  function clearActions() {
    actions.value = []
  }

  function setSimulationResults(results: StepResult[]) {
    simulationResults.value = results
  }

  function setSolverResult(result: { actions: string[] } | null) {
    solverResult.value = result
  }

  // --- Manual mode actions ---

  function clearManualState() {
    actions.value = []
    conditions.value = []
    simulationResults.value = []
    history.value = []
    future.value = []
    pendingBuffDurationBonus.value = 0
    forcedNextCondition.value = null
    currentCondition.value = 'Normal'
  }

  function setMode(next: SimulatorMode) {
    if (mode.value === next) return
    mode.value = next
    clearManualState()
  }

  function snapshot(): ManualSnapshot {
    return {
      actions: [...actions.value],
      conditions: [...conditions.value],
      pendingBuffDurationBonus: pendingBuffDurationBonus.value,
      forcedNextCondition: forcedNextCondition.value,
    }
  }

  function restore(snap: ManualSnapshot) {
    actions.value = [...snap.actions]
    conditions.value = [...snap.conditions]
    pendingBuffDurationBonus.value = snap.pendingBuffDurationBonus
    forcedNextCondition.value = snap.forcedNextCondition
  }

  function pushToHistory(snap: ManualSnapshot) {
    history.value.push(snap)
    if (history.value.length > MANUAL_HISTORY_LIMIT) {
      history.value.splice(0, history.value.length - MANUAL_HISTORY_LIMIT)
    }
  }

  function pushAction(skillId: string) {
    pushToHistory(snapshot())
    future.value = []

    const effectiveCondition: ManualCondition =
      forcedNextCondition.value ?? currentCondition.value

    actions.value = [...actions.value, skillId]
    conditions.value = [...conditions.value, effectiveCondition]
    forcedNextCondition.value = null

    // Consume pending Primed bonus when this step applies an eligible buff.
    // The store doesn't model buff durations directly (WASM does); we only
    // clear the pending flag so the picker re-arms correctly on a fresh Primed.
    const appliedBuff = getActionAppliedBuff(skillId)
    if (
      pendingBuffDurationBonus.value > 0 &&
      appliedBuff !== null &&
      PRIMED_ELIGIBLE_BUFF_SET.has(appliedBuff)
    ) {
      pendingBuffDurationBonus.value = 0
    }

    // Plant new pending state from this step's outcome (Primed / GoodOmen).
    const outcome = applyConditionToAction(effectiveCondition)
    if (outcome.nextBuffDurationBonus > 0) {
      pendingBuffDurationBonus.value = outcome.nextBuffDurationBonus
    }
    if (outcome.forceNextCondition !== null) {
      forcedNextCondition.value = outcome.forceNextCondition as ManualCondition
    }
  }

  function undo() {
    const prev = history.value.pop()
    if (prev === undefined) return
    future.value.push(snapshot())
    restore(prev)
  }

  function redo() {
    const next = future.value.pop()
    if (next === undefined) return
    pushToHistory(snapshot())
    restore(next)
  }

  function resetManual() {
    clearManualState()
  }

  return {
    actions,
    conditions,
    simulationResults,
    solverRunning,
    solverResult,
    mode,
    history,
    future,
    currentCondition,
    pendingBuffDurationBonus,
    forcedNextCondition,
    switchToRecipe,
    removeRecipeState,
    setActions,
    addAction,
    removeAction,
    clearActions,
    setSimulationResults,
    setSolverResult,
    setMode,
    pushAction,
    undo,
    redo,
    resetManual,
  }
})

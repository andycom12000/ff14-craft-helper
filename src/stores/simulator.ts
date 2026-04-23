import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { StepResult, CraftCondition } from '@/engine/simulator'

interface RecipeSimState {
  actions: string[]
  simulationResults: StepResult[]
  solverResult: { actions: string[] } | null
}

export type SimulatorMode = 'solver' | 'manual'
export type ManualCondition = Extract<CraftCondition, 'Normal' | 'Good' | 'Excellent' | 'Poor'>

// History snapshot captures actions + per-step conditions together so undo/redo
// restores both in lockstep.
interface ManualSnapshot {
  actions: string[]
  conditions: string[]
}

export const useSimulatorStore = defineStore('simulator', () => {
  const actions = ref<string[]>([])
  const simulationResults = ref<StepResult[]>([])
  const solverRunning = ref(false)
  const solverResult = ref<{ actions: string[] } | null>(null)

  // --- Manual simulation mode ---
  const mode = ref<SimulatorMode>('solver')
  // Per-step conditions; index i applies to actions[i]. Only grows in manual mode.
  const conditions = ref<string[]>([])
  const history = ref<ManualSnapshot[]>([])
  const future = ref<ManualSnapshot[]>([])
  const currentCondition = ref<ManualCondition>('Normal')

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
    actions.value.push(action)
  }

  function removeAction(index: number) {
    actions.value.splice(index, 1)
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

  function setMode(next: SimulatorMode) {
    if (mode.value === next) return
    mode.value = next
    // Switching modes resets the working actions + undo stacks so the user
    // starts fresh. The live simulate watcher will re-run automatically when
    // actions change.
    actions.value = []
    conditions.value = []
    simulationResults.value = []
    history.value = []
    future.value = []
  }

  function snapshot(): ManualSnapshot {
    return { actions: [...actions.value], conditions: [...conditions.value] }
  }

  function restore(snap: ManualSnapshot) {
    actions.value = [...snap.actions]
    conditions.value = [...snap.conditions]
  }

  function pushAction(skillId: string) {
    // Save prior snapshot to history; clear redo stack (new branch).
    history.value.push(snapshot())
    future.value = []
    actions.value.push(skillId)
    conditions.value.push(currentCondition.value)
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
    history.value.push(snapshot())
    restore(next)
  }

  function resetManual() {
    history.value = []
    future.value = []
    actions.value = []
    conditions.value = []
    simulationResults.value = []
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

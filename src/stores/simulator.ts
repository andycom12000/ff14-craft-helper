import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { StepResult } from '@/engine/simulator'

interface RecipeSimState {
  actions: string[]
  simulationResults: StepResult[]
  solverResult: { actions: string[] } | null
}

export const useSimulatorStore = defineStore('simulator', () => {
  const actions = ref<string[]>([])
  const simulationResults = ref<StepResult[]>([])
  const solverRunning = ref(false)
  const solverResult = ref<{ actions: string[] } | null>(null)

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

  return {
    actions,
    simulationResults,
    solverRunning,
    solverResult,
    switchToRecipe,
    removeRecipeState,
    setActions,
    addAction,
    removeAction,
    clearActions,
    setSimulationResults,
    setSolverResult,
  }
})

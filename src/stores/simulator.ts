import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CraftState, StepResult } from '@/engine/simulator'

export const useSimulatorStore = defineStore('simulator', () => {
  const actions = ref<string[]>([])
  const craftState = ref<CraftState | null>(null)
  const simulationResults = ref<StepResult[]>([])
  const solverRunning = ref(false)

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
    if (results.length > 0) {
      craftState.value = results[results.length - 1].state
    }
  }

  return {
    actions,
    craftState,
    simulationResults,
    solverRunning,
    setActions,
    addAction,
    removeAction,
    clearActions,
    setSimulationResults,
  }
})

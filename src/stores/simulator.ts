import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { StepResult } from '@/engine/simulator'

export const useSimulatorStore = defineStore('simulator', () => {
  const actions = ref<string[]>([])
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
  }

  return {
    actions,
    simulationResults,
    solverRunning,
    setActions,
    addAction,
    removeAction,
    clearActions,
    setSimulationResults,
  }
})

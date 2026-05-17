import { watch, type Ref } from 'vue'
import { trackEvent } from '@/utils/analytics'
import { consumeRecentFailure } from '@/composables/useSolverFailState'

const FAIL_WINDOW_MS = 60_000

type Field =
  | 'crafter_level'
  | 'craftsmanship'
  | 'control'
  | 'cp'
  | 'recipe'

export interface SolverInputs {
  crafterLevel: Ref<number | undefined>
  craftsmanship: Ref<number | undefined>
  control: Ref<number | undefined>
  cp: Ref<number | undefined>
  recipeId: Ref<number | null | undefined>
}

export function useSolverInputAudit(inputs: SolverInputs): void {
  function tryEmit(field: Field): void {
    if (!consumeRecentFailure(FAIL_WINDOW_MS)) return
    trackEvent('solver_input_change_after_fail', { field })
  }

  watch(inputs.crafterLevel, () => tryEmit('crafter_level'))
  watch(inputs.craftsmanship, () => tryEmit('craftsmanship'))
  watch(inputs.control, () => tryEmit('control'))
  watch(inputs.cp, () => tryEmit('cp'))
  watch(inputs.recipeId, () => tryEmit('recipe'))
}

import { trackEvent } from '@/utils/analytics'

type MisuseType = 'single_recipe_in_batch' | 'large_queue_in_simulator' | 'bom_without_quantity'

// Session-scoped dedupe (module-level Set; cleared on page reload).
const fired = new Set<MisuseType>()

function emit(type: MisuseType, payload: Record<string, unknown>): void {
  if (fired.has(type)) return
  fired.add(type)
  trackEvent('page_misuse_hint', { type, ...payload })
}

export function emitSingleRecipeInBatch(p: { target_count: number; total_quantity: number }): void {
  if (p.target_count === 1 && p.total_quantity <= 3) {
    emit('single_recipe_in_batch', p)
  }
}

export function emitLargeQueueInSimulator(queue_length: number): void {
  if (queue_length >= 5) emit('large_queue_in_simulator', { queue_length })
}

export function emitBomWithoutQuantity(p: { targets: Array<{ quantity: number }> }): void {
  if (p.targets.length === 1 && p.targets[0].quantity === 1) {
    emit('bom_without_quantity', { target_count: 1 })
  }
}

// Test-only escape hatch — DO NOT call from production code.
export function resetMisuseDedupeForTests(): void {
  fired.clear()
}

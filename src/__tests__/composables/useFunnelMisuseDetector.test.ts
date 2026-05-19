import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/analytics', () => ({ trackEvent: vi.fn() }))
import { trackEvent } from '@/utils/analytics'
import {
  emitSingleRecipeInBatch,
  emitLargeQueueInSimulator,
  emitBomWithoutQuantity,
  resetMisuseDedupeForTests,
} from '@/composables/useFunnelMisuseDetector'

describe('useFunnelMisuseDetector', () => {
  beforeEach(() => {
    resetMisuseDedupeForTests()
    vi.mocked(trackEvent).mockClear()
  })

  describe('single_recipe_in_batch', () => {
    it('emits when target_count===1 and total_quantity <= 3', () => {
      emitSingleRecipeInBatch({ target_count: 1, total_quantity: 3 })
      expect(trackEvent).toHaveBeenCalledWith('page_misuse_hint', {
        type: 'single_recipe_in_batch', target_count: 1, total_quantity: 3,
      })
    })
    it('does NOT emit when target_count > 1', () => {
      emitSingleRecipeInBatch({ target_count: 2, total_quantity: 2 })
      expect(trackEvent).not.toHaveBeenCalled()
    })
    it('does NOT emit when total_quantity > 3', () => {
      emitSingleRecipeInBatch({ target_count: 1, total_quantity: 4 })
      expect(trackEvent).not.toHaveBeenCalled()
    })
    it('dedupes per session', () => {
      emitSingleRecipeInBatch({ target_count: 1, total_quantity: 1 })
      emitSingleRecipeInBatch({ target_count: 1, total_quantity: 2 })
      expect(trackEvent).toHaveBeenCalledTimes(1)
    })
  })

  describe('large_queue_in_simulator', () => {
    it('emits when queue length transitions to >= 5', () => {
      emitLargeQueueInSimulator(5)
      expect(trackEvent).toHaveBeenCalledWith('page_misuse_hint', {
        type: 'large_queue_in_simulator', queue_length: 5,
      })
    })
    it('does NOT emit when queue length < 5', () => {
      emitLargeQueueInSimulator(4)
      expect(trackEvent).not.toHaveBeenCalled()
    })
    it('dedupes per session', () => {
      emitLargeQueueInSimulator(5)
      emitLargeQueueInSimulator(7)
      expect(trackEvent).toHaveBeenCalledTimes(1)
    })
  })

  describe('bom_without_quantity', () => {
    it('emits when single target with qty 1', () => {
      emitBomWithoutQuantity({ targets: [{ quantity: 1 }] })
      expect(trackEvent).toHaveBeenCalledWith('page_misuse_hint', {
        type: 'bom_without_quantity', target_count: 1,
      })
    })
    it('does NOT emit when qty > 1', () => {
      emitBomWithoutQuantity({ targets: [{ quantity: 5 }] })
      expect(trackEvent).not.toHaveBeenCalled()
    })
    it('does NOT emit when multiple targets', () => {
      emitBomWithoutQuantity({ targets: [{ quantity: 1 }, { quantity: 1 }] })
      expect(trackEvent).not.toHaveBeenCalled()
    })
  })
})

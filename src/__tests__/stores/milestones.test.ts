import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/analytics', () => ({
  trackEvent: vi.fn(),
}))

import { trackEvent } from '@/utils/analytics'
import { useMilestonesStore, type OnboardingMilestone } from '@/stores/milestones'

const STORAGE_KEY = 'ff14ch.onboarding-milestones'

describe('useMilestonesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.mocked(trackEvent).mockClear()
  })

  it('hasMilestone returns false on fresh state', () => {
    const store = useMilestonesStore()
    expect(store.hasMilestone('viewed_recipe')).toBe(false)
  })

  it('markMilestoneOnce sends trackEvent + persists', () => {
    const store = useMilestonesStore()
    store.markMilestoneOnce('viewed_recipe')

    expect(trackEvent).toHaveBeenCalledOnce()
    expect(trackEvent).toHaveBeenCalledWith('first_session_milestone', { step: 'viewed_recipe' })
    expect(store.hasMilestone('viewed_recipe')).toBe(true)

    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as string[]
    expect(parsed).toContain('viewed_recipe')
  })

  it('markMilestoneOnce is idempotent — second call is a no-op', () => {
    const store = useMilestonesStore()
    store.markMilestoneOnce('ran_solver')
    store.markMilestoneOnce('ran_solver')

    expect(trackEvent).toHaveBeenCalledOnce()
  })

  it('restores prior milestones from localStorage on init', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['used_batch']))

    const store = useMilestonesStore()
    expect(store.hasMilestone('used_batch')).toBe(true)
    expect(store.hasMilestone('viewed_recipe')).toBe(false)
  })

  it('does not throw if localStorage write fails', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    const store = useMilestonesStore()
    expect(() => store.markMilestoneOnce('saw_macro')).not.toThrow()
    expect(trackEvent).toHaveBeenCalledWith('first_session_milestone', { step: 'saw_macro' })

    setItemSpy.mockRestore()
  })

  it('does not throw if existing localStorage payload is corrupted', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')
    expect(() => useMilestonesStore()).not.toThrow()
  })

  it('ignores unknown values in persisted payload', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['used_batch', 'bogus_step']))

    const store = useMilestonesStore()
    expect(store.hasMilestone('used_batch')).toBe(true)
  })

  it('all four milestone steps are independent', () => {
    const store = useMilestonesStore()
    const steps: OnboardingMilestone[] = ['viewed_recipe', 'ran_solver', 'saw_macro', 'used_batch']
    for (const step of steps) {
      expect(store.hasMilestone(step)).toBe(false)
      store.markMilestoneOnce(step)
      expect(store.hasMilestone(step)).toBe(true)
    }
    expect(trackEvent).toHaveBeenCalledTimes(4)
  })
})

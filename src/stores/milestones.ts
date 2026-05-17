import { defineStore } from 'pinia'
import { ref } from 'vue'
import { trackEvent } from '@/utils/analytics'

export type OnboardingMilestone =
  | 'viewed_recipe'
  | 'ran_solver'
  | 'saw_macro'
  | 'used_batch'

const ALL_STEPS: readonly OnboardingMilestone[] =
  ['viewed_recipe', 'ran_solver', 'saw_macro', 'used_batch']

const STORAGE_KEY = 'ff14ch.onboarding-milestones'

function readInitial(): Set<OnboardingMilestone> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((s): s is OnboardingMilestone =>
        ALL_STEPS.includes(s as OnboardingMilestone),
      ))
    }
  } catch {
    // Corrupted JSON / blocked localStorage — fall through.
  }
  return new Set()
}

function persist(state: Set<OnboardingMilestone>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...state]))
  } catch {
    // Quota exceeded / private mode — non-critical; event already fired.
  }
}

export const useMilestonesStore = defineStore('milestones', () => {
  const reached = ref<Set<OnboardingMilestone>>(readInitial())

  function hasMilestone(step: OnboardingMilestone): boolean {
    return reached.value.has(step)
  }

  function markMilestoneOnce(step: OnboardingMilestone): void {
    if (reached.value.has(step)) return
    reached.value = new Set(reached.value).add(step)
    persist(reached.value)
    trackEvent('first_session_milestone', { step })
  }

  return { hasMilestone, markMilestoneOnce }
})

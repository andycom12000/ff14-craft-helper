import type { CostDecision } from '@/services/bom-calculator'
import { SELF_CRAFT_SAVINGS_THRESHOLD } from '@/services/bom-calculator'

export function filterCandidatesByThreshold(decisions: CostDecision[]): CostDecision[] {
  return decisions.filter(
    d => d.recommendation === 'craft' && d.savingsRatio >= SELF_CRAFT_SAVINGS_THRESHOLD,
  )
}

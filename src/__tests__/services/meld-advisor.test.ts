import { describe, it, expect } from 'vitest'
import type { MeldAdvice, MeldPlan, MeldStep } from '@/services/meld-advisor'
import { adviseMeld } from '@/services/meld-advisor'
import { BIS_REFERENCE } from '@/engine/materia'

describe('adviseMeld (stub)', () => {
  it('returns a MeldAdvice with both plans present', async () => {
    const advice: MeldAdvice = await adviseMeld(
      [],                       // empty targets — exercises the empty path
      { level: 100, craftsmanship: 4000, control: 4000, cp: 600, isSpecialist: false },
      new Map(),
      { bisReference: BIS_REFERENCE },
    )
    expect(advice.costOptimal).toBeDefined()
    expect(advice.bis).toBeDefined()
    expect(typeof advice.alreadyMeetsThreshold).toBe('boolean')
  })
})

// Trivial type-level checks (compile-time only; no runtime asserts needed).
const _stepShape: MeldStep = {
  stat: 'craftsmanship', grade: 12, placedCount: 1, expectedCount: 1,
  unitPrice: null, subtotal: null,
}
const _planShape: MeldPlan = {
  feasible: true, deltaStats: { craftsmanship: 0, control: 0, cp: 0 },
  steps: [_stepShape], totalGil: null, confirmedBySolver: false,
}
void _stepShape; void _planShape

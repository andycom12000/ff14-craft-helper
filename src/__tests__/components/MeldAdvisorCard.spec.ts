import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MeldAdvisorCard from '@/components/MeldAdvisorCard.vue'
import type { MeldAdvice } from '@/services/meld-advisor'

const fullAdvice: MeldAdvice = {
  alreadyMeetsThreshold: false,
  costOptimal: {
    feasible: true,
    deltaStats: { craftsmanship: 60, control: 0, cp: 0 },
    steps: [{ stat: 'craftsmanship', grade: 12, placedCount: 2, expectedCount: 2, unitPrice: 8000, subtotal: 16000 }],
    totalGil: 16000, confirmedBySolver: true,
  },
  bis: {
    feasible: true,
    deltaStats: { craftsmanship: 400, control: 400, cp: 50 },
    steps: [],
    totalGil: 2_400_000, confirmedBySolver: false,
  },
  gapGil: 2_384_000,
}

describe('MeldAdvisorCard', () => {
  it('renders the gap as the headline', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice } })
    expect(w.text()).toContain('2,384,000')
  })

  it('renders the empty state when advice is null', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: null } })
    // Match any reasonable empty-hint wording — match the actual wording you use.
    expect(w.text()).toMatch(/按 solve|尚未/)
  })

  it('renders a spinner when loading', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: 'loading' } })
    expect(w.find('[data-test=spinner]').exists()).toBe(true)
  })

  it('greys the card when stale', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: 'stale' } })
    expect(w.classes()).toContain('is-stale')
  })

  it('shows "需換底裝" when infeasible', () => {
    const infeasible: MeldAdvice = {
      ...fullAdvice,
      costOptimal: { ...fullAdvice.costOptimal, feasible: false, reason: '槽位不足,需換底裝' },
    }
    const w = mount(MeldAdvisorCard, { props: { advice: infeasible } })
    expect(w.text()).toContain('槽位不足')
  })

  it('shows the already-met state', () => {
    const met: MeldAdvice = { ...fullAdvice, alreadyMeetsThreshold: true }
    const w = mount(MeldAdvisorCard, { props: { advice: met } })
    expect(w.text()).toMatch(/已能保證 HQ|無需鑲嵌/)
  })
})

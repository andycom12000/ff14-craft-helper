import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MeldPlanTable from '@/components/MeldPlanTable.vue'
import type { MeldStep } from '@/services/meld-advisor'

// #160 — structured per-materia breakdown table for a meld plan. One row per
// materia type (stat+grade merged across overmeld depths), totals row at the
// bottom. Pure presentation: all numbers derive from the steps it is given.

const guaranteedOnly: MeldStep[] = [
  { stat: 'craftsmanship', grade: 12, placedCount: 2, expectedCount: 2, unitPrice: 8000, subtotal: 16000 },
]

const deepPlan: MeldStep[] = [
  // same materia split across depths (cost math keeps the split) — must merge
  { stat: 'control', grade: 12, placedCount: 18, expectedCount: 18, unitPrice: 1000, subtotal: 18000 },
  { stat: 'control', grade: 12, placedCount: 12, expectedCount: 12 / 0.17, unitPrice: 1000, subtotal: 70588 },
  { stat: 'cp', grade: 12, placedCount: 2, expectedCount: 2, unitPrice: 5000, subtotal: 10000 },
]

describe('MeldPlanTable', () => {
  it('renders one row per materia type, merging multi-depth steps of the same materia', () => {
    const w = mount(MeldPlanTable, { props: { steps: deepPlan, totalGil: 98588 } })
    const rows = w.findAll('[data-test=meld-plan-row]')
    expect(rows).toHaveLength(2) // control Ⅻ (merged) + cp Ⅻ
    expect(rows[0].text()).toContain('加工魔晶石Ⅻ')
    expect(rows[1].text()).toContain('CP魔晶石Ⅻ')
    expect(w.text()).not.toContain('control')
  })

  it('a row shows the stat increment, occupied slots, and purchase count incl. overmeld waste', () => {
    const w = mount(MeldPlanTable, { props: { steps: deepPlan, totalGil: 98588 } })
    const row = w.findAll('[data-test=meld-plan-row]')[0]
    // 30 slots × 54 (control Ⅻ) = +1620; purchase = ceil(18 + 12/0.17) = 89
    expect(row.text()).toContain('+1,620')
    expect(row.text()).toContain('30')
    expect(row.text()).toContain('89')
  })

  it('renders a totals row with summed slots, summed purchase count, and the plan gil', () => {
    const w = mount(MeldPlanTable, { props: { steps: deepPlan, totalGil: 98588 } })
    const totals = w.find('[data-test=meld-plan-totals]')
    expect(totals.exists()).toBe(true)
    expect(totals.text()).toContain('32') // 30 + 2 slots
    expect(totals.text()).toContain('91') // 89 + 2 materia
    expect(totals.text()).toContain('98,588')
  })

  it('shows an em dash for cost when prices are missing (totalGil null)', () => {
    const noPrice: MeldStep[] = [
      { stat: 'craftsmanship', grade: 12, placedCount: 2, expectedCount: 2, unitPrice: null, subtotal: null },
    ]
    const w = mount(MeldPlanTable, { props: { steps: noPrice, totalGil: null } })
    expect(w.find('[data-test=meld-plan-totals]').text()).toContain('—')
    expect(w.findAll('[data-test=meld-plan-row]')[0].text()).toContain('—')
  })

  it('footnotes the overmeld waste only when purchase count exceeds placed count', () => {
    const deep = mount(MeldPlanTable, { props: { steps: deepPlan, totalGil: 98588 } })
    expect(deep.find('[data-test=overmeld-footnote]').exists()).toBe(true)
    expect(deep.text()).toContain('禁斷')

    const flat = mount(MeldPlanTable, { props: { steps: guaranteedOnly, totalGil: 16000 } })
    expect(flat.find('[data-test=overmeld-footnote]').exists()).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MeldAdvisorCard from '@/components/MeldAdvisorCard.vue'
import type { MeldAdvice } from '@/services/meld-advisor'

const fullAdvice: MeldAdvice = {
  alreadyMeetsThreshold: false,
  hqSufficient: false,
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
  // Shared state tests are mode-agnostic; use cost mode where the assertion is
  // about the cost framing, ability mode for the new ability framing.

  it('cost mode renders the gap as the headline', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice, mode: 'cost', showApply: false } })
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

  it('shows a market-server hint (not the "not solved" empty state) when no market is set', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: 'no-market' } })
    expect(w.text()).toContain('尚未選擇市場伺服器')
    // must NOT misleadingly claim the user hasn't solved yet
    expect(w.text()).not.toContain('尚未求解')
    // and offers a way straight to settings
    const link = w.find('a.no-market-link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('#/settings')
  })

  it('cost mode shows "需換底裝" when infeasible', () => {
    const infeasible: MeldAdvice = {
      ...fullAdvice,
      costOptimal: { ...fullAdvice.costOptimal, feasible: false, reason: '槽位不足,需換底裝' },
    }
    const w = mount(MeldAdvisorCard, { props: { advice: infeasible, mode: 'cost', showApply: false } })
    expect(w.text()).toContain('槽位不足')
  })

  it('cost mode shows the already-met state', () => {
    const met: MeldAdvice = { ...fullAdvice, alreadyMeetsThreshold: true }
    const w = mount(MeldAdvisorCard, { props: { advice: met, mode: 'cost', showApply: false } })
    expect(w.text()).toMatch(/已能保證 HQ|無需鑲嵌/)
  })

  it('cost mode renders the meld step with a localized stat name (not the raw English key)', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice, mode: 'cost', showApply: false } })
    expect(w.text()).toContain('作業') // craftsmanship → 作業
    expect(w.text()).not.toContain('craftsmanship')
    expect(w.text()).toContain('魔晶石')
  })

  // --- Slice A (#118): de-shell + mode/showApply ---

  it('is de-shelled — renders no self-contained header/title (host section owns it)', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice } })
    expect(w.find('.mac-header').exists()).toBe(false)
  })

  it('cost mode (showApply=false): renders no 套用 CTA', () => {
    const w = mount(MeldAdvisorCard, {
      props: { advice: fullAdvice, mode: 'cost', showApply: false },
    })
    expect(w.findAll('button').some(b => /套用/.test(b.text()))).toBe(false)
  })

  it('cost mode: never emits apply even if applyToGearset is reached', async () => {
    const w = mount(MeldAdvisorCard, {
      props: { advice: fullAdvice, mode: 'cost', showApply: false },
    })
    // No CTA button exists to click; assert the contract directly: nothing emitted.
    expect(w.emitted('apply')).toBeUndefined()
    // And via the component's own apply path (vm) — the guard must hold.
    ;(w.vm as unknown as { applyToGearset?: () => void }).applyToGearset?.()
    expect(w.emitted('apply')).toBeUndefined()
  })

  // --- Slice B2 (#120): ability-mode rewrite ---

  it('ability mode: renders the materia 顆數 sentence, not the cost/BiS framing', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice, mode: 'ability' } })
    const text = w.text()
    // ability sentence: 補 {count} 顆 {作業魔晶石Ⅻ} 即可保證 HQ
    expect(text).toContain('即可保證 HQ')
    expect(text).toContain('顆')
    expect(text).toContain('作業魔晶石Ⅻ') // craftsmanship → 作業, grade 12 → Ⅻ
    expect(text).not.toContain('craftsmanship')
    // small cost line, not "你能省"/gap framing
    expect(text).toContain('所需鑲嵌費用 約')
    expect(text).not.toContain('你能省')
    expect(text).not.toContain('全 BiS')
    expect(text).not.toContain('往全 BiS')
    // never shows the gap number or the raw stat delta
    expect(text).not.toContain('2,384,000')
    expect(text).not.toContain('60')
  })

  it('ability mode: shows the 套用鑲嵌（模擬）button, not 複製清單', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice, mode: 'ability' } })
    expect(w.findAll('button').some(b => b.text().includes('套用鑲嵌'))).toBe(true)
    expect(w.findAll('button').some(b => b.text().includes('複製清單'))).toBe(false)
  })

  it('ability mode: 套用鑲嵌（模擬）emits apply with deltaStats', async () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice, mode: 'ability' } })
    const applyBtn = w.findAll('button').find(b => b.text().includes('套用鑲嵌'))
    expect(applyBtn).toBeTruthy()
    await applyBtn!.trigger('click')
    expect(w.emitted('apply')?.[0]).toEqual([fullAdvice.costOptimal.deltaStats])
  })

  it('ability mode: joins multiple materia types with 、', () => {
    const multi: MeldAdvice = {
      ...fullAdvice,
      costOptimal: {
        ...fullAdvice.costOptimal,
        steps: [
          { stat: 'control', grade: 12, placedCount: 8, expectedCount: 8, unitPrice: 8000, subtotal: 64000 },
          { stat: 'cp', grade: 12, placedCount: 2, expectedCount: 2, unitPrice: 8000, subtotal: 16000 },
        ],
      },
    }
    const w = mount(MeldAdvisorCard, { props: { advice: multi, mode: 'ability' } })
    const text = w.text()
    expect(text).toContain('加工魔晶石Ⅻ')
    expect(text).toContain('CP魔晶石Ⅻ')
    expect(text).toContain('、')
  })

  it('ability mode: hqSufficient hides the meld steps and shows the success state', () => {
    const sufficient: MeldAdvice = { ...fullAdvice, hqSufficient: true }
    const w = mount(MeldAdvisorCard, { props: { advice: sufficient, mode: 'ability' } })
    expect(w.text()).toContain('無需鑲嵌')
    // the hero meld sentence + cost line are hidden (the success state replaces them)
    expect(w.find('.ability-sentence').exists()).toBe(false)
    expect(w.find('.ability-cost').exists()).toBe(false)
    expect(w.findAll('button').some(b => b.text().includes('套用鑲嵌'))).toBe(false)
  })

  it('ability mode: infeasible plan surfaces the reason and no CTA', () => {
    const infeasible: MeldAdvice = {
      ...fullAdvice,
      costOptimal: { ...fullAdvice.costOptimal, feasible: false, reason: '槽位不足,需換底裝', steps: [] },
    }
    const w = mount(MeldAdvisorCard, { props: { advice: infeasible, mode: 'ability' } })
    expect(w.text()).toContain('槽位不足')
    expect(w.findAll('button').some(b => b.text().includes('套用鑲嵌'))).toBe(false)
  })

  // --- Slice C (#121): 存成配裝 reverse-gate ---

  it('ability mode: no 存成配裝 gate when overrideActive is false', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice, mode: 'ability', overrideActive: false } })
    expect(w.findAll('button').some(b => b.text().includes('存成配裝'))).toBe(false)
  })

  it('ability mode: overrideActive reveals the inline 存成配裝 gate', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice, mode: 'ability', overrideActive: true } })
    expect(w.findAll('button').some(b => b.text().includes('存成配裝'))).toBe(true)
  })

  it('ability mode: 只存此職業 / 套用到全部職業 emit save-to-gearset with the right scope', async () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice, mode: 'ability', overrideActive: true } })
    // open the inline gate
    await w.findAll('button').find(b => b.text().includes('存成配裝'))!.trigger('click')

    const thisBtn = w.findAll('button').find(b => b.text().includes('只存此職業'))
    const allBtn = w.findAll('button').find(b => b.text().includes('套用到全部職業'))
    expect(thisBtn).toBeTruthy()
    expect(allBtn).toBeTruthy()

    await thisBtn!.trigger('click')
    expect(w.emitted('save-to-gearset')?.[0]).toEqual(['this'])

    // re-open and pick 全部職業
    await w.findAll('button').find(b => b.text().includes('存成配裝'))!.trigger('click')
    await w.findAll('button').find(b => b.text().includes('套用到全部職業'))!.trigger('click')
    expect(w.emitted('save-to-gearset')?.[1]).toEqual(['all'])
  })

  it('cost mode never shows the 存成配裝 gate (even with overrideActive)', () => {
    const w = mount(MeldAdvisorCard, {
      props: { advice: fullAdvice, mode: 'cost', showApply: false, overrideActive: true },
    })
    expect(w.findAll('button').some(b => b.text().includes('存成配裝'))).toBe(false)
  })
})

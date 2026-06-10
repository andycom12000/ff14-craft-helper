import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MeldAdvisorCard from '@/components/MeldAdvisorCard.vue'
import type { MeldAdvice } from '@/services/meld-advisor'

const fullAdvice: MeldAdvice = {
  status: 'feasible',
  alreadyMeetsThreshold: false,
  hqSufficient: false,
  rankedByCount: false,
  noHqLever: false,
  costOptimal: {
    feasible: true,
    deltaStats: { craftsmanship: 60, control: 0, cp: 0 },
    steps: [{ stat: 'craftsmanship', grade: 12, placedCount: 2, expectedCount: 2, unitPrice: 8000, subtotal: 16000 }],
    totalGil: 16000, confirmedBySolver: true,
  },
}

describe('MeldAdvisorCard', () => {
  // Shared state tests are mode-agnostic; use cost mode where the assertion is
  // about the cost framing, ability mode for the new ability framing.

  it('cost mode renders the absolute 最省錢達標 cost (no 你能省 / 全 BiS framing)', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice, mode: 'cost', showApply: false } })
    // Absolute-cost framing: the cost-optimal plan total is the card's number.
    expect(w.text()).toContain('最省錢達標')
    expect(w.text()).toContain('16,000')
    // The removed 全 BiS over-meld ceiling figure must not resurface.
    expect(w.text()).not.toContain('2,384,000')
    expect(w.text()).not.toContain('你能省')
    expect(w.text()).not.toContain('全 BiS')
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

  // #132: the loading state offers a cancel button so a long/pathological solve
  // can be torn down by the user instead of waiting it out.
  it('renders a cancel button while loading and emits "cancel" on click', async () => {
    const w = mount(MeldAdvisorCard, { props: { advice: 'loading' } })
    const btn = w.find('[data-test=cancel-advisor]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(w.emitted('cancel')).toHaveLength(1)
  })

  it('shows no cancel button when not loading', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: 'stale' } })
    expect(w.find('[data-test=cancel-advisor]').exists()).toBe(false)
  })

  // #129 tweak D: a hard CP-bound recipe can keep the reverse search running for
  // tens of seconds (per-request 8s deadline × multiple craftsmanship rungs), so
  // the bare「計算中…」spinner reads like a hang. Surface a long-wait expectation
  // hint so the wait reads as expected, not broken.
  it('#129 D: the loading state surfaces a long-wait expectation hint', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: 'loading' } })
    const hint = w.find('[data-test=loading-hint]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('數十秒')
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
      status: 'infeasible',
      costOptimal: { ...fullAdvice.costOptimal, feasible: false, reason: '槽位不足，需換底裝' },
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
    expect(text).not.toContain('你能省')
    expect(text).not.toContain('全 BiS')
    expect(text).not.toContain('往全 BiS')
    // never shows the gap number or the raw solver stat delta (the table's
    // 能力值 column is the materia-granted increment, a different number)
    expect(text).not.toContain('2,384,000')
    expect(text).not.toContain('60')
  })

  // --- #160: structured plan table replaces the single-line cost text ---

  it('ability mode (#160): renders the plan table with a totals row carrying the gil', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice, mode: 'ability' } })
    expect(w.find('[data-test=meld-plan-table]').exists()).toBe(true)
    expect(w.find('[data-test=meld-plan-totals]').text()).toContain('16,000')
    // the old single-line cost text is gone — the totals row carries the cost
    expect(w.find('.ability-cost').exists()).toBe(false)
    expect(w.text()).not.toContain('所需鑲嵌費用')
  })

  it('cost mode (#160): renders the plan table instead of the plain steps list', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice, mode: 'cost', showApply: false } })
    expect(w.find('[data-test=meld-plan-table]').exists()).toBe(true)
    expect(w.find('.steps-list').exists()).toBe(false)
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

  it('ability mode (#159): merges multi-depth steps of the same materia into one clause', () => {
    // A plan that dips into overmeld carries one step per depth level for the
    // SAME materia (cost math needs the split); the sentence must not repeat
    // 「N 顆 加工魔晶石Ⅻ」 once per depth.
    const deep: MeldAdvice = {
      ...fullAdvice,
      costOptimal: {
        ...fullAdvice.costOptimal,
        deltaStats: { craftsmanship: 0, control: 30 * 54, cp: 0 },
        steps: [
          { stat: 'control', grade: 12, placedCount: 18, expectedCount: 18, unitPrice: 1000, subtotal: 18000 },
          { stat: 'control', grade: 12, placedCount: 12, expectedCount: 12 / 0.17, unitPrice: 1000, subtotal: 70588 },
        ],
        totalGil: 88588,
      },
    }
    const w = mount(MeldAdvisorCard, { props: { advice: deep, mode: 'ability' } })
    const clauses = w.findAll('.ability-clause')
    expect(clauses).toHaveLength(1)
    // Merged purchase count: ceil(18 + 12/0.17) = 89.
    expect(clauses[0].text()).toContain('89 顆 加工魔晶石Ⅻ')
  })

  it('ability mode: states the 全 HQ 素材 premise when the plan assumes full HQ materials', () => {
    const advice: MeldAdvice = { ...fullAdvice, assumesFullHq: true }
    const w = mount(MeldAdvisorCard, { props: { advice, mode: 'ability' } })
    const hint = w.find('[data-test=full-hq-premise]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('HQ 素材')
    // The guarantee sentence still renders — the hint qualifies it, not replaces it.
    expect(w.find('.ability-sentence').exists()).toBe(true)
  })

  it('ability mode: no 全 HQ 素材 premise hint when the screen already matches the baseline', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice, mode: 'ability' } })
    expect(w.find('[data-test=full-hq-premise]').exists()).toBe(false)
  })

  it('ability mode: hqSufficient hides the meld steps and shows the success state', () => {
    const sufficient: MeldAdvice = { ...fullAdvice, hqSufficient: true }
    const w = mount(MeldAdvisorCard, { props: { advice: sufficient, mode: 'ability' } })
    expect(w.text()).toContain('無需鑲嵌')
    // the hero meld sentence + plan table are hidden (the success state replaces them)
    expect(w.find('.ability-sentence').exists()).toBe(false)
    expect(w.find('[data-test=meld-plan-table]').exists()).toBe(false)
    expect(w.findAll('button').some(b => b.text().includes('套用鑲嵌'))).toBe(false)
  })

  // --- #134: 「無 HQ 素材槓桿」prefacing hint for custom recipes (0% HQ) ---

  it('ability mode: shows the no-HQ-lever preface when noHqLever is true', () => {
    const advice: MeldAdvice = { ...fullAdvice, noHqLever: true }
    const w = mount(MeldAdvisorCard, { props: { advice, mode: 'ability' } })
    expect(w.find('[data-test=no-hq-lever]').exists()).toBe(true)
    expect(w.text()).toContain('無 HQ 素材槓桿')
  })

  it('ability mode: hides the no-HQ-lever preface when noHqLever is false', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice, mode: 'ability' } })
    expect(w.find('[data-test=no-hq-lever]').exists()).toBe(false)
  })

  it('the no-HQ-lever preface coexists with an infeasible status (still no false guarantee)', () => {
    const advice: MeldAdvice = {
      ...fullAdvice,
      status: 'infeasible',
      noHqLever: true,
      costOptimal: { ...fullAdvice.costOptimal, feasible: false, reason: '槽位不足，需換底裝', steps: [] },
    }
    const w = mount(MeldAdvisorCard, { props: { advice, mode: 'ability' } })
    expect(w.find('[data-test=no-hq-lever]').exists()).toBe(true)
    expect(w.text()).toContain('無 HQ 素材槓桿')
    // never claims the 保證 HQ guarantee on a non-feasible status
    expect(w.find('.ability-sentence').exists()).toBe(false)
  })

  it('ability mode: infeasible plan surfaces the reason and no CTA', () => {
    const infeasible: MeldAdvice = {
      ...fullAdvice,
      status: 'infeasible',
      costOptimal: { ...fullAdvice.costOptimal, feasible: false, reason: '槽位不足，需換底裝', steps: [] },
    }
    const w = mount(MeldAdvisorCard, { props: { advice: infeasible, mode: 'ability' } })
    expect(w.text()).toContain('槽位不足')
    expect(w.findAll('button').some(b => b.text().includes('套用鑲嵌'))).toBe(false)
  })

  // An UNCONFIRMED leftover plan's reason is the bailout shape's artifact (its
  // delta came from a closed-form seed, possibly the 10k sentinel) — presenting
  // 「槽位不足，需換底裝」would send the user gear-shopping over a number the
  // solver never validated.
  it('ability mode: an unconfirmed plan must NOT surface the 槽位不足 reason (bailout artifact)', () => {
    const bailout: MeldAdvice = {
      ...fullAdvice,
      status: 'infeasible',
      costOptimal: {
        ...fullAdvice.costOptimal,
        feasible: false, reason: '槽位不足，需換底裝', steps: [], confirmedBySolver: false,
      },
    }
    const w = mount(MeldAdvisorCard, { props: { advice: bailout, mode: 'ability' } })
    expect(w.text()).not.toContain('槽位不足')
    expect(w.text()).toContain('無法只靠鑲嵌保證 HQ')
  })

  it('ability mode: status budget-exhausted shows the search-limit message, not 保證 HQ and not 不可行', () => {
    const advice: MeldAdvice = {
      ...fullAdvice,
      status: 'budget-exhausted',
      costOptimal: { ...fullAdvice.costOptimal, feasible: false, steps: [], confirmedBySolver: false },
    }
    const w = mount(MeldAdvisorCard, { props: { advice, mode: 'ability' } })
    expect(w.text()).toContain('搜尋已達上限')
    expect(w.text()).not.toContain('即可保證 HQ')
    expect(w.text()).not.toContain('無法只靠鑲嵌保證 HQ')
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

  // --- #128: 「無市場資料，依鑲嵌數量估算」hint when the plan was ranked by count ---

  const countRankedAdvice: MeldAdvice = {
    ...fullAdvice,
    rankedByCount: true,
    costOptimal: {
      ...fullAdvice.costOptimal,
      steps: [{ stat: 'craftsmanship', grade: 12, placedCount: 2, expectedCount: 2, unitPrice: null, subtotal: null }],
      totalGil: null,
    },
  }

  it('cost mode: shows the 依鑲嵌數量估算 hint when rankedByCount is true', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: countRankedAdvice, mode: 'cost', showApply: false } })
    expect(w.text()).toContain('依鑲嵌數量估算')
  })

  it('ability mode: shows the 依鑲嵌數量估算 hint when rankedByCount is true', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: countRankedAdvice, mode: 'ability' } })
    expect(w.text()).toContain('依鑲嵌數量估算')
  })

  it('does NOT show the 依鑲嵌數量估算 hint when prices are present (rankedByCount false)', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice, mode: 'cost', showApply: false } })
    expect(w.text()).not.toContain('依鑲嵌數量估算')
  })

  it('cost mode never shows the 存成配裝 gate (even with overrideActive)', () => {
    const w = mount(MeldAdvisorCard, {
      props: { advice: fullAdvice, mode: 'cost', showApply: false, overrideActive: true },
    })
    expect(w.findAll('button').some(b => b.text().includes('存成配裝'))).toBe(false)
  })

  // --- #133: honest status rendering — never claim 保證 HQ on a non-feasible run ---

  it('ability mode: status timed-out shows the 逾時 message, not 保證 HQ', () => {
    const advice: MeldAdvice = {
      ...fullAdvice,
      status: 'timed-out',
      costOptimal: { ...fullAdvice.costOptimal, confirmedBySolver: false },
    }
    const w = mount(MeldAdvisorCard, { props: { advice, mode: 'ability' } })
    expect(w.text()).toContain('逾時')
    expect(w.text()).not.toContain('保證 HQ')
    expect(w.findAll('button').some(b => b.text().includes('套用鑲嵌'))).toBe(false)
  })

  it('ability mode: status error shows the 失敗 message, not 保證 HQ', () => {
    const advice: MeldAdvice = {
      ...fullAdvice,
      status: 'error',
      costOptimal: { ...fullAdvice.costOptimal, confirmedBySolver: false },
    }
    const w = mount(MeldAdvisorCard, { props: { advice, mode: 'ability' } })
    expect(w.text()).toContain('失敗')
    expect(w.text()).not.toContain('保證 HQ')
  })

  // The core #123/#133 bug: an unconfirmed-but-feasible-looking plan (status
  // infeasible) must NOT render the「即可保證 HQ」sentence or the 套用 CTA — it
  // claimed guaranteed HQ right after the solver failed to confirm one.
  it('ability mode: infeasible status with a leftover plan never claims 保證 HQ nor offers 套用', () => {
    const advice: MeldAdvice = {
      ...fullAdvice,
      status: 'infeasible',
      costOptimal: { ...fullAdvice.costOptimal, confirmedBySolver: false }, // still feasible:true, has steps
    }
    const w = mount(MeldAdvisorCard, { props: { advice, mode: 'ability' } })
    expect(w.text()).toContain('無法只靠鑲嵌保證 HQ')
    expect(w.text()).not.toContain('即可保證 HQ')
    expect(w.findAll('button').some(b => b.text().includes('套用鑲嵌'))).toBe(false)
  })

  it('ability mode: feasible + confirmed still shows the 保證 HQ sentence and 套用 CTA (regression)', () => {
    const w = mount(MeldAdvisorCard, { props: { advice: fullAdvice, mode: 'ability' } })
    expect(w.text()).toContain('即可保證 HQ')
    expect(w.findAll('button').some(b => b.text().includes('套用鑲嵌'))).toBe(true)
  })
})

// issue #207 — LedgerTrend.vue 呈現層測試（純 region-ledger-trend.ts 的統計輸出已在
// region-ledger-trend.spec.ts 直測，這裡只測「TrendCell → DOM」這段映射）。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LedgerTrend from '../LedgerTrend.vue'
import type { TrendCell } from '../../region-ledger-trend'

function makeCell(overrides: Partial<TrendCell> = {}): TrendCell {
  return {
    ruleId: 'test.rule',
    label: '測試',
    kind: 'rate',
    current: 0.1782,
    state: 'fire',
    threshold: 0.1,
    dir: 'high',
    actionable: true,
    trusted: true,
    wow: null,
    spark: [],
    band: null,
    ...overrides,
  }
}

describe('LedgerTrend.vue', () => {
  it('state: fire 時當期值上色 tone-fire', () => {
    const w = mount(LedgerTrend, { props: { cell: makeCell({ state: 'fire' }) } })
    expect(w.find('.lt-value').classes()).toContain('tone-fire')
    expect(w.text()).toContain('17.8%')
  })

  it('actionable: false（觀測層）時一律 tone-dim，不論 state 算出什麼', () => {
    const w = mount(LedgerTrend, { props: { cell: makeCell({ state: 'fire', actionable: false }) } })
    expect(w.find('.lt-value').classes()).toContain('tone-dim')
  })

  it('trusted: false（埋點待修）時一律 tone-dim，不論 state 算出什麼', () => {
    const w = mount(LedgerTrend, { props: { cell: makeCell({ state: 'clear', trusted: false }) } })
    expect(w.find('.lt-value').classes()).toContain('tone-dim')
  })

  it('current 為 null 時顯示 —，不是 "NaN%" 或 "0.0%"', () => {
    const w = mount(LedgerTrend, { props: { cell: makeCell({ current: null, state: 'absent' }) } })
    expect(w.find('.lt-value').text()).toBe('—')
  })

  it('count 型指標用整數格式，不是百分比', () => {
    const w = mount(LedgerTrend, { props: { cell: makeCell({ kind: 'count', current: 1096, threshold: undefined, state: 'absent' }) } })
    expect(w.find('.lt-value').text()).toBe('1,096')
  })

  it('wow: null 時 delta 顯示 —，不帶「波動不顯著」小字（那是「有算但不顯著」的專屬文案）', () => {
    const w = mount(LedgerTrend, { props: { cell: makeCell({ wow: null }) } })
    expect(w.find('.lt-delta').text()).toBe('—')
  })

  it('wow.significant: false 時顯示 — 加「波動不顯著」小字，不畫箭頭', () => {
    const w = mount(LedgerTrend, { props: { cell: makeCell({ wow: { delta: 0.002, significant: false } }) } })
    const delta = w.find('.lt-delta')
    expect(delta.text()).toContain('波動不顯著')
    expect(delta.text()).not.toMatch(/[▲▼]/)
  })

  it('wow.significant: true 時畫箭頭與 pp 數字，方向依 delta 正負', () => {
    const w = mount(LedgerTrend, { props: { cell: makeCell({ dir: 'high', wow: { delta: -0.05, significant: true } }) } })
    expect(w.find('.lt-delta').text()).toMatch(/▼/)
    expect(w.find('.lt-delta').text()).toContain('5.0pp')
  })

  it('threshold 線只在 actionable && trusted 時渲染', () => {
    const trusted = mount(LedgerTrend, { props: { cell: makeCell({ threshold: 0.1, actionable: true, trusted: true }) } })
    expect(trusted.find('.lt-threshold').exists()).toBe(true)

    const untrusted = mount(LedgerTrend, { props: { cell: makeCell({ threshold: 0.1, actionable: true, trusted: false }) } })
    expect(untrusted.find('.lt-threshold').exists()).toBe(false)

    const notActionable = mount(LedgerTrend, { props: { cell: makeCell({ threshold: 0.1, actionable: false, trusted: true }) } })
    expect(notActionable.find('.lt-threshold').exists()).toBe(false)
  })

  it('band 存在時渲染 p10–p90 的 rect', () => {
    const w = mount(LedgerTrend, { props: { cell: makeCell({ band: [0.05, 0.2] }) } })
    expect(w.find('.lt-band').exists()).toBe(true)
  })

  it('band 為 null 時不渲染 rect（不硬畫一條假的帶）', () => {
    const w = mount(LedgerTrend, { props: { cell: makeCell({ band: null }) } })
    expect(w.find('.lt-band').exists()).toBe(false)
  })

  it('spark 缺值（value: null）不拋錯，仍渲染 svg', () => {
    const w = mount(LedgerTrend, {
      props: {
        cell: makeCell({
          spark: [
            { date: '2026-07-01', value: 0.1 },
            { date: '2026-07-02', value: null },
            { date: '2026-07-03', value: 0.12 },
          ],
        }),
      },
    })
    expect(w.find('svg.lt-spark').exists()).toBe(true)
  })
})

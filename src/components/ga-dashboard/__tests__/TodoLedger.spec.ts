// src/components/ga-dashboard/__tests__/TodoLedger.spec.ts
//
// Mount-level smoke tests for the rendering behaviour `todo-select.spec.ts` can't cover (it never
// touches the DOM): the overflow row is collapsed by default and expands on click, the deep-link
// scroll actually fires (not just a hand-shaped cursor), the extinguish trail renders independently
// of whether `hasRows` is true, and the footnote stays mounted in both branches (spec #206 AC).

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TodoLedger from '../pieces/TodoLedger.vue'
import type { TodoRow } from '../todo-select'

function makeRow(overrides: Partial<TodoRow> = {}): TodoRow {
  return {
    id: 'test.rule',
    age: '✦',
    ageTone: 'fresh',
    ageLabel: '本週新亮',
    sig: '[A · 修 bug / 補資料洞] 批量失敗率 17.5%',
    nextStep: '看失敗原因分佈，找出主導那一項',
    anchor: '#chart-failures',
    value: '75%',
    thresholdLabel: '門檻 10.0% · 236/1345',
    state: 'fire',
    ...overrides,
  }
}

describe('TodoLedger.vue', () => {
  it('點 deep-link 呼叫 window.scrollTo（不是只有游標變手形）', async () => {
    document.body.innerHTML = '<div id="chart-failures"></div>'
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    const wrapper = mount(TodoLedger, {
      props: { windowDays: 28, rows: [makeRow()] },
    })
    await wrapper.find('a').trigger('click')
    expect(scrollTo).toHaveBeenCalledOnce()
  })

  it('overflowRows 預設收起，點擊摺疊行後展開', async () => {
    const wrapper = mount(TodoLedger, {
      props: {
        windowDays: 28,
        rows: [makeRow({ id: 'top' })],
        overflowRows: [makeRow({ id: 'overflow-1', sig: '[C] 誤用 · 模擬器塞入大量佇列 5.5%' })],
      },
    })
    expect(wrapper.text()).toContain('另有 1 項超標未入選')
    expect(wrapper.text()).not.toContain('模擬器塞入大量佇列')

    await wrapper.find('.overflow-toggle').trigger('click')
    expect(wrapper.text()).toContain('模擬器塞入大量佇列')
  })

  it('emptyRows 只在沒有 rows 時渲染（空狀態降級樣式）', () => {
    const withRows = mount(TodoLedger, {
      props: {
        windowDays: 28,
        rows: [makeRow()],
        emptyRows: [makeRow({ id: 'near', age: '', nextStep: '' })],
      },
    })
    expect(withRows.text()).not.toContain('最接近門檻的三項')

    const empty = mount(TodoLedger, {
      props: {
        windowDays: 28,
        emptyRows: [makeRow({ id: 'near', age: '', nextStep: '' })],
      },
    })
    expect(empty.text()).toContain('本期無待辦')
    expect(empty.text()).toContain('最接近門檻的三項')
  })

  it('clearedRows（熄滅留痕）獨立於 hasRows 渲染——即使本期完全無待辦也照樣顯示', () => {
    const wrapper = mount(TodoLedger, {
      props: {
        windowDays: 28,
        clearedRows: [makeRow({ id: 'cleared', age: '✓', ageTone: 'cleared', nextStep: '上次觸發 2026-07-29（15.7%）· 門檻 30.0% · 131/281', anchor: '' })],
      },
    })
    expect(wrapper.text()).toContain('本期熄滅')
    expect(wrapper.text()).toContain('上次觸發 2026-07-29')
  })

  it('footNote 不管待辦清單空不空都掛著', () => {
    const withRows = mount(TodoLedger, {
      props: { windowDays: 28, rows: [makeRow()], footNote: '另有 2 個訊號因埋點待修不可用 · #187' },
    })
    expect(withRows.text()).toContain('另有 2 個訊號因埋點待修不可用')

    const empty = mount(TodoLedger, {
      props: { windowDays: 28, footNote: '另有 2 個訊號因埋點待修不可用 · #187' },
    })
    expect(empty.text()).toContain('另有 2 個訊號因埋點待修不可用')
  })

  it('footNote 未提供時不渲染註腳', () => {
    const wrapper = mount(TodoLedger, { props: { windowDays: 28, rows: [makeRow()] } })
    expect(wrapper.text()).not.toContain('埋點待修')
  })

  // ── 年資標記可讀性（issue #206 review：symbol-only 標記對第一次打開儀表板的人不傳達任何資訊，
  //    `∞` 甚至會被螢幕閱讀器念成 "infinity"）─────────────────────────────
  it('三級年資標記各自掛上 #191 決定 2 的名稱（title + aria-label），不加頁面圖例', () => {
    const wrapper = mount(TodoLedger, {
      props: {
        windowDays: 28,
        rows: [
          makeRow({ id: 'fresh', age: '✦', ageTone: 'fresh', ageLabel: '本週新亮' }),
          makeRow({ id: 'streak', age: '10d', ageTone: 'streak', ageLabel: '連續 10 天' }),
          makeRow({ id: 'censored', age: '∞', ageTone: 'censored', ageLabel: '觀測全期未曾解決' }),
        ],
      },
    })
    const ageEls = wrapper.findAll('.age')
    expect(ageEls[0].attributes('title')).toBe('本週新亮')
    expect(ageEls[0].attributes('aria-label')).toBe('本週新亮')
    expect(ageEls[1].attributes('title')).toBe('連續 10 天')
    expect(ageEls[2].attributes('title')).toBe('觀測全期未曾解決')
    expect(ageEls[2].attributes('aria-label')).toBe('觀測全期未曾解決')
    // 第三級不得洩漏天數——連文案本身都不能出現數字，不只是視覺上的 age 文字。
    expect(ageEls[2].attributes('title')).not.toMatch(/\d/)
    // 不加頁面圖例：ledger 裡不該出現一段獨立、非 hover 觸發的圖例說明文字。
    expect(wrapper.text()).not.toContain('本週新亮')
  })

  it('emptyRows（無 age 標記）不渲染 title/aria-label', () => {
    const wrapper = mount(TodoLedger, {
      props: { windowDays: 28, emptyRows: [makeRow({ id: 'near', age: '', ageLabel: '', nextStep: '' })] },
    })
    const ageEl = wrapper.find('.age')
    expect(ageEl.attributes('title')).toBeUndefined()
    expect(ageEl.attributes('aria-label')).toBeUndefined()
  })
})

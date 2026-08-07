// src/components/ga-dashboard/__tests__/todo-select.spec.ts
//
// `buildTodoLedger()` 的呈現層取捨——直接餵合成的 `Verdict[]`（不經過 `evaluate()`），因為這裡
// 要測的是「同一份判定要怎麼分配到 top / overflow / cleared / emptyNear / footNote」，不是判定本身
// 怎麼算出來的（那是 `ga-evaluate.spec.ts` 的責任，spec #194 的「只測外部行為」原則）。

import { describe, it, expect } from 'vitest'
import { buildTodoLedger } from '../todo-select'
import type { Verdict } from '@/analytics/ga-evaluate'

const BUNDLE_DATE = '2026-07-31'

function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    id: 'test.rule',
    cat: 'A',
    label: '測試規則',
    obs: 175,
    n: 1000,
    threshold: 0.1,
    dir: 'high',
    fired: false,
    gap: 0,
    state: 'grey',
    actionable: true,
    trusted: true,
    nextStep: '看失敗原因分佈',
    anchor: '#chart-x',
    streak: 0,
    streakCensored: false,
    ...overrides,
  }
}

describe('buildTodoLedger()', () => {
  // ── 分界：哪些 verdict 進待辦、哪些進註腳 N ──────────────────────────────
  it('fired 的規則進 top（依 evaluate() 已排序的順序，前 3 進 top，其餘進 overflow）', () => {
    const verdicts = [
      makeVerdict({ id: 'a', cat: 'A', fired: true, state: 'fire', streak: 1, gap: 0.8 }),
      makeVerdict({ id: 'b', cat: 'B', fired: true, state: 'fire', streak: 1, gap: 0.65 }),
      makeVerdict({ id: 'c', cat: 'B', fired: true, state: 'fire', streak: 1, gap: 0.07 }),
      makeVerdict({ id: 'd', cat: 'C', fired: true, state: 'fire', streak: 1, gap: 0.55 }),
    ]
    const result = buildTodoLedger(verdicts, BUNDLE_DATE, 28)
    expect(result.top.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(result.overflow.map((r) => r.id)).toEqual(['d'])
    expect(result.counts).toEqual({ firing: 4, cleared: 0, total: 4 })
  })

  it('absent 的規則不進 top/overflow，且不算進 firing 計數', () => {
    const verdicts = [
      makeVerdict({ id: 'a', fired: true, state: 'fire', streak: 1, gap: 0.8 }),
      makeVerdict({ id: 'gone', fired: false, state: 'absent', blockedBy: 'absent', obs: null, n: null, gap: null }),
    ]
    const result = buildTodoLedger(verdicts, BUNDLE_DATE, 28)
    expect(result.top.map((r) => r.id)).toEqual(['a'])
    expect(result.counts.firing).toBe(1)
  })

  it('blockedBy 為 not-trusted 的規則算進常駐註腳 N，即使 state 是 fire 也不進 top/overflow', () => {
    const verdicts = [
      makeVerdict({ id: 'a', fired: true, state: 'fire', streak: 1, gap: 0.8 }),
      makeVerdict({ id: 'untrusted', fired: false, state: 'fire', trusted: false, blockedBy: 'not-trusted', streak: 5, gap: 0.9 }),
    ]
    const result = buildTodoLedger(verdicts, BUNDLE_DATE, 28)
    expect(result.top.map((r) => r.id)).toEqual(['a'])
    expect(result.footNote).toBe('另有 1 個訊號因埋點待修不可用 · #187')
  })

  it('footNote 在 N === 0 時是 undefined（自己消失）', () => {
    const verdicts = [makeVerdict({ id: 'a', fired: true, state: 'fire', streak: 1, gap: 0.8 })]
    const result = buildTodoLedger(verdicts, BUNDLE_DATE, 28)
    expect(result.footNote).toBeUndefined()
  })

  // ── 年資三級 ──────────────────────────────────────────────────────────
  it('streak ≤ 7 天 → 本週新亮（金色實心，無數字）', () => {
    const verdicts = [makeVerdict({ id: 'a', fired: true, state: 'fire', streak: 7, streakCensored: false, gap: 0.8 })]
    const row = buildTodoLedger(verdicts, BUNDLE_DATE, 28).top[0]
    expect(row.age).toBe('✦')
    expect(row.ageTone).toBe('fresh')
  })

  it('8 ≤ streak < 序列全長（streakCensored: false）→ 顯示連續天數', () => {
    const verdicts = [makeVerdict({ id: 'a', fired: true, state: 'fire', streak: 47, streakCensored: false, gap: 0.8 })]
    const row = buildTodoLedger(verdicts, BUNDLE_DATE, 28).top[0]
    expect(row.age).toBe('47d')
    expect(row.ageTone).toBe('streak')
  })

  it('streakCensored === true → 第三級，不顯示數字（判準是 streakCensored 欄位，不是 streak === 序列全長）', () => {
    // streak 刻意設一個「看起來不像序列全長」的數字，確認選路是讀 streakCensored 而非重算長度。
    const verdicts = [makeVerdict({ id: 'a', fired: true, state: 'fire', streak: 72, streakCensored: true, gap: 0.55 })]
    const row = buildTodoLedger(verdicts, BUNDLE_DATE, 28).top[0]
    expect(row.age).toBe('∞')
    expect(row.ageTone).toBe('censored')
    expect(row.age).not.toMatch(/\d/)
  })

  it('streak === 0 的防禦分支：不會顯示「連續 0 天」（若非 fire 的 verdict 誤入 fired 選取路徑）', () => {
    const verdicts = [makeVerdict({ id: 'a', fired: true, state: 'fire', streak: 0, streakCensored: false, gap: 0.8 })]
    const row = buildTodoLedger(verdicts, BUNDLE_DATE, 28).top[0]
    expect(row.age).not.toBe('0d')
  })

  // ── 熄滅留痕 ──────────────────────────────────────────────────────────
  it('state 為 clear 且 lastFire 在 windowDays 天內 → 進熄滅留痕，帶「上次觸發」文字', () => {
    const verdicts = [
      makeVerdict({
        id: 'x', fired: false, state: 'clear', gap: -0.553,
        lastFire: { date: '2026-07-29', val: 0.157 },
      }),
    ]
    const result = buildTodoLedger(verdicts, BUNDLE_DATE, 28)
    expect(result.cleared).toHaveLength(1)
    expect(result.cleared[0].age).toBe('✓')
    expect(result.cleared[0].ageTone).toBe('cleared')
    expect(result.cleared[0].nextStep).toContain('上次觸發 2026-07-29')
    expect(result.cleared[0].nextStep).toContain('15.7%')
    expect(result.cleared[0].anchor).toBe('') // 熄滅列沒有 deep-link
    expect(result.counts.cleared).toBe(1)
  })

  it('lastFire 超過 windowDays 天 → 不進熄滅留痕（28 天後消失）', () => {
    const verdicts = [
      makeVerdict({ id: 'x', fired: false, state: 'clear', gap: -0.5, lastFire: { date: '2026-06-01', val: 0.15 } }),
    ]
    const result = buildTodoLedger(verdicts, BUNDLE_DATE, 28)
    expect(result.cleared).toHaveLength(0)
  })

  it('state 為 clear 但 not-trusted 的規則不進熄滅留痕（沒被信任過的數字沒有「熄滅」可言）', () => {
    const verdicts = [
      makeVerdict({ id: 'x', fired: false, state: 'clear', trusted: false, gap: -0.5, lastFire: { date: '2026-07-30', val: 0.05 } }),
    ]
    const result = buildTodoLedger(verdicts, BUNDLE_DATE, 28)
    expect(result.cleared).toHaveLength(0)
  })

  it('沒有 lastFire 的 clear 規則不進熄滅留痕（沒有觀測到過 fire，不是「剛熄滅」）', () => {
    const verdicts = [makeVerdict({ id: 'x', fired: false, state: 'clear', gap: -0.5 })]
    const result = buildTodoLedger(verdicts, BUNDLE_DATE, 28)
    expect(result.cleared).toHaveLength(0)
  })

  // ── 空狀態 ────────────────────────────────────────────────────────────
  it('完全沒有 fired 規則 → emptyNear 取未觸發者中缺口比例最大（最接近門檻）的三項', () => {
    const verdicts = [
      makeVerdict({ id: 'near1', fired: false, state: 'grey', gap: -0.01 }),
      makeVerdict({ id: 'near2', fired: false, state: 'clear', gap: -0.14 }),
      makeVerdict({ id: 'near3', fired: false, state: 'clear', gap: -0.28 }),
      makeVerdict({ id: 'far', fired: false, state: 'clear', gap: -0.9 }),
    ]
    const result = buildTodoLedger(verdicts, BUNDLE_DATE, 28)
    expect(result.top).toHaveLength(0)
    expect(result.emptyNear.map((r) => r.id)).toEqual(['near1', 'near2', 'near3'])
    expect(result.emptyNear[0].nextStep).toBe('') // 降級樣式：無下一步
    expect(result.emptyNear[0].age).toBe('') // 降級樣式：無 ★
    expect(result.emptyNear[0].dim).toBe(true) // 降級樣式：灰階
  })

  it('emptyNear 不把 absent（無 obs）的規則算進「接近門檻」的排序', () => {
    const verdicts = [
      makeVerdict({ id: 'near', fired: false, state: 'grey', gap: -0.01 }),
      makeVerdict({ id: 'gone', fired: false, state: 'absent', blockedBy: 'absent', obs: null, n: null, gap: null }),
    ]
    const result = buildTodoLedger(verdicts, BUNDLE_DATE, 28)
    expect(result.emptyNear.map((r) => r.id)).toEqual(['near'])
  })

  it('emptyNear 不補滿——只有 1 條可用時就顯示 1 條', () => {
    const verdicts = [makeVerdict({ id: 'near', fired: false, state: 'grey', gap: -0.01 })]
    const result = buildTodoLedger(verdicts, BUNDLE_DATE, 28)
    expect(result.emptyNear).toHaveLength(1)
  })

  it('有任何 fired 規則時 emptyNear 恆為空（即使 top 只有 1 條，不足 3 條也不用近門檻項填充）', () => {
    const verdicts = [
      makeVerdict({ id: 'a', fired: true, state: 'fire', streak: 1, gap: 0.8 }),
      makeVerdict({ id: 'near', fired: false, state: 'grey', gap: -0.01 }),
    ]
    const result = buildTodoLedger(verdicts, BUNDLE_DATE, 28)
    expect(result.emptyNear).toHaveLength(0)
  })

  // ── 格式化 ────────────────────────────────────────────────────────────
  it('sig 帶類別標籤與當期比率，value 是缺口比例，thresholdLabel 帶門檻與 obs/n', () => {
    const verdicts = [makeVerdict({ id: 'a', cat: 'A', label: '批量失敗率', obs: 236, n: 1345, threshold: 0.1, fired: true, state: 'fire', streak: 1, gap: 0.75 })]
    const row = buildTodoLedger(verdicts, BUNDLE_DATE, 28).top[0]
    expect(row.sig).toBe('[A] 批量失敗率 17.5%')
    expect(row.value).toBe('75%')
    expect(row.thresholdLabel).toBe('門檻 10.0% · 236/1345')
  })
})

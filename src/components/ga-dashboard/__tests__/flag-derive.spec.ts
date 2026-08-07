import { describe, it, expect } from 'vitest'
import { deriveChartFlag, isMetricUntrusted, CHART_METRICS, type ChartMetric } from '../flag-derive'
import { GA_THRESHOLD_RULES, type Rule } from '@/config/ga-thresholds'

/** 最小可用假規則——只填 deriveChartFlag() 會讀到的欄位(id/trusted),其餘湊型別要求。 */
function fakeRule(id: string, trusted: boolean): Rule {
  return {
    id,
    cat: 'A',
    dir: 'high',
    threshold: 0.1,
    pick: () => undefined,
    label: id,
    nextStep: '',
    anchor: '#test',
    actionable: true,
    trusted,
  }
}

/** 測試專用圖表→指標宣告,不污染正式 CHART_METRICS。 */
const FAKE_METRICS: Record<string, ChartMetric[]> = {
  'chart-two-metrics': [
    { label: '指標 A', ruleId: 'a' },
    { label: '指標 B', ruleId: 'b' },
  ],
  'chart-mixed': [{ label: '無規則欄位' }, { label: '指標 X', ruleId: 'x' }],
}

/** 沿用 deriveChartFlag/isMetricUntrusted 的預設參數順序,固定注入 FAKE_METRICS。 */
function derive(chartId: string, rules: Rule[]) {
  return deriveChartFlag(chartId, rules, FAKE_METRICS)
}
function untrusted(chartId: string, ruleId: string, rules: Rule[]) {
  return isMetricUntrusted(chartId, ruleId, rules, FAKE_METRICS)
}

describe('deriveChartFlag — 逐指標推導，不吃整張圖布林值', () => {
  it('這張圖沒有登記任何指標時不掛徽章', () => {
    expect(derive('chart-does-not-exist', [])).toBeUndefined()
  })

  it('全部指標都可信時不掛徽章', () => {
    const rules = [fakeRule('a', true), fakeRule('b', true)]
    const flag = derive('chart-two-metrics', rules)
    expect(flag).toBeUndefined()
  })

  it('全部指標都不可信 → 態一（partial: false），文案列出全部欄位', () => {
    const rules = [fakeRule('a', false), fakeRule('b', false)]
    const flag = derive('chart-two-metrics', rules)
    expect(flag?.partial).toBe(false)
    expect(flag?.text).toContain('指標 A')
    expect(flag?.text).toContain('指標 B')
    expect(flag?.text).not.toContain('已可信')
  })

  it('只有部分指標不可信 → 態二（partial: true），文案指名被指名的欄位並列出已可信的欄位', () => {
    const rules = [fakeRule('a', false), fakeRule('b', true)]
    const flag = derive('chart-two-metrics', rules)
    expect(flag?.partial).toBe(true)
    expect(flag?.text).toContain('指標 A')
    expect(flag?.text).toContain('指標 B')
    expect(flag?.text).toContain('已可信')
  })

  it('驗收 5：同一張圖上兩個指標解除日不同時，能正確從態一過渡到態二、再到無徽章', () => {
    // chart-two-metrics 的「指標 A」對應規則 id 'a'、「指標 B」對應 'b' —— 就像 solver 完成率
    // vs 失敗率：完成率在 pipeline merge 當天解除，失敗率還要再等 3 天累積資料。
    const bothUntrusted = [fakeRule('a', false), fakeRule('b', false)]
    expect(derive('chart-two-metrics', bothUntrusted)?.partial).toBe(false)

    // pipeline merge 當天：指標 A 的規則翻成 trusted，指標 B 還沒。
    const aResolved = [fakeRule('a', true), fakeRule('b', false)]
    expect(derive('chart-two-metrics', aResolved)?.partial).toBe(true)

    // 3 天後：指標 B 也翻成 trusted，徽章整個消失——不需要動 view 任何一行程式碼。
    const allResolved = [fakeRule('a', true), fakeRule('b', true)]
    expect(derive('chart-two-metrics', allResolved)).toBeUndefined()
  })

  it('找不到規則 id（拼字錯誤/規則被移除）時保守判定為不可信，不會悄悄放行', () => {
    const flag = derive('chart-two-metrics', [fakeRule('a', true)]) // 'b' 缺席
    expect(flag?.partial).toBe(true)
    expect(flag?.text).toContain('指標 B')
  })

  it('沒有掛規則的指標（ruleId 省略）永遠視為可信，不會拖累其餘指標的態', () => {
    const flag = derive('chart-mixed', [fakeRule('x', false)])
    // chart-mixed: [{ label: '無規則欄位' }, { label: '指標 X', ruleId: 'x' }]
    expect(flag?.partial).toBe(true)
    expect(flag?.text).toContain('無規則欄位')
    expect(flag?.text).toContain('已可信')
  })
})

describe('isMetricUntrusted — 供圖表元件精準畫局部斜紋', () => {
  it('被指名的不可信欄位回傳 true', () => {
    expect(untrusted('chart-two-metrics', 'a', [fakeRule('a', false), fakeRule('b', true)])).toBe(true)
  })
  it('已可信的欄位回傳 false', () => {
    expect(untrusted('chart-two-metrics', 'b', [fakeRule('a', false), fakeRule('b', true)])).toBe(false)
  })
  it('這張圖沒有登記這個 ruleId 時回傳 false（不誤畫斜紋）', () => {
    expect(untrusted('chart-two-metrics', 'nonexistent', [fakeRule('a', false)])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 與正式門檻表對拍——記錄「今天」的實際推導結果，門檻表的 trusted 旗標改變時這裡會跟著動
// (那正是設計目的：徽章不用手動維護)。CHART_METRICS 本身用的假設是額外覆蓋，不從
// GA_THRESHOLD_RULES 動態生成，測試裡直接複製一份等價宣告以避免 import 私有常數。
// ---------------------------------------------------------------------------
describe('CHART_METRICS 對拍正式門檻表（今天的已知狀態）', () => {
  // solver.failRate 目前仍是 trusted:false——#200（人機分離）原本要把它翻成 true，但
  // solver_failed 事件從未帶過 taxonomy，人類分母 humanFails 結構上恆為 0，會讓判定引擎誤判
  // 成「0% 失敗、一切正常」而不是「還量不到」。#200 已改為維持 trusted:false，等 #198 的
  // client 修正上線、solver_failed 開始帶 source、再累積約 3 天資料才翻。這條斷言反映的仍是
  // 真實的當下狀態，不是暫時性的紅燈——過渡機制本身（態一→態二→無徽章）已經用注入假規則的
  // 測試證過，不依賴這條真實規則斷言，見上面「驗收 5」那條。
  it('chart-funnels：solver 失敗率未可信、批量完成率已可信 → 態二', () => {
    const flag = deriveChartFlag('chart-funnels', GA_THRESHOLD_RULES)
    expect(flag?.partial).toBe(true)
    expect(flag?.text).toContain('solver 失敗率')
    expect(flag?.text).toContain('批量完成率')
    expect(isMetricUntrusted('chart-funnels', 'solver.failRate', GA_THRESHOLD_RULES)).toBe(true)
    expect(isMetricUntrusted('chart-funnels', 'batch.completeRate', GA_THRESHOLD_RULES)).toBe(false)
  })

  it('chart-sim：巨集複製率是唯一指標且未可信 → 態一', () => {
    const flag = deriveChartFlag('chart-sim', GA_THRESHOLD_RULES)
    expect(flag?.partial).toBe(false)
    expect(flag?.text).toContain('巨集複製率')
  })

  it('chart-matrix：巨集複製率未可信、完成率（無規則覆蓋）視為可信 → 態二', () => {
    const flag = deriveChartFlag('chart-matrix', GA_THRESHOLD_RULES)
    expect(flag?.partial).toBe(true)
    expect(flag?.text).toContain('巨集複製率')
    expect(flag?.text).toContain('完成率已可信')
    expect(isMetricUntrusted('chart-matrix', 'solver.macroCopyRate', GA_THRESHOLD_RULES)).toBe(true)
  })

  it('CHART_METRICS 只收錄目前有未可信規則的圖（chart-failures 等全信任的圖不在表裡）', () => {
    expect(CHART_METRICS['chart-failures']).toBeUndefined()
    expect(deriveChartFlag('chart-failures', GA_THRESHOLD_RULES)).toBeUndefined()
  })
})

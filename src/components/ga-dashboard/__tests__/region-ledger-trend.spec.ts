// src/components/ga-dashboard/__tests__/region-ledger-trend.spec.ts
//
// issue #207——首屏 RegionSplitLedger 的趨勢三件組（當期值 + WoW + 7d sparkline）。純函式測試，
// 同 `todo-select.ts`/`flag-derive.ts` 的既有測試慣例：不 mount Vue，直接測 `region-ledger-trend.ts`
// 的輸出形狀。
import { describe, it, expect } from 'vitest'
import {
  buildTrendCell, buildRowTrendCells, REGION_LEDGER_ROW_METRICS, SPARK_LINE_DAYS,
  type RegionLedgerRowKey,
} from '../region-ledger-trend'
import { evaluate, type RuleTrends, type TrendPoint, type Verdict } from '@/analytics/ga-evaluate'
import { GA_THRESHOLD_RULES } from '@/config/ga-thresholds'
import type { MetricsBundle } from '@/types/ga-snapshot'

function makeBundle(overrides: Partial<MetricsBundle> = {}, endDate = '2026-07-31'): MetricsBundle {
  return {
    window: { days: 28, startDate: '2026-07-04', endDate },
    glance: {
      activeUsers: { total: 1096, new: 728, returning: 519, returningPct: 519 / 1096 },
      solver: {
        starts: 13582, completes: 13153, fails: 231, completePct: 13153 / 13582,
        humanStarts: 6451, humanCompletes: 6212, humanFails: 110,
        humanCompletePct: 6212 / 6451, macroCopies: 399,
      },
      batch: { starts: 1340, completes: 1063, fails: 241, cancelled: 36, completePct: 1063 / 1340 },
      bom: { calculates: 268, sentToBatch: 14, handoffPct: 14 / 268 },
      infra: { sabUnavailable: 90, wasmLoadFailed: 3 },
    },
    pages: [],
    solverFunnel: [],
    batchFunnel: [],
    simulatorFunnel: { entry: { label: '', count: 0, users: 0 }, macroCopy: { label: '', count: 0, users: 0 }, globalContext: [] },
    failures: [],
    vitals: [],
    q4Funnels: [],
    marketRegion: [],
    ...overrides,
  }
}

/** 造一段 `n` 天的 7d TrendPoint 序列，比率固定不動——單純填量體用，WoW/band 測試各自覆寫。 */
function flatHistory(days: number, obs: number, n: number, startDate = '2026-06-01'): TrendPoint[] {
  const start = new Date(`${startDate}T00:00:00Z`)
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start)
    d.setUTCDate(d.getUTCDate() + i)
    return { date: d.toISOString().slice(0, 10), obs, n }
  })
}

describe('REGION_LEDGER_ROW_METRICS', () => {
  it('五個 row 共 8 條規則，逐字對齊 #184 決議「五組展開的 ~8 條」與原型的 8-metric META 表', () => {
    const counts = Object.values(REGION_LEDGER_ROW_METRICS).map((m) => m.length)
    expect(counts).toEqual([2, 2, 2, 1, 1]) // activeUsers / solver / batch / bom / infra
    const total = counts.reduce((a, b) => a + b, 0)
    expect(total).toBe(8)
  })

  it('每一條 ruleId 都在 GA_THRESHOLD_RULES 裡找得到對應規則（不是打錯字的孤兒 id）', () => {
    const ruleIds = new Set(GA_THRESHOLD_RULES.map((r) => r.id))
    for (const metrics of Object.values(REGION_LEDGER_ROW_METRICS)) {
      for (const m of metrics) expect(ruleIds.has(m.ruleId)).toBe(true)
    }
  })

  it('infra row 只掛 SAB 不可用率，不掛 WASM——沿用 #184 原型的準確範圍，不是遺漏', () => {
    expect(REGION_LEDGER_ROW_METRICS.infra.map((m) => m.ruleId)).toEqual(['infra.sabUnavailableRate'])
  })
})

describe('buildTrendCell()', () => {
  it('觀測層規則（threshold 未訂）：當期值不繞過 Verdict.obs/n 的 null 化，直接呼叫 rule.pick() 取得真實數字', () => {
    const bundle = makeBundle()
    const cell = buildTrendCell(
      { ruleId: 'infra.sabUnavailableRate', label: 'SAB 不可用率', kind: 'rate' },
      bundle,
      {},
      undefined,
    )
    expect(cell.current).toBeCloseTo(90 / 1096, 5)
    expect(cell.state).toBe('absent') // 沒有門檻，永遠不上色（#184 決議：「觀測層……不上色、不判定」）
  })

  it('count 型指標（活躍使用者）：current 直接是 obs（不除以 n）', () => {
    const bundle = makeBundle()
    const cell = buildTrendCell(
      { ruleId: 'activeUsers.total', label: '活躍使用者', kind: 'count' },
      bundle,
      {},
      undefined,
    )
    expect(cell.current).toBe(1096)
  })

  it('有門檻的規則（bom.handoffRate）：state/threshold/dir 取自傳入的 verdict，不重算 Wilson classify', () => {
    const bundle = makeBundle()
    const verdicts = evaluate(bundle, {}, GA_THRESHOLD_RULES)
    const v = verdicts.find((x) => x.id === 'bom.handoffRate')!
    const cell = buildTrendCell({ ruleId: 'bom.handoffRate', label: '交棒率', kind: 'rate' }, bundle, {}, v)
    expect(cell.state).toBe(v.state)
    expect(cell.threshold).toBe(v.threshold)
    expect(cell.dir).toBe(v.dir)
    expect(cell.current).toBeCloseTo(14 / 268, 5)
  })

  it('trends7d 序列不足 8 天（含當期）時 WoW 為 null（留白，不是「無變化」）', () => {
    const bundle = makeBundle()
    const trends7d: RuleTrends = { 'bom.handoffRate': flatHistory(5, 14, 268) }
    const cell = buildTrendCell({ ruleId: 'bom.handoffRate', label: '交棒率', kind: 'rate' }, bundle, trends7d, undefined)
    expect(cell.wow).toBeNull()
  })

  it('trends7d 序列 ≥8 天、7 天前後比率不變時 WoW 非 null 但 significant 為 false', () => {
    const bundle = makeBundle()
    const trends7d: RuleTrends = { 'bom.handoffRate': flatHistory(10, 14, 268) }
    const cell = buildTrendCell({ ruleId: 'bom.handoffRate', label: '交棒率', kind: 'rate' }, bundle, trends7d, undefined)
    expect(cell.wow).not.toBeNull()
    expect(cell.wow!.significant).toBe(false)
    expect(cell.wow!.delta).toBe(0)
  })

  it('trends7d 序列裡 7 天前後比率有真實大幅落差時 WoW.significant 為 true', () => {
    const bundle = makeBundle()
    const history = flatHistory(7, 400, 1000).concat(flatHistory(3, 40, 1000, '2026-06-08'))
    const trends7d: RuleTrends = { 'infra.sabUnavailableRate': history }
    const cell = buildTrendCell({ ruleId: 'infra.sabUnavailableRate', label: 'SAB 不可用率', kind: 'rate' }, bundle, trends7d, undefined)
    expect(cell.wow!.significant).toBe(true)
    expect(cell.wow!.delta).toBeLessThan(0) // 40/1000 < 400/1000
  })

  it('sparkline 缺值（null TrendPoint）在 spark 陣列裡保留為 value:null——斷線不補（#184 決定 6）', () => {
    const bundle = makeBundle()
    const history = flatHistory(5, 90, 1096)
    history.splice(2, 1, null) // 第 3 天 cron 漏跑
    const trends7d: RuleTrends = { 'infra.sabUnavailableRate': history }
    const cell = buildTrendCell({ ruleId: 'infra.sabUnavailableRate', label: 'SAB 不可用率', kind: 'rate' }, bundle, trends7d, undefined)
    expect(cell.spark).toHaveLength(5)
    expect(cell.spark[2].value).toBeNull()
    expect(cell.spark[0].value).not.toBeNull()
  })

  it('spark 只保留最近 SPARK_LINE_DAYS 天，即使歷史更長（#184 決定 5：線固定 56 天）', () => {
    const bundle = makeBundle()
    const trends7d: RuleTrends = { 'infra.sabUnavailableRate': flatHistory(90, 90, 1096) }
    const cell = buildTrendCell({ ruleId: 'infra.sabUnavailableRate', label: 'SAB 不可用率', kind: 'rate' }, bundle, trends7d, undefined)
    expect(cell.spark).toHaveLength(SPARK_LINE_DAYS)
  })

  it('band（p10–p90）吃全部歷史，不受 56 天線的長度限制（#184 決定 5）', () => {
    const bundle = makeBundle()
    // 90 天歷史，前 80 天比率固定在 5%，最後 10 天飆到 50%——如果 band 被 56 天線截斷，
    // p90 讀不到那段飆高的尾巴；band 吃全部歷史時 p90 應該反映得到。
    const history = flatHistory(80, 50, 1000).concat(flatHistory(10, 500, 1000, '2026-08-20'))
    const trends7d: RuleTrends = { 'infra.sabUnavailableRate': history }
    const cell = buildTrendCell({ ruleId: 'infra.sabUnavailableRate', label: 'SAB 不可用率', kind: 'rate' }, bundle, trends7d, undefined)
    expect(cell.band).not.toBeNull()
    expect(cell.band![1]).toBeGreaterThan(0.05) // p90 抓得到尾巴的高比率
  })

  it('band 樣本 < 2 時為 null——不硬畫一條假的帶', () => {
    const bundle = makeBundle()
    const trends7d: RuleTrends = { 'infra.sabUnavailableRate': flatHistory(1, 90, 1096) }
    const cell = buildTrendCell({ ruleId: 'infra.sabUnavailableRate', label: 'SAB 不可用率', kind: 'rate' }, bundle, trends7d, undefined)
    expect(cell.band).toBeNull()
  })

  it('trends7d 完全沒有這條規則的歷史（呼叫端還沒餵資料）：wow/band 為 null，spark 為空陣列，不拋錯', () => {
    const bundle = makeBundle()
    const cell = buildTrendCell({ ruleId: 'bom.handoffRate', label: '交棒率', kind: 'rate' }, bundle, {}, undefined)
    expect(cell.wow).toBeNull()
    expect(cell.band).toBeNull()
    expect(cell.spark).toEqual([])
  })
})

describe('buildRowTrendCells()', () => {
  it('回傳全部 5 個 row key，每個 row 的長度與 REGION_LEDGER_ROW_METRICS 對齊', () => {
    const bundle = makeBundle()
    const out = buildRowTrendCells(bundle, {}, [])
    const keys = Object.keys(out) as RegionLedgerRowKey[]
    expect(keys.sort()).toEqual(['activeUsers', 'bom', 'batch', 'infra', 'solver'].sort())
    for (const key of keys) expect(out[key].length).toBe(REGION_LEDGER_ROW_METRICS[key].length)
  })

  it('傳入 evaluate() 的完整輸出時，有門檻的 cell 拿得到正確 state（與 TodoLedger 看到的同一份判定）', () => {
    const bundle = makeBundle()
    const verdicts: Verdict[] = evaluate(bundle, {}, GA_THRESHOLD_RULES)
    const out = buildRowTrendCells(bundle, {}, verdicts)
    const bomCell = out.bom.find((c) => c.ruleId === 'bom.handoffRate')!
    const bomVerdict = verdicts.find((v) => v.id === 'bom.handoffRate')!
    expect(bomCell.state).toBe(bomVerdict.state)
  })
})

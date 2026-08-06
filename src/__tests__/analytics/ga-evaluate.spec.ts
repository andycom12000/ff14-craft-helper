import { describe, it, expect } from 'vitest'
import { evaluate, type Verdict } from '@/analytics/ga-evaluate'
import { GA_THRESHOLD_RULES, type Rule } from '@/config/ga-thresholds'
import type { MetricsBundle } from '@/types/ga-snapshot'

/**
 * 最小可用的 MetricsBundle fixture——涵蓋 evaluate() 與 ga-thresholds.ts 現行規則會讀到的每個
 * 欄位，其餘沿用型別要求的最小合法值。個別測試用 `makeBundle({ ... })` 覆寫需要的切片。
 */
function makeBundle(overrides: Partial<MetricsBundle> = {}, endDate = '2026-07-30'): MetricsBundle {
  return {
    window: { days: 28, startDate: '2026-07-03', endDate },
    glance: {
      activeUsers: { total: 1096, new: 728, returning: 519, returningPct: 0.474 },
      solver: { starts: 13582, completes: 13153, fails: 231, completePct: 0.968 },
      batch: { starts: 1340, completes: 1063, fails: 241, cancelled: 36, completePct: 0.793 },
      bom: { calculates: 268, sentToBatch: 14, handoffPct: 0.0522 },
      infra: { sabUnavailable: 90, wasmLoadFailed: 3 },
      // #189/#201 實測 28d：609/30741 = 1.98%，Wilson CI [1.83%, 2.14%] 跨過 2% 門檻，不觸發。
      api: { universalisCalls: 30741, universalisRealFails: 609, universalisNoListing: 1160 },
    },
    pages: [],
    solverFunnel: [],
    batchFunnel: [],
    simulatorFunnel: {
      entry: { label: '/simulator page_view', count: 4415, users: 791 },
      macroCopy: { label: 'solver_macro_copy', count: 399, users: 45 },
      globalContext: [],
    },
    failures: [],
    vitals: [
      { metric: 'LCP', good: 2661, ni: 64, poor: 44 },
      { metric: 'INP', good: 5203, ni: 185, poor: 29 },
      { metric: 'CLS', good: 3475, ni: 195, poor: 67 },
      { metric: 'FCP', good: 2743, ni: 82, poor: 35 },
      { metric: 'TTFB', good: 3899, ni: 273, poor: 108 },
    ],
    q4Funnels: [
      { name: 'Batch prep → Optimize', label: '', from: 4417, to: 1340, note: '', flag: 'danger' },
      { name: 'BOM → Consumed', label: '', from: 268, to: 103, note: '', flag: 'warn' },
    ],
    marketRegion: [],
    misuseSignals: [
      { type: 'single_recipe_in_batch', label: '批量頁只放單一配方', gloss: '', eventCount: 0, affectedUsers: 83 },
      { type: 'large_queue_in_simulator', label: '模擬器塞入大量佇列', gloss: '', eventCount: 0, affectedUsers: 62 },
      { type: 'bom_without_quantity', label: 'BOM 未填數量', gloss: '', eventCount: 0, affectedUsers: 57 },
    ],
    ...overrides,
  }
}

/** 找一筆判定，找不到就丟出——測試斷言用，避免 `undefined` 靜默通過。 */
function must(verdicts: Verdict[], id: string): Verdict {
  const v = verdicts.find((x) => x.id === id)
  if (!v) throw new Error(`verdict not found: ${id}`)
  return v
}

describe('evaluate()', () => {
  // ── AC 1：分母 < 30 → 不觸發，且標記為分母不足 ──────────────────────────
  it('n < 30 時不觸發，blockedBy 標記為 insufficient-n', () => {
    const rule: Rule = {
      id: 'test.smallN',
      cat: 'A',
      dir: 'high',
      threshold: 0.1,
      pick: () => ({ obs: 5, n: 20 }),
      label: 'small n',
      nextStep: '',
      anchor: '',
      actionable: true,
      trusted: true,
    }
    const [v] = evaluate(makeBundle(), [rule])
    expect(v.fired).toBe(false)
    expect(v.blockedBy).toBe('insufficient-n')
    expect(v.state).toBe('absent')
    expect(v.n).toBe(20)
  })

  it('n 剛好等於 30 時不再擋（硬下界含端點）', () => {
    // 5/30 = 16.7%，CI 遠寬於門檻 10%，會落在 grey，但至少不能被 insufficient-n 擋下。
    const rule: Rule = {
      id: 'test.exactly30',
      cat: 'A',
      dir: 'high',
      threshold: 0.1,
      pick: () => ({ obs: 5, n: 30 }),
      label: 'n=30',
      nextStep: '',
      anchor: '',
      actionable: true,
      trusted: true,
    }
    const [v] = evaluate(makeBundle(), [rule])
    expect(v.blockedBy).not.toBe('insufficient-n')
  })

  // ── AC 2：比率超過門檻但 CI 跨過門檻 → 灰態，不觸發 ─────────────────────
  it('比率超過門檻但 CI 跨過門檻時判為 grey，不觸發', () => {
    // 12/100 = 12% > 10% 門檻，但 n=100 時 Wilson CI ≈ [7.0%, 19.8%]，跨過 10%。
    const rule: Rule = {
      id: 'test.greyStraddle',
      cat: 'A',
      dir: 'high',
      threshold: 0.1,
      pick: () => ({ obs: 12, n: 100 }),
      label: 'straddle',
      nextStep: '',
      anchor: '',
      actionable: true,
      trusted: true,
    }
    const [v] = evaluate(makeBundle(), [rule])
    expect(v.state).toBe('grey')
    expect(v.fired).toBe(false)
    expect(v.blockedBy).toBeUndefined()
  })

  // ── AC 3：CI 整段在壞側 → 觸發 ───────────────────────────────────────
  it('CI 整段在壞側（dir=high）時觸發', () => {
    // 批量失敗率 18.0%（241/1340）對門檻 10% —— #181 決議實測案例，CI 下界遠高於 10%。
    const rule: Rule = {
      id: 'test.fireHigh',
      cat: 'A',
      dir: 'high',
      threshold: 0.1,
      pick: () => ({ obs: 241, n: 1340 }),
      label: 'fire high',
      nextStep: '',
      anchor: '',
      actionable: true,
      trusted: true,
    }
    const [v] = evaluate(makeBundle(), [rule])
    expect(v.state).toBe('fire')
    expect(v.fired).toBe(true)
    expect(v.gap).toBeGreaterThan(0)
  })

  it('CI 整段在壞側（dir=low）時觸發', () => {
    // 批量完成率 70%（938/1340）對門檻 85% —— CI 上界遠低於 85%。
    const rule: Rule = {
      id: 'test.fireLow',
      cat: 'B',
      dir: 'low',
      threshold: 0.85,
      pick: () => ({ obs: 938, n: 1340 }),
      label: 'fire low',
      nextStep: '',
      anchor: '',
      actionable: true,
      trusted: true,
    }
    const [v] = evaluate(makeBundle(), [rule])
    expect(v.state).toBe('fire')
    expect(v.fired).toBe(true)
  })

  it('CI 端點剛好等於門檻時不觸發（落在 grey，不是 fire）', () => {
    // obs=100, n=500 的 Wilson 95% 下界精確值為 0.16728494139259462（z=1.96，node 算好帶入）。
    // 門檻直接設成這個精確值：lo === threshold 不滿足嚴格不等式 `lo > threshold`，應解析成 grey。
    const rule: Rule = {
      id: 'test.boundary',
      cat: 'A',
      dir: 'high',
      threshold: 0.16728494139259462,
      pick: () => ({ obs: 100, n: 500 }),
      label: 'boundary',
      nextStep: '',
      anchor: '',
      actionable: true,
      trusted: true,
    }
    const [v] = evaluate(makeBundle(), [rule])
    expect(v.state).toBe('grey')
    expect(v.fired).toBe(false)
  })

  // ── AC 4：日期早於 validFrom → 資料缺席，不得被判為熄滅 ──────────────────
  it('日期早於 validFrom 時判為 absent，不是 clear', () => {
    const rule: Rule = {
      id: 'test.tooEarly',
      cat: 'C',
      dir: 'high',
      threshold: 0.08,
      pick: () => ({ obs: 1, n: 1000 }), // 遠低於門檻，若不擋會判 clear
      label: 'too early',
      nextStep: '',
      anchor: '',
      actionable: true,
      trusted: true,
      validFrom: '2026-06-19',
    }
    const [v] = evaluate(makeBundle({}, '2026-06-01'), [rule])
    expect(v.state).toBe('absent')
    expect(v.state).not.toBe('clear')
    expect(v.blockedBy).toBe('absent')
    expect(v.obs).toBeNull()
    expect(v.n).toBeNull()
  })

  it('日期等於 validFrom 時視為已生效（含端點）', () => {
    const rule: Rule = {
      id: 'test.exactlyValidFrom',
      cat: 'C',
      dir: 'high',
      threshold: 0.08,
      pick: () => ({ obs: 200, n: 1000 }), // 20%，遠高於門檻，n 足夠 → 應觸發
      label: 'exactly validFrom',
      nextStep: '',
      anchor: '',
      actionable: true,
      trusted: true,
      validFrom: '2026-06-19',
    }
    const [v] = evaluate(makeBundle({}, '2026-06-19'), [rule])
    expect(v.state).not.toBe('absent')
  })

  // ── AC 5：指標整條從 bundle 消失 → 資料缺席，不得被判為熄滅 ─────────────
  it('misuseSignals 陣列裡找不到對應 type（該列消失）時判為 absent，不是 clear', () => {
    // 用真實規則（誤用 · BOM 未填數量）配一份只剩另外兩種誤用類型的 bundle，模擬那一列從資料裡消失。
    const bundle = makeBundle({
      misuseSignals: [
        { type: 'single_recipe_in_batch', label: '', gloss: '', eventCount: 0, affectedUsers: 83 },
        { type: 'large_queue_in_simulator', label: '', gloss: '', eventCount: 0, affectedUsers: 62 },
      ],
    })
    const rule = GA_THRESHOLD_RULES.find((r) => r.id === 'misuse_bom_without_quantity')!
    const [v] = evaluate(bundle, [rule])
    expect(v.state).toBe('absent')
    expect(v.state).not.toBe('clear')
    expect(v.blockedBy).toBe('absent')
  })

  it('misuseSignals 整個欄位不存在時，誤用規則判為 absent', () => {
    const bundle = makeBundle({ misuseSignals: undefined })
    const rule = GA_THRESHOLD_RULES.find((r) => r.id === 'misuse_bom_without_quantity')!
    const [v] = evaluate(bundle, [rule])
    expect(v.state).toBe('absent')
    expect(v.blockedBy).toBe('absent')
  })

  // ── AC 6：不可信與不可行動的規則出現在回傳裡但不觸發，且阻擋原因正確 ──────
  it('trusted: false 的規則出現在回傳裡但不觸發，blockedBy 為 not-trusted', () => {
    const rule: Rule = {
      id: 'test.untrusted',
      cat: 'A',
      dir: 'high',
      threshold: 0.1,
      pick: () => ({ obs: 241, n: 1340 }), // 統計上會 fire
      label: 'untrusted',
      nextStep: '',
      anchor: '',
      actionable: true,
      trusted: false,
    }
    const verdicts = evaluate(makeBundle(), [rule])
    const v = must(verdicts, 'test.untrusted')
    expect(v.fired).toBe(false)
    expect(v.blockedBy).toBe('not-trusted')
    expect(v.state).toBe('fire') // 統計狀態仍如實回報，只是被閘門擋下
  })

  it('actionable: false 的規則出現在回傳裡但不觸發，blockedBy 為 not-actionable', () => {
    const rule: Rule = {
      id: 'test.notActionable',
      cat: 'A',
      dir: 'high',
      threshold: 0.1,
      pick: () => ({ obs: 241, n: 1340 }),
      label: 'observation only',
      nextStep: '',
      anchor: '',
      actionable: false,
      trusted: true,
    }
    const verdicts = evaluate(makeBundle(), [rule])
    const v = must(verdicts, 'test.notActionable')
    expect(v.fired).toBe(false)
    expect(v.blockedBy).toBe('not-actionable')
  })

  it('actionable 優先於 trusted：兩者皆 false 時 blockedBy 為 not-actionable', () => {
    const rule: Rule = {
      id: 'test.bothFlags',
      cat: 'A',
      dir: 'high',
      threshold: 0.1,
      pick: () => ({ obs: 241, n: 1340 }),
      label: 'both false',
      nextStep: '',
      anchor: '',
      actionable: false,
      trusted: false,
    }
    const [v] = evaluate(makeBundle(), [rule])
    expect(v.blockedBy).toBe('not-actionable')
  })

  // ── AC 7：pick 回傳陣列的規則展開成多筆判定，標題帶正確後綴 ─────────────
  it('pick 回傳陣列時展開成多筆判定，id 與 label 帶正確後綴', () => {
    const rule = GA_THRESHOLD_RULES.find((r) => r.id === 'vitals.good')!
    const verdicts = evaluate(makeBundle(), [rule])
    expect(verdicts).toHaveLength(5)
    const lcp = must(verdicts, 'vitals.good:LCP')
    expect(lcp.label).toBe('Web Vitals good% · LCP')
    expect(lcp.obs).toBe(2661)
    expect(lcp.n).toBe(2661 + 64 + 44)
    const metrics = verdicts.map((v) => v.id).sort()
    expect(metrics).toEqual(
      ['vitals.good:CLS', 'vitals.good:FCP', 'vitals.good:INP', 'vitals.good:LCP', 'vitals.good:TTFB'].sort(),
    )
  })

  it('動態漏斗規則（q4Funnels）展開成多筆判定，且濾掉 flag=noise 的列', () => {
    const bundle = makeBundle({
      q4Funnels: [
        { name: 'A → B', label: '', from: 1000, to: 300, note: '', flag: 'danger' },
        { name: 'Noisy step', label: '', from: 10, to: 1, note: '', flag: 'noise' },
      ],
    })
    const rule = GA_THRESHOLD_RULES.find((r) => r.id === 'funnel.pageDropoff')!
    const verdicts = evaluate(bundle, [rule])
    expect(verdicts).toHaveLength(1)
    expect(verdicts[0].id).toBe('funnel.pageDropoff:A → B')
    expect(verdicts[0].label).toBe('漏斗轉換 · A → B')
  })

  it('pick 回傳空陣列時仍產生一筆 absent 判定', () => {
    const bundle = makeBundle({ q4Funnels: [] })
    const rule = GA_THRESHOLD_RULES.find((r) => r.id === 'funnel.pageDropoff')!
    const verdicts = evaluate(bundle, [rule])
    expect(verdicts).toHaveLength(1)
    expect(verdicts[0].state).toBe('absent')
  })

  // ── AC 8：排序為固定類別順序、層內按缺口比例 ────────────────────────────
  it('排序遵循固定類別順序 A > B > C > D，層內按缺口比例遞減', () => {
    // 用 #181 決議 resolution comment「28d 快照 2026-07-30」實測數字重建：
    // batch 失敗率 241/1340（A，缺口 80%）> BOM 交棒率 14/268（B，缺口 65%）
    //   > batch 完成率 1063/1340（B，缺口 6.7%）> 誤用·大量佇列 62/1311（C，缺口雖大但類別排後面）。
    const bundle = makeBundle({
      glance: {
        activeUsers: { total: 1311, new: 0, returning: 0, returningPct: 0 },
        solver: { starts: 13582, completes: 13153, fails: 231, completePct: 0.968 },
        batch: { starts: 1340, completes: 1063, fails: 241, cancelled: 0, completePct: 0.793 },
        bom: { calculates: 268, sentToBatch: 14, handoffPct: 0.0522 },
        infra: { sabUnavailable: 0, wasmLoadFailed: 0 },
        api: { universalisCalls: 30741, universalisRealFails: 609, universalisNoListing: 1160 },
      },
      misuseSignals: [
        { type: 'single_recipe_in_batch', label: '', gloss: '', eventCount: 0, affectedUsers: 100 },
        { type: 'large_queue_in_simulator', label: '', gloss: '', eventCount: 0, affectedUsers: 62 },
        { type: 'bom_without_quantity', label: '', gloss: '', eventCount: 0, affectedUsers: 68 },
      ],
    })
    const rules = GA_THRESHOLD_RULES.filter((r) =>
      ['batch.failRate', 'bom.handoffRate', 'batch.completeRate', 'misuse_large_queue_in_simulator'].includes(r.id),
    )
    const verdicts = evaluate(bundle, rules)
    const order = verdicts.map((v) => v.id)
    expect(order).toEqual(['batch.failRate', 'bom.handoffRate', 'batch.completeRate', 'misuse_large_queue_in_simulator'])

    // 誤用規則缺口比例其實遠大於 batch 完成率，但固定類別順序把它壓在 B 類之後——
    // 這正是 #181 決定 4 的意圖（缺口比例只在同類內比較才有意義）。
    const misuse = must(verdicts, 'misuse_large_queue_in_simulator')
    const batchComplete = must(verdicts, 'batch.completeRate')
    expect(misuse.gap!).toBeGreaterThan(batchComplete.gap!)
    expect(order.indexOf('misuse_large_queue_in_simulator')).toBeGreaterThan(order.indexOf('batch.completeRate'))
  })

  it('同類別內，未觸發規則也依缺口比例排序（供空狀態選取使用）', () => {
    const rules: Rule[] = [
      {
        id: 'test.gapSmall',
        cat: 'B',
        dir: 'low',
        threshold: 0.3,
        pick: () => ({ obs: 303, n: 1000 }), // 30.3% vs 30% → gap ≈ -1%
        label: 'small gap',
        nextStep: '',
        anchor: '',
        actionable: true,
        trusted: true,
      },
      {
        id: 'test.gapLarge',
        cat: 'B',
        dir: 'low',
        threshold: 0.3,
        pick: () => ({ obs: 384, n: 1000 }), // 38.4% vs 30% → gap ≈ -28%
        label: 'large negative gap',
        nextStep: '',
        anchor: '',
        actionable: true,
        trusted: true,
      },
    ]
    const verdicts = evaluate(makeBundle(), rules)
    // 兩者皆未觸發（好側），但缺口比例較不負（離門檻較近）的排前面。
    expect(verdicts.map((v) => v.id)).toEqual(['test.gapSmall', 'test.gapLarge'])
  })

  // ── AC 9：evaluate() 回傳全部規則，不只觸發者 ───────────────────────────
  it('回傳全部規則的判定，不只觸發者；每筆未觸發判定都帶有 gap 值', () => {
    // 每條規則都刻意設成安全值（好側，且 n 足夠），驗證「零觸發」不等於「回傳變少」。
    const bundle = makeBundle({
      glance: {
        activeUsers: { total: 1096, new: 0, returning: 0, returningPct: 0 },
        solver: { starts: 13582, completes: 3000, fails: 5, completePct: 0.968 },
        batch: { starts: 1340, completes: 1300, fails: 10, cancelled: 0, completePct: 0.97 }, // 0.75% 遠低於 10% 門檻
        bom: { calculates: 268, sentToBatch: 45, handoffPct: 0.168 }, // 16.8% 高於 15% 門檻（dir low，好側）
        infra: { sabUnavailable: 0, wasmLoadFailed: 0 },
        // universalis 真故障率 0.5%（10/2000）遠低於 2% 門檻（dir high，好側）。
        api: { universalisCalls: 2000, universalisRealFails: 10, universalisNoListing: 50 },
      },
      // simulatorFunnel.macroCopy.count 沿用預設 399；399/3000 = 13.3% 高於門檻 10%（dir low，好側）。
      misuseSignals: [
        { type: 'single_recipe_in_batch', label: '', gloss: '', eventCount: 0, affectedUsers: 50 }, // 4.6% < 8%
        { type: 'large_queue_in_simulator', label: '', gloss: '', eventCount: 0, affectedUsers: 20 }, // 1.8% < 3%
        { type: 'bom_without_quantity', label: '', gloss: '', eventCount: 0, affectedUsers: 30 }, // 2.7% < 5%
      ],
      q4Funnels: [{ name: 'A → B', label: '', from: 4000, to: 1500, note: '', flag: 'danger' }], // 37.5% > 30%
      // vitals 沿用預設（91–97% good），遠高於 75% 門檻。
    })
    const verdicts = evaluate(bundle, GA_THRESHOLD_RULES)

    // 沒有任何一條會觸發（全部刻意設成安全值，或本來就 trusted:false），但陣列長度仍等於全部展開後的判定數。
    expect(verdicts.every((v) => v.fired === false)).toBe(true)
    expect(verdicts.length).toBeGreaterThanOrEqual(GA_THRESHOLD_RULES.length)

    // 空狀態要挑「最接近門檻的 3 項」需要 gap 值——非 absent 的判定都要有 gap。
    const withData = verdicts.filter((v) => v.state !== 'absent')
    expect(withData.length).toBeGreaterThan(0)
    for (const v of withData) {
      expect(v.gap).not.toBeNull()
      expect(Number.isFinite(v.gap!)).toBe(true)
    }
  })

  it('evaluate() 對空規則表回傳空陣列', () => {
    expect(evaluate(makeBundle(), [])).toEqual([])
  })
})

describe('api.universalisRealFailRate（#201）', () => {
  const rule = () => GA_THRESHOLD_RULES.find((r) => r.id === 'api.universalisRealFailRate')!

  it('取 glance.api.universalisRealFails / universalisCalls 當分子分母（不吃 apiFailures）', () => {
    const bundle = makeBundle({
      glance: {
        activeUsers: { total: 1096, new: 728, returning: 519, returningPct: 0.474 },
        solver: { starts: 13582, completes: 13153, fails: 231, completePct: 0.968 },
        batch: { starts: 1340, completes: 1063, fails: 241, cancelled: 36, completePct: 0.793 },
        bom: { calculates: 268, sentToBatch: 14, handoffPct: 0.0522 },
        infra: { sabUnavailable: 90, wasmLoadFailed: 3 },
        api: { universalisCalls: 30741, universalisRealFails: 609, universalisNoListing: 1160 },
      },
    })
    const [v] = evaluate(bundle, [rule()])
    expect(v.obs).toBe(609)
    expect(v.n).toBe(30741)
  })

  it('#189/#201 實測 28d（609/30741 = 1.98%）：Wilson CI 跨過 2% 門檻，不觸發', () => {
    const [v] = evaluate(makeBundle(), [rule()])
    expect(v.fired).toBe(false)
    expect(v.state).not.toBe('fire')
  })

  it('「查無掛單」404 併入分子時會誤報觸發——迴歸測這條規則絕對不能吃 universalisNoListing', () => {
    // #189 決定 3 講的原始 bug：把 404 併進真故障分子會把 1.98% 誇大成 5.91%，遠超 2% 門檻。
    // 這裡直接驗證 pick() 對外只吐 { obs: realFails, n: calls }，不論 no-listing 數值多大都不影響 obs。
    const bundle = makeBundle({
      glance: {
        activeUsers: { total: 1096, new: 728, returning: 519, returningPct: 0.474 },
        solver: { starts: 13582, completes: 13153, fails: 231, completePct: 0.968 },
        batch: { starts: 1340, completes: 1063, fails: 241, cancelled: 36, completePct: 0.793 },
        bom: { calculates: 268, sentToBatch: 14, handoffPct: 0.0522 },
        infra: { sabUnavailable: 90, wasmLoadFailed: 3 },
        // universalisNoListing 刻意設一個極大值——若 pick() 誤把它併進分子，obs 會偏離 609。
        api: { universalisCalls: 30741, universalisRealFails: 609, universalisNoListing: 999999 },
      },
    })
    const [v] = evaluate(bundle, [rule()])
    expect(v.obs).toBe(609)
  })

  it('分子分母遠高於門檻且 n 足夠時觸發（迴歸真陽性路徑）', () => {
    // 5.91%（含 404）版本用來確認規則本身在真的超標時能正確 fire——只是拿它餵真實資料不該發生。
    const bundle = makeBundle({
      glance: {
        activeUsers: { total: 1096, new: 728, returning: 519, returningPct: 0.474 },
        solver: { starts: 13582, completes: 13153, fails: 231, completePct: 0.968 },
        batch: { starts: 1340, completes: 1063, fails: 241, cancelled: 36, completePct: 0.793 },
        bom: { calculates: 268, sentToBatch: 14, handoffPct: 0.0522 },
        infra: { sabUnavailable: 90, wasmLoadFailed: 3 },
        api: { universalisCalls: 30741, universalisRealFails: 1817, universalisNoListing: 0 }, // 5.91%
      },
    })
    const [v] = evaluate(bundle, [rule()])
    expect(v.state).toBe('fire')
    expect(v.fired).toBe(true)
  })
})

describe('GA_THRESHOLD_RULES（門檻表本身的基本健檢）', () => {
  it('id 全部唯一', () => {
    const ids = GA_THRESHOLD_RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('每條規則都能對一份完整的 28d bundle 跑出至少一筆判定', () => {
    const verdicts = evaluate(makeBundle(), GA_THRESHOLD_RULES)
    expect(verdicts.length).toBeGreaterThanOrEqual(GA_THRESHOLD_RULES.length)
  })
})

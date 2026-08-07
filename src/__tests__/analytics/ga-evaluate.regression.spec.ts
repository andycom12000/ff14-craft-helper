// src/__tests__/analytics/ga-evaluate.regression.spec.ts
//
// #205 回歸測試——把真實的 79 份 `gh-data/history/` 歷史快照（2026-05-19 → 今天，2 個已知的
// cron 漏跑缺口日已被 fixture 產生腳本排除，見 `ga-build-trend.mjs` 檔頭）逐日餵進 `evaluate()`，
// 斷言解票時實測出來的歷史事實。這些斷言是**事實**，不是設計出來的行為——如果實作跑出來的數字與
// 這裡不符，先假設是 `ga-evaluate.ts` 錯了，不要調整斷言去迎合實作（票面原文）。
//
// fixture 來源：`src/__tests__/fixtures/ga-regression-history.json`，由
// `scripts/dev/ga-build-regression-fixture.mjs --history <gh-data/history 的 checkout>` 產生。
// 該腳本與這份 fixture 本身都不在 CI 跑（`gh-data/history/` 不存在於一般 checkout），這份測試只讀
// 已經委交進 repo 的精簡版 fixture。

import { describe, it, expect } from 'vitest'
import { evaluate, type Verdict, type RuleTrends } from '@/analytics/ga-evaluate'
import { GA_THRESHOLD_RULES, type Rule } from '@/config/ga-thresholds'
import type { MetricsBundle } from '@/types/ga-snapshot'
import fixture from '../fixtures/ga-regression-history.json'

const bundles = fixture.bundles as unknown as MetricsBundle[]
const dates = fixture.dates
const sab7d = fixture.sab7d as unknown as (readonly [number, number] | null)[]
const sab7dDates = fixture.sab7dDates

/**
 * 逐日呼叫 `evaluate()`，用每一天自己吐回的 `obs`/`n` 餵下一天的 `trends`——這就是 production
 * trends.json 會存的同一組數字（見 `ga-build-trend.mjs`），不是重新推導一份。
 */
function walkSequence(rules: Rule[], seqBundles: MetricsBundle[], seqDates: string[]): { date: string; verdicts: Verdict[] }[] {
  const trends: RuleTrends = {}
  const out: { date: string; verdicts: Verdict[] }[] = []
  for (let i = 0; i < seqBundles.length; i++) {
    const bundle = seqBundles[i]
    const verdicts = evaluate(bundle, trends, rules)
    out.push({ date: seqDates[i], verdicts })
    for (const v of verdicts) {
      const entry = v.obs !== null && v.n !== null ? { date: seqDates[i], obs: v.obs, n: v.n } : null
      ;(trends[v.id] ??= []).push(entry)
    }
  }
  return out
}

function must(verdicts: Verdict[], id: string): Verdict {
  const v = verdicts.find((x) => x.id === id)
  if (!v) throw new Error(`verdict not found: ${id}`)
  return v
}

describe('#205 回歸測試：71/79 份真實歷史快照', () => {
  // ── 事實 1：SAB 修復在序列上準確連亮 7 天後自動安靜 ────────────────────────
  //
  // `glance.infra.sabUnavailable / glance.activeUsers.total` 讀 7d 視窗（不是 28d——#184
  // 決議本身用這個真實事件當「28d 滾動視窗畫不出趨勢」的示範案例：同一次修復在 7d 視窗 8 天內
  // 落到基線，28d 視窗要拖 28 天才追上）。這不是 `GA_THRESHOLD_RULES` 裡的規則（重建後的
  // `/admin/ga`——#196/#197——沒有圖可以掛這條規則的 anchor），用 ad-hoc test-local `Rule`
  // 餵真實數字進同一支 `evaluate()`，驗證 streak/熄滅機制本身是通用的，不挑規則是不是「正式」的。
  //
  // review 記錄：`state`/`streak` 一度被改成帶遲滯（grey 因為「先前 fire 過」而延續顯示
  // fire），套上後 SAB 連亮天數變成 14——已經證明是誤讀（見 `src/analytics/ga-evaluate.ts` 檔頭
  // review 記錄：#191 原文自己的交叉驗證數字——批量失敗率 56/72 天 fire、最長連續 47 天——在
  // 遲滯設計下無法成立）。改回無記憶版本後，streak = 純連續原始 fire 天數，grey 中斷計數，這裡
  // 準確重現票面的 7 天。
  describe('SAB 不可用率（ad-hoc 規則，7d 視窗，真實資料）', () => {
    const sabRule: Rule = {
      id: 'test.sabUnavailRate7d',
      cat: 'A',
      dir: 'high',
      threshold: 0.08,
      pick: (b) => ({ obs: b.glance.infra.sabUnavailable, n: b.glance.activeUsers.total }),
      label: 'SAB 不可用率（7d，回歸測試專用）',
      nextStep: '',
      anchor: '',
      actionable: true,
      trusted: true,
    }

    function makeSabBundle(date: string, obs: number, n: number): MetricsBundle {
      return {
        window: { days: 7, startDate: date, endDate: date },
        glance: {
          activeUsers: { total: n, new: 0, returning: 0, returningPct: 0 },
          solver: { starts: 0, completes: 0, fails: 0, completePct: 0 },
          batch: { starts: 0, completes: 0, fails: 0, cancelled: 0, completePct: 0 },
          bom: { calculates: 0, sentToBatch: 0, handoffPct: 0 },
          infra: { sabUnavailable: obs, wasmLoadFailed: 0 },
        },
        pages: [],
        solverFunnel: [],
        batchFunnel: [],
        simulatorFunnel: { entry: { label: '', count: 0, users: 0 }, macroCopy: { label: '', count: 0, users: 0 }, globalContext: [] },
        failures: [],
        vitals: [],
        q4Funnels: [],
        marketRegion: [],
      }
    }

    const sabBundles = sab7d.map((point, i) => (point ? makeSabBundle(sab7dDates[i], point[0], point[1]) : null))
    // sab7d 目前（見 fixture 產生腳本）不含 null——79 天全部讀得到 7d 視窗——但仍防禦性處理，
    // 不假設未來重跑 fixture 時一定沒有缺口。
    it('sanity：這份回歸測試的資料前提（79 天、無缺口）成立', () => {
      expect(sabBundles.every((b) => b !== null)).toBe(true)
    })

    const results = walkSequence([sabRule], sabBundles.filter((b): b is MetricsBundle => b !== null), sab7dDates)
    const states = results.map((r) => must(r.verdicts, 'test.sabUnavailRate7d').state)
    const fireDates = results.filter((r) => must(r.verdicts, 'test.sabUnavailRate7d').state === 'fire').map((r) => r.date)

    it('連亮 7 天（真實日期見下方 fire run 斷言）', () => {
      expect(fireDates).toHaveLength(7)
    })

    it('7 天在「真實快照序列」的位置上彼此相鄰（fixture 已排除缺口日，位置相鄰即代表原始日期序上連續或跨過缺口日）', () => {
      expect(fireDates[0]).toBe(sab7dDates[0])
      const idxs = fireDates.map((d) => sab7dDates.indexOf(d))
      for (let i = 1; i < idxs.length; i++) expect(idxs[i]).toBe(idxs[i - 1] + 1)
    })

    it('自動安靜後（第 8 天起）終身不再觸發——不是暫時的灰帶，是真的再也沒亮過', () => {
      const lastFireIdx = sab7dDates.indexOf(fireDates[fireDates.length - 1])
      const afterward = states.slice(lastFireIdx + 1)
      expect(afterward.length).toBeGreaterThan(0)
      expect(afterward.every((s) => s !== 'fire')).toBe(true)
    })

    it('streak 在第 7 天連亮日到達峰值 7，隔天起歸零', () => {
      const lastFireIdx = sab7dDates.indexOf(fireDates[fireDates.length - 1])
      const peakVerdict = must(results[lastFireIdx].verdicts, 'test.sabUnavailRate7d')
      expect(peakVerdict.streak).toBe(7)
      const nextVerdict = must(results[lastFireIdx + 1].verdicts, 'test.sabUnavailRate7d')
      expect(nextVerdict.streak).toBe(0)
    })
  })

  // ── 事實 2：72（實際 79）天內從來沒有出現過空狀態 ──────────────────────────
  //
  // 用「現行」GA_THRESHOLD_RULES（含 validFrom / trusted / actionable 全部閘門）逐日跑過全部
  // 真實快照，斷言每一天至少有 1 條 `fired === true`。BOM 交棒率單一規則就已經 79/79 天全亮
  // （見事實 4），這條測試驗證的是「待辦系統的整體行為」而非重複驗證那一條規則本身。
  describe('72（實際 79）天內從來沒有出現過空狀態', () => {
    const results = walkSequence(GA_THRESHOLD_RULES, bundles, dates)

    it(`全部 ${results.length} 天，每一天至少有 1 條 fired`, () => {
      const emptyDays = results.filter((r) => !r.verdicts.some((v) => v.fired))
      expect(emptyDays.map((d) => d.date)).toEqual([])
    })

    it('最少的一天也有 ≥1 條在響（不是巧合地每天都遠超過 1 條）', () => {
      const counts = results.map((r) => r.verdicts.filter((v) => v.fired).length)
      expect(Math.min(...counts)).toBeGreaterThanOrEqual(1)
    })
  })

  // ── 事實 3：誤用三條在門檻修正後，今天沒有任何判定翻轉 ──────────────────────
  //
  // 「今天」= fixture 最後一天（實際存檔的最新日期）。這裡**不是**比對舊門檻（#181 原始
  // 10%/3%/6%）vs 新門檻（#193 修正後 8%/3%/5%）——那個比較對 `misuse_single_recipe_in_batch`
  // 這條規則本身就注定翻轉，而且是刻意的：#193 決議原文明講這條規則在舊門檻下、40 天視窗裡
  // 「0/40」次觸發（率的擺幅 8.37%~10.60% 小於 n≈900 時 Wilson CI 半寬 ±1.8pp，lo 永遠上不去
  // 10% 門檻），這正是 #193 把門檻從 10% 下修到 8% 要修的「常亮的慢性裂縫在舊門檻下量不到」——
  // 把它修好本身就是一次被設計出來的翻轉（never-fires → chronically-fires），不是應該被釘住
  // 不能變的事實。
  //
  // 也**不是**「今天相對昨天的 `state`/`fired` 不變」——review 一度這樣寫，跑出來才發現這三條
  // 規則的率就是貼著門檻上下抖動（見下方逐日印出的真實序列），`state` 天天在 fire/grey 之間換來
  // 換去本來就是常態，不是 bug；沒有遲滯的無記憶設計下，這種抖動**本來就會**逐日反映在 `state`
  // 上（#191 決定 3 的 ASCII 圖：灰帶「不亮」，沒有任何一步說灰帶要「跟昨天一樣」）。
  //
  // 真正**不會翻轉**、且與 #193 決定 3 的診斷方法完全對應的事實是：這三條規則在整段
  // `validFrom`（2026-06-19）之後的觀測期裡，`state` **從來沒有**真正落到 `clear`（CI 整段回到
  // 好側）——這正是 #193 決定 3 判斷「批量失敗率」是否真正修好時用的同一把尺（「批量失敗率 72
  // 天裡 clear 天數 = 0——它從來沒有真正回到門檻內過」）。三條規則各自的 `fire`/`grey` 天數會隨
  // 真實資料逐日波動（`misuse_large_queue_in_simulator` 07-30 起真的爆出一波持續到今天都還在
  // 燒的真實 spike），但 `clear` 天數恆為 0，這才是「這條裂縫沒有被修好」的正確判準，不是逐日
  // state 比對。
  describe('誤用三條規則（現行 8%/3%/5% 門檻）：validFrom 之後從未真正 clear（=從未被判定熄滅）', () => {
    const misuseIds = ['misuse_single_recipe_in_batch', 'misuse_large_queue_in_simulator', 'misuse_bom_without_quantity']
    const misuseRules = GA_THRESHOLD_RULES.filter((r) => misuseIds.includes(r.id))
    const results = walkSequence(misuseRules, bundles, dates)
    const todayIdx = dates.length - 1

    it.each(misuseIds)('%s：validFrom 之後的整段觀測期，state 從未等於 clear', (id) => {
      const validFrom = misuseRules.find((r) => r.id === id)!.validFrom!
      const statesAfterValidFrom = results
        .filter((r) => r.date >= validFrom)
        .map((r) => must(r.verdicts, id).state)
      expect(statesAfterValidFrom.length).toBeGreaterThan(0)
      expect(statesAfterValidFrom).not.toContain('clear')
    })

    it.each(misuseIds)('%s：今天（序列最後一天）state 不是 absent——三條規則現在都量得到資料', (id) => {
      expect(must(results[todayIdx].verdicts, id).state).not.toBe('absent')
    })
  })

  // ── 事實 4：BOM 交棒率的 streak 等於序列全長，且被標記為 censored ──────────
  describe('BOM 交棒率（bom.handoffRate）streak 等於序列全長，且 censored', () => {
    const bomRule = GA_THRESHOLD_RULES.find((r) => r.id === 'bom.handoffRate')!
    const results = walkSequence([bomRule], bundles, dates)
    const todayVerdict = must(results[results.length - 1].verdicts, 'bom.handoffRate')

    it('今天（序列最後一天）的 state 是 fire', () => {
      expect(todayVerdict.state).toBe('fire')
    })

    it(`streak 等於序列全長（${dates.length} 天）`, () => {
      expect(todayVerdict.streak).toBe(dates.length)
    })

    it('streakCensored 為 true——序列從第一天起就沒斷過，真實 streak 只會更長', () => {
      expect(todayVerdict.streakCensored).toBe(true)
    })

    it('全序列每一天都是 fire（不是只有今天，是全程）', () => {
      expect(results.every((r) => must(r.verdicts, 'bom.handoffRate').state === 'fire')).toBe(true)
    })
  })
})

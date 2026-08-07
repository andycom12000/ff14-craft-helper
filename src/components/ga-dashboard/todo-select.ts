// src/components/ga-dashboard/todo-select.ts
//
// 「本期待辦」的呈現層取捨（spec #194 §B3/§C1，#183 決定 4/6，#191 決定 2–4）——`evaluate()`
// （`src/analytics/ga-evaluate.ts`）回傳**全部**規則的判定，取前 3、摺疊、熄滅留痕、空狀態選取、
// 常駐註腳計數，全部是這裡的責任，引擎不做任何取捨（spec §B3：「取前 3、摺疊、降級、空狀態選取
// 全在呈現層」）。純函式，無 Vue 依賴——與同目錄的 `flag-derive.ts` / `rlv-aggregate.ts` 同一種
// 「presentation-logic 抽成 .ts、用 vitest 直測」慣例。
//
// `TodoRow` / `TodoCounts` 的型別本來宣告在 `TodoLedger.vue`（#197 的 shell）裡；搬來這裡是因為
// 這個 repo 沒有「從 .vue 的 <script setup> 匯出型別給另一個 .ts 用」的先例，且這兩個型別本質上
// 是這支選取函式的輸出契約，放在純 .ts 檔更符合現有慣例（TodoLedger.vue 改成從這裡 `import type`）。

import type { Verdict, VerdictState } from '@/analytics/ga-evaluate'
import { fmtPct } from './formatters'

/** #187 常駐註腳連結——待辦清單與空狀態共用同一個 issue 編號。 */
const UNTRUSTED_FOOTNOTE_ISSUE = '#187'

export type BlockedReason = 'insufficient-n' | 'not-actionable' | 'not-trusted' | 'absent'

export interface TodoRow {
  id: string
  /** '✦' 本週新亮 · 'Nd' 連續 N 天 · '∞' 觀測全期未解（censored——history-length capped, NOT a
   *  real day count；不得渲染數字，spec #206 AC）· '✓' 熄滅 · '' 無標記（空狀態近門檻降級列）。 */
  age: string
  ageTone: 'fresh' | 'streak' | 'censored' | 'cleared'
  /** `[cat] label rate%`——由門檻表 + 當期數值算出，不是手寫（spec：訊號可以算）。 */
  sig: string
  /** 一般列＝規則手寫的 `nextStep`；熄滅列＝改寫成「上次觸發…」；空狀態近門檻列＝空字串
   *  （降級樣式：無下一步，見 #183 決定 6）。空字串時 `TodoRowLine.vue` 完全不渲染這一行。 */
  nextStep: string
  /** Layer I 圖表區塊的 deep-link；空字串＝不渲染連結（熄滅列、空狀態近門檻列皆無連結）。 */
  anchor: string
  /** 缺口比例（`Verdict.gap`）格式化後的字串，例如 `80%` / `-1%`；熄滅列不重複顯示，留空字串。 */
  value: string
  /** `門檻 X% · obs/n`；熄滅列把這段資訊併進 `nextStep`（見上），這裡留空字串。 */
  thresholdLabel: string
  state: VerdictState
  blockedBy?: BlockedReason
  /** 降級／淡出視覺（灰階）——熄滅留痕列（28 天淡出）與空狀態近門檻列（降級樣式）共用同一個
   *  淡出視覺語彙，語意都是「次要，不是本期主要待辦」。 */
  dim?: boolean
}

/** 頭部計數——與 `rows.length`（實際渲染的列數，top-3 + 熄滅留痕）是兩回事，見 `Verdict[]`
 *  的總筆數（`evaluate()` 回傳全部規則，含未觸發者）。 */
export interface TodoCounts {
  firing: number
  cleared: number
  total: number
}

export interface TodoLedgerSelection {
  /** 觸發且入選前 3 的列（固定類別順序 > 缺口比例，#181 決定 4，`evaluate()` 已排序好）。 */
  top: TodoRow[]
  /** 觸發但排不進前 3 的列，收進可展開的摺疊行（#183 決定 6）。 */
  overflow: TodoRow[]
  /** 熄滅留痕：`state === 'clear'` 且 `lastFire` 落在 `windowDays` 天內（#191 決定 4）。 */
  cleared: TodoRow[]
  /** 空狀態「最接近門檻的三項」——只有 `top`/`overflow` 皆空（沒有任何規則觸發）時才非空
   *  （#183 決定 6）。 */
  emptyNear: TodoRow[]
  counts: TodoCounts
  /** 「另有 N 個訊號因埋點待修不可用」；N === 0 時為 undefined（#183 決定 6：不分空不空都掛著，
   *  N 歸零時自己消失）。 */
  footNote?: string
}

/** `obs/n`，分母缺席或為 0 時回 0（不可能發生在 fired/clear/near 這三類列上——都已通過
 *  `n ≥ 30` 的硬下界——純防禦）。 */
function rateOf(v: Verdict): number {
  return v.n && v.n > 0 ? (v.obs ?? 0) / v.n : 0
}

function sigOf(v: Verdict): string {
  return `[${v.cat}] ${v.label} ${fmtPct(rateOf(v))}`
}

function thresholdLabelOf(v: Verdict): string {
  const thr = v.threshold !== undefined ? fmtPct(v.threshold) : '—'
  return `門檻 ${thr} · ${v.obs ?? '—'}/${v.n ?? '—'}`
}

/** `Verdict.gap` 已依方向正規化（正號＝壞側），四捨五入到整數百分比；負數的 `-` 號由
 *  `Math.round` 的結果自然帶出，不需要另外拼字串（同 `PagesTable.vue` 的 delta 格式慣例）。 */
function gapLabel(v: Verdict): string {
  return v.gap === null ? '—' : `${Math.round(v.gap * 100)}%`
}

/**
 * 年資三級標記（#191 決定 2）。判準是 `streakCensored`，**不是** `streak === 序列全長`——
 * 兩者理論上等價，但 `streakCensored` 是 `evaluate()` 直接算好的欄位，這裡不重算一次歷史長度
 * （見 `ga-evaluate.ts` 的 `computeHistory()`：censored 的真正判準是「有沒有撞到一個真正的
 * 反證」，不是單純的陣列長度比對）。
 *
 * `streak <= 0` 是防禦分支：依 `buildVerdict()` 的定義，只有 `state === 'fire'` 的列會呼叫這支
 * 函式，此時 `streak` 恆 >= 1；萬一未來呼叫端誤把非 fire 的 verdict 餵進來，寧可顯示成「本週
 * 新亮」（金色實心，全清單最醒目），也不要顯示成「連續 0 天」——一個不存在的天數比一個誤導的
 * 「最醒目」標記更容易被抓到是 bug。
 */
function ageOfFire(v: Verdict): { age: string; ageTone: TodoRow['ageTone'] } {
  if (v.streakCensored) return { age: '∞', ageTone: 'censored' }
  if (v.streak <= 7) return { age: '✦', ageTone: 'fresh' }
  return { age: `${v.streak}d`, ageTone: 'streak' }
}

function toFiredRow(v: Verdict): TodoRow {
  const { age, ageTone } = ageOfFire(v)
  return {
    id: v.id,
    age,
    ageTone,
    sig: sigOf(v),
    nextStep: v.nextStep,
    anchor: v.anchor,
    value: gapLabel(v),
    thresholdLabel: thresholdLabelOf(v),
    state: v.state,
    blockedBy: v.blockedBy,
  }
}

/** 熄滅留痕列——`lastFire` 保證非 undefined（呼叫端已在篩選階段擋過，見 `buildTodoLedger()`）。
 *  「上次觸發」與門檔／分子分母併成一行放進 `nextStep`（#191 決定 4 的原型格式），`value`／
 *  `thresholdLabel` 留空，不重複顯示當期缺口——已熄滅代表缺口是好側，不是本期關注的數字。 */
function toClearedRow(v: Verdict): TodoRow {
  const lastFire = v.lastFire!
  return {
    id: v.id,
    age: '✓',
    ageTone: 'cleared',
    sig: sigOf(v),
    nextStep: `上次觸發 ${lastFire.date}（${fmtPct(lastFire.val)}）· ${thresholdLabelOf(v)}`,
    anchor: '',
    value: '',
    thresholdLabel: '',
    state: v.state,
    dim: true,
  }
}

/** 空狀態「最接近門檻的三項」降級列——無 age 標記、無 `nextStep`（#183 決定 6：「降級樣式：無
 *  ★、無 nextStep、灰階」），但保留 `value`（缺口，通常是負號＝好側但接近）與 `thresholdLabel`，
 *  因為決定 6 的原型範例本身就列出了這兩欄（`−1%`／`門檻 30%`）。 */
function toNearRow(v: Verdict): TodoRow {
  return {
    id: v.id,
    age: '',
    ageTone: 'streak',
    sig: sigOf(v),
    nextStep: '',
    anchor: '',
    value: gapLabel(v),
    thresholdLabel: thresholdLabelOf(v),
    state: v.state,
    dim: true,
  }
}

/** 兩個 ISO 日期字串（`YYYY-MM-DD`）的天數差，`a - b`。用 `Date.UTC(y, m-1, d)` 而非直接字串
 *  相減或整月位移——月份是 1-based 字串但 `Date.UTC` 吃 0-based month index，若忘記 -1，兩個日期
 *  的月份長度不同時算出的天數差會錯（例如 02-01 → 03-01 應該是 28 天，忘記 -1 會被月索引位移
 *  成 3 月 1 日 → 4 月 1 日 = 31 天）。 */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const ms = Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)
  return Math.round(ms / 86_400_000)
}

/**
 * 吃 `evaluate()` 的完整輸出，選出「本期待辦」要渲染的全部內容。`bundleDate` 是待辦 ledger 固定
 * 讀取的 28d bundle 的 `window.endDate`（不是全域視窗選擇器的當期，spec §194 §C1：待辦固定
 * 28 天，不跟著視窗選擇器）；`windowDays` 用來判斷熄滅留痕是否還在保留期內。
 */
export function buildTodoLedger(verdicts: Verdict[], bundleDate: string, windowDays: number): TodoLedgerSelection {
  // `evaluate()` 已依固定類別順序＋缺口比例排序（#181 決定 4），這裡不重新排序。
  const fired = verdicts.filter((v) => v.fired)
  const top = fired.slice(0, 3).map(toFiredRow)
  const overflow = fired.slice(3).map(toFiredRow)

  // 熄滅留痕（#191 決定 3/4）：`state === 'clear'` 是對稱 CI 宣告的「真的熄滅」，`actionable`／
  // `trusted` 排掉永久觀測層與埋點待修規則（一個從沒被信任過的數字沒有「熄滅」可言），
  // `lastFire` 存在且落在 `windowDays` 天內才算「本期」熄滅（超過 28 天不再留痕，見決定 4）。
  const cleared = verdicts
    .filter(
      (v): v is Verdict & { lastFire: NonNullable<Verdict['lastFire']> } =>
        v.state === 'clear' && v.actionable && v.trusted && v.lastFire !== undefined && daysBetween(bundleDate, v.lastFire.date) <= windowDays,
    )
    .sort((a, b) => b.lastFire.date.localeCompare(a.lastFire.date))
    .map(toClearedRow)

  // 空狀態（#183 決定 6）：只有完全沒有任何規則觸發時才計算，且排除 absent（`gap === null`，
  // 沒有 obs 就沒有距離可言）與被閘門擋下的規則（未被信任的數字不該被拿來當「接近門檻」的答案）。
  // 缺口比例越大（越接近門檻，含尚未跨過的正向缺口）排越前面；不足 3 條不補滿。
  const emptyNear =
    fired.length === 0
      ? verdicts
          .filter((v) => !v.fired && v.actionable && v.trusted && v.gap !== null)
          .sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity))
          .slice(0, 3)
          .map(toNearRow)
      : []

  const footNoteCount = verdicts.filter((v) => v.blockedBy === 'not-trusted').length
  const footNote = footNoteCount > 0 ? `另有 ${footNoteCount} 個訊號因埋點待修不可用 · ${UNTRUSTED_FOOTNOTE_ISSUE}` : undefined

  const counts: TodoCounts = { firing: fired.length, cleared: cleared.length, total: verdicts.length }

  return { top, overflow, cleared, emptyNear, counts, footNote }
}

// src/components/ga-dashboard/region-ledger-trend.ts
//
// 首屏 RegionSplitLedger 的趨勢三件組（issue #207，spec #194 US #17–19，決議見 #184 決定 1/2/5/6）
// ——「當期值（門檻上色）+ WoW delta（Wilson CI 閘門，不顯著留白）+ 7d sparkline（疊門檻線與
// p10–p90 帶，缺值斷線不補）」。純函式，無 Vue 依賴——與同目錄 `todo-select.ts` / `flag-derive.ts`
// / `rlv-aggregate.ts` 同一種「presentation-logic 抽成 .ts、用 vitest 直測」慣例。
//
// 這份模組刻意 **不** 走 `evaluate()` 的 `Verdict.obs`/`Verdict.n` 取當期值——`buildVerdict()`
// （`ga-evaluate.ts`）對 `threshold === undefined` 的規則（本檔的三條「觀測層」規則，見
// `ga-thresholds.ts` 檔尾那段）會直接回傳 `obs: null, n: null`，不會呼叫已經算好的 `pick()`
// 結果（那是給「這條規則今天還沒有 fire 的定義」用的缺席語意，見該函式的長註解）。改為直接呼叫
// `rule.pick(bundle)`——跟 `ga-build-trend.mjs` 產出 `trends.json` 用的是同一個函式，單一事實來源
// ——取得當期 (obs, n)，`Verdict` 只用來讀 `state`/`threshold`/`dir`（給有門檻的規則上色）。
import type { MetricsBundle } from '@/types/ga-snapshot'
import { wowSignificant, MIN_DENOMINATOR, type RuleTrends, type TrendPoint, type Verdict, type VerdictState } from '@/analytics/ga-evaluate'
import { GA_THRESHOLD_RULES, type Rule, type Direction } from '@/config/ga-thresholds'

export type TrendKind = 'rate' | 'count'
export type RegionLedgerRowKey = 'activeUsers' | 'solver' | 'batch' | 'bom' | 'infra'

export interface LedgerTrendMetric {
  ruleId: string
  /** 卡片內小標籤（例如「完成率」/「失敗率」）——row 本身的名稱已經在 `RegionSplitLedger.vue`
   *  的 `.rl-label` 顯示過，這裡不重複 row 名。 */
  label: string
  kind: TrendKind
}

/**
 * 五個 RegionSplitLedger row → 趨勢三件組要掛的規則，共 8 條，逐字對齊 #184 決議「五組展開的
 * ~8 條」與原型 `prototype-184/build-proto.mjs` 的 8 metric META 表（activeUsers ×2、solver ×2、
 * batch ×2、bom ×1、infra ×1）。`infra` 只掛 SAB（不掛 WASM）——原型本身就只挑了 SAB 當
 * 「唯一畫出完整故事的那條線」的示範案例，這裡沿用原型的準確範圍，不是遺漏。
 */
export const REGION_LEDGER_ROW_METRICS: Record<RegionLedgerRowKey, LedgerTrendMetric[]> = {
  activeUsers: [
    { ruleId: 'activeUsers.total', label: '活躍使用者', kind: 'count' },
    { ruleId: 'activeUsers.returningPct', label: '回訪率', kind: 'rate' },
  ],
  solver: [
    { ruleId: 'solver.completePct', label: '完成率', kind: 'rate' },
    { ruleId: 'solver.failRate', label: '失敗率', kind: 'rate' },
  ],
  batch: [
    { ruleId: 'batch.completeRate', label: '完成率', kind: 'rate' },
    { ruleId: 'batch.failRate', label: '失敗率', kind: 'rate' },
  ],
  bom: [{ ruleId: 'bom.handoffRate', label: '交棒率', kind: 'rate' }],
  infra: [{ ruleId: 'infra.sabUnavailableRate', label: 'SAB 不可用率', kind: 'rate' }],
}

/** sparkline 線固定 56 天（8 週）——#184 決定 5。p10–p90 帶吃全部歷史，不受這個常數限制。 */
export const SPARK_LINE_DAYS = 56

/** 單一趨勢點——`date` 用於斷線判斷（缺值＝該天沒有對應的歸檔資料），`value` 是 obs/n 換算後的
 *  比率或原始計數（依 `kind`），資料缺席時為 `null`。 */
export interface SparkPoint {
  date: string
  value: number | null
}

export interface TrendCell {
  ruleId: string
  label: string
  kind: TrendKind
  /** 當期值——比例（0–1）或原始計數，依 `kind`；資料缺席時為 `null`。 */
  current: number | null
  /** 單期統計狀態（#183 已定的觸發判定，不變——#184 決定 1）。觀測層規則（`threshold` 未訂）
   *  恆為 `'absent'`，呈現層據此不上色，只留走勢（#184 決議原文）。 */
  state: VerdictState
  threshold?: number
  dir?: Direction
  actionable: boolean
  trusted: boolean
  /** `null` = 留白（資料不足或分母 < 30——#184 決定 2：「不顯著就留白，看到一個數字時它必須是
   *  真的」）。 */
  wow: { delta: number; significant: boolean } | null
  /** 最近 `SPARK_LINE_DAYS` 天，缺值處為 `null`（斷線不補，#184 決定 6）。 */
  spark: SparkPoint[]
  /** p10–p90，吃全部歷史（#184 決定 5）；可用樣本 < 2 時為 `null`（樣本不足不硬畫一條假的帶）。 */
  band: [number, number] | null
}

export type RowTrendCells = Record<RegionLedgerRowKey, TrendCell[]>

function quantile(sortedAsc: number[], p: number): number {
  const idx = Math.floor(p * (sortedAsc.length - 1))
  return sortedAsc[idx]
}

/** `TrendPoint` → 比率/計數，依 `kind`。`null`（缺席）與 `n <= 0`（不可能發生在真正的觀測值上，
 *  純防禦）都回 `null`——不得偽裝成 0（#181/#191 反覆強調的「量不到不能當作有答案」原則）。 */
function valueOf(point: TrendPoint, kind: TrendKind): number | null {
  if (point === null || point.n <= 0) return null
  return kind === 'count' ? point.obs : point.obs / point.n
}

/**
 * 非重疊 WoW 的比較對：`history` 尾端是最新一天。`wowSignificant()`（`ga-evaluate.ts`）本身不知道
 * 「7 天」是什麼，這裡才是決定「當期 7d 窗 vs 往前 7 個序列位置」的地方（#184 決定 2：「7d vs 前
 * 7d 非重疊」）。序列長度不足 8（含當期）時回傳 `null`——沒有兩個完整的可比較窗，WoW 沒有答案，
 * 不是「無變化」。
 */
function pickWowPair(history: TrendPoint[]): [TrendPoint, TrendPoint] | null {
  if (history.length < 8) return null
  return [history[history.length - 1], history[history.length - 8]]
}

/**
 * 一條規則的趨勢三件組。`bundle7d` 是即時抓取的當期 snapshot 的 **7d 視窗 bundle**（不是歷史檔案
 * 裡的一天，也不是 28d——review 抓到的實際 bug：當期值一度誤用 28d bundle，跟 `trends7d` 算出的
 * WoW/sparkline 不同視窗，同一列出現兩個不一致的「活躍使用者」數字）。三件組（當期值 + WoW +
 * sparkline）**必須共用同一個 7d 視窗**才對得起欄頭「趨勢 · 7d」這行字——「當期值」因此永遠是
 * 最新鮮的 7d 數字，不受 `trends7d` 檔案更新落後（cron 一天一次）拖累；`trends7d` 只負責 WoW 與
 * sparkline 這兩件需要「歷史序列」才能回答的事（兩者的差別是即時 vs 歷史，不是視窗長度不同）。
 *
 * `verdict` 若提供，`state`/`threshold`/`dir` 取自它（#183 已定的觸發判定機制不變，不重算一次
 * Wilson classify——單一事實來源）；呼叫端傳進來的 `verdict` 必須是拿同一個 7d bundle 算出來的
 * （`GaDashboardView.vue` 的 `ledgerVerdicts`，跟 TodoLedger 固定吃 28d 的 `todoVerdicts` 是兩份
 * 獨立計算），否則「當期值」與「上不上色/門檻線」會對到不同天的數字。找不到對應 verdict（呼叫端
 * 沒傳，或這條規則不在傳入的規則陣列裡）時退回 `'absent'` + 不上色，行為與門檻未訂時一致，不是
 * 錯誤狀態。
 */
export function buildTrendCell(
  metric: LedgerTrendMetric,
  bundle7d: MetricsBundle,
  trends7d: RuleTrends,
  verdict: Verdict | undefined,
  rules: Rule[] = GA_THRESHOLD_RULES,
): TrendCell {
  const rule = rules.find((r) => r.id === metric.ruleId)
  const picked = rule ? rule.pick(bundle7d) : undefined
  // 這份規則表裡本檔用到的 8 條全部是純量 `pick()`（不是漏斗/vitals 那種回傳陣列的規則），
  // 陣列分支理論上不會發生；出現的話代表呼叫端傳錯了規則 id，寧可讓它落在「缺席」而不是讓
  // TypeScript 掩蓋一個陣列被誤讀成純量的 bug。
  const current = picked && !Array.isArray(picked) ? valueOf({ date: bundle7d.window.endDate, obs: picked.obs, n: picked.n }, metric.kind) : null

  const history = trends7d[metric.ruleId] ?? []
  const wowPair = pickWowPair(history)
  const wowRaw = wowPair ? wowSignificant(wowPair[0], wowPair[1]) : null
  const wow = wowRaw ? { delta: wowRaw.delta, significant: wowRaw.significant } : null

  const spark: SparkPoint[] = history.slice(-SPARK_LINE_DAYS).map((point) => ({
    date: point?.date ?? '',
    value: point ? valueOf(point, metric.kind) : null,
  }))

  const bandValues = history
    .map((point) => (point ? valueOf(point, metric.kind) : null))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)
  const band: [number, number] | null = bandValues.length >= 2 ? [quantile(bandValues, 0.1), quantile(bandValues, 0.9)] : null

  return {
    ruleId: metric.ruleId,
    label: metric.label,
    kind: metric.kind,
    current,
    state: verdict?.state ?? 'absent',
    threshold: verdict?.threshold,
    dir: verdict?.dir,
    actionable: verdict?.actionable ?? (rule?.actionable ?? false),
    trusted: verdict?.trusted ?? (rule?.trusted ?? true),
    wow,
    spark,
    band,
  }
}

/** 五個 row 的趨勢三件組，一次算齊——`RegionSplitLedger.vue` 逐 row 取用。 */
export function buildRowTrendCells(
  bundle7d: MetricsBundle,
  trends7d: RuleTrends,
  verdicts: Verdict[],
  rules: Rule[] = GA_THRESHOLD_RULES,
): RowTrendCells {
  const verdictById = new Map(verdicts.map((v) => [v.id, v]))
  const out = {} as RowTrendCells
  for (const key of Object.keys(REGION_LEDGER_ROW_METRICS) as RegionLedgerRowKey[]) {
    out[key] = REGION_LEDGER_ROW_METRICS[key].map((metric) =>
      buildTrendCell(metric, bundle7d, trends7d, verdictById.get(metric.ruleId), rules),
    )
  }
  return out
}

/** 硬下界重新匯出，供元件層（例如空狀態判斷）共用同一個常數，不要另外寫一份 30。 */
export { MIN_DENOMINATOR }

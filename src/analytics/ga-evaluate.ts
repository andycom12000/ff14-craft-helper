// src/analytics/ga-evaluate.ts
//
// 「本期待辦」判定引擎：吃單期 `MetricsBundle` + 門檻表，吐出**全部**規則的判定，不只觸發者。
// 純函式，無 Vue 依賴——見 #183 決議、spec #194 §B1。取前 3、摺疊、降級、空狀態選取全部留給
// 呈現層（GaDashboardView 等），這裡不做取捨。
//
// 年資（streak）與熄滅（跨期認定「已解決」）需要歷史 `(obs, n)` 序列，不在本模組——見 #205。
// 本模組只判定「這一期」的統計狀態：fire（觸發）/ grey（灰帶）/ clear（好側，但尚未認定為熄滅）/
// absent（資料缺席：validFrom 未到、門檻尚未訂定、指標整條消失、或分母不足）。

import type { MetricsBundle } from '@/types/ga-snapshot'
import { CATEGORY_ORDER, type Category, type Direction, type Pick, type Rule } from '@/config/ga-thresholds'

/** Wilson score interval 用的 z 值，對應 95% 信賴區間（#181 決定 3 `wilson95`）。 */
const Z_95 = 1.96

/** 硬下界：分母低於此值一律判為資料不足，不論 CI 算出什麼（#181 決定 3）。 */
const MIN_DENOMINATOR = 30

export type VerdictState = 'fire' | 'grey' | 'clear' | 'absent'

export type BlockReason = 'insufficient-n' | 'not-actionable' | 'not-trusted' | 'absent'

export interface Verdict {
  /** 規則 id；`pick` 回傳陣列時展開成 `${rule.id}:${suffix}`。 */
  id: string
  cat: Category
  /** 含後綴（漏斗名 / vital 名）後的完整標題。 */
  label: string
  /** 分子；資料缺席時為 null。 */
  obs: number | null
  /** 分母；資料缺席時為 null。 */
  n: number | null
  /** 0–1 的比例門檻；規則的 `threshold` 尚未訂定時為 `undefined`（此時 `state` 恆為 `'absent'`）。 */
  threshold?: number
  dir: Direction
  /** 是否進待辦——`state === 'fire'` 且未被 `actionable` / `trusted` 閘門擋下。 */
  fired: boolean
  /** (obs/n − threshold) / threshold，依 `dir` 正規化：正號＝壞側（越大越該排前面），負號＝好側。 */
  gap: number | null
  state: VerdictState
  /** 未進待辦的原因；`fired === true` 時為 undefined。 */
  blockedBy?: BlockReason
  actionable: boolean
  trusted: boolean
  nextStep: string
  anchor: string
}

/**
 * Wilson score interval，95% CI。
 * n <= 0 时回傳 [0, 1]（沒有任何資訊可以縮窄區間）。
 */
export function wilsonInterval(obs: number, n: number): [number, number] {
  if (n <= 0) return [0, 1]
  const z = Z_95
  const p = obs / n
  const denom = 1 + (z * z) / n
  const center = p + (z * z) / (2 * n)
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  const lo = (center - margin) / denom
  const hi = (center + margin) / denom
  return [Math.max(0, lo), Math.min(1, hi)]
}

/**
 * 依方向分類 CI 落在門檻的哪一側。
 *
 * dir === 'high'（壞側 = 高於門檻）：
 *   - lo > threshold → 整段在壞側 → fire
 *   - hi < threshold → 整段在好側 → clear
 *   - 否則跨過門檻 → grey
 *
 * dir === 'low'（壞側 = 低於門檻）是鏡像關係。
 *
 * 注意邊界：CI 端點剛好等於門檻時一律落在 grey（未滿足嚴格不等式），不判 fire 也不判 clear——
 * 對稱於 #181 決定 3 `fire()` pseudocode 用的嚴格 `>` / `<`。
 */
function classify(dir: Direction, lo: number, hi: number, threshold: number): 'fire' | 'grey' | 'clear' {
  if (dir === 'high') {
    if (lo > threshold) return 'fire'
    if (hi < threshold) return 'clear'
    return 'grey'
  }
  if (hi < threshold) return 'fire'
  if (lo > threshold) return 'clear'
  return 'grey'
}

/**
 * 缺口比例，依 `dir` 正規化成「正號＝壞側」，供跨規則排序與空狀態的近門檻選取共用一個欄位。
 * 例：批量失敗率 18.0% 對門檻 10%（dir high）→ +80%；批量完成率 79.3% 對門檻 85%（dir low）→ +6.7%
 *（兩者皆為觸發／接近觸發方向，符號一致）。
 */
function computeGap(dir: Direction, obs: number, n: number, threshold: number): number {
  const rate = n > 0 ? obs / n : 0
  return dir === 'high' ? (rate - threshold) / threshold : (threshold - rate) / threshold
}

function buildVerdict(rule: Rule, id: string, label: string, bundleDate: string, pick: Pick | undefined): Verdict {
  const base = {
    id,
    cat: rule.cat,
    label,
    threshold: rule.threshold,
    dir: rule.dir,
    actionable: rule.actionable,
    trusted: rule.trusted,
    nextStep: rule.nextStep,
    anchor: rule.anchor,
  }

  // 缺席之一：日期早於 validFrom（維度尚未註冊 / 尚在填窗期）。
  if (rule.validFrom !== undefined && bundleDate < rule.validFrom) {
    return { ...base, obs: null, n: null, fired: false, gap: null, state: 'absent', blockedBy: 'absent' }
  }

  // 缺席之二：門檻尚未訂定（#203 review）——與 validFrom 是兩個獨立的缺席理由，都要顯式擋下，
  // 不要讓魔術數字（例如 threshold: 0）代打。必須放在 computeGap() 呼叫之前：
  // `computeGap()` 用 `threshold` 當除數，任何數字佔位都可能在特定 obs/n 組合下產生
  // `NaN`/`-Infinity`，而 `gap` 會流進 `sortVerdicts()` 的比較器與 #206 空狀態的近門檻選取，
  // 一旦是 NaN 整份排序就變成未定義行為（`??` 只擋 `null`，擋不掉 `NaN`）。
  if (rule.threshold === undefined) {
    return { ...base, obs: null, n: null, fired: false, gap: null, state: 'absent', blockedBy: 'absent' }
  }

  // 缺席之三：指標整條從 bundle 消失（選用性欄位缺席，或陣列裡找不到對應列）。
  if (pick === undefined) {
    return { ...base, obs: null, n: null, fired: false, gap: null, state: 'absent', blockedBy: 'absent' }
  }

  const { obs, n } = pick
  const gap = computeGap(rule.dir, obs, n, rule.threshold)

  // 缺席之三：分母不足，硬下界擋下——不論 CI 算出什麼都不可信（#181 決定 3）。
  if (n < MIN_DENOMINATOR) {
    return { ...base, obs, n, fired: false, gap, state: 'absent', blockedBy: 'insufficient-n' }
  }

  const [lo, hi] = wilsonInterval(obs, n)
  const state = classify(rule.dir, lo, hi, rule.threshold)

  // 閘門：actionable / trusted 兩者都不進待辦，但都出現在回傳裡，且保留真實統計狀態
  // （#181 決定 5、#183 決定 4）。actionable 優先於 trusted，沿用 #181 `fire()` pseudocode 的檢查順序。
  if (!rule.actionable) {
    return { ...base, obs, n, fired: false, gap, state, blockedBy: 'not-actionable' }
  }
  if (!rule.trusted) {
    return { ...base, obs, n, fired: false, gap, state, blockedBy: 'not-trusted' }
  }

  return { ...base, obs, n, fired: state === 'fire', gap, state }
}

/** 排序：固定類別順序，層內按缺口比例遞減（#181 決定 4）。 */
function sortVerdicts(verdicts: Verdict[]): Verdict[] {
  return [...verdicts].sort((a, b) => {
    const catDiff = CATEGORY_ORDER.indexOf(a.cat) - CATEGORY_ORDER.indexOf(b.cat)
    if (catDiff !== 0) return catDiff
    return (b.gap ?? -Infinity) - (a.gap ?? -Infinity)
  })
}

/**
 * 吃當期 bundle + 規則表，吐出全部規則的判定。
 *
 * `pick` 回傳陣列的規則（漏斗轉換、Web Vitals）展開成多筆判定，`id` 變成 `${rule.id}:${suffix}`、
 * `label` 帶上 ` · ${suffix}` 後綴；回傳空陣列時仍產生一筆 `state: 'absent'` 判定（指標整條消失）。
 */
export function evaluate(bundle: MetricsBundle, rules: Rule[]): Verdict[] {
  const bundleDate = bundle.window.endDate
  const verdicts: Verdict[] = []

  for (const rule of rules) {
    const picked = rule.pick(bundle)

    if (Array.isArray(picked)) {
      if (picked.length === 0) {
        verdicts.push(buildVerdict(rule, rule.id, rule.label, bundleDate, undefined))
        continue
      }
      picked.forEach((p, idx) => {
        const suffix = p.suffix ?? String(idx)
        verdicts.push(buildVerdict(rule, `${rule.id}:${suffix}`, `${rule.label} · ${suffix}`, bundleDate, p))
      })
      continue
    }

    verdicts.push(buildVerdict(rule, rule.id, rule.label, bundleDate, picked))
  }

  return sortVerdicts(verdicts)
}

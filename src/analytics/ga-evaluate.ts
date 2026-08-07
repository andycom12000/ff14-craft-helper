// src/analytics/ga-evaluate.ts
//
// 「本期待辦」判定引擎：吃單期 `MetricsBundle` + 歷史 `(obs, n)` 趨勢 + 門檻表，吐出**全部**規則的
// 判定，不只觸發者。純函式，無 Vue 依賴——見 #183 決議、spec #194 §B1。取前 3、摺疊、降級、空狀態
// 選取全部留給呈現層（GaDashboardView 等），這裡不做取捨。
//
// 年資（streak）與熄滅（跨期認定「已解決」）見 #205（#191 決議）：
// - state 恆為單期統計狀態：fire（觸發）/ grey（灰帶）/ clear（好側，但尚未認定為熄滅）/
//   absent（資料缺席：validFrom 未到、門檻尚未訂定、指標整條消失、或分母不足）。**無記憶**——
//   grey 不會因為「先前 fire 過」而被改判顯示成 fire。#191 決定 3 的 ASCII 圖本身已經寫明
//   「灰帶……不亮，也不宣告熄滅」，這是兩件獨立的事：灰帶「不宣告熄滅」是指它不會被算進
//   #191 決定 4 的熄滅區塊（那條裂縫仍算沒修好），但灰帶本身**不亮**，不進 streak、不進
//   `fired`。（review 記錄：#205 review 一度誤把 #193 對 `misuse_single_recipe_in_batch` 的
//   說明文字「靠 #191 遲滯維持點亮」讀成「grey 要顯示成 fire」，並誤引成「#193 決定 4」——決定
//   4 實際講的是 `returningPct` 回填，跟遲滯無關。用 #191 原文自己的交叉驗證數字戳破了這個誤讀：
//   批量失敗率 56/72 天 fire、**最長連續 47 天**——若 grey 會延續 streak，56 天幾乎全部落在
//   `clear = 0` 的視窗裡，最長連續理應貼近 72，不會是 47；47 只在「streak = 純連續原始 fire
//   天數，grey 中斷計數」下才可能小於總 fire 天數。已改回無記憶版本。）
// - streak/streakCensored/lastFire 是跨期欄位，靠呼叫端傳入的 `trends`（每條規則的歷史
//   `(obs, n)` 序列，不含當期）逆向走訪算出。「資料缺席」與「分母不足」都不算熄滅、也不累計
//   streak——這兩者在歷史序列裡一律以 `dayState() === 'absent'` 中止當日的 fire 認定，但**不會**
//   把 state 誤判成 clear，也不會讓 streak 假裝連續下去。
// - 歷史點也要吃 `rule.validFrom`：`trends` 裡可能帶著早於 validFrom 的原始 `(obs, n)`（維度
//   註冊前的填窗期噪音），這些點必須強制視為 `absent`，不能真的拿去跑 Wilson CI——否則填窗期的
//   低率會被 raw 分類成 `clear`，序列上出現一次假的「熄滅→亮起」，`streakCensored` 也會被錯標
//   成 `false`（#193 決定 2 明講的具體後果）。

import type { MetricsBundle } from '@/types/ga-snapshot'
import { CATEGORY_ORDER, type Category, type Direction, type Pick, type Rule } from '@/config/ga-thresholds'

/** Wilson score interval 用的 z 值，對應 95% 信賴區間（#181 決定 3 `wilson95`）。 */
const Z_95 = 1.96

/** 硬下界：分母低於此值一律判為資料不足，不論 CI 算出什麼（#181 決定 3）。 */
const MIN_DENOMINATOR = 30

export type VerdictState = 'fire' | 'grey' | 'clear' | 'absent'

export type BlockReason = 'insufficient-n' | 'not-actionable' | 'not-trusted' | 'absent'

/**
 * 一天的歷史 `(obs, n)`；`null` = 那天資料缺席（cron 漏跑、欄位尚未上線等）——**不得**被視為
 * 「連續」的一部分：walking streak 時遇到 `null` 一律中止計數，不跳過、不當作 0（#205 review：
 * 缺席不能偽裝成有答案，同一理由適用於 streak，不只 state）。
 */
export type TrendPoint = { date: string; obs: number; n: number } | null

/**
 * 每條規則（`pick` 展開後的完整 id，例如 `vitals.good:LCP`）的歷史序列，**時間升冪排列、不含
 * 當期**（當期永遠來自呼叫端傳入的 `bundle`）。查無對應 id 視同空陣列，不拋錯——新規則、或呼叫端
 * 尚未餵歷史時的合法輸入。
 */
export type RuleTrends = Record<string, TrendPoint[]>

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
  /**
   * 連續 fire 天數，含當期（#191 決定 2）。`state !== 'fire'` 時恆為 0——不論當期是 grey / clear /
   * absent，都不延續前一段 streak（absent 尤其不行：「量不到」不能偽裝成「還在燒」）。
   */
  streak: number
  /**
   * `streak` 是否被 `trends` 提供的歷史長度截斷（#191 決定 2 第三級）：往回走訪耗盡了整段提供的
   * 歷史仍全部是 fire，代表真實 streak 只會更長，不會更短。`state !== 'fire'` 時恆為 false。
   */
  streakCensored: boolean
  /** 最近一次 fire 的日期與當時比率（0–1）；當期本身是 fire 時就是當期。從未在提供的歷史裡見過 fire 時為 undefined。 */
  lastFire?: { date: string; val: number }
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

/**
 * 依規則的 `dir`/`threshold` 分類單一歷史日的統計狀態，供 `computeHistory()` 逆向走訪用。
 * 呼叫端必須保證 `rule.threshold !== undefined`（`buildVerdict()` 在門檻缺席時完全不呼叫這條路徑）。
 *
 * `null`（缺席）、早於 `rule.validFrom` 的日期、與 `n < MIN_DENOMINATOR`（分母不足）都回
 * `'absent'`——與當期 `buildVerdict()` 的判斷是同一把尺，理由同上：這三種都不可被 streak 逆向走訪
 * 誤讀為「連續」或「熄滅」。validFrom 這條尤其關鍵（#193 決定 2 明講的具體後果）：`trends` 裡可能
 * 帶著維度註冊前的填窗期噪音，若真的拿去跑 Wilson CI，填窗期的低率會被分類成 `clear`，序列上會
 * 出現一次假的「熄滅→亮起」，把本該「全期未曾解決」的 `streakCensored: true` 錯標成 `false`。
 */
function historicalDayState(rule: Rule, point: TrendPoint): VerdictState {
  if (point === null) return 'absent'
  if (rule.validFrom !== undefined && point.date < rule.validFrom) return 'absent'
  if (point.n < MIN_DENOMINATOR) return 'absent'
  const [lo, hi] = wilsonInterval(point.obs, point.n)
  return classify(rule.dir, lo, hi, rule.threshold!)
}

/**
 * 年資（streak）與熄滅留痕（lastFire）——#191 決定 2/3。
 *
 * `streak`：`currentState !== 'fire'` 時恆為 0（含 `'absent'`：資料缺席不延續前一段 streak，見檔頭
 * 註解）。`currentState === 'fire'` 時從 1 起算，逆向走訪 `history`（最新的在陣列尾端），每遇到一天
 * `historicalDayState() === 'fire'` 就 +1，遇到非 fire（含 grey、absent）立即停止——grey **中斷**
 * streak（#191 決定 3 的 ASCII 圖：灰帶「不亮」），absent 中止計數而不是跳過，因為「量不到」不能被
 * 吃掉當作「還在燒」。
 *
 * `streakCensored`：**不是**單純「有沒有走到陣列開頭」，而是「有沒有走到一個真正的反證」。走訪
 * 中止的原因分兩種：
 * - 撞到一天**真正的** grey／clear（有量到，且量到的不是 fire）——這是實打實的反證，streak 的
 *   起點是確定的，`streakCensored: false`。
 * - 撞到陣列邊界，或撞到一天 `absent`（含 `history` 裡的 `null`、分母不足、早於 validFrom 的
 *   填窗期噪音）——這兩種都代表「我們就是不知道那之前發生了什麼」，不是反證，真實 streak 只會
 *   更長，`streakCensored: true`。這條特別是為了 validFrom 設計的：一條規則第一天有效觀測值就是
 *   fire，序列往前全是 validFrom 之前的 absent 填窗期——那條裂縫在我們開始量之前就已經存在，
 *   正是 censored 的定義（#205 review），不能因為撞到的是 absent 而非陣列邊界就誤標成 false。
 *
 * `lastFire`：當期本身 fire 就是當期；否則逆向走訪 `history` 找最近一次 fire 的日期與比率。與
 * `currentState` 無關（即使當期是 `'absent'`，仍可能找得到「上次量得到時它有沒有燒」，這是純粹的
 * 歷史事實陳述，不代表「現在正常」——是否顯示由呈現層決定）。
 */
function computeHistory(
  rule: Rule,
  history: TrendPoint[],
  currentState: VerdictState,
  bundleDate: string,
  obs: number | null,
  n: number | null,
): { streak: Verdict['streak']; streakCensored: Verdict['streakCensored']; lastFire: Verdict['lastFire'] } {
  let lastFire: Verdict['lastFire']
  if (currentState === 'fire') {
    lastFire = { date: bundleDate, val: n && n > 0 ? (obs ?? 0) / n : 0 }
  } else {
    for (let i = history.length - 1; i >= 0; i--) {
      const point = history[i]
      if (point !== null && historicalDayState(rule, point) === 'fire') {
        lastFire = { date: point.date, val: point.n > 0 ? point.obs / point.n : 0 }
        break
      }
    }
  }

  let streak = 0
  let streakCensored = false
  if (currentState === 'fire') {
    streak = 1
    let i = history.length - 1
    while (i >= 0 && historicalDayState(rule, history[i]) === 'fire') {
      streak++
      i--
    }
    // 走訪停在哪裡決定 censored：陣列邊界（i < 0）或 absent（含 validFrom 填窗期）都不是反證，
    // 只有真正量到的 grey／clear 才是——見上方函式註解。
    streakCensored = i < 0 || historicalDayState(rule, history[i]) === 'absent'
  }

  return { streak, streakCensored, lastFire }
}

function buildVerdict(
  rule: Rule,
  id: string,
  label: string,
  bundleDate: string,
  pick: Pick | undefined,
  history: TrendPoint[],
): Verdict {
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
  // absent 的兩個共用形狀：沒有門檻就沒有「fire」的定義，streak/lastFire 恆空；其餘 absent 分支
  // （validFrom 未到、指標消失、分母不足）門檻仍是定義好的，仍可從歷史裡算出 lastFire，只是
  // streak 恆為 0（見 computeHistory() 對 currentState !== 'fire' 的處理）。
  const noHistory = { streak: 0, streakCensored: false, lastFire: undefined } as const

  // 缺席之一：日期早於 validFrom（維度尚未註冊 / 尚在填窗期）。
  if (rule.validFrom !== undefined && bundleDate < rule.validFrom) {
    const hist = rule.threshold === undefined ? noHistory : computeHistory(rule, history, 'absent', bundleDate, null, null)
    return { ...base, obs: null, n: null, fired: false, gap: null, state: 'absent', blockedBy: 'absent', ...hist }
  }

  // 缺席之二：門檻尚未訂定（#203 review）——與 validFrom 是兩個獨立的缺席理由，都要顯式擋下，
  // 不要讓魔術數字（例如 threshold: 0）代打。必須放在 computeGap() 呼叫之前：
  // `computeGap()` 用 `threshold` 當除數，任何數字佔位都可能在特定 obs/n 組合下產生
  // `NaN`/`-Infinity`，而 `gap` 會流進 `sortVerdicts()` 的比較器與 #206 空狀態的近門檻選取，
  // 一旦是 NaN 整份排序就變成未定義行為（`??` 只擋 `null`，擋不掉 `NaN`）。門檻沒訂，歷史也無從
  // 分類「哪天算 fire」，streak/lastFire 恆空——不是省略計算，是這個規則今天還沒有 fire 的定義。
  if (rule.threshold === undefined) {
    return { ...base, obs: null, n: null, fired: false, gap: null, state: 'absent', blockedBy: 'absent', ...noHistory }
  }

  // 缺席之三：指標整條從 bundle 消失（選用性欄位缺席，或陣列裡找不到對應列）。
  if (pick === undefined) {
    const hist = computeHistory(rule, history, 'absent', bundleDate, null, null)
    return { ...base, obs: null, n: null, fired: false, gap: null, state: 'absent', blockedBy: 'absent', ...hist }
  }

  const { obs, n } = pick
  const gap = computeGap(rule.dir, obs, n, rule.threshold)

  // 缺席之三：分母不足，硬下界擋下——不論 CI 算出什麼都不可信（#181 決定 3）。
  if (n < MIN_DENOMINATOR) {
    const hist = computeHistory(rule, history, 'absent', bundleDate, obs, n)
    return { ...base, obs, n, fired: false, gap, state: 'absent', blockedBy: 'insufficient-n', ...hist }
  }

  const [lo, hi] = wilsonInterval(obs, n)
  const state = classify(rule.dir, lo, hi, rule.threshold)
  const hist = computeHistory(rule, history, state, bundleDate, obs, n)

  // 閘門：actionable / trusted 兩者都不進待辦，但都出現在回傳裡，且保留真實統計狀態
  // （#181 決定 5、#183 決定 4）。actionable 優先於 trusted，沿用 #181 `fire()` pseudocode 的檢查順序。
  // 年資閘門不擋——streak 描述的是統計狀態的歷史，不是待辦資格，一條規則被 trusted:false 擋下仍然
  // 看得出「它已經燒多久了」，供 ⚑ 埋點待修徽章旁邊參考用。
  if (!rule.actionable) {
    return { ...base, obs, n, fired: false, gap, state, blockedBy: 'not-actionable', ...hist }
  }
  if (!rule.trusted) {
    return { ...base, obs, n, fired: false, gap, state, blockedBy: 'not-trusted', ...hist }
  }

  return { ...base, obs, n, fired: state === 'fire', gap, state, ...hist }
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
 * 吃當期 bundle + 歷史趨勢 + 規則表，吐出全部規則的判定。
 *
 * `trends` 用完整展開後的 id（含 `pick` 回傳陣列時的 `${rule.id}:${suffix}`）查對應的歷史序列，
 * 查無對應 id 視同沒有歷史（`streak`/`streakCensored`/`lastFire` 落在空陣列的自然結果，不拋錯）
 * ——新規則或呼叫端還沒餵歷史都是合法輸入。
 *
 * `pick` 回傳陣列的規則（漏斗轉換、Web Vitals）展開成多筆判定，`id` 變成 `${rule.id}:${suffix}`、
 * `label` 帶上 ` · ${suffix}` 後綴；回傳空陣列時仍產生一筆 `state: 'absent'` 判定（指標整條消失）。
 */
export function evaluate(bundle: MetricsBundle, trends: RuleTrends, rules: Rule[]): Verdict[] {
  const bundleDate = bundle.window.endDate
  const verdicts: Verdict[] = []
  const historyFor = (id: string): TrendPoint[] => trends[id] ?? []

  for (const rule of rules) {
    const picked = rule.pick(bundle)

    if (Array.isArray(picked)) {
      if (picked.length === 0) {
        verdicts.push(buildVerdict(rule, rule.id, rule.label, bundleDate, undefined, historyFor(rule.id)))
        continue
      }
      picked.forEach((p, idx) => {
        const suffix = p.suffix ?? String(idx)
        const id = `${rule.id}:${suffix}`
        verdicts.push(buildVerdict(rule, id, `${rule.label} · ${suffix}`, bundleDate, p, historyFor(id)))
      })
      continue
    }

    verdicts.push(buildVerdict(rule, rule.id, rule.label, bundleDate, picked, historyFor(rule.id)))
  }

  return sortVerdicts(verdicts)
}

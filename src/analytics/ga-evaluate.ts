// src/analytics/ga-evaluate.ts
//
// 「本期待辦」判定引擎：吃單期 `MetricsBundle` + 歷史 `(obs, n)` 趨勢 + 門檻表，吐出**全部**規則的
// 判定，不只觸發者。純函式，無 Vue 依賴——見 #183 決議、spec #194 §B1。取前 3、摺疊、降級、空狀態
// 選取全部留給呈現層（GaDashboardView 等），這裡不做取捨。
//
// 年資（streak）與熄滅（跨期認定「已解決」）見 #205（#191 決議）：
// - state 恆為四態之一：fire（觸發）/ grey（灰帶）/ clear（好側，且已認定熄滅）/
//   absent（資料缺席：validFrom 未到、門檻尚未訂定、指標整條消失、或分母不足）。
// - grey **帶遲滯**（#191 決定 3、#193 決定 4 實測驗證）：「灰帶＝維持前一個有定論的狀態」，不是
//   單期記憶體全空的統計快照。曾經 fire 過、CI 之後跨回門檻（lo 掉到 threshold 之下但還沒到
//   `hi < threshold` 的全熄滅）仍顯示 `state: 'fire'`——這正是 #193 對
//   `misuse_single_recipe_in_batch` 的實測：07-30 Wilson 下界 7.69% < 8.0% 門檻（單看當天是
//   grey），但因為 06-19 首次點亮後從未真正跌到 `hi < threshold`，整段序列靠 latch 持續顯示
//   fire。從未 fire 過的 grey 則維持顯示 grey，不會被誤讀成 clear。只有 CI **整段**落回好側
//   （`hi < threshold`／`lo > threshold`，依 dir）才是真正的熄滅，遲滯到此為止——這一步不新增
//   任何額外的滯窗/確認期參數，就是 #181 決定 3 那個 Wilson 規則本身的鏡像。
// - streak/streakCensored/lastFire 是跨期欄位，靠呼叫端傳入的 `trends`（每條規則的歷史
//   `(obs, n)` 序列，不含當期）正向走訪算出（同一次走訪也用來決定遲滯後的 state，兩者共用同一套
//   「有定論狀態」記憶）。「資料缺席」與「分母不足」都不算熄滅、也不累計 streak——這兩者在歷史
//   序列裡一律以 `dayState() === 'absent'` 中止當日的 fire 認定，也**不更新**遲滯記憶（既不會把
//   state 誤判成 clear，也不會讓 streak 假裝連續下去，但不會抹掉「它先前有沒有燒過」這件事，
//   後面若接到 grey 天仍可能透過更早的 fire 記憶繼續 latch——absent 是「不知道」不是「已解決」）。

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
 * 依規則的 `dir`/`threshold` 分類單一歷史日的**原始**統計狀態（尚未套遲滯），供 `walkMomentum()`
 * 正向走訪用。呼叫端必須保證 `rule.threshold !== undefined`（`buildVerdict()` 在門檻缺席時完全不
 * 呼叫這條路徑）。
 *
 * `null`（缺席）與 `n < MIN_DENOMINATOR`（分母不足）都回 `'absent'`——與當期 `buildVerdict()` 的
 * 判斷是同一把尺，理由同上：這兩種都不可被 streak 走訪誤讀為「連續」或「熄滅」。
 */
function historicalDayState(rule: Rule, point: TrendPoint): VerdictState {
  if (point === null) return 'absent'
  if (point.n < MIN_DENOMINATOR) return 'absent'
  const [lo, hi] = wilsonInterval(point.obs, point.n)
  return classify(rule.dir, lo, hi, rule.threshold!)
}

/**
 * 把「原始」單期統計狀態套上遲滯，得到**顯示用**的 state（#191 決定 3、#193 決定 4）。
 *
 * 只有 `raw === 'grey'` 會被遲滯改寫：曾經有過定論（`lastConclusive === 'fire'`）就繼續顯示
 * `'fire'`，否則維持顯示 `'grey'`（從未 fire 過，不會被誤讀成 clear）。`fire`／`clear`／`absent`
 * 三者本身就是「當期定論」，不受歷史動能影響——`clear` 是 CI 整段落回好側的當期事實，遲滯不會
 * 攔住熄滅；`absent` 一律照實顯示缺席，不管歷史動能是什麼（見檔頭「absent 是不知道不是已解決」）。
 */
function applyHysteresis(raw: VerdictState, lastConclusive: 'fire' | 'clear' | undefined): VerdictState {
  if (raw !== 'grey') return raw
  return lastConclusive === 'fire' ? 'fire' : 'grey'
}

/** `walkMomentum()` 正向走訪到「當期開始前」為止累積的動能。 */
interface Momentum {
  /** 最近一次「有定論」（原始 fire 或原始 clear）是哪一種；grey／absent 都不更新它——這就是
   * 「灰帶＝維持前一個有定論的狀態」的具體實作。從未見過定論時為 `undefined`。 */
  lastConclusive: 'fire' | 'clear' | undefined
  /** 走到 `history` 最後一天為止的連續「顯示為 fire」天數（遲滯後）。 */
  streak: number
  lastFire: Verdict['lastFire']
}

/**
 * 正向（時間升冪）走訪 `history`，逐天套用 `applyHysteresis()`，累積遲滯記憶、streak、lastFire——
 * 三者共用同一次走訪，理由是 streak 本身就是「顯示為 fire 的連續天數」，必須先知道每一天遲滯後
 * 顯示什麼，才能正確計數（純看原始 fire/grey/clear 會在遲滯生效的天數上少算，見檔頭 #193 案例）。
 */
function walkMomentum(rule: Rule, history: TrendPoint[]): Momentum {
  let lastConclusive: 'fire' | 'clear' | undefined
  let streak = 0
  let lastFire: Verdict['lastFire']
  for (const point of history) {
    const raw = historicalDayState(rule, point)
    const effective = applyHysteresis(raw, lastConclusive)
    if (raw === 'fire' || raw === 'clear') lastConclusive = raw
    if (effective === 'fire') {
      streak++
      if (point !== null) lastFire = { date: point.date, val: point.n > 0 ? point.obs / point.n : 0 }
    } else {
      streak = 0
    }
  }
  return { lastConclusive, streak, lastFire }
}

/**
 * 年資（streak）、熄滅留痕（lastFire）與遲滯後的顯示 state——#191 決定 2/3、#193 決定 4。
 *
 * 用 `walkMomentum(rule, history)` 算出「當期開始前」的動能，再把當期的**原始**狀態
 * `rawToday` 套 `applyHysteresis()` 得到最終顯示的 `state`。`state === 'fire'` 時
 * `streak = momentum.streak + 1`、`lastFire` 更新為當期；否則 `streak` 歸零、`lastFire` 沿用
 * 走訪到的最近一次 fire（可能是很久以前——即使當期是 `absent`，仍可能找得到「上次量得到時它有沒有
 * 燒過」，這是純粹的歷史事實陳述，不代表「現在正常」，是否顯示由呈現層決定）。
 *
 * `streakCensored`：`momentum.streak` 走完整段提供的 `history` 仍等於 `history.length`（從第一筆
 * 提供的資料起就沒斷過），代表真實 streak 只會更長——這是 `trends` 只存有限視窗（production 為 28
 * 天）時的必然截斷，不是統計上的懸而未決。`history` 為空陣列時兩者皆為 0，也視為 censored（完全
 * 沒有更早的資料可以否證「更早以前就開始燒了」）。
 */
function computeHistory(
  rule: Rule,
  history: TrendPoint[],
  rawToday: VerdictState,
  bundleDate: string,
  obs: number | null,
  n: number | null,
): { state: VerdictState; streak: Verdict['streak']; streakCensored: Verdict['streakCensored']; lastFire: Verdict['lastFire'] } {
  const momentum = walkMomentum(rule, history)
  const state = applyHysteresis(rawToday, momentum.lastConclusive)

  if (state === 'fire') {
    return {
      state,
      streak: momentum.streak + 1,
      streakCensored: momentum.streak === history.length,
      lastFire: { date: bundleDate, val: n && n > 0 ? (obs ?? 0) / n : 0 },
    }
  }
  return { state, streak: 0, streakCensored: false, lastFire: momentum.lastFire }
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
  // absent 的共用形狀：沒有門檻就沒有「fire」的定義，state 恆 absent、streak/lastFire 恆空；
  // 門檻已訂的其餘 absent 分支（validFrom 未到、指標消失、分母不足）改呼叫 `computeHistory()`——
  // `rawToday: 'absent'` 進去，`applyHysteresis('absent', ...)` 原樣回傳 `'absent'`（absent 不受
  // 遲滯影響，見檔頭），但仍會正向走訪歷史算出 lastFire（「上次量得到時它有沒有燒過」與當期缺席
  // 與否無關）。
  const noHistory = { state: 'absent' as const, streak: 0, streakCensored: false, lastFire: undefined } as const

  // 缺席之一：日期早於 validFrom（維度尚未註冊 / 尚在填窗期）。
  if (rule.validFrom !== undefined && bundleDate < rule.validFrom) {
    const hist = rule.threshold === undefined ? noHistory : computeHistory(rule, history, 'absent', bundleDate, null, null)
    return { ...base, obs: null, n: null, fired: false, gap: null, blockedBy: 'absent', ...hist }
  }

  // 缺席之二：門檻尚未訂定（#203 review）——與 validFrom 是兩個獨立的缺席理由，都要顯式擋下，
  // 不要讓魔術數字（例如 threshold: 0）代打。必須放在 computeGap() 呼叫之前：
  // `computeGap()` 用 `threshold` 當除數，任何數字佔位都可能在特定 obs/n 組合下產生
  // `NaN`/`-Infinity`，而 `gap` 會流進 `sortVerdicts()` 的比較器與 #206 空狀態的近門檻選取，
  // 一旦是 NaN 整份排序就變成未定義行為（`??` 只擋 `null`，擋不掉 `NaN`）。門檻沒訂，歷史也無從
  // 分類「哪天算 fire」，streak/lastFire 恆空——不是省略計算，是這個規則今天還沒有 fire 的定義。
  if (rule.threshold === undefined) {
    return { ...base, obs: null, n: null, fired: false, gap: null, blockedBy: 'absent', ...noHistory }
  }

  // 缺席之三：指標整條從 bundle 消失（選用性欄位缺席，或陣列裡找不到對應列）。
  if (pick === undefined) {
    const hist = computeHistory(rule, history, 'absent', bundleDate, null, null)
    return { ...base, obs: null, n: null, fired: false, gap: null, blockedBy: 'absent', ...hist }
  }

  const { obs, n } = pick
  const gap = computeGap(rule.dir, obs, n, rule.threshold)

  // 缺席之三：分母不足，硬下界擋下——不論 CI 算出什麼都不可信（#181 決定 3）。
  if (n < MIN_DENOMINATOR) {
    const hist = computeHistory(rule, history, 'absent', bundleDate, obs, n)
    return { ...base, obs, n, fired: false, gap, blockedBy: 'insufficient-n', ...hist }
  }

  const [lo, hi] = wilsonInterval(obs, n)
  const rawToday = classify(rule.dir, lo, hi, rule.threshold)
  const hist = computeHistory(rule, history, rawToday, bundleDate, obs, n)
  const { state } = hist

  // 閘門：actionable / trusted 兩者都不進待辦，但都出現在回傳裡，且保留真實統計狀態
  // （#181 決定 5、#183 決定 4）。actionable 優先於 trusted，沿用 #181 `fire()` pseudocode 的檢查順序。
  // 年資閘門不擋——streak 描述的是統計狀態的歷史，不是待辦資格，一條規則被 trusted:false 擋下仍然
  // 看得出「它已經燒多久了」，供 ⚑ 埋點待修徽章旁邊參考用。
  if (!rule.actionable) {
    return { ...base, obs, n, fired: false, gap, blockedBy: 'not-actionable', ...hist }
  }
  if (!rule.trusted) {
    return { ...base, obs, n, fired: false, gap, blockedBy: 'not-trusted', ...hist }
  }

  return { ...base, obs, n, fired: state === 'fire', gap, ...hist }
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

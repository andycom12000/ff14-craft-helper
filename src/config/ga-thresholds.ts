// src/config/ga-thresholds.ts
//
// 「本期待辦」門檻表。selector（`pick`）是函式，其餘全是資料——這個形狀來自 #183 的設計決議，
// 不是隨手挑的。判定引擎見 `src/analytics/ga-evaluate.ts`。
//
// 門檻數值是靠實測 71 份歷史快照與探測 GA4 得出的，**不要自行調整或重新論證**。有疑義時去讀
// wayfinder 地圖 #179 索引的決策票（#180–#193）resolution comment，不要在這裡重新推導數字。
// 也**不做 UI 可調門檻**——見 spec #194 的 Out of Scope：門檻裡有刻意訂的雄心值（例如 BOM 交棒率
// 訂在 15%，歷史最高才 12%），做成滑桿等於給了一個把紅燈調掉的旋鈕。

import type { MetricsBundle } from '@/types/ga-snapshot'

export type Category = 'A' | 'B' | 'C' | 'D'
export type Direction = 'high' | 'low'

/**
 * 固定類別優先序（#181 決定 4，#193 resolution comment 重申「C 類是 #181 決定 4 的優先序 3」）：
 *
 *   A 修 bug / 補資料洞  （優先序 1）
 *   B UX 摩擦 / 轉換     （優先序 2）
 *   C 決定下一個功能     （優先序 3）
 *   D 效能優化           （優先序 4）
 *
 * 注意：spec #194 §B4 與 issue #204 body 裡的排序敘述寫成「A > C > B > D」，但那與 #193 resolution
 * comment 明確標注的字面 `category: 'C'`（= 誤用類 / 決定下一個功能，優先序 3）互相矛盾，也與 #186
 * 「跨伺服器使用率／鑲嵌建議採用率」歸類「C 類新規則」矛盾。已判定為文件轉譯時的字母誤植，
 * 沿用 #181 原始決議與 #193 的字面代碼（`category: 'C'` 為誤用類、優先序 3）。
 */
export const CATEGORY_ORDER: readonly Category[] = ['A', 'B', 'C', 'D']

/**
 * 類別的可讀全名——待辦 ledger 逐條顯示用（issue #206：「分類要印全名，不能只印 `[A]`」）。與上面
 * `CATEGORY_ORDER` 注解裡的四行對照逐字同步，改一邊記得改另一邊；不要另外維護第二份措辭，也不要
 * 抄 spec #194 §B4 那處「A > C > B > D」——上面注解已經解釋過那是文件轉譯時的字母誤植，這裡跟著
 * repo 現況（#181 原始決議 + #193 resolution comment 的字面 `category` 代碼）走。
 */
export const CATEGORY_LABEL: Record<Category, string> = {
  A: '修 bug / 補資料洞',
  B: 'UX 摩擦 / 轉換',
  C: '決定下一個功能',
  D: '效能優化',
}

/** 一筆判定所需的分子分母；`suffix` 供 `pick` 回傳陣列時附加在 label 後。 */
export interface Pick {
  /** 分子。 */
  obs: number
  /** 分母。 */
  n: number
  /** 展開成多筆判定時的後綴（漏斗名 / vital 名）。未提供時 evaluate() 用陣列索引代替。 */
  suffix?: string
}

export interface Rule {
  id: string
  cat: Category
  dir: Direction
  /**
   * 0–1 的比例門檻。`undefined` = 門檻尚未訂定（例如新規則管線先落地、真正的數字要等 SOP 掃描歷史
   * 序列才訂得出來，#203）——顯式缺席狀態，不要用 0 或其他數字魔術編碼「還沒訂」，那會讓
   * `computeGap()`（`ga-evaluate.ts`）除以門檻時產出 `NaN`/`-Infinity`，污染排序與空狀態選取
   * （#203 review）。`buildVerdict()` 在算 gap 之前就攔截 `threshold === undefined`，直接判
   * `state: 'absent'`，行為與 `validFrom`／`pick()` 回傳 `undefined` 的既有缺席路徑一致：有人把
   * 真正的數字填進來，規則自動生效，不需要同時拿掉任何佔位值或翻任何旗標。
   */
  threshold?: number
  /**
   * 從 MetricsBundle 取 {obs, n}。可回傳單筆、陣列（漏斗轉換 / Web Vitals 這類「一條規則、多筆判定」）
   * 或 undefined（指標整條從 bundle 消失，例如選用性欄位缺席，或陣列裡找不到對應列）。
   */
  pick: (bundle: MetricsBundle) => Pick | Pick[] | undefined
  label: string
  /** 手寫的下一步——產品判斷，不可計算。 */
  nextStep: string
  /** deep-link 到承載細節的既有圖表區塊。 */
  anchor: string
  /** false = 永久觀測層，畫得清楚但永不進待辦。 */
  actionable: boolean
  /** false = 埋點／pipeline 待修，數字現在不可信；修好即刪這個旗標。 */
  trusted: boolean
  /** 早於此日的資料判為 absent，不視為熄滅（#193 決定 2）。留空 = 全期有效。 */
  validFrom?: string
  /** 訂門檻的依據，供維護者參考，不上 UI。 */
  note?: string
}

export const GA_THRESHOLD_RULES: Rule[] = [
  // ---------------------------------------------------------------------
  // A · 修 bug / 補資料洞（優先序 1）
  // ---------------------------------------------------------------------
  {
    id: 'batch.failRate',
    cat: 'A',
    dir: 'high',
    threshold: 0.1,
    pick: (b) => ({ obs: b.glance.batch.fails, n: b.glance.batch.starts }),
    label: '批量失敗率',
    nextStep: '看失敗原因分佈，找出主導那一項',
    anchor: '#chart-failures',
    actionable: true,
    trusted: true,
    validFrom: '2026-06-19',
    note: '歷史最佳 10.8% —— 訂在自己的最佳紀錄（#181 決定 2 / 門檻定義表 A 類）',
  },
  {
    id: 'solver.failRate',
    cat: 'A',
    dir: 'high',
    threshold: 0.02,
    pick: (b) => {
      // `human*` 欄位是 v2-additive optional（#200）——gh-data/history/ 下的舊快照沒有這幾欄
      // 且不會回填，guard 讓那些快照落到 `state: 'absent'`，不讓 evaluate() 的迴圈整圈拋錯
      // （#201 review B2 踩過的坑，這裡沿用同一個防守寫法）。
      const { humanFails, humanStarts } = b.glance.solver
      if (humanFails == null || humanStarts == null) return undefined
      return { obs: humanFails, n: humanStarts }
    },
    label: 'solver 失敗率',
    nextStep: '看失敗原因（reason）分佈，找出主導的失敗類型',
    anchor: '#chart-funnels',
    actionable: true,
    trusted: false,
    note:
      '分母已切到人類面（#200）：`isMachineSolveRow()` 判別式（`craft_kind` 缺席 `(not set)`/`\'\'`' +
      ' OR `source === \'machine\'`）排除 batch-optimizer / buff-recommender / meld-advisor 的機器迴圈後，' +
      '改吃 `humanFails` / `humanStarts`，解掉與完成率共用的污染分母（#181 對地圖意涵第 3 點、#183 決定 4、' +
      '#187）。但 trusted 仍為 false，卡住的是分子不是分母：`solver_failed` 從沒帶過 taxonomy（#189 決定 3），' +
      '目前每一筆 `solver_failed` 都會被判成機器，`humanFails` 結構上恆為「無法歸戶」——' +
      '`buildSolverHumanGlance()`（ga-analyze.mjs）偵測到這個情況時回傳 `undefined` 而非 0，讓這條規則落在' +
      '`state: absent`，不會偽裝成「失敗率 0%」的假綠燈（真實 28d 探測：obs=0/n=14572，若沒有這層防守會' +
      '誤報 clear——見 #200 review 抓到的迴歸）。`n ≥ 30` 這個下界在這裡擋不住：`n` 是 `humanStarts`（已破萬），' +
      '硬下界從一開始就過了，真正卡住的是資料本身能不能歸戶，不是樣本量。' +
      '解除條件：#198 的 client 修正部署上線、`solver_failed` 開始帶 `source`/`craft_kind` 後，' +
      '`humanFails` 會立刻停止回傳 `undefined`（不需要等 28 天，新事件即時生效）；但 `trusted` 仍要等維護者' +
      '手動確認部署已生效、資料看起來合理後才翻成 `true`，不會自動解鎖。',
  },
  {
    id: 'api.universalisRealFailRate',
    cat: 'A',
    dir: 'high',
    threshold: 0.02,
    pick: (b) => {
      // `glance.api` is optional (v2-additive) — absent on all 77 pre-#201
      // history snapshots, which are frozen and will never be backfilled.
      // Guard so #205 feeding one of those in resolves to `state: 'absent'`
      // instead of throwing inside evaluate()'s loop.
      const api = b.glance.api
      if (!api) return undefined
      return { obs: api.universalisRealFails, n: api.universalisCalls }
    },
    label: 'universalis 真故障率',
    nextStep: '看端點失敗分佈，確認是特定端點集中故障還是全站性連線問題',
    anchor: '#chart-api',
    actionable: true,
    trusted: true,
    note:
      '分子分母同源取 `universalis_fetch`（ok=false&status=0 / 全部），刻意不用 `apiFailures`（走 ' +
      '`api_failure`）——兩條流不同步 ~3.5%（#189 決定 3）。404「查無掛單」是合法的空掛單回應不是故障，' +
      '併入分子會把率誇大到 5.91% 量級，故獨立成 `universalisNoListing` 留作常駐註腳，不進分子（#201）。' +
      '門檻 >2% 出自 #181 A 類門檻表；#189 探測值 609/30741 = 1.98%，Wilson CI [1.83%, 2.14%]，CI 跨過' +
      '門檻不觸發；pipeline 實跑另得 600/34006 ≈ 1.76%，量體不同但結論一致（不觸發）。',
  },

  // ---------------------------------------------------------------------
  // B · UX 摩擦 / 轉換（優先序 2）
  // ---------------------------------------------------------------------
  {
    id: 'batch.completeRate',
    cat: 'B',
    dir: 'low',
    threshold: 0.85,
    pick: (b) => ({ obs: b.glance.batch.completes, n: b.glance.batch.starts }),
    label: '批量完成率',
    nextStep: '看漏斗哪一步流失最多，決定要不要加提示或簡化步驟',
    anchor: '#chart-funnels',
    actionable: true,
    trusted: true,
    note: '歷史 p75 85.8% —— 做得到過（#181 決定 2 / 門檻定義表 B 類）',
  },
  {
    // #207：首屏 RegionSplitLedger「Solver 吞吐」列的趨勢三件組（當期值 + WoW + 7d sparkline）
    // 需要一個掛在 `completePct` 本身的規則——`solver.failRate`（上方 A 類）分母已切到人類面
    // （#200），但 `completePct` 沿用的仍是含機器迴圈的 `starts`/`completes`（#181 探測：71 天有
    // 63 天 >100%）。這條規則刻意 **不** 重新計算人類分母（那是 `solver.failRate` 的責任，兩者是
    // 兩個不同的污染修復——分子污染 vs 分母污染，見該規則的長註解），而是原封不動地把這個已知
    // 有問題的數字掛進判定引擎，讓 `trusted:false` 徽章有一個真正對應的規則可以推導（#184 決議：
    // 「71 天的 28d 序列中位數是 101.4%……這是 trusted:false 徽章該掛在那裡的直接證據」）。
    // `anchor` 沿用 `solver.failRate` 的 `#chart-funnels`——同一張漏斗圖上的 SOLVER_COMPLETE 節點。
    // 刻意不加進 `flag-derive.ts` 的 `CHART_METRICS['chart-funnels']`（該檔案的既有註解明講
    // "solver.completePct……從未被判定過,所以不參與這裡的可信/不可信推導"）——本規則只服務
    // RegionSplitLedger 的趨勢顯示，擴大 chart-funnels 徽章的判定粒度是另一張票的範圍。
    id: 'solver.completePct',
    cat: 'B',
    dir: 'low',
    threshold: 0.95,
    pick: (b) => ({ obs: b.glance.solver.completes, n: b.glance.solver.starts }),
    label: 'Solver 完成率',
    nextStep: '分母含機器迴圈污染，完成率可能失真——待人類分母（#200 同款過濾）套用到這條規則後解掛',
    anchor: '#chart-funnels',
    actionable: true,
    trusted: false,
    note:
      '門檻沿用 #184 原型（`solverCompletePct`，th 0.95 dir low）。trusted:false：分母含 batch-optimizer/' +
      'buff-recommender/meld-advisor 的機器迴圈（同 `solver.failRate` 分母污染的成因），71 天 28d 序列' +
      '中位數 101.4%、p90 105.3%（#181 探測）——這條規則的存在本身就是那個污染的直接證據，不是待修的' +
      '前提。',
  },
  {
    id: 'bom.handoffRate',
    cat: 'B',
    dir: 'low',
    threshold: 0.15,
    pick: (b) => ({ obs: b.glance.bom.sentToBatch, n: b.glance.bom.calculates }),
    label: 'BOM→批量交棒率',
    nextStep: 'BOM 算完後沒有進批量的入口？看漏斗',
    anchor: '#chart-drops',
    actionable: true,
    trusted: true,
    note: '雄心值，歷史最高才 12%——持續亮代表這條旅程真的斷了（#181 決定 2 / 門檻定義表 B 類）',
  },
  {
    id: 'solver.macroCopyRate',
    cat: 'B',
    dir: 'low',
    threshold: 0.1,
    pick: (b) => {
      // `humanCompletes` 是 v2-additive optional（#200）——guard 同 solver.failRate 上方。
      const n = b.glance.solver.humanCompletes
      if (n == null) return undefined
      return { obs: b.simulatorFunnel.macroCopy.count, n }
    },
    label: '巨集複製率',
    nextStep: '巨集複製率低代表模擬器產出沒被使用，看模擬器→巨集匯出漏斗找斷點',
    anchor: '#chart-sim',
    actionable: true,
    trusted: false,
    note:
      '分母已切到人類面（#200，`humanCompletes`），不再用含機器迴圈的 `solver.completes`——率因此從' +
      '稀釋過的 2.96% 上跳到人類基準（#189 已實測）。trusted 仍為 false：卡在分子，不是分母——#180 第 5 項' +
      '的三條複製路徑合併（#198）已 merge 但尚未 deploy，需再等 28 天暗期資料重新累積才能解掛（#187 ⚑ ' +
      '解掛時序總表）。',
  },
  {
    id: 'funnel.pageDropoff',
    cat: 'B',
    dir: 'low',
    threshold: 0.3,
    pick: (b) => b.q4Funnels.filter((f) => f.flag !== 'noise').map((f) => ({ obs: f.to, n: f.from, suffix: f.name })),
    label: '漏斗轉換',
    nextStep: '看哪一步驟流失最多，決定要不要加提示或簡化該步驟',
    anchor: '#chart-drops',
    actionable: true,
    trusted: true,
    note: '沿用現行 `ga-analyze.mjs` `rateVerdict` 的 danger 界（#181 決定 2 / 門檻定義表 B 類）',
  },

  // ---------------------------------------------------------------------
  // C · 決定下一個功能（優先序 3）
  // ---------------------------------------------------------------------
  {
    id: 'misuse_single_recipe_in_batch',
    cat: 'C',
    dir: 'high',
    threshold: 0.08,
    pick: (b) => {
      const row = b.misuseSignals?.find((r) => r.type === 'single_recipe_in_batch')
      if (!row) return undefined
      return { obs: row.affectedUsers, n: b.glance.activeUsers.total }
    },
    label: '誤用 · 批量頁只放單一配方',
    nextStep: '批量頁只放一個配方，可能代表「批量」的多配方賣點沒被發現——評估是否需要引導或改變預設',
    anchor: '#chart-misuse',
    actionable: true,
    trusted: true,
    validFrom: '2026-06-19',
    note:
      '常亮區（邊界 8.25%）。歷史最佳 8.37% 之下——沿用 #181 batch 失敗率「訂在自己的最佳紀錄」先例，' +
      '宣告這是慢性裂縫、不是本期惡化（#193 決定 1）。靠 #191 遲滯維持點亮，序列若從今天重新起算不會' +
      '重新點亮；熄滅條件 = rate 掉到約 6.2%（比歷史最佳再低 2.2pp）。',
  },
  {
    id: 'misuse_large_queue_in_simulator',
    cat: 'C',
    dir: 'high',
    threshold: 0.03,
    pick: (b) => {
      const row = b.misuseSignals?.find((r) => r.type === 'large_queue_in_simulator')
      if (!row) return undefined
      return { obs: row.affectedUsers, n: b.glance.activeUsers.total }
    },
    label: '誤用 · 模擬器塞入大量佇列',
    nextStep: '模擬器塞大量佇列，可能是想做批量規劃但不知道有批量功能——評估要不要在模擬器裡導流',
    anchor: '#chart-misuse',
    actionable: true,
    trusted: true,
    validFrom: '2026-06-19',
    note:
      '#181 原值，40 天實測落在過渡區（2.25%~4.25%）正中央，不動（#193 決定 1）。三條誤用規則裡唯一有' +
      '真實動態範圍的一條，40 天只亮 07-29/07-30 那波真 spike。',
  },
  {
    id: 'misuse_bom_without_quantity',
    cat: 'C',
    dir: 'high',
    threshold: 0.05,
    pick: (b) => {
      const row = b.misuseSignals?.find((r) => r.type === 'bom_without_quantity')
      if (!row) return undefined
      return { obs: row.affectedUsers, n: b.glance.activeUsers.total }
    },
    label: '誤用 · BOM 未填數量',
    nextStep: 'BOM 沒填數量代表只是概略試算，評估是否要簡化數量輸入或給預設值',
    anchor: '#chart-misuse',
    actionable: true,
    trusted: true,
    validFrom: '2026-06-19',
    note:
      '常亮區（邊界 5.75%）。歷史最佳 4.66% 之上 0.34pp，靠 #191 遲滯維持點亮（#193 決定 1）。' +
      '熄滅條件 = rate 掉到約 3.6%。',
  },
  {
    // #203：兩條「決定下一個功能」規則的管線就位，門檻數字本票**不訂**（票面明講，SOP 訂法見
    // #194：掃 0.25pp × 跑對稱 CI 遲滯 × 標明落在常亮／過渡／全暗哪段——那是後續 SOP 掃描票的
    // 工作，不是本票）。以「門檻待資料」的 placeholder 形式存在，兩個獨立的缺席理由都要顯式表達：
    //
    //   - `validFrom: '2026-08-28'`——`cross_server` 於 2026-07-31 人工註冊（#186 決定 5 /
    //     #189 決定 2），28 天暗期滿窗日。同一日期已寫死在 GaDashboardView.vue 的
    //     `chart-adoption` placeholder（`resolves-on="2026-08-28"`），這裡沿用同一份決議，不是
    //     另訂。暗期內（`bundleDate < validFrom`）判定落在 `state: 'absent'`（`ga-evaluate.ts:
    //     112-114`），不是熄滅也不是觸發。
    //   - `threshold` 刻意省略（不是設成 0）——「門檻尚未訂定」是與「維度暗期」正交的另一個缺席
    //     理由，兩者都該存在。早期版本用 `threshold: 0` 搭 `dir: 'low'` 當「數學上不可能觸發」的
    //     佔位值，被 review 抓到兩個缺陷：(1) `computeGap()`（`ga-evaluate.ts`）用 `threshold`
    //     當除數，`0` 會產生 `NaN`/`-Infinity`，污染 `sortVerdicts()` 的排序與 #206 空狀態的近門檻
    //     選取——而 `meldApplies`/`meldAdvisorRuns` 今天實測都是 0，2026-08-28 一到 `rate === 0`
    //     必然發生，不是邊角情境；(2) `trusted: false` 只擋得住 `fired`，擋不住 `state`——暗期一過
    //     `classify()` 就會把這兩條規則判成 `state: 'clear'`，一個從沒人訂過門檻的指標卻在儀表板
    //     上顯示「一切正常」，正是 #200 review 剛修掉的那類假訊號。現在 `threshold: undefined` 由
    //     `buildVerdict()` 在算 gap 之前直接攔截，回 `state: 'absent'`（見該函式 validFrom 檢查旁的
    //     分支）——自癒式設計：有人把真正的門檻數字填進來，規則自動生效，不需要同時拿掉任何
    //     佔位值或翻任何旗標。
    //   - `trusted: false`——沿用 solver.failRate / solver.macroCopyRate 的既有模式（本檔上方），
    //     即使日後 `threshold` 補上了，仍需維護者手動確認 SOP 掃描出的數字合理才翻成 true。
    id: 'adoption.crossServerRate',
    cat: 'C',
    dir: 'low',
    pick: (b) => {
      // `glance.adoption` 整條是 v2-additive optional（brand-new key，pre-#203 快照沒有這個
      // 欄位且不會回填）——guard 用 `?? {}` 展開，同 solver.failRate 上方的坑（#201 review B2）。
      const { crossServerBatches, batchStarts } = b.glance.adoption ?? {}
      if (crossServerBatches == null || batchStarts == null) return undefined
      return { obs: crossServerBatches, n: batchStarts }
    },
    label: '跨伺服器使用率',
    nextStep: '門檻待 SOP 掃描後訂定；資料到位後看使用趨勢，評估跨伺服器功能要不要加強引導或維持現狀',
    anchor: '#chart-adoption',
    actionable: true,
    trusted: false,
    validFrom: '2026-08-28',
    note:
      '分子分母同源取 `batch_optimization_start`（#189 決定 2；`cross_server:true` / 全部），' +
      '刻意不共用 `glance.batch.starts`（語意獨立，見票面 #203）。門檻數字本票不訂，`threshold`' +
      '刻意留空（不是 0）——見上方規則定義前的長註解。',
  },
  {
    id: 'adoption.meldAdvisorRate',
    cat: 'C',
    dir: 'low',
    pick: (b) => {
      // 同上：`glance.adoption` 整條 optional，guard 同一種寫法。
      const { meldApplies, meldAdvisorRuns } = b.glance.adoption ?? {}
      if (meldApplies == null || meldAdvisorRuns == null) return undefined
      return { obs: meldApplies, n: meldAdvisorRuns }
    },
    label: '鑲嵌建議採用率',
    nextStep: '門檻待 SOP 掃描後訂定；資料到位後看建議產出到套用的轉換，評估要不要優化建議呈現或引導套用',
    anchor: '#chart-adoption',
    actionable: true,
    trusted: false,
    validFrom: '2026-08-28',
    note:
      '分子取 `gearset_apply_all` 且 `fields ∈ { meld_delta, meld_delta_single }`（鑲嵌建議的兩個' +
      '寫入分支，#189 決定 2）；分母改用新事件 `meld_advisor_run`（#198，事件名免註冊、不吃 28 天' +
      '暗期）——原本兩個候選分母（套用全部裝備 `gearset_apply_all` 總數 / 開啟配裝表' +
      '`gearset_sheet_open`）分屬不同動線（建議在模擬器、配裝表在另一頁），比出來的數字沒有意義，' +
      '已在 #189 決定 2 翻案（見票面 #203「⚠️ 鑲嵌採用率的分母經過一次翻案」）。門檻數字本票不訂，' +
      '`threshold` 刻意留空（不是 0）——見上方規則定義前的長註解。',
  },

  // ---------------------------------------------------------------------
  // D · 效能優化（優先序 4）—— 絆線，今天不會亮，見 #189 決定 5
  // ---------------------------------------------------------------------
  {
    id: 'vitals.good',
    cat: 'D',
    dir: 'low',
    threshold: 0.75,
    pick: (b) => b.vitals.map((v) => ({ obs: v.good, n: v.good + v.ni + v.poor, suffix: v.metric })),
    label: 'Web Vitals good%',
    nextStep: '查看是否為特定瀏覽器 / 裝置在拖累，看 SAB × 瀏覽器細分',
    anchor: '#chart-vitals',
    actionable: true,
    trusted: true,
    note:
      'Google 官方標準（#181 決定 2 / 門檻定義表 D 類）。今天 91–97% good 遠超門檻，是刻意留著的絆線——' +
      '真跌破才是該修的東西（#189 決定 5）。',
  },

  // ---------------------------------------------------------------------
  // 觀測層 · 首屏 RegionSplitLedger 專用（#207，#184 決定 3）
  //
  // `actionable: false`——永遠不進「本期待辦」，`evaluate()` 仍會吐出這些規則的判定（含
  // streak/lastFire），只是 `fired` 恆為 false（`buildVerdict()` 的 not-actionable 閘門）。
  // 存在的唯一理由是首屏 ledger 的趨勢三件組（當期值 + WoW + 7d sparkline）需要一個 rule id
  // 才能掛進 `trends.json`（`ga-build-trend.mjs` 逐條 `GA_THRESHOLD_RULES` 收集歷史序列，不是
  // 另開一條平行管線）——SAB 不可用率正是 #184 決議原文點名「唯一畫出完整故事的那條線」的
  // 觀測層示範案例，但 #205 當時因為「沒有圖可以掛這條規則的 anchor」而沒有收進來（見
  // `ga-evaluate.regression.spec.ts` 的 `test.sabUnavailRate7d` ad-hoc 規則的檔頭註解）——
  // #207 補上真正的圖（RegionSplitLedger 本身）之後，這裡把它們轉正。
  //
  // `threshold` 刻意留空（不是某個永遠不會被跨過的魔術數字）：這三條在 #184 原型（`build-proto.mjs`
  // 的 META 表）裡就是 `th: null`——它們不是「門檻還沒訂」，是「這個指標本來就不打算被判定，只
  // 留走勢」，跟 C 類 `adoption.*` 兩條「暗期待資料」的空白門檻語意不同，但共用同一個
  // `threshold === undefined → state: 'absent'` 缺席路徑（`buildVerdict()`）——`evaluate()` 不需要
  // 分辨這兩種「留空」的動機，呈現層（`region-ledger-trend.ts`）本來就繞過 `Verdict.obs/n`
  // （threshold 缺席時恆為 null，見 `buildVerdict()` 的「缺席之二」分支），直接呼叫這幾條規則自己的
  // `pick()` 取當期值，`Verdict` 只用來讀 `state`（這裡恆為 `'absent'`，呈現層對應成「不上色，
  // 只留走勢」，正是 #184 決議「觀測層指標……不上色、不判定，只留走勢」那句話）。
  //
  // `anchor` 一律指向既有圖表——這幾條永不進待辦、`anchor` 因此永遠不會被 `TodoRowLine.vue`
  // 渲染成 deep-link，純粹是為了滿足 `ga-thresholds.spec.ts` 的「anchor 對齊實際 chart id」回歸
  // 測試與型別要求，選最貼題的既有圖：`activeUsers.*` 指首屏之外唯一討論使用者行為的頁面圖
  // （`#chart-pages`）；`infra.sabUnavailableRate` 指 `#chart-failures`——`FailuresBar` 的資料模型
  // 本就包含 `event: 'wasm', reason: 'SAB unavailable'` 這一類列（見 `charts-v2-smoke.test.ts` 的
  // fixture），SAB 失敗本來就是那張圖涵蓋的故事之一。
  {
    // 活躍使用者原始計數——不是比例，`pick()` 的 `n: 1` 是刻意的形狀妥協：`Pick`/`TrendPoint`
    // 全庫只有 `{obs, n}` 一種形狀（#191 決定 5：Wilson CI 吃 `(obs, n)`），沒有「純數值、無分母」
    // 的第二種點型別。`n: 1` 讓 `obs/n === obs`（sparkline 直接讀 `obs` 當作原始計數），同時讓
    // `n < MIN_DENOMINATOR`（30）恆成立——WoW 顯著性檢定（`wowSignificant()`）與 Wilson 分類都會
    // 在算任何統計量之前就被這個硬下界擋下，不會對一個「樣本數=1」的假分母跑出無意義的信賴區間。
    // 這正是這一列的正確行為：一個原始計數本來就沒有 Wilson CI 可言，WoW 應該恆為留白，不是恰好
    // 留白。
    id: 'activeUsers.total',
    cat: 'D',
    dir: 'low',
    pick: (b) => ({ obs: b.glance.activeUsers.total, n: 1 }),
    label: '活躍使用者',
    nextStep: '',
    anchor: '#chart-pages',
    actionable: false,
    trusted: true,
    note: '純觀測——原始計數，無比例可言。#184 原型 `activeUsers`，`th: null`。',
  },
  {
    id: 'activeUsers.returningPct',
    cat: 'D',
    dir: 'low',
    pick: (b) => ({ obs: b.glance.activeUsers.returning, n: b.glance.activeUsers.total }),
    label: '回訪率',
    nextStep: '',
    anchor: '#chart-pages',
    actionable: false,
    trusted: true,
    note: '純觀測，無門檻。#184 原型 `returningPct`，`th: null`。',
  },
  {
    id: 'infra.sabUnavailableRate',
    cat: 'D',
    dir: 'high',
    pick: (b) => ({ obs: b.glance.infra.sabUnavailable, n: b.glance.activeUsers.total }),
    label: 'SAB 不可用率',
    nextStep: '',
    anchor: '#chart-failures',
    actionable: false,
    trusted: true,
    note:
      '純觀測，無門檻。#184 原型 `sabUnavailPct`，`th: null`——這條是 #184 決議原文點名「唯一畫出' +
      '完整故事的那條線」的示範案例（SAB 修復期間 7d 視窗連亮 7 天後準確安靜，見' +
      '`ga-evaluate.regression.spec.ts` 的回歸測試）。',
  },
]

// ---------------------------------------------------------------------------
// 刻意未收錄的規則（#189 已定義分子分母，但 MetricsBundle 上今天沒有對應欄位）
//
// - universalis 真故障率 —— 已於 #201 補上 `glance.api` 三欄並收進上面的規則表，不再列於此。
// - 跨伺服器使用率、鑲嵌建議採用率 —— 已於 #203 補上 `glance.adoption` 四欄並收進上面的 C 類
//   規則表（`adoption.crossServerRate` / `adoption.meldAdvisorRate`），以「門檻待資料」的
//   placeholder 存在（`trusted: false` + `validFrom: '2026-08-28'`），不再列於此。門檻數值本身
//   仍待 SOP 掃描票（見規則定義處的長註解）訂定。
//
// 等對應的 pipeline 票落地、MetricsBundle 補上欄位後，在這裡加規則即可——引擎不用動。
// ---------------------------------------------------------------------------

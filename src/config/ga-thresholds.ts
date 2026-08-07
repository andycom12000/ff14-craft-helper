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
  /** 0–1 的比例門檻。 */
  threshold: number
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
    pick: (b) => ({ obs: b.glance.solver.fails, n: b.glance.solver.starts }),
    label: 'solver 失敗率',
    nextStep: '看失敗原因（reason）分佈，找出主導的失敗類型',
    anchor: '#chart-funnels',
    actionable: true,
    trusted: false,
    note:
      '分母 `solver_start` 含機器迴圈（batch-optimizer / buff-recommender 等），且與完成率共用同一個' +
      '污染分母（#181 對地圖意涵第 3 點、#183 決定 4、#187）。等 #200（人機分離 + `glance.solver` 人類面' +
      '四欄）落地後改吃 `humanFails` / `humanStarts` 並解掛 trusted。',
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
    pick: (b) => ({ obs: b.simulatorFunnel.macroCopy.count, n: b.glance.solver.completes }),
    label: '巨集複製率',
    nextStep: '巨集複製率低代表模擬器產出沒被使用，看模擬器→巨集匯出漏斗找斷點',
    anchor: '#chart-sim',
    actionable: true,
    trusted: false,
    note:
      '#180 第 5 項：三條複製路徑只埋了一條，分子被低估。分母 `solver.completes` 也含機器迴圈，' +
      '且一旦人機分離改用 `humanCompletes`，率會從 2.96% 上跳到人類基準（#189 已實測，避免用全量分母稀釋一半）。',
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
]

// ---------------------------------------------------------------------------
// 刻意未收錄的規則（#189 已定義分子分母，但 MetricsBundle 上今天沒有對應欄位）
//
// - universalis 真故障率 —— 已於 #201 補上 `glance.api` 三欄並收進上面的規則表，不再列於此。
// - 跨伺服器使用率、鑲嵌建議採用率（C 類新規則）—— 需要 `glance.adoption`，見 #203；門檻數值
//   本身也還沒訂（#179 map「Not yet specified」，等 `cross_server` / `fields` 兩個 dim 約
//   2026-08-28 滿窗才有資料可推）。
//
// 等對應的 pipeline 票落地、MetricsBundle 補上欄位後，在這裡加規則即可——引擎不用動。
// ---------------------------------------------------------------------------

// src/components/ga-dashboard/flag-derive.ts
//
// ⚑ 埋點待修徽章的訊號來源──門檻表(GA_THRESHOLD_RULES)的 `trusted` 旗標,不是手寫在
// GaDashboardView.vue 裡的字串(spec #194 §E6 / issue #208 驗收 1)。拆除的方式是把規則的
// `trusted` 翻成 true,呼叫端(view)完全不用碰——badge 自己消失。
//
// CHART_METRICS 是「這張圖顯示了哪些門檻規則覆蓋的指標」的結構性宣告,類似 L1Item/L2Row
// 本來就要宣告 id/title 的性質,不是徽章文案本身。新增/移除一張圖顯示的指標時才改這裡;
// 規則的 `trusted` 翻轉時完全不用碰,徽章的態一/態二與文案會自動跟著變。
//
// 逐指標推導(#208 驗收 5「必須逐指標推導,不能整張圖一個布林值」):一張圖底下若還有多個
// 指標,只要有一個仍不可信就掛徽章;是否為「整張不可信」(態一)取決於同圖其餘指標是否
// 全部也都不可信,而不是憑印象整張圖判一次。

import { GA_THRESHOLD_RULES, type Rule } from '@/config/ga-thresholds'

export interface ChartMetric {
  /** 顯示給使用者的欄位名稱,會出現在徽章文案裡(#208 驗收 4「文案指名到欄位」)。 */
  label: string
  /**
   * 對應的門檻規則 id。省略 = 這個欄位目前沒有門檻規則覆蓋它(例如 ExpertCollectableMatrix
   * 逐格顯示的「完成率」——taxonomy cell 層級,MetricsBundle 沒有對應門檻),視為「未被判定過,
   * 沒有理由不信」,不會被算進不可信集合。
   */
  ruleId?: string
}

export interface ChartFlag {
  /** 徽章文案,已指名不可信欄位(態一列出全部欄位、態二只列被指名的那些)。 */
  text: string
  /** true = 態二(一半可信,虛線框、局部斜紋);false = 態一(整張不可信,實線框、整張斜紋)。 */
  partial: boolean
}

/**
 * 每張圖顯示的指標清單——決定徽章態一/態二與斜紋覆蓋範圍的唯一依據。
 *
 * 只收錄「目前至少有一個指標掛著 `trusted:false` 規則」的圖;規則全部翻成 trusted 後這裡
 * 不用清掉舊 entry——deriveChartFlag() 會自然回傳 undefined(不掛徽章)。
 *
 * chart-tool(ToolUsageByRlv)的徽章描述的是 RLV 歸戶 pipeline 問題,門檻表裡沒有對應規則
 * (不是比率門檻,無法用 trusted 表達),刻意不收錄在這裡——那顆徽章維持 #197 原樣手寫,
 * 不在本次推導範圍內(見 #208 實作報告)。
 */
export const CHART_METRICS: Record<string, ChartMetric[]> = {
  'chart-funnels': [
    { label: 'solver 失敗率', ruleId: 'solver.failRate' },
    { label: '批量完成率', ruleId: 'batch.completeRate' },
  ],
  'chart-sim': [{ label: '巨集複製率', ruleId: 'solver.macroCopyRate' }],
  'chart-matrix': [{ label: '完成率' }, { label: '巨集複製率', ruleId: 'solver.macroCopyRate' }],
}

/** 沒有掛規則的指標視為可信(未被判定過,沒有理由不信);找不到規則 id 保守判定為不可信,
 *  逼開發/測試時發現拼字錯誤,而不是悄悄放行一個掛了 flag 卻永遠不會消失的徽章。 */
function ruleTrusted(ruleId: string | undefined, rules: Rule[]): boolean {
  if (ruleId === undefined) return true
  return rules.find((r) => r.id === ruleId)?.trusted ?? false
}

/**
 * 逐指標推導一張圖的徽章態。`rules`/`metricsMap` 預設吃正式門檻表與 CHART_METRICS,測試可
 * 注入假規則陣列與假指標宣告驗證態一→態二→無徽章的過渡(#208 驗收 5),不用污染正式常數。
 *
 *  - 全部指標都不可信 → 態一(`partial: false`)
 *  - 只有部分指標不可信 → 態二(`partial: true`)
 *  - 全部可信(或這張圖沒有登記任何指標)→ undefined,不掛徽章
 */
export function deriveChartFlag(
  chartId: string,
  rules: Rule[] = GA_THRESHOLD_RULES,
  metricsMap: Record<string, ChartMetric[]> = CHART_METRICS,
): ChartFlag | undefined {
  const metrics = metricsMap[chartId]
  if (!metrics || metrics.length === 0) return undefined

  const untrusted = metrics.filter((m) => !ruleTrusted(m.ruleId, rules))
  if (untrusted.length === 0) return undefined

  const trusted = metrics.filter((m) => ruleTrusted(m.ruleId, rules))
  const untrustedNames = untrusted.map((m) => m.label).join('／')

  if (trusted.length === 0) {
    return { text: `「${untrustedNames}」埋點待修`, partial: false }
  }

  const trustedNames = trusted.map((m) => m.label).join('／')
  return { text: `僅「${untrustedNames}」埋點待修 · ${trustedNames}已可信`, partial: true }
}

/**
 * 供圖表元件精準畫局部斜紋用(#208「態二是你的範圍」)——這個 ruleId 目前是否為被指名的
 * 不可信欄位。圖表元件拿這個布林值決定要不要在自己內部畫斜紋覆蓋特定區塊,而不是整張蓋滿。
 */
export function isMetricUntrusted(
  chartId: string,
  ruleId: string,
  rules: Rule[] = GA_THRESHOLD_RULES,
  metricsMap: Record<string, ChartMetric[]> = CHART_METRICS,
): boolean {
  const metric = metricsMap[chartId]?.find((m) => m.ruleId === ruleId)
  if (!metric) return false
  return !ruleTrusted(metric.ruleId, rules)
}

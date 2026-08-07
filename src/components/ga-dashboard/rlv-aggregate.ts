// src/components/ga-dashboard/rlv-aggregate.ts
//
// RLV 前端聚合 — spec #194 §C3 / issue #209.
//
// 分組從 pipeline 移到前端：`ga-analyze.mjs` 現在只吐 raw per-rlv 直方圖
// （不分桶），這裡動態選出「排行榜」——事件數最高的 top-8 raw RLV + 一個
// 「其他」桶。⚠️ 它是排行榜不是分類法：沒有訂死的分界線，改版不需要跟著
// 重訂，零維護、零腐化。標籤走可選對照表，查不到就顯示裸數字（fail-soft，
// 刻意避開「查不到就用最接近的標籤」這種 fail-wrong 的降級——那類降級會讓
// 維運者以為看到了一個有意義的分類，其實是猜的）。
//
// 兩張圖（配方難度分佈 RecipeDifficultyKind.vue、工具偏好 ToolUsageByRlv.vue）
// 共用同一套聚合函式 `aggregateTopRlv()`，只是各自傳入不同的 rank 欄位
// （前者排 `events`，後者排 `selectCount` —— 兩者其實是同一個 GA 查詢
// `recipe_select × rlv`，pipeline 端分兩次查是既有作法，這裡不動）。

/** Dynamic leaderboard size. Not a classification boundary — just "how many
 *  rows fit before a chart gets noisy" (spec #194 §C3: "覆蓋 71%，最大格從
 *  75% 降到 32%" was measured at 8). */
export const TOP_N = 8

/** Sentinel rlv for the merged "其他" row — never collides with a real rlv
 *  (real rlv is always > 0, guaranteed by the pipeline's raw-passthrough
 *  guard — see `buildRlvRawCounts()` in ga-analyze.mjs). */
export const OTHER_RLV = -1
export const OTHER_LABEL = '其他'

/**
 * Optional rlv → human label lookup. Deliberately sparse and NOT a range
 * table — every key here must be a single verified rlv (e.g. "this is the
 * rlv of a specific well-known recipe"), never a segment guess like
 * "690–710 = 某版本". Ships empty: nobody has curated real labels yet, and an
 * empty table is a correct, honest starting point (every row falls back to
 * the raw number, which is exactly the fail-soft behaviour this ticket
 * requires — NOT a placeholder for "someone forgot to fill this in").
 */
export const RLV_LABELS: Record<number, string> = {}

/** `RLV_LABELS` 查不到就回傳裸數字字串（fail-soft）。`table` 參數只為了讓
 *  單元測試能注入本地對照表，不需要動全域常數。 */
export function labelForRlv(rlv: number, table: Record<number, string> = RLV_LABELS): string {
  return table[rlv] ?? String(rlv)
}

interface RlvRow {
  rlv: number
}

export interface AggregatedRlvRow<T extends RlvRow> {
  rlv: number
  label: string
  isOther: boolean
  row: T
}

/**
 * 從 `rows` 裡挑出依 `rankKey` 排序的 top-N rlv key 集合。
 *
 * **Tie 規則**（第 N 名與第 N+1 名同票時）：先比 `rankKey` 的值（desc），
 * 同分再比 `rlv` 數值本身（desc）——不依賴 `Array.sort` 的實作細節（stable
 * sort 剛好照輸入順序留下同分項，但輸入順序來自 Map 迭代 / GA row 順序，
 * 不是穩定的產品事實，換一次查詢就可能翻面）。高 rlv 贏 tie 只是一個任意
 * 但確定的方向——重要的是「每次跑出同一份輸入都得到同一個答案」。
 */
export function pickTopRlvKeys<T extends RlvRow>(
  rows: readonly T[],
  rankKey: keyof T,
  n: number = TOP_N,
): Set<number> {
  const sorted = [...rows].sort((a, b) => {
    const rankDiff = toNumber(b[rankKey]) - toNumber(a[rankKey])
    if (rankDiff !== 0) return rankDiff
    return b.rlv - a.rlv
  })
  return new Set(sorted.slice(0, n).map((r) => r.rlv))
}

/**
 * 動態 top-N + 其他聚合，兩張 RLV 圖共用的同一套純函式。
 *
 * - 前 N 名各自保留原始 row（外加 `label`/`isOther`），依 `rankKey` desc 排序
 *   （tie 規則同 `pickTopRlvKeys()`）。
 * - 其餘全部併入一個 `isOther: true` 的尾列，`rlv: OTHER_RLV`、
 *   `label: '其他'`；row 內每個數值欄位（除了 `rlv`）逐一加總。「其他」永遠
 *   排在最後，不參與排序——它是收尾的「剩下全部」，不是一個可比較的名次。
 * - 空輸入回傳空陣列；沒有「其他」剩餘（rows.length <= n）時不產生尾列。
 */
export function aggregateTopRlv<T extends RlvRow>(
  rows: readonly T[],
  rankKey: keyof T,
  n: number = TOP_N,
): AggregatedRlvRow<T>[] {
  if (rows.length === 0) return []

  const topKeys = pickTopRlvKeys(rows, rankKey, n)

  const top = rows
    .filter((r) => topKeys.has(r.rlv))
    .slice()
    .sort((a, b) => toNumber(b[rankKey]) - toNumber(a[rankKey]) || b.rlv - a.rlv)
    .map((row): AggregatedRlvRow<T> => ({ rlv: row.rlv, label: labelForRlv(row.rlv), isOther: false, row }))

  const rest = rows.filter((r) => !topKeys.has(r.rlv))
  if (rest.length === 0) return top

  const merged = mergeNumericFields(rest)
  const otherRow: AggregatedRlvRow<T> = {
    rlv: OTHER_RLV,
    label: OTHER_LABEL,
    isOther: true,
    row: { ...merged, rlv: OTHER_RLV } as T,
  }
  return [...top, otherRow]
}

function toNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Sum every numeric field across `rows` except `rlv`. Non-numeric fields are
 *  dropped (none of the RLV chart row shapes carry any today). */
function mergeNumericFields<T extends RlvRow>(rows: readonly T[]): Partial<T> {
  const merged: Record<string, number> = {}
  for (const row of rows) {
    for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
      if (key === 'rlv') continue
      if (typeof value === 'number') merged[key] = (merged[key] ?? 0) + value
    }
  }
  return merged as Partial<T>
}

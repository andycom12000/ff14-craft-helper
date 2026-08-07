// 直測 issue #209 點名的三項：top-8 選取、tie 的處理、標籤查不到時回退顯示裸數字。
import { describe, it, expect } from 'vitest'
import { aggregateTopRlv, pickTopRlvKeys, labelForRlv, OTHER_RLV, OTHER_LABEL, TOP_N } from '../rlv-aggregate'

interface DifficultyRow {
  rlv: number
  events: number
}

/** rlv 1..n，events 遞減（rlv=1 最大），確保「事件數」與「rlv 數值」不同向
 *  ——避免測試在兩種排序規則下都碰巧算出一樣的答案。 */
function makeRows(n: number): DifficultyRow[] {
  return Array.from({ length: n }, (_, i) => ({ rlv: i + 1, events: n - i }))
}

describe('pickTopRlvKeys / aggregateTopRlv — top-N 選取', () => {
  it('少於 N 筆時全部進 top，沒有其他列', () => {
    const rows = makeRows(5)
    const out = aggregateTopRlv(rows, 'events', TOP_N)
    expect(out).toHaveLength(5)
    expect(out.every((r) => !r.isOther)).toBe(true)
  })

  it('剛好 N 筆時全部進 top，沒有其他列', () => {
    const rows = makeRows(TOP_N)
    const out = aggregateTopRlv(rows, 'events', TOP_N)
    expect(out).toHaveLength(TOP_N)
    expect(out.every((r) => !r.isOther)).toBe(true)
  })

  it('多於 N 筆時只留 top-N + 一列其他，其他排在最後', () => {
    const rows = makeRows(12)
    const out = aggregateTopRlv(rows, 'events', TOP_N)
    expect(out).toHaveLength(TOP_N + 1)
    expect(out.slice(0, TOP_N).every((r) => !r.isOther)).toBe(true)
    expect(out[TOP_N].isOther).toBe(true)
    expect(out[TOP_N].rlv).toBe(OTHER_RLV)
    expect(out[TOP_N].label).toBe(OTHER_LABEL)
  })

  it('挑出的 top-N 是事件數真正最高的那幾筆（不是輸入順序的前 N 筆）', () => {
    // 刻意把輸入順序打亂、事件數最高的擺在最後，確保排序看的是 rank 不是位置。
    const rows: DifficultyRow[] = [
      { rlv: 1, events: 1 },
      { rlv: 2, events: 2 },
      { rlv: 3, events: 3 },
      { rlv: 4, events: 100 }, // 應該進 top
      { rlv: 5, events: 90 },  // 應該進 top
    ]
    const keys = pickTopRlvKeys(rows, 'events', 2)
    expect(keys).toEqual(new Set([4, 5]))
  })

  it('其他列把剩下的數值欄位加總', () => {
    const rows = makeRows(10) // top-8 吃走 rlv 1..8，其他剩 rlv 9(events=2)、rlv 10(events=1)
    const out = aggregateTopRlv(rows, 'events', TOP_N)
    const other = out[out.length - 1]
    expect(other.isOther).toBe(true)
    expect(other.row.events).toBe(2 + 1)
  })

  it('全部進其他（N=0 時沒有 top）', () => {
    const rows = makeRows(3)
    const out = aggregateTopRlv(rows, 'events', 0)
    expect(out).toHaveLength(1)
    expect(out[0].isOther).toBe(true)
    expect(out[0].row.events).toBe(3 + 2 + 1)
  })

  it('空輸入回傳空陣列，不產生其他列', () => {
    expect(aggregateTopRlv([], 'events', TOP_N)).toEqual([])
  })
})

describe('tie 的處理 — 第 N 名與第 N+1 名同票', () => {
  it('同票時用 rlv 數值（desc）當決勝規則，結果與輸入順序無關', () => {
    // 8 筆 events=10（會被同票淹沒），另外 2 筆同樣 events=10 在邊界競爭第 8 名。
    // rlv 更大的那筆（rlv=9）應該贏，被排進 top；rlv=1 那筆落到其他。
    const rows: DifficultyRow[] = [
      { rlv: 1, events: 10 },
      { rlv: 2, events: 10 },
      { rlv: 3, events: 10 },
      { rlv: 4, events: 10 },
      { rlv: 5, events: 10 },
      { rlv: 6, events: 10 },
      { rlv: 7, events: 10 },
      { rlv: 8, events: 10 },
      { rlv: 9, events: 10 }, // 10 筆同票，只能留 8 筆 → tie-break 上場
    ]
    const keys = pickTopRlvKeys(rows, 'events', TOP_N)
    expect(keys.has(9)).toBe(true) // 最大 rlv 進 top
    expect(keys.has(1)).toBe(false) // 最小 rlv 落到其他
    expect(keys.size).toBe(TOP_N)
  })

  it('決勝規則是確定性的：打亂輸入順序，結果不變', () => {
    const rows: DifficultyRow[] = [
      { rlv: 1, events: 10 }, { rlv: 2, events: 10 }, { rlv: 3, events: 10 },
      { rlv: 4, events: 10 }, { rlv: 5, events: 10 }, { rlv: 6, events: 10 },
      { rlv: 7, events: 10 }, { rlv: 8, events: 10 }, { rlv: 9, events: 10 },
    ]
    const shuffled = [...rows].reverse()
    const a = pickTopRlvKeys(rows, 'events', TOP_N)
    const b = pickTopRlvKeys(shuffled, 'events', TOP_N)
    expect(b).toEqual(a)
  })

  it('aggregateTopRlv 對同票輸入的輸出順序穩定（不靠 Array.sort 的實作細節）', () => {
    const rows: DifficultyRow[] = Array.from({ length: 9 }, (_, i) => ({ rlv: i + 1, events: 10 }))
    const out = aggregateTopRlv(rows, 'events', TOP_N)
    // top 8 筆全部 events=10、按 rlv desc 排列（tie-break 也決定顯示順序）。
    expect(out.slice(0, TOP_N).map((r) => r.rlv)).toEqual([9, 8, 7, 6, 5, 4, 3, 2])
    expect(out[TOP_N].isOther).toBe(true)
    expect(out[TOP_N].row.events).toBe(10) // rlv=1 那筆落單成為「其他」
  })
})

describe('labelForRlv — 標籤查不到時回退顯示裸數字（fail-soft）', () => {
  it('對照表命中時顯示標籤', () => {
    expect(labelForRlv(660, { 660: '傳說級・稀有食譜' })).toBe('傳說級・稀有食譜')
  })

  it('對照表查不到時回退顯示裸數字字串，不是 unknown / 最接近的標籤', () => {
    expect(labelForRlv(517, { 660: '傳說級・稀有食譜' })).toBe('517')
  })

  it('空對照表（正式環境的預設狀態）一律回退裸數字', () => {
    expect(labelForRlv(1, {})).toBe('1')
    expect(labelForRlv(770, {})).toBe('770')
  })

  it('aggregateTopRlv 的每一列都帶著 fail-soft 標籤（未命中時是裸數字字串）', () => {
    const rows = makeRows(3)
    const out = aggregateTopRlv(rows, 'events', TOP_N)
    expect(out.map((r) => r.label)).toEqual(['1', '2', '3'])
  })

  it('其他列的標籤固定是 OTHER_LABEL，不查對照表', () => {
    const rows = makeRows(10)
    const out = aggregateTopRlv(rows, 'events', TOP_N)
    expect(out[out.length - 1].label).toBe(OTHER_LABEL)
  })
})

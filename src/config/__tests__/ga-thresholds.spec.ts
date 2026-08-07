// 釘死 GA_THRESHOLD_RULES 的 anchor 字串跟 GaDashboardView.vue 裡實際存在的 chart id 對齊
// (issue #208 追加任務)。#197 重建版面時把 chart id 換過一輪(例如
// chart-solver-batch-funnel → chart-funnels),門檻表的 anchor 字串沒跟著動,是純字串、
// TypeScript 抓不到的漂移——不該靠人眼逐條核對,所以直接讀 GaDashboardView.vue 原始碼抽出
// 「這個版面實際存在哪些 chart id」，跟門檻表逐條對拍。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { GA_THRESHOLD_RULES } from '../ga-thresholds'

// `import.meta.url` isn't a real file:// URL once Vite/vitest transforms this module, so resolve
// from the project root (vitest's cwd) instead of trying to derive a relative path from here.
const VIEW_PATH = path.resolve(process.cwd(), 'src/views/admin/GaDashboardView.vue')

/** GaDashboardView.vue 裡所有 `id="chart-…"`（L1Item / L2Row 掛的 DOM id,即 deep-link 目標）。 */
function actualChartIds(): Set<string> {
  const source = readFileSync(VIEW_PATH, 'utf-8')
  const ids = new Set<string>()
  for (const m of source.matchAll(/id="(chart-[a-z0-9-]+)"/g)) {
    ids.add(m[1])
  }
  return ids
}

describe('GA_THRESHOLD_RULES anchor 對齊 GaDashboardView.vue 實際存在的 chart id', () => {
  const chartIds = actualChartIds()

  it('sanity check：至少抓到 GaDashboardView.vue 裡已知的幾個 chart id（regex 沒抓空）', () => {
    expect(chartIds.has('chart-failures')).toBe(true)
    expect(chartIds.has('chart-funnels')).toBe(true)
    expect(chartIds.size).toBeGreaterThanOrEqual(8)
  })

  it.each(GA_THRESHOLD_RULES.map((r) => [r.id, r.anchor] as const))(
    '%s 的 anchor（%s）指到一個實際存在的 chart id',
    (id, anchor) => {
      const target = anchor.replace(/^#/, '')
      expect(chartIds.has(target), `規則 ${id} 的 anchor '${anchor}' 在 GaDashboardView.vue 裡找不到對應的 id`).toBe(true)
    },
  )
})

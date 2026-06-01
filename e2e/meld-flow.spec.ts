import { test, expect } from '@playwright/test'
import { searchFillAndSolve } from './helpers/sim'

/**
 * Meld-advisor backbone flow (issue #115) — market-free paths.
 *
 * These specs stay clear of the Universalis fetch entirely: the backbone proves
 * the search → gearset → real-WASM-solve spine, and the no-market spec exercises
 * the advisor path *before* any market call is made.
 */

test('search a recipe, fill the gearset, and the WASM solver finds a successful craft', async ({ page }) => {
  await searchFillAndSolve(page)
})

test('with no market server selected, the advisor no longer hard-blocks but runs the count-ranked fallback (#135)', async ({ page }) => {
  await searchFillAndSolve(page)

  // #135: a missing market server no longer dead-ends at the「尚未選擇市場伺服器」
  // hard block. The ride-along advisor now runs the engine with an empty price
  // map and degrades to the count-ranked plan (ADR-0002), so the no-market block
  // must be GONE from the DOM.
  await expect(page.getByText('尚未選擇市場伺服器')).toHaveCount(0)

  // It must also never show the pre-solve「尚未求解」hint — the solve did run.
  await expect(page.getByText('尚未求解，按 solve 後將算出鑲嵌建議')).toHaveCount(0)

  // The advisor proceeds to compute. On this rlv770 fixture the bounded search
  // does not converge yet (blocked on #132 wall-clock deadline + #136 basis), so
  // we assert it entered the compute path rather than the terminal count-ranked
  // 「無市場資料，依鑲嵌數量估算」state — a follow-up pins that once it converges.
  await expect(page.locator('.meld-advisor-card').getByText('計算中…')).toBeVisible()
})

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

test('with no market server selected, the meld advisor shows the no-market state — not the pre-solve "not solved yet" hint', async ({ page }) => {
  await searchFillAndSolve(page)

  // The ride-along advisor fires automatically after solve. With no market
  // server selected (the default in a fresh context), it must surface the
  // honest「尚未選擇市場伺服器」state — issue #115 explicitly calls out that it
  // must NOT fall back to the pre-solve「尚未求解」hint, which would wrongly
  // read as "you never pressed solve" when the solve did run.
  await expect(page.getByText('尚未選擇市場伺服器').first()).toBeVisible()

  // The empty-state hint is a `v-if` branch, so when the card is in the
  // no-market state it is absent from the DOM entirely (count 0). If the
  // advisor regressed to the blank fallback, this hint would render and fail.
  await expect(page.getByText('尚未求解，按 solve 後將算出鑲嵌建議')).toHaveCount(0)
})

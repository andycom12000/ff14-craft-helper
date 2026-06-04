import { test, expect } from '@playwright/test'
import { searchFillAndSolve } from './helpers/sim'
import { seedMarketServer, mockUniversalisPrices } from './helpers/market'

/**
 * Meld-advisor market path (issue #115, Step 3).
 *
 * Verifies the reusable Universalis mock plumbing: with a market server seeded
 * and prices mocked, the ride-along advisor takes the real pricing path —
 * it hits Universalis (intercepted, so deterministic) and leaves the no-market
 * state. This deliberately does NOT wait for the bounded solver search to
 * converge; that search has no wall-clock deadline yet (#132) and is gated as a
 * separate @wasm-heavy spec.
 */
test('with a market server selected, the advisor fetches mocked prices and leaves the no-market state', async ({ page }) => {
  await seedMarketServer(page, 'Gilgamesh')
  await mockUniversalisPrices(page)

  // The ride-along advisor fires after solve; capture its Universalis request.
  const priceRequest = page.waitForRequest('**/universalis.app/api/v2/**', { timeout: 60_000 })
  await searchFillAndSolve(page)

  // The advisor actually hit Universalis (and our route served the fixture).
  await priceRequest

  // A server is selected, so the advisor must NOT be in the no-market state...
  await expect(page.getByText('尚未選擇市場伺服器')).toHaveCount(0)
  // ...and a failed/blocked fetch would fall back to the blank「尚未求解」hint;
  // the mock served a 200, so that must not appear either.
  await expect(page.getByText('尚未求解，按 solve 後將算出鑲嵌建議')).toHaveCount(0)
})

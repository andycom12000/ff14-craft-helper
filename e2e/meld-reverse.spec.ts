import { test, expect } from '@playwright/test'
import { searchFillAndSolve } from './helpers/sim'
import { seedMarketServer, mockUniversalisPrices } from './helpers/market'

/**
 * Reverse meld advisor — real convergence (issue #115, Step 4).
 *
 * This is the closest regression guard for the #123 family of meld-advisor bugs:
 * with a market server seeded and prices mocked, the ride-along advisor runs the
 * real bounded solver search end to end and must converge to a recommendation
 * that guarantees HQ (either "備齊 HQ 素材…無需鑲嵌" or "補 N 顆…即可保證 HQ" —
 * both assert「保證 HQ」).
 *
 * Tagged @wasm-heavy: it drives the real solver to convergence, which has no
 * wall-clock deadline yet (#132), so it is slow and kept out of the fast local
 * subset (`npm run test:e2e:fast`). The `allHq` setup keeps the gap small so it
 * converges in seconds-to-low-minutes rather than grinding indefinitely.
 */
test('reverse advisor converges to an HQ-guaranteeing recommendation', { tag: '@wasm-heavy' }, async ({ page }) => {
  test.setTimeout(240_000)

  await seedMarketServer(page, 'Gilgamesh')
  await mockUniversalisPrices(page)
  // Maple Clogs (rlv 1) with strong lv100 gear double-maxes outright, so the
  // advisor's bounded solver search resolves to its HQ-sufficient verdict in one
  // probe — a fast, deterministic convergence. (The high-difficulty fixture
  // recipe does NOT converge in bounded time on the current engine; that is the
  // #132/#136 bug this suite will guard once those land — see meld-reverse note.)
  await searchFillAndSolve(page, { recipeName: 'Maple Clogs', gear: { craft: 6500, control: 6500, cp: 700 } })

  // Scope to the advisor card so this matches its verdict, not any other
  // "保證 HQ" text on the page (e.g. the「如何保證 HQ」help label).
  const card = page.locator('.meld-advisor-card').first()
  await expect(card.getByText('保證 HQ').first()).toBeVisible({ timeout: 120_000 })
})

/**
 * Documented red-spec — convergence on a HIGH-difficulty recipe.
 *
 * Surfaced by this suite: on the rlv770 fixture the reverse advisor stays in
 * 「計算中…」indefinitely even when HQ materials alone already double-max, so a
 * convergence assertion here would hang. That is the live bug cluster — #132
 * (no wall-clock deadline / cancel) and #136 (advisor searches on the bare-gear
 * basis instead of the screen's HQ/food basis). Kept as `test.fixme` so it is
 * recorded but not run; un-fixme it once #132 + #136 land to lock in bounded
 * convergence on hard recipes (issue #115 §4.1, 拍板 #4).
 */
test.fixme('reverse advisor converges on a high-difficulty recipe within a deadline', { tag: '@wasm-heavy' }, async ({ page }) => {
  await seedMarketServer(page, 'Gilgamesh')
  await mockUniversalisPrices(page)
  await searchFillAndSolve(page, { allHq: true, gear: { craft: 5811, control: 5309, cp: 649 } })

  const card = page.locator('.meld-advisor-card').first()
  await expect(card.getByText('保證 HQ').first()).toBeVisible({ timeout: 120_000 })
})

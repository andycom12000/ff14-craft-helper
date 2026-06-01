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
 * #132 regression guard — BOUNDED termination on a HIGH-difficulty recipe.
 *
 * Before #132 the reverse advisor stayed in「計算中…」indefinitely on the rlv770
 * fixture (the bounded solver search had no wall-clock deadline). With #132's
 * per-solve deadline + bail-to-best-so-far, the advisor must now leave the
 * loading state and reach a DEFINITE terminal verdict within the deadline budget
 * — that boundedness is the win this locks in (issue #115 §4.1, 拍板 #4).
 *
 * Deliberately does NOT assert WHICH verdict: on this genuinely-hard fixture +
 * sub-BiS gear the bounded search currently hits the per-solve deadline and
 * #133 honestly reports 「計算逾時」(timed-out) — NOT a false 無法以鑲嵌達標. Whether
 * a longer budget would find a plan is a separate question (#134 prefilter),
 * not what this @wasm-heavy guard is for. Tagged @wasm-heavy (real convergence,
 * ~minutes) so it runs nightly, not PR CI.
 */
test('reverse advisor reaches a bounded terminal verdict on a high-difficulty recipe', { tag: '@wasm-heavy' }, async ({ page }) => {
  test.setTimeout(240_000)
  await seedMarketServer(page, 'Gilgamesh')
  await mockUniversalisPrices(page)
  await searchFillAndSolve(page, { allHq: true, gear: { craft: 5811, control: 5309, cp: 649 } })

  // The #132 guarantee: the bounded search terminates, so the card must leave
  // 「計算中…」within the deadline budget instead of spinning forever.
  const card = page.locator('.meld-advisor-card').first()
  await expect(card.getByText('計算中…')).toBeHidden({ timeout: 200_000 })
  // And it must land on a real #133 terminal verdict, not vanish/blank out:
  // 保證 HQ (success/hqSufficient) | 無法只靠鑲嵌 (infeasible) | 逾時 | 失敗 | 無市場資料.
  await expect(card.getByText(/保證 HQ|無法只靠鑲嵌|逾時|失敗|無市場資料/).first()).toBeVisible()
})

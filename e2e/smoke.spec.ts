import { test, expect } from '@playwright/test'

/**
 * Walking skeleton (issue #115, Step 0).
 *
 * Proves the e2e harness stands up end to end: the dev server boots, serves the
 * app under its GH-Pages base path, the hash route renders, and — critically —
 * the page is **cross-origin isolated**.
 *
 * `crossOriginIsolated === true` is the browser-level proof that the COOP/COEP
 * headers (vite.config.ts `server`) took effect, which is exactly the
 * precondition SharedArrayBuffer — and therefore the multi-threaded WASM solver
 * — depends on. If those headers ever regressed (or `vite preview`, which omits
 * them, were used), this flips to false and the skeleton fails for the right
 * reason. The solver actually *running* is proven by the happy-path spec, which
 * needs a recipe in the queue to surface the SolverPanel.
 */
test('app boots cross-origin isolated (COOP/COEP → SharedArrayBuffer)', async ({ page }) => {
  await page.goto('#/simulator')

  await expect(page.getByRole('heading', { name: '製作模擬' })).toBeVisible()

  const isolated = await page.evaluate(() => globalThis.crossOriginIsolated)
  expect(isolated, 'crossOriginIsolated must be true for the WASM solver to use SharedArrayBuffer').toBe(true)
})

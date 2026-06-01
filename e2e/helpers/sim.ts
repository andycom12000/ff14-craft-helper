import { expect, type Page } from '@playwright/test'

/**
 * Shared simulator setup for meld-advisor specs (issue #115).
 *
 * Queues the fixture recipe — Courtly Lover's Partisan (item 49252, CRP, rlv
 * 770) — fills the CRP gearset with a strong lv100 baseline, and runs the real
 * multi-threaded WASM solver to a successful craft.
 *
 * The recipe only carries a searchable name in the EN items shard (recipe data
 * is bundled, not fetched from XIVAPI), so the game-data language is switched to
 * EN before searching.
 */
export async function searchFillAndSolve(page: Page) {
  await page.goto('#/simulator')

  // Game-data language → EN (zh-TW items shard lacks this recipe's name).
  await page.getByRole('button', { name: 'EN', exact: true }).click()

  // Search and queue the recipe.
  await page.getByRole('button', { name: '搜尋配方' }).first().click()
  await page.getByRole('textbox', { name: '配方名稱搜尋' }).fill("Courtly Lover's Partisan")
  const row = page.locator('.search-result-row', { hasText: "Courtly Lover's Partisan" }).first()
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '+' }).click()
  await page.getByRole('button', { name: '關閉搜尋視窗' }).click()

  // Fill the CRP gearset.
  await page.getByRole('button', { name: '配裝' }).first().click()
  await page.getByLabel('木工師 作業精度').fill('5500')
  await page.getByLabel('木工師 加工精度').fill('5500')
  await page.getByLabel('木工師 CP').fill('700')
  await page.keyboard.press('Escape')

  // Solve with the real WASM solver.
  const solveBtn = page.getByRole('button', { name: '啟動求解' })
  await expect(solveBtn).toBeEnabled({ timeout: 60_000 })
  await solveBtn.click()
  await expect(page.getByText('製作成功')).toBeVisible({ timeout: 90_000 })
}

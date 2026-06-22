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
 *
 * `allHq` flips every ingredient to HQ before solving, raising initial quality
 * so the post-solve meld gap is small — which lets the reverse advisor's bounded
 * solver search converge quickly instead of grinding for minutes on a large gap
 * (issue #115 §4.1; the search has no wall-clock deadline yet — #132).
 */
export async function searchFillAndSolve(
  page: Page,
  options: {
    allHq?: boolean
    gear?: { craft: number; control: number; cp: number }
    recipeName?: string
  } = {},
) {
  const gear = options.gear ?? { craft: 5500, control: 5500, cp: 700 }
  const recipeName = options.recipeName ?? "Courtly Lover's Partisan"

  // Meld advice is opt-in (settings.meldAdvice, default OFF since the toggle
  // landed). Every meld-advisor spec asserts the ride-along advisor's post-solve
  // behaviour, so seed the persisted opt-in before the app boots. Merge so it
  // composes with seedMarketServer's settings seed regardless of call order.
  await page.addInitScript(() => {
    const raw = localStorage.getItem('settings')
    const parsed = raw ? JSON.parse(raw) : {}
    parsed.meldAdvice = true
    localStorage.setItem('settings', JSON.stringify(parsed))
  })

  await page.goto('#/simulator')

  // Game-data language → EN (zh-TW items shard lacks this recipe's name).
  await page.getByRole('button', { name: 'EN', exact: true }).click()

  // Search and queue the recipe.
  await page.getByRole('button', { name: '搜尋配方' }).first().click()
  await page.getByRole('textbox', { name: '配方名稱搜尋' }).fill(recipeName)
  const row = page.locator('.search-result-row', { hasText: recipeName }).first()
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '+' }).click()
  await page.getByRole('button', { name: '關閉搜尋視窗' }).click()

  // Fill the CRP gearset.
  await page.getByRole('button', { name: '配裝' }).first().click()
  await page.getByLabel('木工師 作業精度').fill(String(gear.craft))
  await page.getByLabel('木工師 加工精度').fill(String(gear.control))
  await page.getByLabel('木工師 CP').fill(String(gear.cp))
  await page.keyboard.press('Escape')

  // Optionally flip every ingredient to HQ to shrink the meld gap.
  if (options.allHq) {
    await page.getByRole('button', { name: '全部 HQ' }).click()
  }

  // Solve with the real WASM solver.
  const solveBtn = page.getByRole('button', { name: '啟動求解' })
  await expect(solveBtn).toBeEnabled({ timeout: 60_000 })
  await solveBtn.click()
  await expect(page.getByText('製作成功')).toBeVisible({ timeout: 90_000 })
}

import { test, expect } from '@playwright/test'
import { searchFillAndSolve } from './helpers/sim'

// Regression #143: a canHq:false recipe has no HQ concept, so the entire
// "如何保證 HQ" cascade (初期品質 / reverse meld advisor / forward playground) is
// meaningless and must not render. Before the recipe.canHq gate the cascade
// rendered regardless, advising「補 N 顆魔晶石保證 HQ」on a craft that can never
// be HQ (a semantic contradiction surfaced by the #115 e2e probe).
test('canHq:false recipe hides the entire 如何保證 HQ cascade', async ({ page }) => {
  // Riviera Arched Window — CRP, rlv14, canHq:false (bundled recipe id 1651).
  await searchFillAndSolve(page, { recipeName: 'Riviera Arched Window' })

  // The whole cascade section (both render branches) and the reverse advisor
  // card must be absent for a recipe that cannot HQ.
  await expect(page.locator('.hq-cascade')).toHaveCount(0)
  await expect(page.locator('.meld-advisor-card')).toHaveCount(0)
})

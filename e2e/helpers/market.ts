import type { Page } from '@playwright/test'

/**
 * Universalis market-price mocking for meld-advisor specs (issue #115).
 *
 * The meld advisor's only live external dependency is the Universalis market
 * lookup; recipe data is bundled and served by the dev server. These helpers
 * make the market deterministic: one seeds a selected market server (so the
 * advisor isn't short-circuited into the no-market state), the other intercepts
 * the price requests and serves fixed fixtures.
 */

/** Universalis materia item IDs (see src/engine/materia.ts MATERIA_GRADES). */
export const MATERIA_ITEM_IDS = {
  craftsmanshipXII: 41757,
  controlXII: 41758,
  cpXII: 41759,
  craftsmanshipXI: 33930,
  controlXI: 33931,
  cpXI: 33932,
  craftsmanshipX: 33918,
  controlX: 33919,
  cpX: 33920,
} as const

/**
 * Seed a selected market server into the persisted `settings` store *before*
 * the app boots, so `settingsStore.server` is non-empty and the advisor takes
 * the real pricing path instead of the no-market short-circuit.
 *
 * This goes through localStorage (pinia-plugin-persistedstate, store id
 * `settings`) rather than driving the teleported Element Plus region/DC/world
 * selects on the settings page — far more robust, and it survives the hash-route
 * changes that would otherwise clear an in-session selection.
 */
export async function seedMarketServer(page: Page, server = 'Gilgamesh') {
  await page.addInitScript((srv) => {
    localStorage.setItem('settings', JSON.stringify({ server: srv }))
  }, server)
}

/** Minimal MarketData — only the fields priceForItemNq() reads (minPriceNQ,
 *  falling back to minPriceHQ). */
function marketData(itemId: number, price: number) {
  return {
    itemID: itemId,
    lastUploadTime: 1_700_000_000_000,
    currentAveragePrice: price,
    currentAveragePriceNQ: price,
    currentAveragePriceHQ: price,
    minPriceNQ: price,
    minPriceHQ: price,
    listings: [],
    recentHistory: [],
  }
}

export interface UniversalisMockOptions {
  /** Price per unit for any materia not overridden in `prices`. */
  defaultPrice?: number
  /** Per-item-id price overrides. */
  prices?: Record<number, number>
  /** Item ids to omit from the response entirely — simulates an unpriced
   *  materia (no listings), which drives the count/slot-based ranking fallback. */
  missing?: number[]
}

/**
 * Intercept every Universalis market-price request and serve deterministic
 * fixtures. The app hits `GET .../api/v2/{server}/{id1,id2,...}` and expects
 * `{ items: { "<id>": MarketData } }` for multi-item requests (single-item
 * requests get the MarketData object directly) — see getAggregatedPrices.
 */
export async function mockUniversalisPrices(page: Page, options: UniversalisMockOptions = {}) {
  const { defaultPrice = 5000, prices = {}, missing = [] } = options
  await page.route('**/universalis.app/api/v2/**', async (route) => {
    const url = new URL(route.request().url())
    const idsSegment = decodeURIComponent(url.pathname.split('/').pop() ?? '')
    const ids = idsSegment.split(',').map(Number).filter((n) => Number.isFinite(n))

    const items: Record<string, ReturnType<typeof marketData>> = {}
    for (const id of ids) {
      if (missing.includes(id)) continue
      const price = id in prices ? prices[id] : defaultPrice
      if (price <= 0) continue
      items[String(id)] = marketData(id, price)
    }

    const single = ids.length === 1 ? items[String(ids[0])] : undefined
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(single ?? { items }),
    })
  })
}

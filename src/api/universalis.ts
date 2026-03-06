const BASE_URL = 'https://universalis.app/api/v2'

export interface MarketListing {
  pricePerUnit: number
  quantity: number
  total: number
  hq: boolean
  worldName?: string
  lastReviewTime: number
}

export interface MarketData {
  itemID: number
  lastUploadTime: number
  currentAveragePrice: number
  currentAveragePriceNQ: number
  currentAveragePriceHQ: number
  minPriceNQ: number
  minPriceHQ: number
  listings: MarketListing[]
  recentHistory: MarketListing[]
}

export interface DataCenter {
  name: string
  region: string
  worlds: number[]
}

export interface World {
  id: number
  name: string
}

async function fetchUniversalis<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}/${path}`)
  if (!response.ok) {
    throw new Error(`Universalis request failed: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export function getMarketData(
  server: string,
  itemId: number
): Promise<MarketData> {
  return fetchUniversalis(`${encodeURIComponent(server)}/${itemId}`)
}

export async function getAggregatedPrices(
  server: string,
  itemIds: number[]
): Promise<Map<number, MarketData>> {
  const result = new Map<number, MarketData>()

  // Universalis supports max 100 items per request
  const chunks: number[][] = []
  for (let i = 0; i < itemIds.length; i += 100) {
    chunks.push(itemIds.slice(i, i + 100))
  }

  // Fetch all chunks in parallel
  const chunkResults = await Promise.all(chunks.map(async (chunk) => {
    const ids = chunk.join(',')
    const data = await fetchUniversalis<MarketData | { items: Record<string, MarketData> }>(
      `${encodeURIComponent(server)}/${ids}`,
    )
    return { chunk, data }
  }))

  for (const { chunk, data } of chunkResults) {
    if (chunk.length === 1) {
      result.set(chunk[0], data as MarketData)
    } else {
      const items = (data as { items: Record<string, MarketData> }).items
      for (const [id, marketData] of Object.entries(items)) {
        result.set(Number(id), marketData)
      }
    }
  }

  return result
}

export function getDataCenters(): Promise<DataCenter[]> {
  return fetchUniversalis('data-centers')
}

export function getWorlds(): Promise<World[]> {
  return fetchUniversalis('worlds')
}

export interface WorldPriceSummary {
  worldName: string
  minPriceNQ: number
  minPriceHQ: number
  avgPriceNQ: number
  avgPriceHQ: number
  lastUploadTime: number
  listingCount: number
}

export function getMarketDataByDC(
  dcName: string,
  itemId: number
): Promise<MarketData> {
  return fetchUniversalis(`${encodeURIComponent(dcName)}/${itemId}`)
}

export function aggregateByWorld(listings: MarketListing[]): WorldPriceSummary[] {
  const worldMap = new Map<string, MarketListing[]>()

  for (const listing of listings) {
    const world = listing.worldName ?? 'Unknown'
    if (!worldMap.has(world)) worldMap.set(world, [])
    worldMap.get(world)!.push(listing)
  }

  return Array.from(worldMap.entries()).map(([worldName, worldListings]) => {
    const nqListings = worldListings.filter(l => !l.hq)
    const hqListings = worldListings.filter(l => l.hq)

    return {
      worldName,
      minPriceNQ: nqListings.length > 0 ? Math.min(...nqListings.map(l => l.pricePerUnit)) : 0,
      minPriceHQ: hqListings.length > 0 ? Math.min(...hqListings.map(l => l.pricePerUnit)) : 0,
      avgPriceNQ: nqListings.length > 0
        ? Math.round(nqListings.reduce((s, l) => s + l.pricePerUnit, 0) / nqListings.length)
        : 0,
      avgPriceHQ: hqListings.length > 0
        ? Math.round(hqListings.reduce((s, l) => s + l.pricePerUnit, 0) / hqListings.length)
        : 0,
      lastUploadTime: Math.max(...worldListings.map(l => l.lastReviewTime)),
      listingCount: worldListings.length,
    }
  }).sort((a, b) => {
    const priceA = a.minPriceNQ || Infinity
    const priceB = b.minPriceNQ || Infinity
    return priceA - priceB
  })
}

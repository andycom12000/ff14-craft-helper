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

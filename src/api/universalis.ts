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

export async function getMarketData(
  server: string,
  itemId: number
): Promise<MarketData> {
  try {
    const url = `${BASE_URL}/${encodeURIComponent(server)}/${itemId}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Universalis request failed: ${response.status} ${response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    console.error('[Universalis] getMarketData error:', error)
    throw error
  }
}

export async function getAggregatedPrices(
  server: string,
  itemIds: number[]
): Promise<Map<number, MarketData>> {
  const result = new Map<number, MarketData>()

  try {
    // Universalis supports max 100 items per request
    const chunks: number[][] = []
    for (let i = 0; i < itemIds.length; i += 100) {
      chunks.push(itemIds.slice(i, i + 100))
    }

    for (const chunk of chunks) {
      const ids = chunk.join(',')
      const url = `${BASE_URL}/${encodeURIComponent(server)}/${ids}`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Universalis request failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (chunk.length === 1) {
        // Single item returns MarketData directly
        result.set(chunk[0], data)
      } else {
        // Multiple items returns { items: { [itemId]: MarketData } }
        const items = data.items as Record<string, MarketData>
        for (const [id, marketData] of Object.entries(items)) {
          result.set(Number(id), marketData)
        }
      }
    }

    return result
  } catch (error) {
    console.error('[Universalis] getAggregatedPrices error:', error)
    throw error
  }
}

export async function getDataCenters(): Promise<DataCenter[]> {
  try {
    const url = `${BASE_URL}/data-centers`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Universalis request failed: ${response.status} ${response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    console.error('[Universalis] getDataCenters error:', error)
    throw error
  }
}

export async function getWorlds(): Promise<World[]> {
  try {
    const url = `${BASE_URL}/worlds`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Universalis request failed: ${response.status} ${response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    console.error('[Universalis] getWorlds error:', error)
    throw error
  }
}

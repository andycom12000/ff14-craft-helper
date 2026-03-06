import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findRecipesByItemName } from '@/api/xivapi'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('findRecipesByItemName', () => {
  it('returns recipes matching exact item_id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 43, item_id: 5057, item_name: '黑鐵錠', job: '鍛造' },
          { id: 189, item_id: 5057, item_name: '黑鐵錠', job: '甲冑' },
        ],
        p: 1,
      }),
    } as Response)

    const results = await findRecipesByItemName('黑鐵錠', 5057)
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ recipeId: 43, job: '鍛造' })
  })

  it('returns empty array for non-craftable items', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [], p: 0 }),
    } as Response)

    const results = await findRecipesByItemName('鐵礦', 5111)
    expect(results).toHaveLength(0)
  })

  it('filters out partial name matches with wrong item_id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 43, item_id: 5057, item_name: '黑鐵錠', job: '鍛造' },
          { id: 99, item_id: 9999, item_name: '黑鐵錠鑄塊', job: '鍛造' },
        ],
        p: 1,
      }),
    } as Response)

    const results = await findRecipesByItemName('黑鐵錠', 5057)
    expect(results).toHaveLength(1)
    expect(results[0].recipeId).toBe(43)
  })
})

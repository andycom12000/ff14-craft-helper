import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { findRecipesByItemName } from '@/api/xivapi'
import { setupLocalDataMocks, resetLocalDataMocks } from '@/__tests__/fixtures/load'
import { __resetForTesting, setLocale } from '@/services/local-data-source'

beforeEach(async () => {
  __resetForTesting()
  setupLocalDataMocks()
  await setLocale('zh-TW')
})

afterEach(() => {
  resetLocalDataMocks()
  __resetForTesting()
})

describe('findRecipesByItemName', () => {
  it('returns recipes matching exact item_id', async () => {
    // Fixture recipe 1001 produces itemResult 5057 (黑鐵錠), craftType 1 → BSM → '鍛造'
    const results = await findRecipesByItemName('黑鐵錠', 5057)
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({ recipeId: 1001, job: '鍛造' })
  })

  it('returns empty array for non-craftable items', async () => {
    // itemId 5111 has no recipe in the fixture
    const results = await findRecipesByItemName('鐵礦', 5111)
    expect(results).toHaveLength(0)
  })

  it('filters by item_id, ignoring the legacy item_name argument', async () => {
    // Recipe 1002 (itemResult 12538) must not appear when asking for 5057,
    // even if the name hint happens to be a partial/ambiguous match.
    const results = await findRecipesByItemName('黑鐵錠', 5057)
    expect(results).toHaveLength(1)
    expect(results[0].recipeId).toBe(1001)
  })
})

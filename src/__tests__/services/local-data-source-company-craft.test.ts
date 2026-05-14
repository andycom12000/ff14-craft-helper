import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  loadCompanyCraft,
  getCompanyCraftSequence,
  listCompanyCraftByCategory,
  __resetForTesting,
} from '@/services/local-data-source'

const FIXTURE = {
  schemaVersion: 1 as const,
  sequences: [
    {
      id: 1, resultItemId: 18715, category: 'submersible' as const,
      partSlot: 'bow' as const,
      phases: [
        { partIndex: 0, processIndex: 0, jobAbbr: 'LTW', level: 70,
          supplyItems: [{ itemId: 5057, amount: 12 }] },
      ],
    },
    {
      id: 2, resultItemId: 18716, category: 'submersible' as const,
      partSlot: 'stern' as const,
      phases: [
        { partIndex: 0, processIndex: 0, jobAbbr: 'GSM', level: 75,
          supplyItems: [{ itemId: 5058, amount: 6 }] },
      ],
    },
    {
      id: 99, resultItemId: 20000, category: 'workshop' as const,
      partSlot: null,
      phases: [
        { partIndex: 0, processIndex: 0, jobAbbr: 'CRP', level: 60,
          supplyItems: [{ itemId: 5057, amount: 4 }] },
      ],
    },
  ],
}

describe('company-craft loader', () => {
  beforeEach(() => {
    __resetForTesting()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/data/company-craft.json')) {
        return new Response(JSON.stringify(FIXTURE), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loadCompanyCraft returns the parsed sequences', async () => {
    const seqs = await loadCompanyCraft()
    expect(seqs).toHaveLength(3)
    expect(seqs[0].resultItemId).toBe(18715)
  })

  it('getCompanyCraftSequence returns by id after load', async () => {
    await loadCompanyCraft()
    expect(getCompanyCraftSequence(2)?.partSlot).toBe('stern')
    expect(getCompanyCraftSequence(404)).toBeNull()
  })

  it('listCompanyCraftByCategory filters by category', async () => {
    await loadCompanyCraft()
    const subs = listCompanyCraftByCategory('submersible')
    expect(subs.map(s => s.id).sort()).toEqual([1, 2])
    expect(listCompanyCraftByCategory('workshop')).toHaveLength(1)
  })

  it('listCompanyCraftByCategory filters by partSlot too', async () => {
    await loadCompanyCraft()
    const bows = listCompanyCraftByCategory('submersible', 'bow')
    expect(bows).toHaveLength(1)
    expect(bows[0].id).toBe(1)
  })
})

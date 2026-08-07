import { describe, it, expect, vi, beforeEach } from 'vitest'

const FIXTURE = {
  schemaVersion: 1,
  generatedAt: '2026-07-31T04:00:00Z',
  window: { days: 28, bundleWindow: '28d' as const },
  dates: ['2026-07-29', '2026-07-30', '2026-07-31'],
  series: {
    'batch.failRate': [[236, 1345], null, [241, 1340]],
    'bom.handoffRate': [[14, 268], [15, 270], [14, 268]],
  },
}

describe('useGaTrends', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve(FIXTURE),
    } as Response)))
  })

  it('fetches the trend file and reshapes series into RuleTrends (date re-attached per point)', async () => {
    const { useGaTrends } = await import('../useGaTrends')
    const t = useGaTrends()
    expect(t.loading.value).toBe(true)
    await t.load()
    expect(t.loading.value).toBe(false)
    expect(t.error.value).toBeNull()
    expect(t.trends.value['batch.failRate']).toEqual([
      { date: '2026-07-29', obs: 236, n: 1345 },
      null,
      { date: '2026-07-31', obs: 241, n: 1340 },
    ])
    expect(t.trends.value['bom.handoffRate']).toHaveLength(3)
  })

  it('a null point in series stays null (day-of-absence, not coerced into a fabricated obs/n)', async () => {
    const { useGaTrends } = await import('../useGaTrends')
    const t = useGaTrends()
    await t.load()
    expect(t.trends.value['batch.failRate'][1]).toBeNull()
  })

  it('a rule id absent from the fetched series simply has no history (evaluate() treats this as day-1, not an error)', async () => {
    const { useGaTrends } = await import('../useGaTrends')
    const t = useGaTrends()
    await t.load()
    expect(t.trends.value['some.new.rule']).toBeUndefined()
  })

  it('degrades to an empty RuleTrends on fetch failure — must not block the todo ledger', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('boom'))))
    const { useGaTrends } = await import('../useGaTrends')
    const t = useGaTrends()
    await t.load()
    expect(t.error.value?.message).toBe('boom')
    expect(t.trends.value).toEqual({})
  })
})

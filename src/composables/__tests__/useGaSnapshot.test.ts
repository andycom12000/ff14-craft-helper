import { describe, it, expect, vi, beforeEach } from 'vitest'

const FIXTURE = {
  schemaVersion: 1,
  generatedAt: '2026-05-20T04:00:00Z',
  propertyId: '527587379',
  windows: {
    '7d':  { window: { days: 7,  startDate: '2026-05-13', endDate: '2026-05-20' }, glance: {}, pages: [] },
    '14d': { window: { days: 14, startDate: '2026-05-06', endDate: '2026-05-20' }, glance: {}, pages: [] },
    '28d': { window: { days: 28, startDate: '2026-04-22', endDate: '2026-05-20' }, glance: {}, pages: [] },
  },
}

describe('useGaSnapshot', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve(FIXTURE),
    } as Response)))
  })

  it('fetches snapshot and exposes loading + data refs', async () => {
    const { useGaSnapshot } = await import('../useGaSnapshot')
    const s = useGaSnapshot()
    expect(s.loading.value).toBe(true)
    await s.load()
    expect(s.loading.value).toBe(false)
    expect(s.error.value).toBeNull()
    expect(s.snapshot.value?.schemaVersion).toBe(1)
    expect(Object.keys(s.snapshot.value?.windows ?? {})).toEqual(['7d', '14d', '28d'])
  })

  it('marks stale when generatedAt is older than 36h', async () => {
    const old = new Date(Date.now() - 40 * 3600 * 1000).toISOString()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve({ ...FIXTURE, generatedAt: old }),
    } as Response)))
    const { useGaSnapshot } = await import('../useGaSnapshot')
    const s = useGaSnapshot()
    await s.load()
    expect(s.staleHours.value).toBeGreaterThanOrEqual(36)
  })

  it('captures error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('boom'))))
    const { useGaSnapshot } = await import('../useGaSnapshot')
    const s = useGaSnapshot()
    await s.load()
    expect(s.error.value?.message).toBe('boom')
    expect(s.snapshot.value).toBeNull()
  })
})

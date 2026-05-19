import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('setUserProperty', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls gtag("set", "user_properties", { key: value }) when gtag exists', async () => {
    const gtag = vi.fn()
    vi.stubGlobal('gtag', gtag)
    Object.defineProperty(window, 'gtag', { value: gtag, configurable: true })

    const { setUserProperty } = await import('@/utils/analytics')
    setUserProperty('market_region', 'cht')

    expect(gtag).toHaveBeenCalledWith('set', 'user_properties', { market_region: 'cht' })
  })

  it('is a no-op when window.gtag is undefined', async () => {
    Object.defineProperty(window, 'gtag', { value: undefined, configurable: true })
    const { setUserProperty } = await import('@/utils/analytics')
    expect(() => setUserProperty('market_region', 'cht')).not.toThrow()
  })

  it('accepts string, number, boolean values', async () => {
    const gtag = vi.fn()
    Object.defineProperty(window, 'gtag', { value: gtag, configurable: true })

    const { setUserProperty } = await import('@/utils/analytics')
    setUserProperty('viewport_bucket', 'wide')
    setUserProperty('endgame_tier_lv', 100)
    setUserProperty('pwa_standalone', true)

    expect(gtag).toHaveBeenNthCalledWith(1, 'set', 'user_properties', { viewport_bucket: 'wide' })
    expect(gtag).toHaveBeenNthCalledWith(2, 'set', 'user_properties', { endgame_tier_lv: 100 })
    expect(gtag).toHaveBeenNthCalledWith(3, 'set', 'user_properties', { pwa_standalone: true })
  })
})

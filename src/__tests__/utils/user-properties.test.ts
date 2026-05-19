import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/analytics', () => ({
  setUserProperty: vi.fn(),
  trackEvent: vi.fn(),
}))

import { setUserProperty } from '@/utils/analytics'
import {
  inferMarketRegion,
  computeViewportBucket,
  computeDeviceClass,
  computeEndgameTier,
  syncUserProperties,
} from '@/utils/user-properties'

describe('inferMarketRegion', () => {
  it('zh-TW → cht', () => { expect(inferMarketRegion('zh-TW')).toBe('cht') })
  it('TW → cht', () => { expect(inferMarketRegion('TW')).toBe('cht') })
  it('CN (simplified Chinese) → intl', () => { expect(inferMarketRegion('CN')).toBe('intl') })
  it('Japan → intl', () => { expect(inferMarketRegion('Japan')).toBe('intl') })
  it('North-America → intl', () => { expect(inferMarketRegion('North-America')).toBe('intl') })
  it('empty → unset', () => { expect(inferMarketRegion('')).toBe('unset') })
})

describe('computeViewportBucket', () => {
  it('width >= 1440 → wide', () => { expect(computeViewportBucket(1440)).toBe('wide') })
  it('width 1024–1439 → standard', () => {
    expect(computeViewportBucket(1024)).toBe('standard')
    expect(computeViewportBucket(1439)).toBe('standard')
  })
  it('width < 1024 → narrow', () => { expect(computeViewportBucket(1023)).toBe('narrow') })
})

describe('computeDeviceClass', () => {
  it('mobile UA → mobile', () => {
    expect(computeDeviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Mobile')).toBe('mobile')
  })
  it('tablet UA → tablet', () => {
    expect(computeDeviceClass('Mozilla/5.0 (iPad; CPU OS 17_0) AppleWebKit')).toBe('tablet')
  })
  it('desktop UA → desktop', () => {
    expect(computeDeviceClass('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0')).toBe('desktop')
  })
})

describe('computeEndgameTier', () => {
  it('lv 100 → 7.x', () => { expect(computeEndgameTier({ CRP: { level: 100 } })).toBe('7.x') })
  it('lv 90 → 6.x', () => { expect(computeEndgameTier({ CRP: { level: 90 } })).toBe('6.x') })
  it('lv 80 → 5.x', () => { expect(computeEndgameTier({ CRP: { level: 80 } })).toBe('5.x') })
  it('takes max across jobs', () => {
    expect(computeEndgameTier({ CRP: { level: 80 }, BSM: { level: 100 } })).toBe('7.x')
  })
  it('empty gearsets → none', () => { expect(computeEndgameTier({})).toBe('none') })
})

describe('syncUserProperties', () => {
  beforeEach(() => { vi.mocked(setUserProperty).mockClear() })

  it('calls setUserProperty for each computed property', () => {
    syncUserProperties({
      region: 'zh-TW',
      gearsets: { CRP: { level: 100 } },
      themeMode: 'light',
      viewportWidth: 1500,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0',
      pwaStandalone: false,
    })
    expect(setUserProperty).toHaveBeenCalledWith('market_region', 'cht')
    expect(setUserProperty).toHaveBeenCalledWith('endgame_tier', '7.x')
    expect(setUserProperty).toHaveBeenCalledWith('theme_mode', 'light')
    expect(setUserProperty).toHaveBeenCalledWith('viewport_bucket', 'wide')
    expect(setUserProperty).toHaveBeenCalledWith('device_class', 'desktop')
    expect(setUserProperty).toHaveBeenCalledWith('pwa_standalone', false)
  })
})

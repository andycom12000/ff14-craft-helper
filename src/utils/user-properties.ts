import { setUserProperty } from '@/utils/analytics'

export type MarketRegion = 'cht' | 'intl' | 'unset'
export type ViewportBucket = 'wide' | 'standard' | 'narrow'
export type DeviceClass = 'mobile' | 'tablet' | 'desktop'
export type EndgameTier = '7.x' | '6.x' | '5.x' | '4.x' | '3.x' | '2.x' | 'none'

// Universalis API region strings: 'zh-TW' / 'TW' = 繁中服; 'CN' = 簡中(國服) → intl.
const CHT_VALUES = new Set(['zh-TW', 'TW'])

export function inferMarketRegion(region: string): MarketRegion {
  if (!region) return 'unset'
  if (CHT_VALUES.has(region)) return 'cht'
  return 'intl'
}

export function computeViewportBucket(width: number): ViewportBucket {
  if (width >= 1440) return 'wide'
  if (width >= 1024) return 'standard'
  return 'narrow'
}

export function computeDeviceClass(ua: string): DeviceClass {
  if (/iPad|tablet/i.test(ua)) return 'tablet'
  if (/Mobile|iPhone|Android/i.test(ua)) return 'mobile'
  return 'desktop'
}

interface GearsetLike { level?: number }

export function computeEndgameTier(gearsets: Record<string, GearsetLike>): EndgameTier {
  let max = 0
  for (const g of Object.values(gearsets)) {
    if (typeof g?.level === 'number' && g.level > max) max = g.level
  }
  if (max === 0) return 'none'
  if (max >= 100) return '7.x'
  if (max >= 90) return '6.x'
  if (max >= 80) return '5.x'
  if (max >= 70) return '4.x'
  if (max >= 60) return '3.x'
  return '2.x'
}

export interface UserPropertySnapshot {
  region: string
  gearsets: Record<string, GearsetLike>
  themeMode: 'light' | 'dark'
  viewportWidth: number
  userAgent: string
  pwaStandalone: boolean
}

export function syncUserProperties(snapshot: UserPropertySnapshot): void {
  setUserProperty('market_region', inferMarketRegion(snapshot.region))
  setUserProperty('endgame_tier', computeEndgameTier(snapshot.gearsets))
  setUserProperty('theme_mode', snapshot.themeMode)
  setUserProperty('viewport_bucket', computeViewportBucket(snapshot.viewportWidth))
  setUserProperty('device_class', computeDeviceClass(snapshot.userAgent))
  setUserProperty('pwa_standalone', snapshot.pwaStandalone)
}

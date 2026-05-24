import { setUserProperty } from '@/utils/analytics'
import { useSettingsStore } from '@/stores/settings'
import { useGearsetsStore } from '@/stores/gearsets'
import { useThemeStore } from '@/stores/theme'
import { inferMarketRegion } from '@/utils/market-region'
export { type MarketRegion, inferMarketRegion } from '@/utils/market-region'

export type ViewportBucket = 'wide' | 'standard' | 'narrow'
export type DeviceClass = 'mobile' | 'tablet' | 'desktop'
export type EndgameTier = '7.x' | '6.x' | '5.x' | '4.x' | '3.x' | '2.x' | 'none'

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
  // UI locale ('zh-TW' | 'zh-CN' | 'en' | 'ja'). market_region is derived from
  // this — NOT the Universalis market region. The market region has no Taiwan
  // value (TW players use Oceania/Japan worlds, 國服 reports as CN), so sourcing
  // it from settings.region made cht permanently 0.
  locale: string
  gearsets: Record<string, GearsetLike>
  themeMode: 'light' | 'dark'
  viewportWidth: number
  userAgent: string
  pwaStandalone: boolean
}

export function syncUserProperties(snapshot: UserPropertySnapshot): void {
  setUserProperty('market_region', inferMarketRegion(snapshot.locale))
  setUserProperty('endgame_tier', computeEndgameTier(snapshot.gearsets))
  setUserProperty('theme_mode', snapshot.themeMode)
  setUserProperty('viewport_bucket', computeViewportBucket(snapshot.viewportWidth))
  setUserProperty('device_class', computeDeviceClass(snapshot.userAgent))
  setUserProperty('pwa_standalone', snapshot.pwaStandalone)
}

// Convenience wrapper that pulls live state from stores. Called by main.ts
// after Pinia is mounted, and re-called by individual store mutations.
export function syncFromStores(): void {
  if (typeof window === 'undefined') return
  const settings = useSettingsStore()
  const gearsets = useGearsetsStore()
  const theme = useThemeStore()

  syncUserProperties({
    locale: settings.language,
    gearsets: gearsets.gearsets as Record<string, GearsetLike>,
    themeMode: theme.mode === 'dark' ? 'dark' : 'light',
    viewportWidth: window.innerWidth,
    userAgent: navigator.userAgent,
    pwaStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
  })
}

export type MarketRegion = 'cht' | 'intl' | 'unset'

// Universalis API region strings: 'zh-TW' / 'TW' = 繁中服; 'CN' = 簡中(國服) → intl.
const CHT_VALUES = new Set(['zh-TW', 'TW'])

export function inferMarketRegion(region: string): MarketRegion {
  if (!region) return 'unset'
  if (CHT_VALUES.has(region)) return 'cht'
  return 'intl'
}

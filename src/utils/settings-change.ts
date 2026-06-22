import { trackEvent } from '@/utils/analytics'

export type SettingsKey =
  | 'server'
  | 'data_center'
  | 'region'
  | 'price_display_mode'
  | 'cross_server'
  | 'recursive_pricing'
  | 'max_recursion_depth'
  | 'exception_strategy'
  | 'raw_material_default'
  | 'meld_advice'
  | 'language'

type SettingsValue = string | number | boolean | null | undefined

function stringify(value: SettingsValue): string {
  if (value === null || value === undefined) return ''
  return String(value).slice(0, 100)
}

export function emitSettingsChange(
  key: SettingsKey,
  prev: SettingsValue,
  next: SettingsValue,
): void {
  if (prev === next) return
  const prevStr = stringify(prev)
  const nextStr = stringify(next)
  trackEvent('settings_change', { key, prev: prevStr, value: nextStr })
}

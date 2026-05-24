// Mirrors the CSS custom properties in tokens.css — tweak values here AND
// in tokens.css together; nothing keeps them in sync at runtime.
export const C = {
  // surfaces
  bg:          'oklch(0.18 0.018 62)',
  bgDeep:      'oklch(0.14 0.014 60)',
  surface:     'oklch(0.225 0.018 62)',
  surface2:    'oklch(0.26 0.022 62)',
  surface3:    'oklch(0.30 0.025 64)',
  border:      'oklch(0.42 0.035 60 / 0.36)',
  borderSoft:  'oklch(0.42 0.035 60 / 0.18)',

  // ink
  ink:         'oklch(0.94 0.022 82)',
  inkMid:      'oklch(0.80 0.022 75)',
  inkMuted:    'oklch(0.66 0.024 68)',
  inkFaint:    'oklch(0.52 0.028 62)',

  // brand
  gold:        'oklch(0.78 0.15 72)',
  goldGlow:    'oklch(0.78 0.15 72 / 0.16)',
  goldDim:     'oklch(0.78 0.15 72 / 0.30)',
  crust:       'oklch(0.66 0.11 50)',

  // jam-jar
  cocoa:       'oklch(0.66 0.14 40)',
  cocoaDark:   'oklch(0.50 0.13 40)',
  strawberry:  'oklch(0.70 0.18 15)',
  matcha:      'oklch(0.72 0.15 138)',
  blueberry:   'oklch(0.66 0.16 248)',
  meta:        'oklch(0.50 0.04 65)',

  // semantic
  success:     'oklch(0.70 0.16 145)',
  warning:     'oklch(0.74 0.16 60)',
  danger:      'oklch(0.68 0.20 22)',
} as const

export type FamilyColorMap<K extends string> = Record<K, string>

// Page taxonomy → jam-jar hue
import type { PageFamily, EventFamily } from '@/types/ga-snapshot'

export const pageFamilyColor: FamilyColorMap<PageFamily> = {
  core:    C.gold,
  craft:   C.cocoa,
  gather:  C.matcha,
  company: C.blueberry,
  meta:    C.meta,
  market:  C.strawberry,
}

export const eventFamilyColor: FamilyColorMap<EventFamily> = {
  core:    C.gold,
  craft:   C.cocoa,
  gather:  C.matcha,
  company: C.blueberry,
  meta:    C.meta,
  market:  C.strawberry,
  error:   C.danger,
}

// Region split colors — single source of truth shared by RegionSplitLedger and
// MarketRegionStack so the same region never reads as two different hues across
// charts (cht was gold in the ledger but cocoa in the stack; unset was gold in
// the stack but faint in the ledger — a cross-chart correctness trap).
// Matches RegionSplitLedger's established CSS tokens (cht=gold, intl=strawberry,
// unset=faint). MarketRegionStack distinguishes its two neutral segments by
// opacity, not hue, so neither reads as the gold cht accent.
export const regionColor = {
  cht:   C.gold,        // 繁中 / Taiwan-locale users
  intl:  C.strawberry,  // international
  unset: C.inkFaint,    // not yet resolved / historical (not set)
} as const

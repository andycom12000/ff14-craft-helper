export type Job = 'CRP' | 'BSM' | 'ARM' | 'GSM' | 'LTW' | 'WVR' | 'ALC' | 'CUL'

export const JOB_ORDER: readonly Job[] = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL']

export const JOB_NAMES: Record<string, string> = {
  CRP: '木工師',
  BSM: '鍛造師',
  ARM: '甲冑師',
  GSM: '金工師',
  LTW: '皮革師',
  WVR: '裁縫師',
  ALC: '鍊金術師',
  CUL: '烹調師',
}

export const JOB_ICONS: Record<string, string> = {
  CRP: '🪓', BSM: '⚒️', ARM: '🛡️', GSM: '💍',
  LTW: '🧶', WVR: '🪡', ALC: '⚗️', CUL: '🍳',
}

// Short 2-character job names without 師/術師 suffix.
// Used in compact UI labels (job badges, tags) and by yyyy.games API.
export const JOB_NAMES_SHORT: Record<string, string> = {
  CRP: '木工',
  BSM: '鍛造',
  ARM: '甲冑',
  GSM: '金工',
  LTW: '皮革',
  WVR: '裁縫',
  ALC: '鍊金',
  CUL: '烹調',
}

export const JOB_ABBR: Record<string, string> = Object.fromEntries([
  ...Object.entries(JOB_NAMES).map(([abbr, name]) => [name, abbr]),
  ...Object.entries(JOB_NAMES_SHORT).map(([abbr, name]) => [name, abbr]),
])

export function getJobName(abbr: string): string {
  return JOB_NAMES[abbr] ?? abbr
}

export function getJobNameShort(abbr: string): string {
  return JOB_NAMES_SHORT[abbr] ?? abbr
}

export function getJobLabel(abbr: string): string {
  return `${JOB_ICONS[abbr] ?? ''} ${JOB_NAMES[abbr] ?? abbr}`.trim()
}

// FFXIV CraftType sheet: 0..7 → DoH job abbreviation
// keep in sync with scripts/build-game-data.mjs CRAFT_TYPE_TO_JOB
export const CRAFT_TYPE_TO_JOB: Record<number, keyof typeof JOB_NAMES> = {
  0: 'CRP',
  1: 'BSM',
  2: 'ARM',
  3: 'GSM',
  4: 'LTW',
  5: 'WVR',
  6: 'ALC',
  7: 'CUL',
}

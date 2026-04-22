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

// yyyy.games API returns short job names without 師/術師
const API_JOB_NAMES: Record<string, string> = {
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
  ...Object.entries(API_JOB_NAMES).map(([abbr, name]) => [name, abbr]),
])

export function getJobName(abbr: string): string {
  return JOB_NAMES[abbr] ?? abbr
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

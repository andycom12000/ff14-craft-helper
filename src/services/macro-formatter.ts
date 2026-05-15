import { getSkillById, getSkillNameByLocale } from '@/engine/skills'
import type { SupportedLocale } from '@/engine/skills'
import { useLocaleStore } from '@/stores/locale'

const MACRO_LINE_LIMIT = 15

// Per-skill animation time，對拍 raphael upstream `time_cost()`
// (raphael-sim/src/actions.rs)。在表內的技能用表中數值；不在表內的技能 fallback
// 到使用者設定的 `waitTime`（預設 3，MacroExport 面板可調）。
//
// 註：
// - Manipulation 上游是 2s，但目前我們先維持 3（走 waitTime 預設），確認 2s 在
//   實機穩定後再加進表。
// - FinalAppraisal 不在 raphael 的 action enum 內，這裡釘成 2s 維持既有行為。
const SKILL_WAIT_TIME: ReadonlyMap<string, number> = new Map([
  ['WasteNot', 2],
  ['WasteNotII', 2],
  ['Veneration', 2],
  ['Innovation', 2],
  ['GreatStrides', 2],
  ['FinalAppraisal', 2],
])

interface FormatOptions {
  waitTime?: number
  includeEcho?: boolean
  /**
   * Locale for the macro's skill names and echo text. When omitted, falls back
   * to the current locale from the locale store so macros always match what
   * the UI is showing.
   */
  locale?: SupportedLocale
}

function resolveLocale(explicit?: SupportedLocale): SupportedLocale {
  if (explicit) return explicit
  try {
    return useLocaleStore().current as SupportedLocale
  } catch {
    // Pinia store may not be active (e.g. unit tests that don't install Pinia).
    // Fall back to zh-TW so behaviour matches the historical default.
    return 'zh-TW'
  }
}

function formatAction(skillId: string, waitTime: number, locale: SupportedLocale): string {
  const skill = getSkillById(skillId)
  const name = skill ? getSkillNameByLocale(skill.id, locale) : skillId
  const wait = SKILL_WAIT_TIME.get(skillId) ?? waitTime
  return `/ac ${name} <wait.${wait}>`
}

function formatEcho(index: number, locale: SupportedLocale): string {
  const n = index + 1
  switch (locale) {
    case 'en':
      return `/echo Macro ${n} complete <se.1>`
    case 'ja':
      return `/echo マクロ ${n} 完了 <se.1>`
    case 'zh-CN':
    case 'zh-TW':
    default:
      return `/echo 巨集 ${n} 完成 <se.1>`
  }
}

export function formatMacros(
  actions: string[],
  options: FormatOptions = {},
): string[] {
  if (actions.length === 0) return []

  const { waitTime = 3, includeEcho = true } = options
  const locale = resolveLocale(options.locale)
  const lines = actions.map(a => formatAction(a, waitTime, locale))
  const result: string[][] = []
  let current: string[] = []

  for (const line of lines) {
    const limit = includeEcho ? MACRO_LINE_LIMIT - 1 : MACRO_LINE_LIMIT
    if (current.length >= limit) {
      result.push(current)
      current = []
    }
    current.push(line)
  }
  if (current.length > 0) result.push(current)

  return result.map((chunk, i) => {
    const macroLines = [...chunk]
    if (includeEcho) {
      macroLines.push(formatEcho(i, locale))
    }
    return macroLines.join('\n')
  })
}

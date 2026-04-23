import { getSkillById, getSkillNameByLocale } from '@/engine/skills'
import type { SupportedLocale } from '@/engine/skills'
import { useLocaleStore } from '@/stores/locale'

const MACRO_LINE_LIMIT = 15
const BUFF_CATEGORIES = new Set(['buff', 'other'])

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
  const wait = skill && BUFF_CATEGORIES.has(skill.category)
    ? Math.min(waitTime, 2)
    : waitTime
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

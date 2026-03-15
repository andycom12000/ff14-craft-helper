import { getSkillById } from '@/engine/skills'

const MACRO_LINE_LIMIT = 15
const BUFF_CATEGORIES = new Set(['buff', 'other'])

interface FormatOptions {
  waitTime?: number
  includeEcho?: boolean
}

function formatAction(skillId: string, waitTime: number): string {
  const skill = getSkillById(skillId)
  const name = skill?.nameZh ?? skillId
  const wait = skill && BUFF_CATEGORIES.has(skill.category)
    ? Math.min(waitTime, 2)
    : waitTime
  return `/ac ${name} <wait.${wait}>`
}

export function formatMacros(
  actions: string[],
  options: FormatOptions = {},
): string[] {
  if (actions.length === 0) return []

  const { waitTime = 3, includeEcho = true } = options
  const lines = actions.map(a => formatAction(a, waitTime))
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
      macroLines.push(`/echo 巨集 ${i + 1} 完成 <se.1>`)
    }
    return macroLines.join('\n')
  })
}

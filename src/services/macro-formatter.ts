import { getSkillById } from '@/engine/skills'

const MACRO_LINE_LIMIT = 15
const BUFF_CATEGORIES = new Set(['buff', 'other'])

interface FormatOptions {
  waitTime?: number
  includeEcho?: boolean
}

function getWaitTime(skillId: string, defaultWait: number): number {
  const skill = getSkillById(skillId)
  if (skill && BUFF_CATEGORIES.has(skill.category)) {
    return Math.min(defaultWait, 2)
  }
  return defaultWait
}

function formatAction(skillId: string, waitTime: number): string {
  const skill = getSkillById(skillId)
  const name = skill?.nameZh ?? skillId
  return `/ac ${name} <wait.${getWaitTime(skillId, waitTime)}>`
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

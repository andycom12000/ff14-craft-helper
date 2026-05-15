import { describe, it, expect } from 'vitest'
import { formatMacros } from '@/services/macro-formatter'

describe('formatMacros', () => {
  it('converts action IDs to macro lines', () => {
    const result = formatMacros(['muscle_memory', 'veneration', 'groundwork'])
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('/ac')
    expect(result[0]).toContain('<wait.')
  })

  it('splits into multiple macros when exceeding line limit', () => {
    const actions = Array(20).fill('groundwork')
    const result = formatMacros(actions)
    expect(result.length).toBeGreaterThan(1)
  })

  it('returns empty array for no actions', () => {
    expect(formatMacros([])).toEqual([])
  })

  it('includes echo by default', () => {
    const result = formatMacros(['groundwork'])
    expect(result[0]).toContain('/echo')
  })

  it('excludes echo when disabled', () => {
    const result = formatMacros(['groundwork'], { includeEcho: false })
    expect(result[0]).not.toContain('/echo')
  })

  it.each([
    ['TrainedPerfection'],
    ['HeartAndSoul'],
    ['QuickInnovation'],
    ['Observe'],
    ['TricksOfTheTrade'],
  ])('falls back to waitTime for %s (not in SKILL_WAIT_TIME → uses default 3)', (id) => {
    const result = formatMacros([id], { includeEcho: false })
    expect(result[0]).toContain('<wait.3>')
  })

  it.each([
    ['WasteNot'],
    ['WasteNotII'],
    ['Veneration'],
    ['Innovation'],
    ['GreatStrides'],
    ['FinalAppraisal'],
  ])('uses 2s for %s (per SKILL_WAIT_TIME table)', (id) => {
    const result = formatMacros([id], { includeEcho: false })
    expect(result[0]).toContain('<wait.2>')
  })
})

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
})

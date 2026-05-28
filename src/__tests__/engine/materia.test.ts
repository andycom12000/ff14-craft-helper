import { describe, it, expect } from 'vitest'
import { MATERIA_GRADES } from '@/engine/materia'

describe('MATERIA_GRADES', () => {
  it('covers craftsmanship/control/cp at the top grade', () => {
    const top = Math.max(...MATERIA_GRADES.map(m => m.grade))
    const topGradeStats = new Set(
      MATERIA_GRADES.filter(m => m.grade === top).map(m => m.stat),
    )
    expect(topGradeStats.has('craftsmanship')).toBe(true)
    expect(topGradeStats.has('control')).toBe(true)
    expect(topGradeStats.has('cp')).toBe(true)
  })

  it('every entry has a positive value and a Universalis itemId', () => {
    for (const m of MATERIA_GRADES) {
      expect(m.value).toBeGreaterThan(0)
      expect(m.itemId).toBeGreaterThan(0)
    }
  })
})

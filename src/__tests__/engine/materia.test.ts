import { describe, it, expect } from 'vitest'
import {
  MATERIA_GRADES,
  SLOT_STRUCTURE,
  OVERMELD_SUCCESS_LADDER,
  BIS_REFERENCE,
} from '@/engine/materia'

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

describe('SLOT_STRUCTURE', () => {
  it('has positive guaranteed and overmeld slot totals', () => {
    expect(SLOT_STRUCTURE.guaranteedSlots).toBeGreaterThan(0)
    expect(SLOT_STRUCTURE.overmeldSlots).toBeGreaterThan(0)
  })

  it('total slots are within a sane range for a 12-piece crafter set', () => {
    const total = SLOT_STRUCTURE.guaranteedSlots + SLOT_STRUCTURE.overmeldSlots
    expect(total).toBeGreaterThanOrEqual(20)
    expect(total).toBeLessThanOrEqual(60)
  })
})

describe('OVERMELD_SUCCESS_LADDER', () => {
  it('is monotone non-increasing in (0, 1]', () => {
    expect(OVERMELD_SUCCESS_LADDER.length).toBeGreaterThan(0)
    for (let i = 0; i < OVERMELD_SUCCESS_LADDER.length; i++) {
      expect(OVERMELD_SUCCESS_LADDER[i]).toBeGreaterThan(0)
      expect(OVERMELD_SUCCESS_LADDER[i]).toBeLessThanOrEqual(1)
      if (i > 0) {
        expect(OVERMELD_SUCCESS_LADDER[i]).toBeLessThanOrEqual(OVERMELD_SUCCESS_LADDER[i - 1])
      }
    }
  })
})

describe('BIS_REFERENCE', () => {
  it('matches the maintained reference (snapshot)', () => {
    expect(BIS_REFERENCE).toMatchSnapshot()
  })

  it('has positive values for all three stats', () => {
    expect(BIS_REFERENCE.craftsmanship).toBeGreaterThan(0)
    expect(BIS_REFERENCE.control).toBeGreaterThan(0)
    expect(BIS_REFERENCE.cp).toBeGreaterThan(0)
  })
})

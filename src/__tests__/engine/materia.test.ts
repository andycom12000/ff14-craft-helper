import { describe, it, expect } from 'vitest'
import {
  MATERIA_GRADES,
  SLOT_STRUCTURE,
  OVERMELD_SUCCESS_LADDER,
  materiaForStat,
  topGradeForStat,
  expectedCountForOvermeldDepth,
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

  it('uses the corrected per-piece guaranteed/overmeld split (#105)', () => {
    // weapon 2 + tool 1 + 5 armor x 2 (10) + 5 accessories x 1 (5) = 18 guaranteed
    expect(SLOT_STRUCTURE.guaranteedSlots).toBe(18)
    // 60 total - 18 guaranteed = 42 overmeld
    expect(SLOT_STRUCTURE.overmeldSlots).toBe(42)
    // a full crafter set is 12 pieces x 5 = 60 slots
    expect(SLOT_STRUCTURE.guaranteedSlots + SLOT_STRUCTURE.overmeldSlots).toBe(60)
  })
})

describe('OVERMELD_SUCCESS_LADDER', () => {
  it('matches the corrected per-depth advanced-melding rates (#101)', () => {
    expect(OVERMELD_SUCCESS_LADDER).toEqual([0.17, 0.10, 0.07, 0.05])
  })

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

describe('topGradeForStat', () => {
  it('returns the highest-grade materia for a given stat', () => {
    const top = topGradeForStat('craftsmanship')
    expect(top).not.toBeNull()
    expect(top!.grade).toBe(12)
    expect(top!.value).toBeGreaterThan(0)
  })
})

describe('materiaForStat', () => {
  it('returns all materia of a given stat sorted descending by grade', () => {
    const list = materiaForStat('control')
    expect(list.length).toBeGreaterThan(0)
    for (let i = 1; i < list.length; i++) {
      expect(list[i].grade).toBeLessThanOrEqual(list[i - 1].grade)
    }
  })
})

describe('expectedCountForOvermeldDepth', () => {
  it('returns placed count divided by success rate at the given depth', () => {
    const placed = 5
    const expected = expectedCountForOvermeldDepth(0, placed)
    expect(expected).toBeCloseTo(placed / 0.17, 5)
  })

  it('uses the corrected per-depth rates (#101)', () => {
    // depth 0 -> 1 / 0.17 = 5.88, depth 1 -> 1 / 0.10 = 10,
    // depth 2 -> 1 / 0.07 = 14.29, depth 3 -> 1 / 0.05 = 20
    expect(expectedCountForOvermeldDepth(0, 1)).toBeCloseTo(1 / 0.17, 5)
    expect(expectedCountForOvermeldDepth(1, 1)).toBeCloseTo(1 / 0.10, 5)
    expect(expectedCountForOvermeldDepth(2, 1)).toBeCloseTo(1 / 0.07, 5)
    expect(expectedCountForOvermeldDepth(3, 1)).toBeCloseTo(1 / 0.05, 5)
  })

  it('depths beyond the ladder use the last entry (deepest, lowest rate)', () => {
    const last = OVERMELD_SUCCESS_LADDER[OVERMELD_SUCCESS_LADDER.length - 1]
    expect(expectedCountForOvermeldDepth(99, 1)).toBeCloseTo(1 / last, 5)
  })
})

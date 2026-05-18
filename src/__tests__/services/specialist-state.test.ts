import { describe, it, expect } from 'vitest'
import type { GearsetMap, GearsetStats } from '@/stores/gearsets'
import {
  currentSpecialists,
  specialistCount,
  applyCrafterSoulBonus,
  SPECIALIST_BONUS,
} from '@/services/specialist-state'

function makeStats(overrides: Partial<GearsetStats> = {}): GearsetStats {
  return {
    level: 100,
    craftsmanship: 4000,
    control: 4000,
    cp: 600,
    isSpecialist: false,
    ...overrides,
  }
}

function makeGearsetMap(flags: Record<string, boolean>): GearsetMap {
  const map: GearsetMap = {}
  for (const [job, isSpecialist] of Object.entries(flags)) {
    map[job] = makeStats({ isSpecialist })
  }
  return map
}

describe('currentSpecialists', () => {
  it('returns empty array when no gearset is flagged', () => {
    const map = makeGearsetMap({ CRP: false, BSM: false, ARM: false })
    expect(currentSpecialists(map)).toEqual([])
  })

  it('returns the single flagged job', () => {
    const map = makeGearsetMap({ CRP: false, BSM: true, ARM: false })
    expect(currentSpecialists(map)).toEqual(['BSM'])
  })

  it('returns every flagged job in iteration order', () => {
    const map = makeGearsetMap({
      CRP: true,
      BSM: false,
      ARM: true,
      GSM: true,
      LTW: false,
    })
    expect(currentSpecialists(map)).toEqual(['CRP', 'ARM', 'GSM'])
  })

  it('does not enforce the 3-token cap — caller can flag 8 jobs', () => {
    const map = makeGearsetMap({
      CRP: true, BSM: true, ARM: true, GSM: true,
      LTW: true, WVR: true, ALC: true, CUL: true,
    })
    const list = currentSpecialists(map)
    expect(list).toHaveLength(8)
    expect(list).toContain('CUL')
  })
})

describe('specialistCount', () => {
  it('matches currentSpecialists().length across scenarios', () => {
    const cases: GearsetMap[] = [
      makeGearsetMap({ CRP: false }),
      makeGearsetMap({ CRP: true }),
      makeGearsetMap({ CRP: true, BSM: true, ARM: true }),
      makeGearsetMap({ CRP: true, BSM: true, ARM: true, GSM: true, LTW: true }),
    ]
    for (const map of cases) {
      expect(specialistCount(map)).toBe(currentSpecialists(map).length)
    }
  })
})

describe('applyCrafterSoulBonus', () => {
  it('returns identical stat values (in a fresh object) when isSpecialist=false', () => {
    const input = makeStats({ isSpecialist: false, craftsmanship: 4123, control: 4500, cp: 620 })
    const result = applyCrafterSoulBonus(input)
    expect(result).toEqual(input)
    expect(result).not.toBe(input) // fresh copy — defensive against mutation
  })

  it('adds +20/+20/+15 when isSpecialist=true', () => {
    const input = makeStats({ isSpecialist: true, craftsmanship: 4000, control: 4200, cp: 600 })
    const result = applyCrafterSoulBonus(input)
    expect(result.craftsmanship).toBe(4000 + SPECIALIST_BONUS.craftsmanship)
    expect(result.control).toBe(4200 + SPECIALIST_BONUS.control)
    expect(result.cp).toBe(600 + SPECIALIST_BONUS.cp)
  })

  it('preserves non-stat fields (level, isSpecialist)', () => {
    const input = makeStats({ isSpecialist: true, level: 95 })
    const result = applyCrafterSoulBonus(input)
    expect(result.level).toBe(95)
    expect(result.isSpecialist).toBe(true)
  })

  it('exposes the canonical bonus constants 20/20/15', () => {
    expect(SPECIALIST_BONUS).toEqual({ craftsmanship: 20, control: 20, cp: 15 })
  })
})

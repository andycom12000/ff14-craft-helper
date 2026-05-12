import { describe, it, expect } from 'vitest'
import { computeBaseQuality, computeBaseProgress, canReachHQQuality, canReachHQQualityStrict } from '@/services/feasibility-prefilter'
import type { Recipe } from '@/stores/recipe'
import fixture from '../fixtures/prefilter-fixture.json'
import type { GearsetStats } from '@/stores/gearsets'
import type { RecipeLevelTable } from '@/stores/recipe'

const lv90Rlt = {
  classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
  durability: 80, suggestedCraftsmanship: 3500,
  progressDivider: 130, qualityDivider: 115,
  progressModifier: 90, qualityModifier: 80,
}

describe('computeBaseQuality / computeBaseProgress', () => {
  it('applies recipe-level modifier when crafter level ≤ rlvl', () => {
    expect(computeBaseQuality(3800, 90, lv90Rlt)).toBe(292)
    expect(computeBaseProgress(4000, 90, lv90Rlt)).toBe(278)
  })

  it('skips modifier when crafter outlevels recipe', () => {
    expect(computeBaseQuality(3800, 100, lv90Rlt)).toBe(365)
  })
})

const lv94Recipe: Recipe = {
  id: 1, itemId: 100, name: 'test', icon: '', job: 'CRP',
  level: 94, stars: 0, canHq: true, materialQualityFactor: 50, amountResult: 1,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 94, stars: 0, difficulty: 4400, quality: 8500,
    durability: 80, suggestedCraftsmanship: 3950,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 80,
  },
}

describe('canReachHQQuality', () => {
  it('passes when control + CP comfortably exceed target', () => {
    expect(canReachHQQuality(lv94Recipe, { level: 100, craftsmanship: 5000, control: 5000, cp: 700 })).toBe(true)
  })

  it('rejects when both control and CP are starved', () => {
    expect(canReachHQQuality(lv94Recipe, { level: 94, craftsmanship: 3500, control: 100, cp: 50 })).toBe(false)
  })
})

interface PrefilterFixtureRow {
  label: string
  rlv: number
  rlt: RecipeLevelTable
  gearset: GearsetStats
  expectedStrict: boolean
}

describe('canReachHQQualityStrict — 57-row calibration fixture', () => {
  const rows = fixture as PrefilterFixtureRow[]

  it.each(rows)('$label → predicted=$expectedStrict', (row) => {
    const recipe = {
      id: 0, itemId: 0, name: row.label, icon: '', job: 'CRP',
      level: row.rlt.classJobLevel, stars: row.rlt.stars,
      canHq: true, materialQualityFactor: 0, amountResult: 1,
      ingredients: [], recipeLevelTable: row.rlt,
    } as unknown as import('@/stores/recipe').Recipe
    expect(canReachHQQualityStrict(recipe, row.gearset)).toBe(row.expectedStrict)
  })
})

import { describe, it, expect } from 'vitest'
import type { Recipe } from '@/stores/recipe'
import type { RltRecord } from '@/services/local-data-source.types'
import type { LevelSyncTables } from '@/services/local-data-source'
import type { GearsetStats } from '@/stores/gearsets'
import { partitionLevelTargets } from '@/services/batch-level-gating'

// Fixture table — same three rows used by src/engine/__tests__/level-sync.spec.ts.
function makeTables(): LevelSyncTables {
  const rlt = new Map<number, RltRecord>([
    [560, {
      classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200, durability: 80,
      suggestedCraftsmanship: 2805, progressDivider: 130, qualityDivider: 115,
      progressModifier: 90, qualityModifier: 80, conditionsFlag: 15,
    }],
    [660, {
      classJobLevel: 94, stars: 0, difficulty: 4800, quality: 9400, durability: 80,
      suggestedCraftsmanship: 3706, progressDivider: 152, qualityDivider: 132,
      progressModifier: 100, qualityModifier: 100, conditionsFlag: 15,
    }],
    [690, {
      classJobLevel: 100, stars: 0, difficulty: 6600, quality: 12000, durability: 80,
      suggestedCraftsmanship: 4207, progressDivider: 170, qualityDivider: 150,
      progressModifier: 90, qualityModifier: 75, conditionsFlag: 15,
    }],
  ])

  const lvAdjust = new Array<number>(101).fill(0)
  lvAdjust[90] = 560
  lvAdjust[94] = 660
  lvAdjust[100] = 690

  return { rlt, lvAdjust }
}

// 同步配方：rlv 690 / maxAdjustableJobLevel 100 / factors 61-48-50 — the shape
// all 768 real level-synced recipes ship as (ADR 0003).
function makeSyncedRecipe(): Recipe {
  return {
    id: 36480,
    itemId: 1,
    name: '統一規格的棉線',
    icon: '',
    job: 'WVR',
    level: 100,
    stars: 0,
    canHq: true,
    materialQualityFactor: 0,
    amountResult: 1,
    ingredients: [],
    recipeLevelTable: {
      classJobLevel: 100,
      stars: 0,
      difficulty: 4026,
      quality: 5760,
      durability: 40,
      suggestedCraftsmanship: 4207,
      progressDivider: 170,
      qualityDivider: 150,
      progressModifier: 90,
      qualityModifier: 75,
    },
    rlv: 690,
    maxAdjustableJobLevel: 100,
    difficultyFactor: 61,
    qualityFactor: 48,
    durabilityFactor: 50,
  }
}

const gearsetLv90: GearsetStats = { level: 90, craftsmanship: 2000, control: 2000, cp: 400, isSpecialist: false }

describe('partitionLevelTargets', () => {
  it('does not misclassify a level-synced recipe against a low-level gearset (regression, US5)', () => {
    // Canonical recipe reads Lv100 with no hard gates. Naively checking the
    // gate against the unsynced recipe would classify this as "soft" (100 > 90,
    // no stars) even though syncing to WVR Lv90 lands exactly on classJobLevel 90.
    const targets = [{ recipe: makeSyncedRecipe(), quantity: 1 }]
    const getGearset = () => gearsetLv90

    const { hard, soft } = partitionLevelTargets(targets, getGearset, makeTables())

    expect(hard).toEqual([])
    expect(soft).toEqual([])
  })

  it('still classifies a genuinely low-level non-synced recipe as soft', () => {
    const recipe: Recipe = {
      id: 1, itemId: 100, name: 'Test', icon: '', job: 'CRP',
      level: 90, stars: 0, canHq: true, materialQualityFactor: 75, amountResult: 1,
      ingredients: [],
      recipeLevelTable: {
        classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
        durability: 80, suggestedCraftsmanship: 0,
        progressDivider: 130, qualityDivider: 115,
        progressModifier: 90, qualityModifier: 80,
      },
    }
    const targets = [{ recipe, quantity: 1 }]
    const getGearset = (): GearsetStats => ({ level: 80, craftsmanship: 2000, control: 2000, cp: 400, isSpecialist: false })

    const { hard, soft } = partitionLevelTargets(targets, getGearset, null)

    expect(hard).toEqual([])
    expect(soft).toHaveLength(1)
    expect(soft[0].recipe.recipeLevelTable.classJobLevel).toBe(90)
  })

  it('still classifies a genuinely hard-gated recipe as hard even after attempting sync', () => {
    const recipe: Recipe = {
      id: 2, itemId: 200, name: 'Starred', icon: '', job: 'CRP',
      level: 90, stars: 2, canHq: true, materialQualityFactor: 75, amountResult: 1,
      ingredients: [],
      recipeLevelTable: {
        classJobLevel: 90, stars: 2, difficulty: 3500, quality: 7200,
        durability: 80, suggestedCraftsmanship: 0,
        progressDivider: 130, qualityDivider: 115,
        progressModifier: 90, qualityModifier: 80,
      },
    }
    const targets = [{ recipe, quantity: 1 }]
    const getGearset = (): GearsetStats => ({ level: 80, craftsmanship: 2000, control: 2000, cp: 400, isSpecialist: false })

    const { hard, soft } = partitionLevelTargets(targets, getGearset, null)

    expect(soft).toEqual([])
    expect(hard).toHaveLength(1)
  })

  it('skips targets with no gearset or an unconfigured (0/0) gearset', () => {
    const recipe = makeSyncedRecipe()
    const targets = [{ recipe, quantity: 1 }]

    const noGearset = partitionLevelTargets(targets, () => null, makeTables())
    expect(noGearset).toEqual({ hard: [], soft: [] })

    const unconfigured = partitionLevelTargets(
      targets,
      () => ({ level: 90, craftsmanship: 0, control: 0, cp: 0, isSpecialist: false }),
      makeTables(),
    )
    expect(unconfigured).toEqual({ hard: [], soft: [] })
  })
})

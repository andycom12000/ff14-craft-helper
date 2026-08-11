import { describe, it, expect } from 'vitest'
import type { Recipe } from '@/stores/recipe'
import type { RltRecord } from '@/services/local-data-source.types'
import {
  isLevelSyncedRecipe,
  syncRecipeToCrafterLevel,
  type LevelSyncTables,
} from '../level-sync'

// Fixture tables — 三列真實資料，覆蓋 ADR 0003 記載的兩組實機對拍
// （CRP Lv94 / WVR Lv90）與 Lv100 恆等變換。
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

// 基準配方：rlv 690 / Lv100，factors 61/48/50（ADR 0003 的實機對拍配方）。
function makeBaseRecipe(): Recipe {
  return {
    id: 36168,
    itemId: 1,
    name: '研究用的木材',
    icon: '',
    job: '木工',
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

describe('syncRecipeToCrafterLevel', () => {
  it('實機 golden A：CRP Lv94 × 研究用的木材 → 2928 / 4512 / 40', () => {
    const recipe = makeBaseRecipe()
    const tables = makeTables()
    const result = syncRecipeToCrafterLevel(recipe, 94, tables)

    expect(result.recipeLevelTable.difficulty).toBe(2928)
    expect(result.recipeLevelTable.quality).toBe(4512)
    expect(result.recipeLevelTable.durability).toBe(40)
    expect(result.level).toBe(94)
    expect(result.recipeLevelTable.classJobLevel).toBe(94)
    expect(result.rlv).toBe(660)
  })

  it('實機 golden B：WVR Lv90 × 統一規格的棉線 → 2135 / 3456 / 40', () => {
    const recipe: Recipe = { ...makeBaseRecipe(), id: 36480, name: '統一規格的棉線', job: '裁縫' }
    const tables = makeTables()
    const result = syncRecipeToCrafterLevel(recipe, 90, tables)

    expect(result.recipeLevelTable.difficulty).toBe(2135)
    expect(result.recipeLevelTable.quality).toBe(3456)
    expect(result.recipeLevelTable.durability).toBe(40)
    expect(result.level).toBe(90)
    expect(result.rlv).toBe(560)
  })

  it('Lv100 恆等變換：回傳同一個 reference，且沒有 levelSync', () => {
    const recipe = makeBaseRecipe()
    const tables = makeTables()
    const result = syncRecipeToCrafterLevel(recipe, 100, tables)

    expect(result).toBe(recipe)
    expect(result.levelSync).toBeUndefined()
  })

  it('製作者等級超過上限時被截斷，等同 Lv100（原樣返回）', () => {
    const recipe = makeBaseRecipe()
    const tables = makeTables()
    const result = syncRecipeToCrafterLevel(recipe, 120, tables)

    expect(result).toBe(recipe)
  })

  it('製作者等級超過配方自己的上限（maxAdjustableJobLevel）時被截斷到該上限，' +
    '結果數值可觀測（非 identity 早退）', () => {
    // maxAdjustableJobLevel=90 < crafterLevel=94 → truncated to L=90 → rlv 560's
    // 2135/3456/40 (NOT rlv 660's 2928/4512/40). Deleting the
    // `Math.min(..., maxAdjustableJobLevel)` clamp in level-sync.ts would make
    // this resolve to L=94 → rlv 660 → 2928, so this assertion catches that
    // regression — unlike the Lv120/maxAdjustableJobLevel=100 case above, which
    // lands on the Lv100 identity early-return and doesn't exercise the clamp.
    const recipe: Recipe = { ...makeBaseRecipe(), maxAdjustableJobLevel: 90 }
    const tables = makeTables()
    const result = syncRecipeToCrafterLevel(recipe, 94, tables)

    expect(result.recipeLevelTable.difficulty).toBe(2135)
    expect(result.recipeLevelTable.quality).toBe(3456)
    expect(result.recipeLevelTable.durability).toBe(40)
    expect(result.level).toBe(90)
    expect(result.rlv).toBe(560)
  })

  it('非同步配方（maxAdjustableJobLevel 為 0 或 undefined）原樣返回', () => {
    const tables = makeTables()

    const zero: Recipe = { ...makeBaseRecipe(), maxAdjustableJobLevel: 0 }
    expect(syncRecipeToCrafterLevel(zero, 50, tables)).toBe(zero)

    const missing: Recipe = { ...makeBaseRecipe() }
    delete missing.maxAdjustableJobLevel
    expect(syncRecipeToCrafterLevel(missing, 50, tables)).toBe(missing)
  })

  it('換算表缺席時原樣返回', () => {
    const recipe = makeBaseRecipe()

    expect(syncRecipeToCrafterLevel(recipe, 90, null)).toBe(recipe)
    expect(syncRecipeToCrafterLevel(recipe, 90, { rlt: new Map(), lvAdjust: [] })).toBe(recipe)
  })

  it('不動製作者數值：輸出與輸入除了 level/stars/rlv/recipeLevelTable/levelSync 之外逐 key 相等', () => {
    const recipe = makeBaseRecipe()
    const tables = makeTables()
    const result = syncRecipeToCrafterLevel(recipe, 94, tables)

    const exempt = new Set(['level', 'stars', 'rlv', 'recipeLevelTable', 'levelSync'])
    const keys = new Set([...Object.keys(recipe), ...Object.keys(result)])
    for (const key of keys) {
      if (exempt.has(key)) continue
      expect((result as unknown as Record<string, unknown>)[key]).toEqual((recipe as unknown as Record<string, unknown>)[key])
    }
  })

  it('降級標示：Lv94 有 levelSync，Lv100 沒有', () => {
    const recipe = makeBaseRecipe()
    const tables = makeTables()

    const synced = syncRecipeToCrafterLevel(recipe, 94, tables)
    expect(synced.levelSync).toEqual({ syncedLevel: 94, originalLevel: 100 })

    const identity = syncRecipeToCrafterLevel(recipe, 100, tables)
    expect(identity.levelSync).toBeUndefined()
  })
})

describe('isLevelSyncedRecipe', () => {
  it('非 0 的 maxAdjustableJobLevel 為 true', () => {
    expect(isLevelSyncedRecipe(makeBaseRecipe())).toBe(true)
  })

  it('0 或 undefined 為 false', () => {
    expect(isLevelSyncedRecipe({ ...makeBaseRecipe(), maxAdjustableJobLevel: 0 })).toBe(false)
    const recipe = makeBaseRecipe()
    delete recipe.maxAdjustableJobLevel
    expect(isLevelSyncedRecipe(recipe)).toBe(false)
  })
})

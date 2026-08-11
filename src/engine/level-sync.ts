import type { Recipe, RecipeLevelTable } from '@/stores/recipe'
import type { RltRecord } from '@/services/local-data-source.types'

// 等級同步（宇宙探索 D／C／B 級任務配方）純函式層。
//
// 見 docs/adr/0003-level-sync-at-recipe-gearset-junction.md：canonical 配方
// 永遠未同步（載入路徑 / batch 資料一律回傳 Lv100 / rlv 690 的原始值），
// 同步只發生在「配方 × 裝備組」的交會點——由呼叫端在拿到配方與製作者等級
// 之後手動呼叫 syncRecipeToCrafterLevel。下游所有消費端收到的本來就是
// 已同步的配方，不需要各自重新判斷。
//
// 這裡的 LevelSyncTables 型別與 local-data-source.ts 的 levelSyncTables ref
// 結構相容，但刻意不 import 該檔——保持這層純函式無依賴，方便單元測試餵入
// 手工 fixture，也讓呼叫端（composable / batch-optimizer 等交會點）自行決定
// 何時讀 local-data-source 的即時值。

export interface LevelSyncTables {
  rlt: ReadonlyMap<number, RltRecord>
  /** index = 製作者職業等級 0..100，值 = 配方等級 rlv。 */
  lvAdjust: readonly number[]
}

/**
 * 只看配方自身性質，不看它屬於哪種內容（宇宙探索 A／EX 級是不同步的一般配方，
 * maxAdjustableJobLevel 為 0）。
 */
export function isLevelSyncedRecipe(recipe: Recipe): boolean {
  return typeof recipe.maxAdjustableJobLevel === 'number' && recipe.maxAdjustableJobLevel > 0
}

/**
 * (未同步配方, 製作者等級) → 同步後配方。純函式、同形狀輸出。
 * 任何無法安全換算的情況一律原樣返回同一個 reference（呼叫端可用 === 判斷 no-op）。
 */
export function syncRecipeToCrafterLevel(
  recipe: Recipe,
  crafterLevel: number | null | undefined,
  tables: LevelSyncTables | null | undefined,
): Recipe {
  if (!isLevelSyncedRecipe(recipe)) return recipe
  if (!tables || tables.lvAdjust.length === 0) return recipe
  if (typeof crafterLevel !== 'number' || !Number.isFinite(crafterLevel) || crafterLevel <= 0) {
    return recipe
  }

  const maxAdjustableJobLevel = recipe.maxAdjustableJobLevel as number
  let level = Math.min(Math.floor(crafterLevel), maxAdjustableJobLevel)
  const maxIndex = tables.lvAdjust.length - 1
  if (level < 1) level = 1
  if (level > maxIndex) level = maxIndex

  const rlv2 = tables.lvAdjust[level]
  if (typeof rlv2 !== 'number' || rlv2 <= 0) return recipe
  if (rlv2 === recipe.rlv) return recipe

  const base = tables.rlt.get(rlv2)
  if (!base) return recipe

  const difficultyFactor = recipe.difficultyFactor ?? 100
  const qualityFactor = recipe.qualityFactor ?? 100
  const durabilityFactor = recipe.durabilityFactor ?? 100
  const stars = base.stars ?? 0

  const recipeLevelTable: RecipeLevelTable = {
    classJobLevel: base.classJobLevel,
    stars,
    difficulty: Math.floor(base.difficulty * difficultyFactor / 100),
    quality: Math.floor(base.quality * qualityFactor / 100),
    durability: Math.floor(base.durability * durabilityFactor / 100),
    suggestedCraftsmanship: base.suggestedCraftsmanship,
    progressDivider: base.progressDivider,
    qualityDivider: base.qualityDivider,
    progressModifier: base.progressModifier,
    qualityModifier: base.qualityModifier,
  }

  // levelSync is always decided explicitly here (never spread conditionally):
  // `recipe` is documented as always canonical/unsynced at every call site, so
  // this branch is unreachable today — but if a caller ever fed an ALREADY-
  // synced recipe back in, an `...(cond ? {...} : {})` spread would silently
  // keep the input's stale `levelSync` (wrong originalLevel) instead of
  // recomputing it. Setting `undefined` explicitly makes that impossible.
  const levelSync = base.classJobLevel < recipe.level
    ? { syncedLevel: base.classJobLevel, originalLevel: recipe.level }
    : undefined

  return {
    ...recipe,
    level: base.classJobLevel,
    stars,
    rlv: rlv2,
    // `rlv` below is the synced one — that's what the craft math needs. GA
    // taxonomy reads canonicalRlv instead so analytics stays joinable against
    // recipes.json. `?? recipe.rlv` makes a re-sync keep the ORIGINAL value.
    canonicalRlv: recipe.canonicalRlv ?? recipe.rlv,
    recipeLevelTable,
    levelSync,
  }
}

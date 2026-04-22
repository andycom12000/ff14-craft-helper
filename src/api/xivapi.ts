import type { Recipe, Ingredient, RecipeLevelTable } from '@/stores/recipe'
import {
  getLocale,
  loadItems,
  loadRecipes,
  getRlt,
  getItem,
  searchRecipesByName,
} from '@/services/local-data-source'
import { getIconUrl } from '@/utils/icon-url'
import { CRAFT_TYPE_TO_JOB } from '@/utils/jobs'

// Chinese short-form job names (matching what the legacy tnze API returned).
// Components filter on these strings, so we must preserve them in searchRecipes output.
const JOB_ABBR_TO_ZH: Record<string, string> = {
  CRP: '木工',
  BSM: '鍛造',
  ARM: '甲冑',
  GSM: '金工',
  LTW: '皮革',
  WVR: '裁縫',
  ALC: '鍊金',
  CUL: '烹調',
}

function jobZh(abbr: string): string {
  return JOB_ABBR_TO_ZH[abbr] ?? abbr
}

export interface RecipeSearchResult {
  id: number
  itemId: number
  name: string
  icon: string
  level: number
  job: string
}

export async function searchRecipes(
  query: string,
): Promise<RecipeSearchResult[]> {
  try {
    const results = await searchRecipesByName(query, getLocale())

    // Need iconId for each result — batch-load items map and look up.
    const items = await loadItems(getLocale())
    const fallbackItems = await loadItems('zh-TW')

    return results.map((r) => {
      const item = items.get(r.itemId) ?? fallbackItems.get(r.itemId)
      const iconId = item?.iconId ?? 0
      return {
        id: r.id,
        itemId: r.itemId,
        name: r.name,
        icon: iconId ? getIconUrl(iconId) : '',
        level: r.rlv,
        job: jobZh(r.job),
      }
    })
  } catch (error) {
    console.error('[API] searchRecipes error:', error)
    throw error
  }
}

/**
 * Find recipes that produce a specific item.
 * The itemName parameter is retained for backward compatibility with existing
 * callers but is no longer used — the local data source can look up directly
 * by itemId.
 */
export async function findRecipesByItemName(
  _itemName: string,
  itemId: number,
): Promise<{ recipeId: number; job: string }[]> {
  try {
    const recipes = await loadRecipes()
    return recipes
      .filter((r) => r.itemResult === itemId)
      .map((r) => ({
        recipeId: r.id,
        job: jobZh(CRAFT_TYPE_TO_JOB[r.craftType] ?? 'CRP'),
      }))
  } catch {
    return []
  }
}

export async function getRecipe(id: number): Promise<Recipe> {
  const recipes = await loadRecipes()
  const recipe = recipes.find((r) => r.id === id)
  if (!recipe) {
    throw new Error(`Recipe ${id} not found in local data`)
  }

  const rlt = await getRlt(recipe.rlv)
  if (!rlt) {
    throw new Error(`Recipe level table ${recipe.rlv} not found`)
  }

  const locale = getLocale()
  const items = await loadItems(locale)
  const fallbackItems = locale === 'zh-TW' ? items : await loadItems('zh-TW')

  const lookupItem = (itemId: number) =>
    items.get(itemId) ?? fallbackItems.get(itemId)

  const resultItem = lookupItem(recipe.itemResult)
  const resultName = resultItem?.name ?? `Item #${recipe.itemResult}`
  const resultIcon = resultItem?.iconId ? getIconUrl(resultItem.iconId) : ''

  const ingredients: Ingredient[] = recipe.ingredients
    .filter(([, amount]) => amount > 0)
    .map(([itemId, amount]) => {
      const info = lookupItem(itemId)
      return {
        itemId,
        name: info?.name ?? `Item #${itemId}`,
        icon: info?.iconId ? getIconUrl(info.iconId) : '',
        amount,
        canHq: info?.canBeHq ?? false,
        level: info?.level ?? 0,
      }
    })

  const recipeLevelTable: RecipeLevelTable = {
    classJobLevel: rlt.classJobLevel,
    stars: 0,
    difficulty: Math.floor(rlt.difficulty * recipe.difficultyFactor / 100),
    quality: Math.floor(rlt.quality * recipe.qualityFactor / 100),
    durability: Math.floor(rlt.durability * recipe.durabilityFactor / 100),
    suggestedCraftsmanship: rlt.suggestedCraftsmanship,
    progressDivider: rlt.progressDivider,
    qualityDivider: rlt.qualityDivider,
    progressModifier: rlt.progressModifier,
    qualityModifier: rlt.qualityModifier,
  }

  const jobAbbr = CRAFT_TYPE_TO_JOB[recipe.craftType] ?? 'CRP'

  return {
    id: recipe.id,
    itemId: recipe.itemResult,
    name: resultName,
    icon: resultIcon,
    job: jobZh(jobAbbr),
    level: rlt.classJobLevel,
    stars: 0,
    canHq: recipe.canHq,
    materialQualityFactor: recipe.materialQualityFactor,
    ingredients,
    recipeLevelTable,
  }
}

// Re-export getItem for callers that need raw item lookup via this module.
export { getItem }

export const XIVAPI_SHEET_BASE = 'https://xivapi-v2.xivcdn.com/api'

export async function fetchSheetFields<T>(
  sheet: string, rows: number[], fields: string,
): Promise<Map<number, T>> {
  const map = new Map<number, T>()
  if (rows.length === 0) return map
  try {
    const url = `${XIVAPI_SHEET_BASE}/sheet/${sheet}?rows=${rows.join(',')}&fields=${fields}`
    const resp = await fetch(url)
    if (!resp.ok) return map
    const data = await resp.json()
    for (const row of data.rows) {
      map.set(row.row_id, row.fields as T)
    }
  } catch { /* non-critical */ }
  return map
}

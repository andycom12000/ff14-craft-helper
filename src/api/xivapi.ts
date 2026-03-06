import type { Recipe, Ingredient, RecipeLevelTable } from '@/stores/recipe'

const API_BASE = 'https://tnze.yyyy.games/api/datasource/zh-TW'
const ICON_API = 'https://xivapi-v2.xivcdn.com/api'
const ICON_ASSET = 'https://beta.xivapi.com/api/1/asset'

export interface RecipeSearchResult {
  id: number
  itemId: number
  name: string
  icon: string
  level: number
  job: string
}

interface RecipeTableEntry {
  id: number
  rlv: number
  item_id: number
  item_name: string
  job: string
  can_hq: boolean
  material_quality_factor: number
}

interface RecipeTableResponse {
  data: RecipeTableEntry[]
  p: number
}

interface RecipeLevelResponse {
  id: number
  class_job_level: number
  suggested_craftsmanship: number
  difficulty: number
  quality: number
  durability: number
  progress_divider: number
  quality_divider: number
  progress_modifier: number
  quality_modifier: number
  conditions_flag: number
}

interface ItemInfoResponse {
  id: number
  name: string
  level: number
  can_be_hq: number
}

async function fetchIcons(itemIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (itemIds.length === 0) return map

  try {
    const url = `${ICON_API}/sheet/Item?rows=${itemIds.join(',')}&fields=Icon`
    const resp = await fetch(url)
    if (!resp.ok) return map

    const data = await resp.json()
    for (const row of data.rows) {
      const path = row.fields?.Icon?.path_hr1 ?? row.fields?.Icon?.path
      if (path) {
        map.set(row.row_id, `${ICON_ASSET}/${path}?format=png`)
      }
    }
  } catch {
    // Icons are non-critical; return what we have
  }
  return map
}

export async function searchRecipes(
  query: string,
): Promise<RecipeSearchResult[]> {
  try {
    const url = `${API_BASE}/recipe_table?page_id=0&search_name=${encodeURIComponent('%' + query + '%')}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`API search failed: ${response.status} ${response.statusText}`)
    }

    const data: RecipeTableResponse = await response.json()

    const itemIds = data.data.map((r) => r.item_id)
    const icons = await fetchIcons(itemIds)

    return data.data.map((item) => ({
      id: item.id,
      itemId: item.item_id,
      name: item.item_name,
      icon: icons.get(item.item_id) ?? '',
      level: item.rlv,
      job: item.job,
    }))
  } catch (error) {
    console.error('[API] searchRecipes error:', error)
    throw error
  }
}

/**
 * Find recipes that produce a specific item by exact name match.
 * Returns empty array if the item is not craftable.
 */
export async function findRecipesByItemName(
  itemName: string,
  itemId: number,
): Promise<{ recipeId: number; job: string }[]> {
  try {
    const url = `${API_BASE}/recipe_table?page_id=0&search_name=${encodeURIComponent(itemName)}`
    const response = await fetch(url)
    if (!response.ok) return []

    const data: RecipeTableResponse = await response.json()
    // Filter by exact item_id match to avoid partial name matches
    return data.data
      .filter((r) => r.item_id === itemId)
      .map((r) => ({ recipeId: r.id, job: r.job }))
  } catch {
    return []
  }
}

export async function getRecipe(id: number): Promise<Recipe> {
  try {
    // Fetch recipe info and ingredients in parallel
    const [recipeResp, ingredientsResp] = await Promise.all([
      fetch(`${API_BASE}/recipe_info?recipe_id=${id}`),
      fetch(`${API_BASE}/recipes_ingredientions?recipe_id=${id}`),
    ])

    if (!recipeResp.ok) throw new Error(`API recipe_info failed: ${recipeResp.status}`)
    if (!ingredientsResp.ok) throw new Error(`API ingredients failed: ${ingredientsResp.status}`)

    const recipeData = await recipeResp.json() as {
      id: number
      rlv: number
      item_id: number
      item_name: string
      job: string
      can_hq: boolean
      material_quality_factor: number
    }

    const rawIngredients: [number, number][] = await ingredientsResp.json()

    // Fetch recipe level table and ingredient item info in parallel
    const ingredientIds = rawIngredients.filter(([, amt]) => amt > 0).map(([itemId]) => itemId)

    const [rltResp, ...itemResponses] = await Promise.all([
      fetch(`${API_BASE}/recipe_level_table?rlv=${recipeData.rlv}`),
      ...ingredientIds.map((itemId) =>
        fetch(`${API_BASE}/item_info?item_id=${itemId}`),
      ),
    ])

    if (!rltResp.ok) throw new Error(`API recipe_level_table failed: ${rltResp.status}`)

    const rlt: RecipeLevelResponse = await rltResp.json()

    const itemInfos = await Promise.all(
      itemResponses.map(async (resp) => {
        if (!resp.ok) return null
        return (await resp.json()) as ItemInfoResponse
      }),
    )

    // Fetch icons for recipe item + all ingredients
    const allItemIds = [recipeData.item_id, ...ingredientIds]
    const icons = await fetchIcons(allItemIds)

    const ingredients: Ingredient[] = rawIngredients
      .filter(([, amt]) => amt > 0)
      .map(([itemId, amount], i) => ({
        itemId,
        name: itemInfos[i]?.name ?? `Item #${itemId}`,
        icon: icons.get(itemId) ?? '',
        amount,
        canHq: !!(itemInfos[i]?.can_be_hq),
        level: itemInfos[i]?.level ?? 0,
      }))

    const recipeLevelTable: RecipeLevelTable = {
      classJobLevel: rlt.class_job_level,
      stars: 0,
      difficulty: rlt.difficulty,
      quality: rlt.quality,
      durability: rlt.durability,
      suggestedCraftsmanship: rlt.suggested_craftsmanship,
      progressDivider: rlt.progress_divider,
      qualityDivider: rlt.quality_divider,
      progressModifier: rlt.progress_modifier,
      qualityModifier: rlt.quality_modifier,
    }

    return {
      id: recipeData.id,
      itemId: recipeData.item_id,
      name: recipeData.item_name,
      icon: icons.get(recipeData.item_id) ?? '',
      job: recipeData.job,
      level: rlt.class_job_level,
      stars: 0,
      canHq: recipeData.can_hq,
      materialQualityFactor: recipeData.material_quality_factor,
      ingredients,
      recipeLevelTable,
    }
  } catch (error) {
    console.error('[API] getRecipe error:', error)
    throw error
  }
}

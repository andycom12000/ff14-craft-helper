import type { Recipe, Ingredient, RecipeLevelTable } from '@/stores/recipe'
import * as OpenCC from 'opencc-js'

const BASE_URL = 'https://cafemaker.wakingsands.com'

const toSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' })
const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' })

function iconUrl(path: string): string {
  return `${BASE_URL}${path}`
}

const SEARCH_COLUMNS = 'ID,Name,Icon,RecipeLevelTable.ClassJobLevel,ClassJob.Abbreviation'

const RECIPE_COLUMNS = [
  'ID', 'Name', 'Icon',
  'ClassJob.Name', 'ClassJob.Abbreviation',
  'RecipeLevelTable',
  'CanHq', 'MaterialQualityFactor',
  ...Array.from({ length: 10 }, (_, i) => `ItemIngredient${i}`),
  ...Array.from({ length: 10 }, (_, i) => `AmountIngredient${i}`),
].join(',')

export interface RecipeSearchResult {
  id: number
  name: string
  icon: string
  level: number
  job: string
}

interface CafeSearchResponse {
  Results: Array<{
    ID: number
    Name: string
    Icon: string
    RecipeLevelTable: {
      ClassJobLevel: number
    }
    ClassJob: {
      Name: string
      Abbreviation: string
    }
  }>
}

interface CafeRecipeResponse {
  ID: number
  Name: string
  Icon: string
  ClassJob: {
    Name: string
    Abbreviation: string
  }
  RecipeLevelTable: {
    ClassJobLevel: number
    Stars: number
    Difficulty: number
    Quality: number
    Durability: number
    SuggestedCraftsmanship: number
    ProgressDivider: number
    QualityDivider: number
    ProgressModifier: number
    QualityModifier: number
  }
  CanHq: number
  MaterialQualityFactor: number
  ItemIngredient0: { ID: number; Name: string; Icon: string } | null
  ItemIngredient1: { ID: number; Name: string; Icon: string } | null
  ItemIngredient2: { ID: number; Name: string; Icon: string } | null
  ItemIngredient3: { ID: number; Name: string; Icon: string } | null
  ItemIngredient4: { ID: number; Name: string; Icon: string } | null
  ItemIngredient5: { ID: number; Name: string; Icon: string } | null
  ItemIngredient6: { ID: number; Name: string; Icon: string } | null
  ItemIngredient7: { ID: number; Name: string; Icon: string } | null
  ItemIngredient8: { ID: number; Name: string; Icon: string } | null
  ItemIngredient9: { ID: number; Name: string; Icon: string } | null
  AmountIngredient0: number
  AmountIngredient1: number
  AmountIngredient2: number
  AmountIngredient3: number
  AmountIngredient4: number
  AmountIngredient5: number
  AmountIngredient6: number
  AmountIngredient7: number
  AmountIngredient8: number
  AmountIngredient9: number
}

export async function searchRecipes(
  query: string,
  filters?: { job?: string }
): Promise<RecipeSearchResult[]> {
  try {
    const simplifiedQuery = toSimplified(query)
    let url = `${BASE_URL}/search?indexes=Recipe&string=${encodeURIComponent(simplifiedQuery)}&language=zh&columns=${SEARCH_COLUMNS}`

    if (filters?.job) {
      url += `&filters=ClassJob.Abbreviation=${encodeURIComponent(filters.job)}`
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`API search failed: ${response.status} ${response.statusText}`)
    }

    const data: CafeSearchResponse = await response.json()

    return data.Results.map((item) => ({
      id: item.ID,
      name: toTraditional(item.Name),
      icon: iconUrl(item.Icon),
      level: item.RecipeLevelTable?.ClassJobLevel ?? 0,
      job: item.ClassJob?.Abbreviation ?? '',
    }))
  } catch (error) {
    console.error('[XIVAPI] searchRecipes error:', error)
    throw error
  }
}

export async function getRecipe(id: number): Promise<Recipe> {
  try {
    const url = `${BASE_URL}/recipe/${id}?columns=${RECIPE_COLUMNS}&language=zh`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`API getRecipe failed: ${response.status} ${response.statusText}`)
    }

    const data: CafeRecipeResponse = await response.json()

    const ingredients: Ingredient[] = []
    for (let i = 0; i < 10; i++) {
      const item = data[`ItemIngredient${i}` as keyof CafeRecipeResponse] as
        | { ID: number; Name: string; Icon: string }
        | null
      const amount = data[`AmountIngredient${i}` as keyof CafeRecipeResponse] as number

      if (item && item.ID > 0 && amount > 0) {
        ingredients.push({
          itemId: item.ID,
          name: toTraditional(item.Name),
          icon: iconUrl(item.Icon),
          amount,
        })
      }
    }

    const rlt = data.RecipeLevelTable
    const recipeLevelTable: RecipeLevelTable = {
      classJobLevel: rlt.ClassJobLevel,
      stars: rlt.Stars,
      difficulty: rlt.Difficulty,
      quality: rlt.Quality,
      durability: rlt.Durability,
      suggestedCraftsmanship: rlt.SuggestedCraftsmanship,
      progressDivider: rlt.ProgressDivider,
      qualityDivider: rlt.QualityDivider,
      progressModifier: rlt.ProgressModifier,
      qualityModifier: rlt.QualityModifier,
    }

    return {
      id: data.ID,
      name: toTraditional(data.Name),
      icon: iconUrl(data.Icon),
      job: data.ClassJob?.Abbreviation ?? '',
      level: rlt.ClassJobLevel,
      stars: rlt.Stars,
      canHq: data.CanHq === 1,
      materialQualityFactor: data.MaterialQualityFactor,
      ingredients,
      recipeLevelTable,
    }
  } catch (error) {
    console.error('[XIVAPI] getRecipe error:', error)
    throw error
  }
}

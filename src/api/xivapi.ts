import type { Recipe, Ingredient, RecipeLevelTable } from '@/stores/recipe'

const BASE_URL = 'https://xivapi.com'

export interface RecipeSearchResult {
  id: number
  name: string
  icon: string
  level: number
  job: string
}

interface XIVAPISearchResponse {
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
  Pagination: {
    Page: number
    PageTotal: number
    Results: number
    ResultsTotal: number
  }
}

interface XIVAPIRecipeResponse {
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
    SuggestedControl: number
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
    let url = `${BASE_URL}/search?indexes=Recipe&string=${encodeURIComponent(query)}&language=en`

    if (filters?.job) {
      url += `&filters=ClassJob.Abbreviation=${encodeURIComponent(filters.job)}`
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`XIVAPI search failed: ${response.status} ${response.statusText}`)
    }

    const data: XIVAPISearchResponse = await response.json()

    return data.Results.map((item) => ({
      id: item.ID,
      name: item.Name,
      icon: `${BASE_URL}${item.Icon}`,
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
    const columns = [
      'ID', 'Name', 'Icon',
      'ClassJob.Name', 'ClassJob.Abbreviation',
      'RecipeLevelTable',
      'CanHq', 'MaterialQualityFactor',
      ...Array.from({ length: 10 }, (_, i) => `ItemIngredient${i}`),
      ...Array.from({ length: 10 }, (_, i) => `AmountIngredient${i}`),
    ].join(',')

    const url = `${BASE_URL}/recipe/${id}?columns=${columns}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`XIVAPI getRecipe failed: ${response.status} ${response.statusText}`)
    }

    const data: XIVAPIRecipeResponse = await response.json()

    const ingredients: Ingredient[] = []
    for (let i = 0; i < 10; i++) {
      const item = data[`ItemIngredient${i}` as keyof XIVAPIRecipeResponse] as
        | { ID: number; Name: string; Icon: string }
        | null
      const amount = data[`AmountIngredient${i}` as keyof XIVAPIRecipeResponse] as number

      if (item && item.ID > 0 && amount > 0) {
        ingredients.push({
          itemId: item.ID,
          name: item.Name,
          icon: `${BASE_URL}${item.Icon}`,
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
      suggestedControl: rlt.SuggestedControl,
      progressDivider: rlt.ProgressDivider,
      qualityDivider: rlt.QualityDivider,
      progressModifier: rlt.ProgressModifier,
      qualityModifier: rlt.QualityModifier,
    }

    return {
      id: data.ID,
      name: data.Name,
      icon: `${BASE_URL}${data.Icon}`,
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

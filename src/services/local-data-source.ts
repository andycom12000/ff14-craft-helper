import type {
  Locale,
  ItemRecord,
  RecipeRecord,
  RltRecord,
  Manifest,
  RecipeSearchResult,
} from './local-data-source.types'

export * from './local-data-source.types'

export function getLocale(): Locale {
  throw new Error('local-data-source stub: not implemented')
}

export async function setLocale(_locale: Locale): Promise<void> {
  throw new Error('local-data-source stub: not implemented')
}

export function onLocaleChange(_cb: (locale: Locale) => void): () => void {
  throw new Error('local-data-source stub: not implemented')
}

export async function loadRecipes(): Promise<RecipeRecord[]> {
  throw new Error('local-data-source stub: not implemented')
}

export async function loadItems(_locale?: Locale): Promise<Map<number, ItemRecord>> {
  throw new Error('local-data-source stub: not implemented')
}

export async function loadRlt(): Promise<Map<number, RltRecord>> {
  throw new Error('local-data-source stub: not implemented')
}

export async function loadManifest(): Promise<Manifest> {
  throw new Error('local-data-source stub: not implemented')
}

export async function getItem(_id: number, _locale?: Locale): Promise<ItemRecord | undefined> {
  throw new Error('local-data-source stub: not implemented')
}

export function getItemSync(_id: number, _locale?: Locale): ItemRecord | undefined {
  return undefined
}

export async function getRecipe(_id: number): Promise<RecipeRecord | undefined> {
  throw new Error('local-data-source stub: not implemented')
}

export async function getRlt(_rlv: number): Promise<RltRecord | undefined> {
  throw new Error('local-data-source stub: not implemented')
}

export async function searchRecipesByName(_query: string, _locale?: Locale): Promise<RecipeSearchResult[]> {
  throw new Error('local-data-source stub: not implemented')
}

export const loadingState: Record<Locale, { recipes: boolean; items: boolean; rlt: boolean }> = {
  'zh-TW': { recipes: false, items: false, rlt: false },
  'zh-CN': { recipes: false, items: false, rlt: false },
  en: { recipes: false, items: false, rlt: false },
  ja: { recipes: false, items: false, rlt: false },
}

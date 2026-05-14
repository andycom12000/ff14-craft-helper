export type Locale = 'zh-TW' | 'zh-CN' | 'en' | 'ja'
export const LOCALES: readonly Locale[] = ['zh-TW', 'zh-CN', 'en', 'ja'] as const
export const DEFAULT_LOCALE: Locale = 'zh-TW'

export interface ItemRecord {
  name: string
  level: number
  canBeHq: boolean
  iconId: number
}

export interface RecipeRecord {
  id: number
  itemResult: number
  amountResult: number
  craftType: number
  rlv: number
  canHq: boolean
  materialQualityFactor: number
  difficultyFactor: number
  qualityFactor: number
  durabilityFactor: number
  ingredients: Array<[itemId: number, amount: number]>
  // Hard-gate signals from XIVAPI Recipe sheet. Optional for backward
  // compatibility with older bundles built before the augment step ran.
  isExpert?: boolean
  requiredCraftsmanship?: number
  requiredControl?: number
  // Minimum quality required for a non-canHq recipe to be accepted in-game —
  // tribe-quest / event "建造組件" deliverables. 0 = quality irrelevant.
  requiredQuality?: number
}

export interface RltRecord {
  classJobLevel: number
  // Recipe star count from XIVAPI RecipeLevelTable.Stars. 0 = standard recipe.
  // Optional for backward compatibility with bundles built before the augment step.
  stars?: number
  difficulty: number
  quality: number
  durability: number
  suggestedCraftsmanship: number
  progressDivider: number
  qualityDivider: number
  progressModifier: number
  qualityModifier: number
  conditionsFlag: number
}

export interface Manifest {
  schemaVersion: 1
  buildTime: string
  locales: Locale[]
  defaultLocale: Locale
  sources: Record<Locale, { repo: string; commit: string }>
}

export type ItemTuple = [id: number, name: string, level: number, canBeHq: 0 | 1, iconId: number]

export interface ItemsFile {
  schemaVersion: 1
  items: ItemTuple[]
}

export interface RecipeSearchResult {
  id: number
  itemId: number
  name: string
  job: string
  rlv: number
  canHq: boolean
  materialQualityFactor: number
}

export type CompanyCraftCategory = 'submersible' | 'airship' | 'workshop'
export type PartSlot = 'bow' | 'stern' | 'hull' | 'bridge'

export interface CompanyCraftPhase {
  partIndex: number
  processIndex: number
  jobAbbr: string
  level: number
  supplyItems: Array<{ itemId: number; amount: number }>
}

export interface CompanyCraftSequence {
  id: number
  resultItemId: number
  category: CompanyCraftCategory
  partSlot: PartSlot | null
  phases: CompanyCraftPhase[]
}

export interface CompanyCraftFile {
  schemaVersion: 1
  sequences: CompanyCraftSequence[]
}

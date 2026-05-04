import { ref } from 'vue'
import { loadRlt } from '@/services/local-data-source'
import type { RltRecord } from '@/services/local-data-source.types'
import type { Recipe } from '@/stores/recipe'

const STORAGE_KEY = 'toast-workshop:custom-recipes'

export interface CustomRecipeForm {
  id: string
  name: string
  job: string
  rlv: number
  level: number
  stars: number
  canHq: boolean
  difficulty: number
  quality: number
  durability: number
  progressDivider: number
  qualityDivider: number
  progressModifier: number
  qualityModifier: number
}

export const CUSTOM_RECIPE_ICON = '✎'

function makeId(): string {
  return `custom-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

function readStorage(): CustomRecipeForm[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is CustomRecipeForm =>
      item != null && typeof item === 'object' && typeof item.id === 'string',
    )
  } catch {
    return []
  }
}

export class CustomRecipeStorageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'CustomRecipeStorageError'
  }
}

function writeStorage(list: CustomRecipeForm[]): void {
  if (typeof localStorage === 'undefined') {
    throw new CustomRecipeStorageError('瀏覽器未提供 localStorage')
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch (err) {
    throw new CustomRecipeStorageError('localStorage 寫入失敗（可能容量已滿或被瀏覽器禁用）', err)
  }
}

const customRecipes = ref<CustomRecipeForm[]>(readStorage())

export function useCustomRecipes() {
  function refresh() {
    customRecipes.value = readStorage()
  }

  function save(form: CustomRecipeForm): CustomRecipeForm {
    const list = [...customRecipes.value]
    const existingIdx = list.findIndex(r => r.id === form.id)
    const entry: CustomRecipeForm = { ...form }
    if (existingIdx >= 0) {
      list[existingIdx] = entry
    } else {
      list.push(entry)
    }
    // Write before mutating in-memory state so a quota failure leaves the
    // saved-list ref consistent with what's actually persisted.
    writeStorage(list)
    customRecipes.value = list
    return entry
  }

  function remove(id: string) {
    const list = customRecipes.value.filter(r => r.id !== id)
    writeStorage(list)
    customRecipes.value = list
  }

  async function lookupRlv(rlv: number): Promise<RltRecord | null> {
    if (!rlv || !Number.isFinite(rlv) || rlv <= 0) return null
    const map = await loadRlt()
    return map.get(rlv) ?? null
  }

  function buildRecipe(form: CustomRecipeForm): Recipe {
    return {
      // Negative id keeps custom recipes from colliding with API ids.
      id: -Math.abs(parseInt(form.id.replace(/\D/g, '').slice(-12) || '0', 10)) - 1,
      itemId: 0,
      name: form.name.trim() || '自訂配方',
      icon: CUSTOM_RECIPE_ICON,
      job: form.job,
      level: form.level,
      stars: form.stars,
      canHq: form.canHq,
      materialQualityFactor: 0,
      amountResult: 1,
      ingredients: [],
      recipeLevelTable: {
        classJobLevel: form.level,
        stars: form.stars,
        difficulty: form.difficulty,
        quality: form.quality,
        durability: form.durability,
        suggestedCraftsmanship: 0,
        progressDivider: form.progressDivider,
        qualityDivider: form.qualityDivider,
        progressModifier: form.progressModifier,
        qualityModifier: form.qualityModifier,
      },
      isCustom: true,
    }
  }

  function emptyForm(): CustomRecipeForm {
    return {
      id: makeId(),
      name: '',
      job: 'CRP',
      rlv: 0,
      level: 0,
      stars: 0,
      canHq: true,
      difficulty: 0,
      quality: 0,
      durability: 80,
      progressDivider: 0,
      qualityDivider: 0,
      progressModifier: 0,
      qualityModifier: 0,
    }
  }

  return {
    customRecipes,
    refresh,
    save,
    remove,
    lookupRlv,
    buildRecipe,
    emptyForm,
  }
}

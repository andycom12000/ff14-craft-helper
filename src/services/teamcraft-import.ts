import { findRecipesByItemName, getItem } from '@/api/xivapi'
import { getIconUrl } from '@/utils/icon-url'

export interface TeamcraftEntry {
  itemId: number
  recipeId: number | null
  qty: number
}

export interface TeamcraftParseResult {
  entries: TeamcraftEntry[]
  warnings: string[]
}

const TEAMCRAFT_URL_PREFIX = 'https://ffxivteamcraft.com/import/'

export function parseTeamcraftImport(input: string): TeamcraftParseResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { entries: [], warnings: ['輸入為空'] }
  }

  const raw = extractRawString(trimmed)
  if (raw === null) {
    return { entries: [], warnings: ['無法辨識的輸入格式'] }
  }
  if (raw.endsWith(';')) {
    return { entries: [], warnings: ['Teamcraft 列表不應以分號結尾'] }
  }

  const segments = raw.split(';')
  const entries: TeamcraftEntry[] = []
  const warnings: string[] = []

  for (const seg of segments) {
    const parts = seg.split(',')
    if (parts.length !== 3) {
      warnings.push(`格式錯誤的片段：${seg}`)
      continue
    }
    const [itemIdStr, recipeIdStr, qtyStr] = parts
    const itemId = Number.parseInt(itemIdStr, 10)
    const qty = Number.parseInt(qtyStr, 10)
    if (!Number.isFinite(itemId) || itemId <= 0) {
      warnings.push(`無效的物品 ID：${itemIdStr}`)
      continue
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      warnings.push(`無效的數量：${qtyStr}`)
      continue
    }
    const recipeId =
      recipeIdStr === 'null' || recipeIdStr === ''
        ? null
        : Number.parseInt(recipeIdStr, 10)
    if (recipeId !== null && (!Number.isFinite(recipeId) || recipeId <= 0)) {
      warnings.push(`無效的配方 ID：${recipeIdStr}`)
      continue
    }
    entries.push({ itemId, recipeId, qty })
  }

  if (entries.length === 0 && warnings.length === 0) {
    warnings.push('沒有可解析的條目')
  }

  return { entries, warnings }
}

function extractRawString(input: string): string | null {
  if (input.startsWith(TEAMCRAFT_URL_PREFIX)) {
    const encoded = input.slice(TEAMCRAFT_URL_PREFIX.length).split(/[?#]/)[0]
    return decodeBase64Lenient(encoded)
  }
  if (looksLikeBase64(input)) {
    const decoded = decodeBase64Lenient(input)
    if (decoded !== null && /^\d+,(\d+|null|),\d+(?:;\d+,(\d+|null|),\d+)*;?$/.test(decoded)) {
      return decoded
    }
  }
  if (/^\d+,(\d+|null|),\d+(?:;\d+,(\d+|null|),\d+)*;?$/.test(input)) {
    return input
  }
  return null
}

function looksLikeBase64(s: string): boolean {
  return /^[A-Za-z0-9+/_-]+=*$/.test(s) && s.length >= 4
}

function decodeBase64Lenient(encoded: string): string | null {
  try {
    let normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const pad = normalized.length % 4
    if (pad === 2) normalized += '=='
    else if (pad === 3) normalized += '='
    else if (pad === 1) return null
    const binary = atob(normalized)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

export interface ResolvedTeamcraftEntry {
  itemId: number
  qty: number
  /** Original recipeId hint from the import (may be null). */
  importedRecipeId: number | null
  /** All recipes that produce this item, sorted by recipeId. */
  recipes: { recipeId: number; job: string }[]
  /** Auto-selected recipeId: imported one if valid, else only recipe, else null (ambiguous). */
  resolvedRecipeId: number | null
  /** Display name from local items db. */
  name: string
  /** Icon URL. amountResult left at default 1; consumer pulls from getRecipe later. */
  icon: string
  /** True when the itemId is not in the local items database. */
  unknown: boolean
}

export async function resolveTeamcraftEntries(
  entries: TeamcraftEntry[],
  onProgress?: (done: number, total: number) => void,
): Promise<ResolvedTeamcraftEntry[]> {
  let done = 0
  const total = entries.length
  return Promise.all(
    entries.map(async (entry): Promise<ResolvedTeamcraftEntry> => {
      try {
        const item = await getItem(entry.itemId)
        if (!item) {
          return {
            itemId: entry.itemId,
            qty: entry.qty,
            importedRecipeId: entry.recipeId,
            recipes: [],
            resolvedRecipeId: null,
            name: `物品 #${entry.itemId}`,
            icon: '',
            unknown: true,
          }
        }
        const recipes = await findRecipesByItemName(item.name, entry.itemId)
        const recipesSorted = [...recipes].sort((a, b) => a.recipeId - b.recipeId)
        let resolvedRecipeId: number | null = null
        if (
          entry.recipeId !== null &&
          recipesSorted.some((r) => r.recipeId === entry.recipeId)
        ) {
          resolvedRecipeId = entry.recipeId
        } else if (recipesSorted.length === 1) {
          resolvedRecipeId = recipesSorted[0].recipeId
        } else if (recipesSorted.length === 0) {
          resolvedRecipeId = null
        }
        return {
          itemId: entry.itemId,
          qty: entry.qty,
          importedRecipeId: entry.recipeId,
          recipes: recipesSorted,
          resolvedRecipeId,
          name: item.name,
          icon: item.iconId ? getIconUrl(item.iconId) : '',
          unknown: false,
        }
      } finally {
        done++
        onProgress?.(done, total)
      }
    }),
  )
}

export function buildTeamcraftImportUrl(
  entries: { itemId: number; recipeId: number | null; qty: number }[],
): string {
  if (entries.length === 0) return TEAMCRAFT_URL_PREFIX
  const raw = entries
    .map(
      (e) =>
        `${e.itemId},${e.recipeId === null ? 'null' : e.recipeId},${e.qty}`,
    )
    .join(';')
  const bytes = new TextEncoder().encode(raw)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const encoded = btoa(binary)
  return `${TEAMCRAFT_URL_PREFIX}${encoded}`
}

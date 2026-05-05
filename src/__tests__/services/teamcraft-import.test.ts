import { describe, it, expect } from 'vitest'
import {
  parseTeamcraftImport,
  buildTeamcraftImportUrl,
} from '@/services/teamcraft-import'

const URL_PREFIX = 'https://ffxivteamcraft.com/import/'

function encodeRaw(raw: string): string {
  return URL_PREFIX + btoa(raw)
}

describe('parseTeamcraftImport', () => {
  it('parses a raw `itemId,recipeId,qty` triple', () => {
    const result = parseTeamcraftImport('5340,8,3')
    expect(result.entries).toEqual([{ itemId: 5340, recipeId: 8, qty: 3 }])
    expect(result.warnings).toEqual([])
  })

  it('parses multiple semicolon-separated triples', () => {
    const result = parseTeamcraftImport('5340,8,3;5337,4,5;100,null,1')
    expect(result.entries).toEqual([
      { itemId: 5340, recipeId: 8, qty: 3 },
      { itemId: 5337, recipeId: 4, qty: 5 },
      { itemId: 100, recipeId: null, qty: 1 },
    ])
  })

  it('treats "null" recipeId as null', () => {
    const result = parseTeamcraftImport('123,null,2')
    expect(result.entries[0].recipeId).toBeNull()
  })

  it('decodes a Teamcraft URL', () => {
    const url = encodeRaw('5340,8,3;5337,4,5')
    const result = parseTeamcraftImport(url)
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0].itemId).toBe(5340)
  })

  it('decodes a base64 string by itself', () => {
    const b64 = btoa('5340,8,3')
    const result = parseTeamcraftImport(b64)
    expect(result.entries).toEqual([{ itemId: 5340, recipeId: 8, qty: 3 }])
  })

  it('rejects a raw string with a trailing semicolon', () => {
    const result = parseTeamcraftImport('5340,8,3;')
    expect(result.entries).toEqual([])
    expect(result.warnings.some((w) => w.includes('分號'))).toBe(true)
  })

  it('rejects an empty string', () => {
    const result = parseTeamcraftImport('   ')
    expect(result.entries).toEqual([])
    expect(result.warnings.some((w) => w.includes('輸入為空'))).toBe(true)
  })

  it('returns warning on segments with too few fields', () => {
    const result = parseTeamcraftImport('5340,8')
    expect(result.entries).toEqual([])
    expect(result.warnings.some((w) => w.includes('無法辨識'))).toBe(true)
  })

  it('flags invalid item id', () => {
    const result = parseTeamcraftImport('abc,8,3')
    // 'abc,8,3' fails the regex, so it's reported as unrecognized rather than per-segment.
    expect(result.entries).toEqual([])
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('handles URL-safe base64 (- and _ in place of + and /)', () => {
    const raw = '5340,8,3'
    const stdBase64 = btoa(raw)
    const urlSafe = stdBase64.replace(/\+/g, '-').replace(/\//g, '_')
    const result = parseTeamcraftImport(URL_PREFIX + urlSafe)
    expect(result.entries).toEqual([{ itemId: 5340, recipeId: 8, qty: 3 }])
  })

  it('strips query/fragment from URL before decoding', () => {
    const b64 = btoa('5340,8,3')
    const result = parseTeamcraftImport(`${URL_PREFIX}${b64}?utm_source=foo`)
    expect(result.entries).toEqual([{ itemId: 5340, recipeId: 8, qty: 3 }])
  })
})

describe('buildTeamcraftImportUrl', () => {
  it('round-trips a single entry', () => {
    const url = buildTeamcraftImportUrl([{ itemId: 5340, recipeId: 8, qty: 3 }])
    expect(url).toMatch(/^https:\/\/ffxivteamcraft\.com\/import\//)
    const parsed = parseTeamcraftImport(url)
    expect(parsed.entries).toEqual([{ itemId: 5340, recipeId: 8, qty: 3 }])
  })

  it('round-trips multiple entries with mixed null recipeIds', () => {
    const entries = [
      { itemId: 5340, recipeId: 8, qty: 3 },
      { itemId: 5337, recipeId: null, qty: 5 },
      { itemId: 100, recipeId: 42, qty: 1 },
    ]
    const url = buildTeamcraftImportUrl(entries)
    const parsed = parseTeamcraftImport(url)
    expect(parsed.entries).toEqual(entries)
  })

  it('emits no trailing semicolon (Teamcraft compatibility)', () => {
    const url = buildTeamcraftImportUrl([
      { itemId: 5340, recipeId: 8, qty: 3 },
      { itemId: 5337, recipeId: 4, qty: 5 },
    ])
    const b64 = url.replace(URL_PREFIX, '')
    const decoded = atob(b64)
    expect(decoded.endsWith(';')).toBe(false)
    expect(decoded).toBe('5340,8,3;5337,4,5')
  })

  it('returns just the prefix for empty entries', () => {
    const url = buildTeamcraftImportUrl([])
    expect(url).toBe(URL_PREFIX)
  })
})

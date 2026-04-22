import { describe, it, expect } from 'vitest'
import { getIconUrl } from '@/utils/icon-url'

const BASE = 'https://beta.xivapi.com/api/1/asset/ui/icon'

describe('getIconUrl', () => {
  it('buckets icon 5057 into the 005000 folder with 6-digit padding', () => {
    expect(getIconUrl(5057)).toBe(`${BASE}/005000/005057_hr1.tex?format=png`)
  })

  it('handles small icon ids by padding both folder and file to 6 digits', () => {
    expect(getIconUrl(1)).toBe(`${BASE}/000000/000001_hr1.tex?format=png`)
  })

  it('buckets a large icon id into its thousand-folder', () => {
    expect(getIconUrl(123456)).toBe(`${BASE}/123000/123456_hr1.tex?format=png`)
  })

  it('keeps icons that sit exactly on a thousand boundary in their own folder', () => {
    expect(getIconUrl(1000)).toBe(`${BASE}/001000/001000_hr1.tex?format=png`)
  })

  it('uses the beta.xivapi.com asset endpoint', () => {
    expect(getIconUrl(42)).toMatch(/^https:\/\/beta\.xivapi\.com\/api\/1\/asset\/ui\/icon\//)
  })

  it('uses _hr1 variant and requests PNG via format query', () => {
    expect(getIconUrl(42)).toMatch(/_hr1\.tex\?format=png$/)
  })
})

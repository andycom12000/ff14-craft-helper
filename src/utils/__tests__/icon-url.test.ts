import { describe, it, expect } from 'vitest'
import { getIconUrl } from '@/utils/icon-url'

describe('getIconUrl', () => {
  it('buckets icon 5057 into the 005000 folder with 6-digit padding', () => {
    expect(getIconUrl(5057)).toBe('https://xivapi-v2.xivcdn.com/i/005000/005057_hr1.png')
  })

  it('handles small icon ids by padding both folder and file to 6 digits', () => {
    expect(getIconUrl(1)).toBe('https://xivapi-v2.xivcdn.com/i/000000/000001_hr1.png')
  })

  it('buckets a large icon id into its thousand-folder', () => {
    expect(getIconUrl(123456)).toBe('https://xivapi-v2.xivcdn.com/i/123000/123456_hr1.png')
  })

  it('keeps icons that sit exactly on a thousand boundary in their own folder', () => {
    expect(getIconUrl(1000)).toBe('https://xivapi-v2.xivcdn.com/i/001000/001000_hr1.png')
  })

  it('uses the xivapi-v2 CDN host', () => {
    expect(getIconUrl(42)).toMatch(/^https:\/\/xivapi-v2\.xivcdn\.com\//)
  })

  it('produces _hr1.png suffix', () => {
    expect(getIconUrl(42)).toMatch(/_hr1\.png$/)
  })
})

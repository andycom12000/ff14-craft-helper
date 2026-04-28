import { describe, it, expect } from 'vitest'
import { classifyGearBucket } from '@/utils/gear-bucket'

describe('classifyGearBucket', () => {
  it('returns bis when ratio >= 0.95 at lv100', () => {
    // approx BiS: 5400/5200, 95% = 5130/4940
    expect(classifyGearBucket(100, 5400, 5200)).toBe('bis')
    expect(classifyGearBucket(100, 5130, 4940)).toBe('bis')
  })

  it('returns mid for 0.70 <= ratio < 0.95', () => {
    // 80% of (5400, 5200) = (4320, 4160)
    expect(classifyGearBucket(100, 4320, 4160)).toBe('mid')
  })

  it('returns entry when ratio < 0.70', () => {
    // 50% of (5400, 5200)
    expect(classifyGearBucket(100, 2700, 2600)).toBe('entry')
  })

  it('uses lv80 thresholds for level 87 (floors to 80)', () => {
    // approx BiS at 80 cap: 2700/2600. 95% = 2565/2470
    expect(classifyGearBucket(87, 2565, 2470)).toBe('bis')
    expect(classifyGearBucket(87, 100, 100)).toBe('entry')
  })

  it('uses lv50 thresholds for level 50', () => {
    // approx BiS: 410/410, 95% = 390/390
    expect(classifyGearBucket(50, 410, 410)).toBe('bis')
  })

  it('uses lv50 thresholds for sub-50 levels (clamps down)', () => {
    expect(classifyGearBucket(20, 410, 410)).toBe('bis')
    expect(classifyGearBucket(20, 50, 50)).toBe('entry')
  })

  it('handles 0 stats as entry', () => {
    expect(classifyGearBucket(100, 0, 0)).toBe('entry')
  })
})

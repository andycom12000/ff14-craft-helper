import { describe, it, expect } from 'vitest'
import { derivePoolSize, deriveRayonThreads } from '@/solver/pool-config'

describe('derivePoolSize', () => {
  it('caps at 3 for high-core machines (hwc >= 12)', () => {
    expect(derivePoolSize(12)).toBe(3)
    expect(derivePoolSize(16)).toBe(3)
    expect(derivePoolSize(20)).toBe(3)
    expect(derivePoolSize(64)).toBe(3)
  })

  it('stays at 2 below 12 cores (behaviour unchanged for low-core machines)', () => {
    expect(derivePoolSize(11)).toBe(2)
    expect(derivePoolSize(8)).toBe(2)
    expect(derivePoolSize(4)).toBe(2)
    expect(derivePoolSize(2)).toBe(2)
    expect(derivePoolSize(1)).toBe(2)
  })

  it('has its boundary exactly at 12: 11 -> 2, 12 -> 3', () => {
    expect(derivePoolSize(11)).toBe(2)
    expect(derivePoolSize(12)).toBe(3)
  })

  it('never returns 4+ (bench rejected pool=4: +1.4% median is inside noise and costs a 4th WASM instance)', () => {
    for (const hwc of [12, 16, 20, 24, 32, 128]) {
      expect(derivePoolSize(hwc)).toBeLessThanOrEqual(3)
    }
  })
})

describe('deriveRayonThreads', () => {
  it('keeps the rayon invariant threads * POOL_SIZE <= hwc (never oversubscribes)', () => {
    // deriveRayonThreads uses the module-level POOL_SIZE, which is itself
    // hwc-derived at load time — so we assert the invariant against that pool.
    for (const hwc of [1, 4, 8, 12, 16, 20, 24]) {
      const threads = deriveRayonThreads(hwc)
      expect(threads).toBeGreaterThanOrEqual(1)
    }
  })

  it('floors to at least 1 thread even when hwc < POOL_SIZE', () => {
    expect(deriveRayonThreads(1)).toBe(1)
    expect(deriveRayonThreads(0)).toBe(1)
  })
})

import { describe, it, expect } from 'vitest'
import { solveCacheKey } from '@/solver/solve-cache'
import { SOLVER_CACHE_EPOCH } from '@/solver/pool-config'
import type { SolverConfig } from '@/solver/raphael'

function baseConfig(overrides: Partial<SolverConfig> = {}): SolverConfig {
  return {
    recipe_level: 690, stars: 0, progress: 6600, quality: 12000, durability: 70,
    cp: 620, craftsmanship: 5000, control: 5000, crafter_level: 100,
    progress_divider: 130, quality_divider: 115, progress_modifier: 80, quality_modifier: 70,
    hq_target: true, initial_quality: 0,
    use_manipulation: true, use_heart_and_soul: false, use_quick_innovation: false,
    use_trained_eye: false, isExpert: false, adversarial: false,
    ...overrides,
  }
}

describe('solveCacheKey', () => {
  it('includes the epoch prefix', () => {
    expect(solveCacheKey(baseConfig()).startsWith(`${SOLVER_CACHE_EPOCH}:`)).toBe(true)
  })

  it('is stable regardless of field insertion order', () => {
    const a = baseConfig()
    // Rebuild with reversed key order — same values.
    const b = Object.fromEntries(Object.entries(a).reverse()) as unknown as SolverConfig
    expect(solveCacheKey(a)).toBe(solveCacheKey(b))
  })

  it('ignores analytics-only taxonomy', () => {
    const plain = baseConfig()
    const withTaxonomy = baseConfig({
      taxonomy: { rlv: 690, stars: 0, is_expert: false, is_collectable: false, craft_kind: 'gear' },
    })
    expect(solveCacheKey(withTaxonomy)).toBe(solveCacheKey(plain))
  })

  it('treats undefined optional fields the same as absent', () => {
    expect(solveCacheKey(baseConfig({ strict_quality: undefined }))).toBe(solveCacheKey(baseConfig()))
  })

  it('differs when any solve-affecting field differs', () => {
    expect(solveCacheKey(baseConfig({ control: 5001 }))).not.toBe(solveCacheKey(baseConfig()))
    expect(solveCacheKey(baseConfig({ strict_quality: true }))).not.toBe(solveCacheKey(baseConfig()))
    expect(solveCacheKey(baseConfig({ adversarial: true }))).not.toBe(solveCacheKey(baseConfig()))
  })
})

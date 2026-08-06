// src/__tests__/solver/api.test.ts
//
// #198: `solveCraftForRecipe` is the façade most machine callers (batch-optimizer,
// buff-recommender, meld-advisor's reverse search) go through. It tags every
// solve it forwards with `source: 'machine'` by default AND a full recipe
// taxonomy — but that default is overridable: `useMeldPlayground`'s forward
// 試算台 is a direct, one-shot user action (not a loop) and passes
// `source: 'user'`. Getting either the default OR the override wrong either
// double-counts machine solves as human, or misclassifies a real user click
// as machine (silently undercounting the human denominator — the exact class
// of bug this ticket exists to close).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Recipe } from '@/stores/recipe'
import type { GearsetStats } from '@/stores/gearsets'

vi.mock('@/solver/worker', () => ({
  solveCraft: vi.fn(),
  simulateCraft: vi.fn(),
}))

import { solveCraft } from '@/solver/worker'
import { solveCraftForRecipe } from '@/solver/api'

const mockRecipe: Recipe = {
  id: 1, itemId: 100, name: 'Test', icon: '', job: 'CRP',
  level: 90, stars: 2, canHq: true, materialQualityFactor: 75, amountResult: 1,
  isExpert: false, isCollectable: true, craftKind: 'quick', rlv: 640,
  ingredients: [
    { itemId: 200, name: 'Mat A', icon: '', amount: 3, canHq: true, level: 50 },
  ],
  recipeLevelTable: {
    classJobLevel: 90, stars: 2, difficulty: 3500, quality: 7200,
    durability: 80, suggestedCraftsmanship: 0,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 80,
  },
}
const mockGearset: GearsetStats = { level: 100, craftsmanship: 4000, control: 3800, cp: 600, isSpecialist: false }

describe('solveCraftForRecipe (#198 façade taxonomy + source tagging)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(solveCraft).mockResolvedValue({ actions: [], progress: 0, quality: 0, steps: 0 })
  })

  it('tags the forwarded config with source: "machine" by default', async () => {
    await solveCraftForRecipe(mockRecipe, mockGearset)
    const config = vi.mocked(solveCraft).mock.calls[0][0]
    expect(config.source).toBe('machine')
  })

  // Reviewer-flagged gap: useMeldPlayground's forward "試算台" is a direct,
  // one-shot user action (button click → one solve, no loop/watcher) and must
  // override the façade's machine default — otherwise a real user click gets
  // misclassified as machine, silently undercounting the human denominator.
  it('honours an explicit source: "user" override', async () => {
    await solveCraftForRecipe(mockRecipe, mockGearset, { source: 'user' })
    const config = vi.mocked(solveCraft).mock.calls[0][0]
    expect(config.source).toBe('user')
  })

  it('an explicit source: "machine" override is a no-op (still machine)', async () => {
    await solveCraftForRecipe(mockRecipe, mockGearset, { source: 'machine' })
    const config = vi.mocked(solveCraft).mock.calls[0][0]
    expect(config.source).toBe('machine')
  })

  it('sets taxonomy from the recipe (previously always undefined)', async () => {
    await solveCraftForRecipe(mockRecipe, mockGearset)
    const config = vi.mocked(solveCraft).mock.calls[0][0]
    expect(config.taxonomy).toEqual({
      rlv: 640, stars: 2, is_expert: false, is_collectable: true, craft_kind: 'quick',
    })
  })

  it('falls back to recipeLevelTable.classJobLevel for rlv and "normal" for craft_kind when unset', async () => {
    const bare: Recipe = { ...mockRecipe, rlv: undefined, craftKind: undefined, isCollectable: undefined }
    await solveCraftForRecipe(bare, mockGearset)
    const config = vi.mocked(solveCraft).mock.calls[0][0]
    expect(config.taxonomy).toMatchObject({ rlv: 90, craft_kind: 'normal', is_collectable: false })
  })
})

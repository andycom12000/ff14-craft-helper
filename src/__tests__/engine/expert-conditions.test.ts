import { describe, it, expect } from 'vitest'
import {
  applyConditionToAction,
  capSuccessRate,
  divCeilHalf,
  malleableProgressMod,
  type ModifiedOutcome,
} from '@/engine/expert-conditions'
import type { CraftCondition, CraftState } from '@/engine/simulator'
import { applyAction, resolveActionProgressMod } from '@/engine/simulator'
import { getSkillById, type SkillDefinition } from '@/engine/skills'

// A representative action; specific id doesn't matter for the pure module.
const HASTY_TOUCH = getSkillById('HastyTouch') as SkillDefinition
const PRUDENT_TOUCH = getSkillById('PrudentTouch') as SkillDefinition
const BASIC_TOUCH = getSkillById('BasicTouch') as SkillDefinition
const RAPID_SYNTH = getSkillById('RapidSynthesis') as SkillDefinition

function stateWith(condition: CraftCondition): CraftState {
  return {
    progress: 0,
    quality: 0,
    durability: 80,
    cp: 600,
    maxProgress: 1000,
    maxQuality: 1000,
    maxDurability: 80,
    maxCp: 600,
    buffs: new Map(),
    step: 0,
    condition,
    isComplete: false,
    isSuccess: false,
  }
}

function expectAllFlagsDefault(o: ModifiedOutcome, except?: Partial<ModifiedOutcome>) {
  const baseline: ModifiedOutcome = {
    successRateBonusPp: 0,
    durabilityCeilHalve: false,
    cpCeilHalve: false,
    progressModMul3Div2: false,
    nextBuffDurationBonus: 0,
    forceNextCondition: null,
  }
  expect(o).toEqual({ ...baseline, ...except })
}

describe('applyConditionToAction', () => {
  it('Centered sets successRateBonusPp=25 only', () => {
    const o = applyConditionToAction(HASTY_TOUCH, 'Centered')
    expectAllFlagsDefault(o, { successRateBonusPp: 25 })
  })

  it('Sturdy sets durabilityCeilHalve=true only', () => {
    const o = applyConditionToAction(BASIC_TOUCH, 'Sturdy')
    expectAllFlagsDefault(o, { durabilityCeilHalve: true })
  })

  it('Pliant sets cpCeilHalve=true only', () => {
    const o = applyConditionToAction(BASIC_TOUCH, 'Pliant')
    expectAllFlagsDefault(o, { cpCeilHalve: true })
  })

  it('Malleable sets progressModMul3Div2=true only', () => {
    const o = applyConditionToAction(RAPID_SYNTH, 'Malleable')
    expectAllFlagsDefault(o, { progressModMul3Div2: true })
  })

  it.each<CraftCondition>(['Normal', 'Good', 'Excellent', 'Poor'])(
    '%s returns all defaults (no expert flags fire)',
    (cond) => {
      const o = applyConditionToAction(BASIC_TOUCH, cond)
      expectAllFlagsDefault(o)
    },
  )

  it.each<CraftCondition>(['Primed', 'GoodOmen'])(
    'R2 condition %s returns all defaults in this slice',
    (cond) => {
      const o = applyConditionToAction(BASIC_TOUCH, cond)
      expectAllFlagsDefault(o)
    },
  )

  it('returned outcome is a fresh object (no shared mutable default)', () => {
    const a = applyConditionToAction(BASIC_TOUCH, 'Centered')
    const b = applyConditionToAction(BASIC_TOUCH, 'Centered')
    expect(a).not.toBe(b)
    a.successRateBonusPp = 999
    expect(b.successRateBonusPp).toBe(25)
  })
})

describe('arithmetic helpers', () => {
  it('divCeilHalf matches div_ceil(2) semantics', () => {
    expect(divCeilHalf(5)).toBe(3) // dura=5 → 3
    expect(divCeilHalf(10)).toBe(5) // dura=10 → 5
    expect(divCeilHalf(25)).toBe(13) // CP=25 → 13
    expect(divCeilHalf(18)).toBe(9) // CP=18 → 9
    expect(divCeilHalf(0)).toBe(0)
    expect(divCeilHalf(1)).toBe(1)
    expect(divCeilHalf(20)).toBe(10) // even dura halves cleanly
  })

  it('capSuccessRate caps at 100 (Centered: 80 + 25 → 100, not 105)', () => {
    expect(capSuccessRate(80 + 25)).toBe(100)
    expect(capSuccessRate(100)).toBe(100)
    expect(capSuccessRate(50 + 25)).toBe(75) // Hasty Touch base + Centered
    expect(capSuccessRate(0)).toBe(0)
  })

  it('malleableProgressMod = floor(action_progress_mod × 3 / 2) — even & odd', () => {
    // raphael action_progress_mod is per-thousand (e.g. 500 == 500%)
    expect(malleableProgressMod(500)).toBe(750) // Rapid Synthesis: 500 → 750
    expect(malleableProgressMod(120)).toBe(180) // Basic Synthesis: 120 → 180
    expect(malleableProgressMod(180)).toBe(270) // Careful: 180 → 270
    expect(malleableProgressMod(300)).toBe(450) // Muscle Memory: 300 → 450
    expect(malleableProgressMod(100)).toBe(150) // even
    expect(malleableProgressMod(101)).toBe(151) // odd: floor(303/2) = 151
    expect(malleableProgressMod(7)).toBe(10) // floor(21/2) = 10
    expect(malleableProgressMod(0)).toBe(0)
  })
})

describe('applyAction integration', () => {
  it('Pliant halves CP cost via div_ceil and leaves durability alone', () => {
    const resolved = applyAction(stateWith('Pliant'), PRUDENT_TOUCH) // PrudentTouch: cp=25, dura=5
    expect(resolved.cpCost).toBe(13)
    expect(resolved.durabilityCost).toBe(5)
    expect(resolved.outcome.cpCeilHalve).toBe(true)
    expect(resolved.outcome.durabilityCeilHalve).toBe(false)
  })

  it('Sturdy halves durability via div_ceil and leaves CP alone', () => {
    const resolved = applyAction(stateWith('Sturdy'), PRUDENT_TOUCH) // cp=25, dura=5
    expect(resolved.cpCost).toBe(25)
    expect(resolved.durabilityCost).toBe(3) // ceil(5 / 2)
  })

  it('Centered adds 25pp and < 100% actions still resolve as success', () => {
    const resolved = applyAction(stateWith('Centered'), HASTY_TOUCH, 60)
    expect(resolved.effectiveSuccessRate).toBe(85)
    expect(resolved.success).toBe(true) // deterministic
  })

  it('Centered caps at 100 when base + bonus would exceed', () => {
    const resolved = applyAction(stateWith('Centered'), BASIC_TOUCH, 80)
    expect(resolved.effectiveSuccessRate).toBe(100)
  })

  it('Normal condition is a no-op (costs match action defaults)', () => {
    const resolved = applyAction(stateWith('Normal'), BASIC_TOUCH) // cp=18, dura=10
    expect(resolved.cpCost).toBe(18)
    expect(resolved.durabilityCost).toBe(10)
    expect(resolved.effectiveSuccessRate).toBe(100)
  })

  it('resolveActionProgressMod applies Malleable only when flag is set', () => {
    const malleable = applyConditionToAction(RAPID_SYNTH, 'Malleable')
    expect(resolveActionProgressMod(500, malleable)).toBe(750)

    const normal = applyConditionToAction(RAPID_SYNTH, 'Normal')
    expect(resolveActionProgressMod(500, normal)).toBe(500)
  })
})

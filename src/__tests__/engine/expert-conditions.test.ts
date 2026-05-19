import { describe, it, expect } from 'vitest'
import {
  applyConditionToAction,
  capSuccessRate,
  divCeilHalf,
  malleableProgressMod,
  type ModifiedOutcome,
} from '@/engine/expert-conditions'
import type { CraftCondition, CraftState } from '@/engine/simulator'
import {
  applyAction,
  commitOutcomeToState,
  consumeForcedCondition,
  getActionAppliedBuff,
  PRIMED_ELIGIBLE_BUFFS,
  resolveActionProgressMod,
} from '@/engine/simulator'
import { getSkillById, type SkillDefinition } from '@/engine/skills'
import type { BuffType } from '@/engine/buffs'

// A representative action; specific id doesn't matter for the pure module.
const HASTY_TOUCH = getSkillById('HastyTouch') as SkillDefinition
const PRUDENT_TOUCH = getSkillById('PrudentTouch') as SkillDefinition
const BASIC_TOUCH = getSkillById('BasicTouch') as SkillDefinition
const MANIPULATION = getSkillById('Manipulation') as SkillDefinition
const INNOVATION = getSkillById('Innovation') as SkillDefinition
const BASIC_SYNTH = getSkillById('BasicSynthesis') as SkillDefinition

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
    pendingBuffDurationBonus: 0,
    forcedNextCondition: null,
  }
}

/** Mutate `state` to add `buff` with `duration` (and stacks=1). Mirrors
 *  the post-action buff installation that the WASM solver performs; we
 *  recreate just enough of it here to test the +2 carry independently. */
function installBuff(state: CraftState, buff: BuffType, duration: number) {
  state.buffs.set(buff, { stacks: 1, duration })
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
    const o = applyConditionToAction('Centered')
    expectAllFlagsDefault(o, { successRateBonusPp: 25 })
  })

  it('Sturdy sets durabilityCeilHalve=true only', () => {
    const o = applyConditionToAction('Sturdy')
    expectAllFlagsDefault(o, { durabilityCeilHalve: true })
  })

  it('Pliant sets cpCeilHalve=true only', () => {
    const o = applyConditionToAction('Pliant')
    expectAllFlagsDefault(o, { cpCeilHalve: true })
  })

  it('Malleable sets progressModMul3Div2=true only', () => {
    const o = applyConditionToAction('Malleable')
    expectAllFlagsDefault(o, { progressModMul3Div2: true })
  })

  it.each<CraftCondition>(['Normal', 'Good', 'Excellent', 'Poor'])(
    '%s returns all defaults (no expert flags fire)',
    (cond) => {
      const o = applyConditionToAction(cond)
      expectAllFlagsDefault(o)
    },
  )

  it('Primed sets nextBuffDurationBonus=2 only', () => {
    const o = applyConditionToAction('Primed')
    expectAllFlagsDefault(o, { nextBuffDurationBonus: 2 })
  })

  it('GoodOmen sets forceNextCondition=Good only', () => {
    const o = applyConditionToAction('GoodOmen')
    expectAllFlagsDefault(o, { forceNextCondition: 'Good' })
  })

  it('returned outcome is a fresh object (no shared mutable default)', () => {
    const a = applyConditionToAction('Centered')
    const b = applyConditionToAction('Centered')
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
    const malleable = applyConditionToAction('Malleable')
    expect(resolveActionProgressMod(500, malleable)).toBe(750)

    const normal = applyConditionToAction('Normal')
    expect(resolveActionProgressMod(500, normal)).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// R2 stateful conditions (Primed / GoodOmen)
// ---------------------------------------------------------------------------

describe('PRIMED_ELIGIBLE_BUFFS', () => {
  it('contains exactly the 8 duration-bearing buffs', () => {
    expect([...PRIMED_ELIGIBLE_BUFFS].sort()).toEqual([
      'FinalAppraisal',
      'GreatStrides',
      'Innovation',
      'Manipulation',
      'MuscleMemory',
      'Veneration',
      'WasteNot',
      'WasteNotII',
    ])
  })

  it('does not include InnerQuiet / TrainedPerfection / HeartAndSoul / QuickInnovation', () => {
    expect(PRIMED_ELIGIBLE_BUFFS).not.toContain('InnerQuiet' as BuffType)
    expect(PRIMED_ELIGIBLE_BUFFS).not.toContain('TrainedPerfection' as BuffType)
    expect(PRIMED_ELIGIBLE_BUFFS).not.toContain('HeartAndSoul' as BuffType)
    expect(PRIMED_ELIGIBLE_BUFFS).not.toContain('QuickInnovation' as BuffType)
  })
})

describe('getActionAppliedBuff', () => {
  it('maps duration-bearing buff actions to their BuffType', () => {
    expect(getActionAppliedBuff('Manipulation')).toBe('Manipulation')
    expect(getActionAppliedBuff('Innovation')).toBe('Innovation')
    expect(getActionAppliedBuff('Veneration')).toBe('Veneration')
    expect(getActionAppliedBuff('GreatStrides')).toBe('GreatStrides')
    expect(getActionAppliedBuff('MuscleMemory')).toBe('MuscleMemory')
    expect(getActionAppliedBuff('FinalAppraisal')).toBe('FinalAppraisal')
    expect(getActionAppliedBuff('WasteNot')).toBe('WasteNot')
    expect(getActionAppliedBuff('WasteNotII')).toBe('WasteNotII')
  })

  it('returns null for non-buff-applying actions', () => {
    expect(getActionAppliedBuff('BasicSynthesis')).toBeNull()
    expect(getActionAppliedBuff('BasicTouch')).toBeNull()
    expect(getActionAppliedBuff('HastyTouch')).toBeNull()
    expect(getActionAppliedBuff('MastersMend')).toBeNull()
    expect(getActionAppliedBuff('Observe')).toBeNull()
  })

  it('returns null for one-shot / no-duration buff actions excluded from Primed', () => {
    // These are technically "buff" category in SKILLS but are not eligible
    // for the +2 turns bonus.
    expect(getActionAppliedBuff('HeartAndSoul')).toBeNull()
    expect(getActionAppliedBuff('QuickInnovation')).toBeNull()
    expect(getActionAppliedBuff('TrainedPerfection')).toBeNull()
  })
})

describe('commitOutcomeToState — Primed plant + carry + consume', () => {
  it('Primed condition plants pendingBuffDurationBonus=2 after the step', () => {
    const state = stateWith('Primed')
    const outcome = applyConditionToAction('Primed')
    commitOutcomeToState(state, BASIC_TOUCH, outcome)
    expect(state.pendingBuffDurationBonus).toBe(2)
  })

  it('Primed → Manipulation: duration = 8 + 2 = 10', () => {
    const state = stateWith('Normal')
    state.pendingBuffDurationBonus = 2
    // Simulate the WASM-side buff installation (Manipulation: 8 turns base).
    installBuff(state, 'Manipulation', 8)
    const outcome = applyConditionToAction('Normal')
    commitOutcomeToState(state, MANIPULATION, outcome)
    expect(state.buffs.get('Manipulation')?.duration).toBe(10)
    expect(state.pendingBuffDurationBonus).toBe(0)
  })

  it('Primed → Innovation: duration = 4 + 2 = 6', () => {
    const state = stateWith('Normal')
    state.pendingBuffDurationBonus = 2
    installBuff(state, 'Innovation', 4)
    const outcome = applyConditionToAction('Normal')
    commitOutcomeToState(state, INNOVATION, outcome)
    expect(state.buffs.get('Innovation')?.duration).toBe(6)
    expect(state.pendingBuffDurationBonus).toBe(0)
  })

  it('Primed → BasicSynthesis (non-buff): bonus is NOT consumed, carries forward', () => {
    const state = stateWith('Normal')
    state.pendingBuffDurationBonus = 2
    const outcome = applyConditionToAction('Normal')
    commitOutcomeToState(state, BASIC_SYNTH, outcome)
    expect(state.pendingBuffDurationBonus).toBe(2)
  })

  it('Primed → BasicSynthesis → Innovation: bonus carries then applies on Innovation', () => {
    const state = stateWith('Normal')
    state.pendingBuffDurationBonus = 2
    // Step 1: BasicSynthesis (non-buff) — carry.
    commitOutcomeToState(
      state,
      BASIC_SYNTH,
      applyConditionToAction('Normal'),
    )
    expect(state.pendingBuffDurationBonus).toBe(2)
    // Step 2: Innovation — consume.
    installBuff(state, 'Innovation', 4)
    commitOutcomeToState(
      state,
      INNOVATION,
      applyConditionToAction('Normal'),
    )
    expect(state.buffs.get('Innovation')?.duration).toBe(6)
    expect(state.pendingBuffDurationBonus).toBe(0)
  })

  it('Multiple Primed in a row overwrite (no accumulation)', () => {
    const state = stateWith('Normal')
    // First Primed.
    commitOutcomeToState(
      state,
      BASIC_TOUCH,
      applyConditionToAction('Primed'),
    )
    expect(state.pendingBuffDurationBonus).toBe(2)
    // Second Primed back-to-back — overwrite, still 2 (not 4).
    commitOutcomeToState(
      state,
      BASIC_TOUCH,
      applyConditionToAction('Primed'),
    )
    expect(state.pendingBuffDurationBonus).toBe(2)
  })

  it('Buff cap is not enforced here (matches FFXIV: no separate Primed cap)', () => {
    const state = stateWith('Normal')
    state.pendingBuffDurationBonus = 2
    // Manipulation base 8 → 10 after Primed; no cap clamp imposed by the
    // commit helper. (The spec says cap behaviour is unchanged.)
    installBuff(state, 'Manipulation', 8)
    commitOutcomeToState(
      state,
      MANIPULATION,
      applyConditionToAction('Normal'),
    )
    expect(state.buffs.get('Manipulation')?.duration).toBe(10)
  })
})

describe('commitOutcomeToState — GoodOmen forces next condition', () => {
  it('GoodOmen condition plants forcedNextCondition="Good" after the step', () => {
    const state = stateWith('GoodOmen')
    const outcome = applyConditionToAction('GoodOmen')
    commitOutcomeToState(state, BASIC_TOUCH, outcome)
    expect(state.forcedNextCondition).toBe('Good')
  })

  it('does not touch forcedNextCondition for non-GoodOmen conditions', () => {
    const state = stateWith('Centered')
    commitOutcomeToState(
      state,
      BASIC_TOUCH,
      applyConditionToAction('Centered'),
    )
    expect(state.forcedNextCondition).toBeNull()
  })
})

describe('consumeForcedCondition', () => {
  it('returns the forced condition and resets the field to null', () => {
    const state = stateWith('Normal')
    state.forcedNextCondition = 'Good'
    const next = consumeForcedCondition(state, 'Excellent')
    expect(next).toBe('Good')
    expect(state.forcedNextCondition).toBeNull()
  })

  it('returns the picker choice when no condition is forced', () => {
    const state = stateWith('Normal')
    expect(consumeForcedCondition(state, 'Centered')).toBe('Centered')
    expect(state.forcedNextCondition).toBeNull()
  })

  it('GoodOmen → next step state.condition === Good regardless of picker', () => {
    // End-to-end: a GoodOmen step plants the lock; on the next step,
    // even if the picker would otherwise pick Excellent, the consumed
    // condition is Good.
    const state = stateWith('GoodOmen')
    commitOutcomeToState(
      state,
      BASIC_TOUCH,
      applyConditionToAction('GoodOmen'),
    )
    expect(state.forcedNextCondition).toBe('Good')

    // Start of next step: picker says 'Excellent', but lock overrides.
    const effective = consumeForcedCondition(state, 'Excellent')
    expect(effective).toBe('Good')
    expect(state.forcedNextCondition).toBeNull()
  })
})

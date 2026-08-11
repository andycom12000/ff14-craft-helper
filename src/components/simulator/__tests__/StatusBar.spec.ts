// src/components/simulator/__tests__/StatusBar.spec.ts
//
// The level-sync downgrade badge (issue #234, US10/US11/US13). It lives on the
// StatusBar header because that header sits directly above the 進展／品質／耐久
// bars — the numbers the sync changed — so the explanation is where the
// surprise is. The badge must appear ONLY on an actual downgrade: a Lv100
// crafter sees an identity transform and must get no extra chrome at all.

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusBar from '../StatusBar.vue'
import type { CraftState } from '@/engine/simulator'

const globalStubs = {
  'el-tag': { template: '<span class="el-tag"><slot /></span>' },
  'el-text': { template: '<span class="el-text"><slot /></span>' },
  'el-tooltip': { template: '<span class="el-tooltip"><slot /></span>' },
  'el-progress': { template: '<div class="el-progress" />' },
}

function makeState(): CraftState {
  return {
    step: 0,
    progress: 0,
    maxProgress: 2928,
    quality: 0,
    maxQuality: 4512,
    durability: 40,
    maxDurability: 40,
    cp: 500,
    maxCp: 500,
    isComplete: false,
    isSuccess: false,
    buffs: new Map(),
  } as unknown as CraftState
}

function mountBar(levelSync: { syncedLevel: number; originalLevel: number } | null) {
  return mount(StatusBar, {
    props: { craftState: makeState(), levelSync },
    global: { stubs: globalStubs },
  })
}

describe('StatusBar — level-sync badge (#234)', () => {
  it('shows the synced level alongside the original when the recipe was downgraded', () => {
    const text = mountBar({ syncedLevel: 94, originalLevel: 100 }).text()
    // US11: both levels are present, so the user can reconcile the on-screen
    // numbers against the Lv100 the in-game recipe log shows.
    expect(text).toContain('等級同步 Lv.94')
    expect(text).toContain('原始 Lv.100')
  })

  it('renders no badge for a Lv100 crafter (identity transform)', () => {
    // US13: no downgrade happened, so `levelSync` is absent and the header must
    // be free of noise — this feature is invisible to people who don't need it.
    const text = mountBar(null).text()
    expect(text).not.toContain('等級同步')
    expect(text).not.toContain('原始 Lv.')
  })

  it('omits the badge when the prop is not passed at all', () => {
    const wrapper = mount(StatusBar, {
      props: { craftState: makeState() },
      global: { stubs: globalStubs },
    })
    expect(wrapper.text()).not.toContain('等級同步')
  })

  it('still renders the craft bars and step count with the badge present', () => {
    // The badge is additive: it must not displace what was already there.
    const text = mountBar({ syncedLevel: 90, originalLevel: 100 }).text()
    expect(text).toContain('製作中')
    expect(text).toContain('步數: 0')
    expect(text).toContain('0 / 2928')
  })
})

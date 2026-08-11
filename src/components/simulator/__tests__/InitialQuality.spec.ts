// src/components/simulator/__tests__/InitialQuality.spec.ts
//
// Regression test for the level-sync junction bug (issue #234): InitialQuality
// must compute the initial-quality value from the `recipe` PROP (already synced
// to crafter level at the useSimulator junction — ADR 0003), never from
// recipeStore.currentRecipe directly. Reading the store bypasses the sync and
// leaks the un-synced canonical recipe's quality cap into the value handed to
// the solver (see spec walkthrough for the 6372 vs 10620 numbers below).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import InitialQuality from '../InitialQuality.vue'
import type { Recipe } from '@/stores/recipe'

vi.mock('@/components/common/ItemName.vue', () => ({
  default: { template: '<span />' },
}))

const ElButtonStub = {
  name: 'ElButton',
  template: '<button class="el-button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  props: { disabled: Boolean, type: String },
  emits: ['click'],
}

const globalStubs = {
  'el-empty': { template: '<div class="el-empty" />' },
  'el-button': ElButtonStub,
  'el-button-group': { template: '<div class="el-button-group"><slot /></div>' },
  'el-text': { template: '<span><slot /></span>' },
}

// Three canHq ingredients, amount 1 each, level 1 each — with `setAllHq` this
// drives hqAmount === amount for all of them, so calculateInitialQuality's
// level-weighted ratio collapses to exactly 1 regardless of the level values.
function makeIngredients() {
  return [1, 2, 3].map((n) => ({
    itemId: n,
    name: `素材${n}`,
    icon: '',
    amount: 1,
    canHq: true,
    level: 1,
  }))
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 36179,
    itemId: 9999,
    name: '測試配方',
    icon: '',
    job: 'CRP',
    level: 90,
    stars: 0,
    canHq: true,
    materialQualityFactor: 50,
    amountResult: 1,
    ingredients: makeIngredients(),
    recipeLevelTable: {
      classJobLevel: 90,
      stars: 0,
      difficulty: 3500,
      quality: 21240,
      durability: 80,
      suggestedCraftsmanship: 0,
      progressDivider: 130,
      qualityDivider: 115,
      progressModifier: 90,
      qualityModifier: 80,
    },
    ...overrides,
  }
}

beforeEach(() => setActivePinia(createPinia()))

describe('InitialQuality.vue', () => {
  it('全部 HQ 時，用傳入的（已同步）recipe.recipeLevelTable.quality 算初始品質，不吃 store 裡未同步的配方', async () => {
    const synced = makeRecipe({
      recipeLevelTable: {
        classJobLevel: 90, stars: 0, difficulty: 3500, quality: 12744,
        durability: 80, suggestedCraftsmanship: 0,
        progressDivider: 130, qualityDivider: 115,
        progressModifier: 90, qualityModifier: 80,
      },
    })

    const wrapper = mount(InitialQuality, {
      props: { recipe: synced },
      global: { stubs: globalStubs },
    })

    const allHqBtn = wrapper.findAll('.el-button').find((b) => b.text().includes('全部 HQ'))
    expect(allHqBtn).toBeDefined()
    await allHqBtn!.trigger('click')

    const emitted = wrapper.emitted('update:initialQuality')
    expect(emitted).toBeTruthy()
    const last = emitted![emitted!.length - 1][0]
    expect(last).toBe(6372)
  })

  it('傳入未同步版本（quality=21240）時算出的初始品質是 10620（對照組，證明兩者確實不同）', async () => {
    const unsynced = makeRecipe() // recipeLevelTable.quality: 21240 (see makeRecipe default)

    const wrapper = mount(InitialQuality, {
      props: { recipe: unsynced },
      global: { stubs: globalStubs },
    })

    const allHqBtn = wrapper.findAll('.el-button').find((b) => b.text().includes('全部 HQ'))
    await allHqBtn!.trigger('click')

    const emitted = wrapper.emitted('update:initialQuality')
    const last = emitted![emitted!.length - 1][0]
    expect(last).toBe(10620)
  })

  it('recipe prop 為 null 時不會炸掉，顯示空狀態', () => {
    const wrapper = mount(InitialQuality, {
      props: { recipe: null },
      global: { stubs: globalStubs },
    })
    expect(wrapper.find('.el-empty').exists()).toBe(true)
    expect(wrapper.emitted('update:initialQuality')?.[0][0]).toBe(0)
  })
})

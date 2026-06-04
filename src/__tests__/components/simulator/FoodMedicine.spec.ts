import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'

vi.mock('@/utils/user-properties', () => ({ syncFromStores: vi.fn() }))
vi.mock('@/utils/analytics', () => ({ trackEvent: vi.fn() }))

import FoodMedicine from '@/components/simulator/FoodMedicine.vue'
import { useRecipeStore, type Recipe } from '@/stores/recipe'
import { useGearsetsStore } from '@/stores/gearsets'

const mountOpts = { global: { plugins: [ElementPlus] } }

const RECIPE: Recipe = {
  id: 1, itemId: 100, name: 'P', icon: '', job: 'CRP',
  level: 90, stars: 0, canHq: true, materialQualityFactor: 75, amountResult: 1,
  ingredients: [],
  recipeLevelTable: {
    classJobLevel: 90, stars: 0, difficulty: 3500, quality: 7200,
    durability: 80, suggestedCraftsmanship: 0,
    progressDivider: 130, qualityDivider: 115,
    progressModifier: 90, qualityModifier: 80,
  },
}

function seed() {
  setActivePinia(createPinia())
  localStorage.clear()
  const recipeStore = useRecipeStore()
  recipeStore.setRecipe(RECIPE)
  const gearsets = useGearsetsStore()
  gearsets.updateGearset('CRP', { level: 100, craftsmanship: 4000, control: 3800, cp: 600 })
}

describe('FoodMedicine — session meld override (Slice C)', () => {
  beforeEach(seed)

  it('with no override, base and final stats are unchanged (parity)', () => {
    const w = mount(FoodMedicine, mountOpts)
    // last emitted enhancedStats == raw gearset (no buffs, no override)
    const emitted = w.emitted('update:enhancedStats') as Array<[{ craftsmanship: number; control: number; cp: number }]>
    const last = emitted[emitted.length - 1][0]
    expect(last).toEqual({ craftsmanship: 4000, control: 3800, cp: 600 })
    // no chip
    expect(w.find('.meld-override-chip').exists()).toBe(false)
  })

  it('an override prop shifts the final stats (base+override then buffs)', () => {
    const w = mount(FoodMedicine, {
      ...mountOpts,
      props: { override: { craftsmanship: 0, control: 432, cp: 0 } },
    })
    const emitted = w.emitted('update:enhancedStats') as Array<[{ craftsmanship: number; control: number; cp: number }]>
    const last = emitted[emitted.length - 1][0]
    // no food/medicine selected → final = raw + override
    expect(last).toEqual({ craftsmanship: 4000, control: 3800 + 432, cp: 600 })
  })

  it('renders a closable chip when overrideChipLabel is set', () => {
    const w = mount(FoodMedicine, {
      ...mountOpts,
      props: {
        override: { craftsmanship: 0, control: 432, cp: 0 },
        overrideChipLabel: '8 顆 加工魔晶石Ⅻ',
      },
    })
    const chip = w.find('.meld-override-chip')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('模擬鑲嵌：8 顆 加工魔晶石Ⅻ')
  })

  // #136: the card surfaces the active buff OBJECTS so the host can fold them
  // into the meld advisor on the same basis as the screen solver.
  it('#136: emits update:buffs (null/null when nothing is selected)', () => {
    const w = mount(FoodMedicine, mountOpts)
    const emitted = w.emitted('update:buffs') as Array<[{ food: unknown; medicine: unknown }]>
    expect(emitted).toBeTruthy()
    expect(emitted[emitted.length - 1][0]).toEqual({ food: null, medicine: null })
  })

  it('closing the chip emits clear-override', async () => {
    const w = mount(FoodMedicine, {
      ...mountOpts,
      props: {
        override: { craftsmanship: 0, control: 432, cp: 0 },
        overrideChipLabel: '8 顆 加工魔晶石Ⅻ',
      },
    })
    // el-tag closable renders a close icon button
    const closeBtn = w.find('.meld-override-chip .el-tag__close')
    expect(closeBtn.exists()).toBe(true)
    await closeBtn.trigger('click')
    expect(w.emitted('clear-override')).toBeTruthy()
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import NewProjectDialog from '@/components/company-craft/NewProjectDialog.vue'

vi.mock('@/services/local-data-source', () => ({
  listCompanyCraftByCategory: vi.fn(() => []),
  getItemSync: vi.fn(() => ({ name: 'Test Item', level: 1, canBeHq: false, iconId: 0 })),
  loadCompanyCraft: vi.fn(async () => []),
}))

vi.mock('@/components/common/ItemName.vue', () => ({
  default: { template: '<span />' },
}))

// Stub el-dialog to render slots inline (bypasses teleport + registration issues)
const ElDialogStub = {
  name: 'ElDialog',
  template: `
    <div class="el-dialog-stub" v-if="modelValue">
      <div class="el-dialog__header"><slot name="header" /></div>
      <div class="el-dialog__body"><slot /></div>
      <div class="el-dialog__footer"><slot name="footer" /></div>
    </div>
  `,
  props: ['modelValue', 'width', 'showClose', 'alignCenter'],
  emits: ['update:modelValue'],
}

// Stub el-button to render as a native button with disabled support
const ElButtonStub = {
  name: 'ElButton',
  template: '<button class="el-button" :disabled="disabled"><slot /></button>',
  props: { disabled: Boolean, type: String },
}

const globalStubs = {
  'el-dialog': ElDialogStub,
  'el-button': ElButtonStub,
  'el-input': { template: '<input />' },
  'el-select': { template: '<select />' },
  'el-option': { template: '<option />' },
}

beforeEach(() => setActivePinia(createPinia()))

describe('NewProjectDialog', () => {
  it('starts on Step 1 with all three type cards', async () => {
    const wrapper = mount(NewProjectDialog, {
      props: { modelValue: true },
      global: { stubs: globalStubs },
    })
    await flushPromises()
    expect(wrapper.findAll('.type-card').length).toBe(3)
    expect(wrapper.text()).toContain('Step 1 / 3')
  })

  it('disables next button until a type is picked', async () => {
    const wrapper = mount(NewProjectDialog, {
      props: { modelValue: true },
      global: { stubs: globalStubs },
    })
    await flushPromises()

    const nextBtn = wrapper.findAll('.el-button').find(b => b.text().includes('下一步'))
    expect(nextBtn).toBeDefined()
    expect(nextBtn?.attributes('disabled')).toBeDefined()

    await wrapper.findAll('.type-card')[0].trigger('click')
    await flushPromises()
    expect(nextBtn?.attributes('disabled')).toBeUndefined()
  })
})

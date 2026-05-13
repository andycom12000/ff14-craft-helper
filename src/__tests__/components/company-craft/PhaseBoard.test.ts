import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import PhaseBoard from '@/components/company-craft/PhaseBoard.vue'
import { useWorkshopProjectsStore } from '@/stores/workshop-projects'
import { SEQ_TATANORA_BOW } from '@/__tests__/fixtures/company-craft'

vi.mock('@/components/common/ItemName.vue', () => ({
  default: { template: '<span />' },
}))
vi.mock('@/components/company-craft/PhaseRow.vue', () => ({
  default: { template: '<div class="phase-row-stub" />' },
}))

beforeEach(() => setActivePinia(createPinia()))

describe('PhaseBoard', () => {
  it('renders one part group per linked sequence', () => {
    const store = useWorkshopProjectsStore()
    const id = store.createProject({
      name: 'X', category: 'submersible',
      sequences: [{ sequenceId: SEQ_TATANORA_BOW.id }],
    })
    const wrapper = mount(PhaseBoard, {
      props: { project: store.getProject(id)!, sequences: [SEQ_TATANORA_BOW] },
    })
    expect(wrapper.findAll('.part-group').length).toBe(1)
  })

  it('toggles part expansion on header click', async () => {
    const store = useWorkshopProjectsStore()
    const id = store.createProject({
      name: 'X', category: 'submersible',
      sequences: [{ sequenceId: SEQ_TATANORA_BOW.id }],
    })
    const wrapper = mount(PhaseBoard, {
      props: { project: store.getProject(id)!, sequences: [SEQ_TATANORA_BOW] },
    })
    expect(wrapper.find('.part-group-body').exists()).toBe(false)
    await wrapper.find('.part-group-head').trigger('click')
    expect(wrapper.find('.part-group-body').exists()).toBe(true)
  })
})

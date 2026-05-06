import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RoutePlannerToolbar from '@/components/bom/RoutePlannerToolbar.vue'

describe('RoutePlannerToolbar', () => {
  it('renders progress count', () => {
    const w = mount(RoutePlannerToolbar, {
      props: { progress: { done: 7, total: 12 } },
    })
    expect(w.find('[data-testid="progress-count"]').text()).toBe('7 / 12')
  })

  it('emits reset and re-sort on button clicks', async () => {
    const w = mount(RoutePlannerToolbar, {
      props: { progress: { done: 0, total: 5 } },
    })
    const buttons = w.findAll('.rpt__btn')
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    expect(w.emitted('re-sort')).toBeTruthy()
    expect(w.emitted('reset')).toBeTruthy()
  })

  it('marks bar as complete when done === total', () => {
    const w = mount(RoutePlannerToolbar, {
      props: { progress: { done: 5, total: 5 } },
    })
    expect(w.find('[data-testid="progress"]').classes()).toContain('is-complete')
  })

  it('shows 0% when total is 0', () => {
    const w = mount(RoutePlannerToolbar, {
      props: { progress: { done: 0, total: 0 } },
    })
    expect(w.find('[data-testid="progress"]').classes()).not.toContain('is-complete')
  })
})

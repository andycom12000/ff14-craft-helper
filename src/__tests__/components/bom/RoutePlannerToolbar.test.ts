import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RoutePlannerToolbar from '@/components/bom/RoutePlannerToolbar.vue'

// Pure container — caller provides stepper and right-aligned actions
// via the default slot. Reset is owned by BomRoutePlanner now (it can
// react locally without an emit round-trip).
describe('RoutePlannerToolbar', () => {
  it('renders default slot content', () => {
    const w = mount(RoutePlannerToolbar, {
      slots: { default: '<div data-testid="child">stops</div>' },
    })
    expect(w.find('[data-testid="child"]').exists()).toBe(true)
  })

  it('exposes the route-toolbar test hook', () => {
    const w = mount(RoutePlannerToolbar)
    expect(w.find('[data-testid="route-toolbar"]').exists()).toBe(true)
  })
})

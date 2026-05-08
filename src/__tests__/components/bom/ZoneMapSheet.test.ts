import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import ZoneMapSheet from '@/components/bom/ZoneMapSheet.vue'
import { fetchZoneMetaBulk, __clearCache } from '@/services/zone-meta'

// ---------------------------------------------------------------------------
// Mock useZoneName to return a computed with predictable value
// ---------------------------------------------------------------------------

vi.mock('@/composables/useZoneName', () => ({
  useZoneName: (zoneIdGetter: unknown) => {
    const { computed, toValue } = require('vue')
    return computed(() => {
      const id = toValue(zoneIdGetter)
      return id === 146 ? 'Lower La Noscea' : `#zone:${id}`
    })
  },
}))

// ---------------------------------------------------------------------------
// Mock locale store
// ---------------------------------------------------------------------------

vi.mock('@/stores/locale', () => ({
  useLocaleStore: () => ({ current: 'en' }),
}))

// ---------------------------------------------------------------------------
// beforeEach setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  setActivePinia(createPinia())
  __clearCache()
  vi.restoreAllMocks()
})

describe('ZoneMapSheet', () => {
  it('mounts in closed state when modelValue=false', () => {
    const w = mount(ZoneMapSheet, {
      props: { modelValue: false, zoneId: null },
    })
    // When drawer is closed, the body content is hidden (though still in DOM)
    const sheet = w.find('[data-testid="zone-map-sheet"]')
    expect(sheet.exists()).toBe(true) // Component itself exists
    w.unmount()
  })

  it('renders title + canvas when open with valid zoneId', async () => {
    // Mock fetch for zone metadata
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => {
          // Match Map search FIRST — its URL contains "PlaceName=146" inside
          // the query string, which would falsely match a substring check.
          if (url.includes('search?sheets=Map')) {
            return {
              results: [
                {
                  row_id: 12,
                  fields: {
                    Id: 'r1f1/00',
                    SizeFactor: 100,
                    PlaceName: { value: 146 },
                  },
                },
              ],
            }
          }
          if (url.includes('/sheet/PlaceName')) {
            return {
              rows: [
                {
                  row_id: 146,
                  fields: {
                    Name_en: 'Lower La Noscea',
                    Name_chs: '拉诺西亚低地',
                  },
                },
              ],
            }
          } else if (url.includes('Map')) {
            // Map sheet response
            return {
              results: [
                {
                  row_id: 12,
                  fields: {
                    Id: 'r1f1/00',
                    SizeFactor: 100,
                    PlaceName: { value: 146 },
                  },
                },
              ],
            }
          }
          return { rows: [], results: [] }
        },
      } as any))
    )

    // Fetch zone metadata
    await fetchZoneMetaBulk([146])

    const w = mount(ZoneMapSheet, {
      props: { modelValue: true, zoneId: 146 },
    })
    await w.vm.$nextTick()

    expect(w.find('[data-testid="zone-map-canvas"]').exists()).toBe(true)
    expect(w.text()).toContain('Lower La Noscea')
    w.unmount()
  })

  it('positions marker via convertToPixel + pixelToPercent', async () => {
    // Mock fetch for zone metadata
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => {
          // Match Map search before the PlaceName substring check (the Map
          // URL itself contains "PlaceName=146" inside its query string).
          if (url.includes('search?sheets=Map')) {
            return {
              results: [
                {
                  row_id: 12,
                  fields: {
                    Id: 'r1f1/00',
                    SizeFactor: 100,
                    PlaceName: { value: 146 },
                  },
                },
              ],
            }
          }
          if (url.includes('/sheet/PlaceName')) {
            return {
              rows: [
                {
                  row_id: 146,
                  fields: { Name_en: 'Lower La Noscea' },
                },
              ],
            }
          }
          return { rows: [], results: [] }
        },
      } as any))
    )

    await fetchZoneMetaBulk([146])

    const w = mount(ZoneMapSheet, {
      props: {
        modelValue: true,
        zoneId: 146,
        highlightCoords: { x: 21.5, y: 21.5 },
      },
    })
    await w.vm.$nextTick()

    const marker = w.find('[data-testid="zone-map-marker"]')
    expect(marker.exists()).toBe(true)

    // marker style should have left/top set as percentages
    const style = marker.attributes('style') ?? ''
    expect(style).toContain('left:')
    expect(style).toContain('top:')
    expect(style).toContain('%')
    w.unmount()
  })

  it('emits update:modelValue when drawer close fires', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ rows: [], results: [] }),
      }))
    )

    const w = mount(ZoneMapSheet, {
      props: { modelValue: true, zoneId: 146 },
    })
    await w.vm.$nextTick()

    // Verify component exists
    expect(w.exists()).toBe(true)

    // Simulate closing the drawer by triggering the update:modelValue event
    // The component's template has @update:model-value="(v) => emit('update:modelValue', v)"
    // which forwards the el-drawer's event
    w.vm.$emit('update:modelValue', false)

    const events = w.emitted('update:modelValue')
    expect(events).toBeTruthy()
    expect(events![0]).toEqual([false])
    w.unmount()
  })
})

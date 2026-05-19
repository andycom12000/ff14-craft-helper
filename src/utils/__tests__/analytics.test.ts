import { describe, it, expect, beforeEach, vi } from 'vitest'
import { trackEvent } from '../analytics'

describe('analytics', () => {
  let gtag: ReturnType<typeof vi.fn>
  beforeEach(() => {
    gtag = vi.fn()
    ;(globalThis as Record<string, unknown>).window = {
      gtag,
      location: { origin: 'https://example.com', pathname: '/ff14-craft-helper/', hash: '#/simulator' },
    }
  })
  it('placeholder', () => { expect(true).toBe(true) })

  describe('trackEvent', () => {
    it('includes current page_location with hash for custom events', () => {
      trackEvent('solver_start', { foo: 'bar' })
      expect(gtag).toHaveBeenCalledWith('event', 'solver_start', expect.objectContaining({
        page_location: 'https://example.com/ff14-craft-helper/#/simulator',
        foo: 'bar',
      }))
    })

    it('caller-supplied page_location overrides default', () => {
      trackEvent('share_link_inbound', { page_location: 'https://override.com/' })
      expect(gtag).toHaveBeenCalledWith('event', 'share_link_inbound', expect.objectContaining({
        page_location: 'https://override.com/',
      }))
    })
  })
})

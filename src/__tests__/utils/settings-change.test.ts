import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/analytics', () => ({ trackEvent: vi.fn() }))

import { trackEvent } from '@/utils/analytics'
import { emitSettingsChange } from '@/utils/settings-change'

describe('emitSettingsChange', () => {
  beforeEach(() => {
    vi.mocked(trackEvent).mockClear()
  })

  it('emits settings_change with stringified prev/next', () => {
    emitSettingsChange('region', '', '繁中服')
    expect(trackEvent).toHaveBeenCalledWith('settings_change', {
      key: 'region',
      prev: '',
      value: '繁中服',
    })
  })

  it('stringifies booleans', () => {
    emitSettingsChange('cross_server', true, false)
    expect(trackEvent).toHaveBeenCalledWith('settings_change', {
      key: 'cross_server',
      prev: 'true',
      value: 'false',
    })
  })

  it('stringifies numbers', () => {
    emitSettingsChange('max_recursion_depth', 2, 5)
    expect(trackEvent).toHaveBeenCalledWith('settings_change', {
      key: 'max_recursion_depth',
      prev: '2',
      value: '5',
    })
  })

  it('handles null and undefined', () => {
    emitSettingsChange('region', null, undefined)
    expect(trackEvent).toHaveBeenCalledWith('settings_change', {
      key: 'region',
      prev: '',
      value: '',
    })
  })

  it('truncates strings longer than 100 chars', () => {
    const long = 'x'.repeat(500)
    emitSettingsChange('server', '', long)
    const call = vi.mocked(trackEvent).mock.calls[0][1] as Record<string, string>
    expect(call.value.length).toBe(100)
  })

  it('does not emit when prev === next', () => {
    emitSettingsChange('region', '繁中服', '繁中服')
    expect(trackEvent).not.toHaveBeenCalled()
  })
})

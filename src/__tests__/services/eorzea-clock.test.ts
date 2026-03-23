import { describe, it, expect, vi } from 'vitest'
import { getEorzeaTime, getNextSpawn, formatCountdown } from '@/services/eorzea-clock'

describe('getEorzeaTime', () => {
  it('returns hour and minute from real timestamp', () => {
    vi.spyOn(Date, 'now').mockReturnValue(0)
    const et = getEorzeaTime()
    expect(et.hour).toBe(0)
    expect(et.minute).toBe(0)
  })

  it('returns correct ET for a known real timestamp', () => {
    vi.spyOn(Date, 'now').mockReturnValue(175 * 1000)
    const et = getEorzeaTime()
    expect(et.hour).toBe(1)
    expect(et.minute).toBe(0)
  })

  it('wraps at 24 ET hours', () => {
    vi.spyOn(Date, 'now').mockReturnValue(4200 * 1000)
    const et = getEorzeaTime()
    expect(et.hour).toBe(0)
    expect(et.minute).toBe(0)
  })
})

describe('getNextSpawn', () => {
  const node = {
    spawnTimes: [2, 14],
    duration: 120,
  }

  it('returns isActive=true when current ET is within spawn window', () => {
    const result = getNextSpawn(node, { hour: 2, minute: 30 })
    expect(result.isActive).toBe(true)
  })

  it('returns isActive=false when outside spawn window', () => {
    const result = getNextSpawn(node, { hour: 5, minute: 0 })
    expect(result.isActive).toBe(false)
  })

  it('calculates seconds until next spawn', () => {
    const result = getNextSpawn(node, { hour: 5, minute: 0 })
    expect(result.realSecondsUntil).toBe(9 * 175)
  })

  it('wraps around midnight for next spawn', () => {
    // Current: ET 17:00, both windows closed (2:00-4:00 and 14:00-16:00)
    // Next spawn: ET 2:00 → 9 ET hours away
    const result = getNextSpawn(node, { hour: 17, minute: 0 })
    expect(result.isActive).toBe(false)
    expect(result.realSecondsUntil).toBe(9 * 175)
  })

  it('returns isActive=true near end of spawn window', () => {
    // ET 15:00 is within 14:00-16:00 window
    const result = getNextSpawn(node, { hour: 15, minute: 0 })
    expect(result.isActive).toBe(true)
  })

  it('returns 0 seconds when active', () => {
    const result = getNextSpawn(node, { hour: 14, minute: 0 })
    expect(result.isActive).toBe(true)
    expect(result.realSecondsUntil).toBe(0)
  })
})

describe('formatCountdown', () => {
  it('formats seconds as MM:SS', () => {
    expect(formatCountdown(754)).toBe('12:34')
  })

  it('handles zero', () => {
    expect(formatCountdown(0)).toBe('00:00')
  })

  it('handles over an hour', () => {
    expect(formatCountdown(3661)).toBe('61:01')
  })
})

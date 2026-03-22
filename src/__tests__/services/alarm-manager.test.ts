import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shouldTriggerAlarm, buildAlarmKey, markAlarmFired, hasAlarmFired, clearFiredAlarmsForNode } from '@/services/alarm-manager'

describe('shouldTriggerAlarm', () => {
  it('returns first when within first alert window', () => {
    const result = shouldTriggerAlarm({
      realSecondsUntil: 350,
      isActive: false,
      alarmSettings: {
        firstAlert: { enabled: true, etMinutesBefore: 120 },
        secondAlert: { enabled: false, etMinutesBefore: 0 },
        soundFile: 'chime',
        volume: 70,
      },
      globalAlarmEnabled: true,
      itemAlarmEnabled: true,
    })
    expect(result).toBe('first')
  })

  it('returns false when global alarm disabled', () => {
    const result = shouldTriggerAlarm({
      realSecondsUntil: 350,
      isActive: false,
      alarmSettings: {
        firstAlert: { enabled: true, etMinutesBefore: 120 },
        secondAlert: { enabled: false, etMinutesBefore: 0 },
        soundFile: 'chime',
        volume: 70,
      },
      globalAlarmEnabled: false,
      itemAlarmEnabled: true,
    })
    expect(result).toBe(false)
  })

  it('returns false when item alarm disabled', () => {
    const result = shouldTriggerAlarm({
      realSecondsUntil: 350,
      isActive: false,
      alarmSettings: {
        firstAlert: { enabled: true, etMinutesBefore: 120 },
        secondAlert: { enabled: false, etMinutesBefore: 0 },
        soundFile: 'chime',
        volume: 70,
      },
      globalAlarmEnabled: true,
      itemAlarmEnabled: false,
    })
    expect(result).toBe(false)
  })

  it('returns second when node just became active', () => {
    const result = shouldTriggerAlarm({
      realSecondsUntil: 0,
      isActive: true,
      alarmSettings: {
        firstAlert: { enabled: true, etMinutesBefore: 120 },
        secondAlert: { enabled: true, etMinutesBefore: 0 },
        soundFile: 'chime',
        volume: 70,
      },
      globalAlarmEnabled: true,
      itemAlarmEnabled: true,
    })
    expect(result).toBe('second')
  })
})

describe('alarm deduplication', () => {
  it('tracks fired alarms to prevent duplicates', () => {
    const key = buildAlarmKey(123, 2, 'first')
    expect(hasAlarmFired(key)).toBe(false)
    markAlarmFired(key)
    expect(hasAlarmFired(key)).toBe(true)
  })

  it('clears fired alarms for a specific node', () => {
    markAlarmFired(buildAlarmKey(123, 2, 'first'))
    markAlarmFired(buildAlarmKey(123, 14, 'second'))
    markAlarmFired(buildAlarmKey(456, 0, 'first'))
    clearFiredAlarmsForNode(123)
    expect(hasAlarmFired(buildAlarmKey(123, 2, 'first'))).toBe(false)
    expect(hasAlarmFired(buildAlarmKey(456, 0, 'first'))).toBe(true)
  })
})

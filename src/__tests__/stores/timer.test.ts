import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTimerStore } from '@/stores/timer'

describe('useTimerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('has correct default state', () => {
    const store = useTimerStore()
    expect(store.trackedItems).toEqual([])
    expect(store.globalAlarmEnabled).toBe(true)
    expect(store.alarmSettings.volume).toBe(70)
    expect(store.alarmSettings.soundFile).toBe('chime')
  })

  it('adds a tracked item', () => {
    const store = useTimerStore()
    store.addTrackedItem(123, 456)
    expect(store.trackedItems).toHaveLength(1)
    expect(store.trackedItems[0]).toEqual({ nodeId: 123, itemId: 456, alarmEnabled: true })
  })

  it('does not add duplicate tracked item', () => {
    const store = useTimerStore()
    store.addTrackedItem(123, 456)
    store.addTrackedItem(123, 456)
    expect(store.trackedItems).toHaveLength(1)
  })

  it('removes a tracked item', () => {
    const store = useTimerStore()
    store.addTrackedItem(123, 456)
    store.removeTrackedItem(123)
    expect(store.trackedItems).toHaveLength(0)
  })

  it('toggles individual item alarm', () => {
    const store = useTimerStore()
    store.addTrackedItem(123, 456)
    store.toggleItemAlarm(123)
    expect(store.trackedItems[0].alarmEnabled).toBe(false)
    store.toggleItemAlarm(123)
    expect(store.trackedItems[0].alarmEnabled).toBe(true)
  })

  it('checks if a node is tracked', () => {
    const store = useTimerStore()
    store.addTrackedItem(123, 456)
    expect(store.isTracked(123)).toBe(true)
    expect(store.isTracked(999)).toBe(false)
  })
})

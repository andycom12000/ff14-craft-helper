import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { GatheringNode } from '@/api/garland'

export interface TrackedItem {
  nodeId: number
  itemId: number
  alarmEnabled: boolean
}

export interface AlarmSettings {
  firstAlert: { enabled: boolean; etMinutesBefore: number }
  secondAlert: { enabled: boolean; etMinutesBefore: number }
  soundFile: string
  volume: number
}

export const useTimerStore = defineStore('timer', () => {
  const trackedItems = ref<TrackedItem[]>([])
  const globalAlarmEnabled = ref(true)
  const alarmSettings = ref<AlarmSettings>({
    firstAlert: { enabled: true, etMinutesBefore: 120 },
    secondAlert: { enabled: true, etMinutesBefore: 0 },
    soundFile: 'chime',
    volume: 70,
  })
  const nodeCache = ref<GatheringNode[]>([])
  const nodeCacheTimestamp = ref(0)

  function addTrackedItem(nodeId: number, itemId: number) {
    if (trackedItems.value.some((t) => t.nodeId === nodeId)) return
    trackedItems.value.push({ nodeId, itemId, alarmEnabled: true })
  }

  function removeTrackedItem(nodeId: number) {
    trackedItems.value = trackedItems.value.filter((t) => t.nodeId !== nodeId)
  }

  function toggleItemAlarm(nodeId: number) {
    const item = trackedItems.value.find((t) => t.nodeId === nodeId)
    if (item) item.alarmEnabled = !item.alarmEnabled
  }

  function isTracked(nodeId: number): boolean {
    return trackedItems.value.some((t) => t.nodeId === nodeId)
  }

  return {
    trackedItems, globalAlarmEnabled, alarmSettings,
    nodeCache, nodeCacheTimestamp,
    addTrackedItem, removeTrackedItem, toggleItemAlarm, isTracked,
  }
}, {
  persist: {
    pick: ['trackedItems', 'globalAlarmEnabled', 'alarmSettings'],
  },
})

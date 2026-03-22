import type { AlarmSettings } from '@/stores/timer'
import { REAL_SECONDS_PER_ET_HOUR } from '@/services/eorzea-clock'

interface AlarmCheckInput {
  realSecondsUntil: number
  isActive: boolean
  alarmSettings: AlarmSettings
  globalAlarmEnabled: boolean
  itemAlarmEnabled: boolean
}

export function shouldTriggerAlarm(input: AlarmCheckInput): 'first' | 'second' | false {
  const { realSecondsUntil, isActive, alarmSettings, globalAlarmEnabled, itemAlarmEnabled } = input
  if (!globalAlarmEnabled || !itemAlarmEnabled) return false

  if (alarmSettings.secondAlert.enabled) {
    const secondRealSec = alarmSettings.secondAlert.etMinutesBefore * REAL_SECONDS_PER_ET_HOUR / 60
    if (isActive && secondRealSec === 0) return 'second'
    if (!isActive && Math.abs(realSecondsUntil - secondRealSec) < 2) return 'second'
  }

  if (alarmSettings.firstAlert.enabled && !isActive) {
    const firstRealSec = alarmSettings.firstAlert.etMinutesBefore * REAL_SECONDS_PER_ET_HOUR / 60
    if (Math.abs(realSecondsUntil - firstRealSec) < 2) return 'first'
  }

  return false
}

const firedAlarms = new Set<string>()

export function buildAlarmKey(nodeId: number, spawnHour: number, alertType: 'first' | 'second'): string {
  return `${nodeId}-${spawnHour}-${alertType}`
}

export function markAlarmFired(key: string): void {
  firedAlarms.add(key)
}

export function hasAlarmFired(key: string): boolean {
  return firedAlarms.has(key)
}

export function clearFiredAlarmsForNode(nodeId: number): void {
  for (const key of firedAlarms) {
    if (key.startsWith(`${nodeId}-`)) firedAlarms.delete(key)
  }
}

let audioContext: AudioContext | null = null
const bufferCache = new Map<string, AudioBuffer>()

export async function playAlarmSound(soundFile: string, volume: number): Promise<void> {
  if (!audioContext) audioContext = new AudioContext()
  if (audioContext.state === 'suspended') await audioContext.resume()

  const isCustom = soundFile.startsWith('data:') || soundFile.startsWith('blob:')
  const url = isCustom ? soundFile : `${import.meta.env.BASE_URL}sounds/${soundFile}.wav`

  let audioBuffer = bufferCache.get(url)
  if (!audioBuffer) {
    const resp = await fetch(url)
    const raw = await resp.arrayBuffer()
    audioBuffer = await audioContext.decodeAudioData(raw)
    bufferCache.set(url, audioBuffer)
  }

  const source = audioContext.createBufferSource()
  const gain = audioContext.createGain()
  source.buffer = audioBuffer
  gain.gain.value = volume / 100
  source.connect(gain)
  gain.connect(audioContext.destination)
  source.start()
}

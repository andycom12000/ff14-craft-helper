export const REAL_SECONDS_PER_ET_HOUR = 175
const ET_FACTOR = 3600 / REAL_SECONDS_PER_ET_HOUR

export function getEorzeaTime(): { hour: number; minute: number } {
  const etTotalMs = Date.now() * ET_FACTOR
  const etTotalMinutes = Math.floor(etTotalMs / 60000)
  const hour = Math.floor(etTotalMinutes / 60) % 24
  const minute = etTotalMinutes % 60
  return { hour, minute }
}

export function getNextSpawn(
  node: { spawnTimes: number[]; duration: number },
  currentET: { hour: number; minute: number },
): { realSecondsUntil: number; isActive: boolean; relevantSpawnHour: number } {
  const nowMinutes = currentET.hour * 60 + currentET.minute

  for (const spawnHour of node.spawnTimes) {
    const startMin = spawnHour * 60
    const endMin = startMin + node.duration
    if (endMin <= 1440) {
      if (nowMinutes >= startMin && nowMinutes < endMin) {
        return { realSecondsUntil: 0, isActive: true, relevantSpawnHour: spawnHour }
      }
    } else {
      if (nowMinutes >= startMin || nowMinutes < endMin - 1440) {
        return { realSecondsUntil: 0, isActive: true, relevantSpawnHour: spawnHour }
      }
    }
  }

  let minEtMinutesUntil = Infinity
  let nextSpawnHour = node.spawnTimes[0]
  for (const spawnHour of node.spawnTimes) {
    const spawnMin = spawnHour * 60
    let diff = spawnMin - nowMinutes
    if (diff <= 0) diff += 1440
    if (diff < minEtMinutesUntil) {
      minEtMinutesUntil = diff
      nextSpawnHour = spawnHour
    }
  }

  const realSeconds = Math.round((minEtMinutesUntil * REAL_SECONDS_PER_ET_HOUR) / 60)
  return { realSecondsUntil: realSeconds, isActive: false, relevantSpawnHour: nextSpawnHour }
}

export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

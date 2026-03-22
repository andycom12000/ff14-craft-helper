const ET_FACTOR = 3600 / 175

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
): { realSecondsUntil: number; isActive: boolean } {
  const nowMinutes = currentET.hour * 60 + currentET.minute
  // duration is in real seconds; convert to ET minutes
  const durationEtMinutes = Math.floor((node.duration * 60) / 175)

  for (const spawnHour of node.spawnTimes) {
    const startMin = spawnHour * 60
    const endMin = startMin + durationEtMinutes
    if (endMin <= 1440) {
      if (nowMinutes >= startMin && nowMinutes < endMin) {
        return { realSecondsUntil: 0, isActive: true }
      }
    } else {
      if (nowMinutes >= startMin || nowMinutes < endMin - 1440) {
        return { realSecondsUntil: 0, isActive: true }
      }
    }
  }

  let minEtMinutesUntil = Infinity
  for (const spawnHour of node.spawnTimes) {
    const spawnMin = spawnHour * 60
    let diff = spawnMin - nowMinutes
    if (diff <= 0) diff += 1440
    if (diff < minEtMinutesUntil) minEtMinutesUntil = diff
  }

  const realSeconds = Math.round((minEtMinutesUntil * 175) / 60)
  return { realSecondsUntil: realSeconds, isActive: false }
}

export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

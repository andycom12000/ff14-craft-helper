export function starsDisplay(stars: number): string {
  return stars > 0 ? '\u2605'.repeat(stars) : ''
}

/**
 * Format a Gil amount for display. `null`/`undefined` represent "price unknown"
 * (no market listings, no fallback), distinct from a real price of 0 Gil.
 */
export function formatGil(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString()
}

export function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp * 1000
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小時前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

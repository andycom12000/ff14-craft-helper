/**
 * Build a `/tp` chat command targeting a zone's main aetheryte.
 * FF14 accepts the zone name as-is; we trim whitespace and return the command string.
 * Example: buildTpCommand('烏爾達哈の冒險者區') → '/tp 烏爾達哈の冒險者區'
 */
export function buildTpCommand(zoneName: string): string {
  return `/tp ${zoneName.trim()}`
}

/**
 * Build a FF14 map-flag chat link. In-game, pasting this surfaces the
 * coordinate as a clickable flag that drops a map marker.
 *
 * FF14's chat link payload format (simplified, mirrors what the game pastes
 * when you Ctrl+drag a flag from the map UI):
 *   <flag><zone name>(x,y)</flag>
 *
 * Coordinates are rounded to one decimal — FF14's in-game coords use 1-decimal precision.
 */
export function buildMapFlagLink(zoneName: string, x: number, y: number): string {
  const xs = x.toFixed(1)
  const ys = y.toFixed(1)
  return `<flag>${zoneName.trim()}(${xs},${ys})</flag>`
}

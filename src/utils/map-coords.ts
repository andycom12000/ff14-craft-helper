/**
 * FFXIV map texture is 2048×2048 covering 41 in-game units (rawCoord 1..42).
 * `sizeFactor` from the Map sheet scales the visible region — sizeFactor=100
 * means the texture covers 41 units, sizeFactor=200 means it covers ~21 units
 * (zoomed in 2×). The reference implementation lives in NodeMinimap.vue.
 *
 * Formula:
 *   pixel = (rawCoord - 1) / 41 * 2048 * sizeFactor / 100
 *
 * The previous version `(rawX - offsetX) * sizeFactor / 100 + 1024` placed
 * every marker near the center because in-game coords (1..42) plus 1024
 * always landed in the 1024..1044 pixel band. That looked like all pins
 * stacked at the same spot.
 */
export function convertToPixel(opts: {
  rawX: number; rawY: number;
  offsetX?: number; offsetY?: number;
  sizeFactor: number;
}): { px: number; py: number } {
  const { rawX, rawY, sizeFactor } = opts
  const offsetX = opts.offsetX ?? 0
  const offsetY = opts.offsetY ?? 0
  return {
    px: ((rawX - offsetX) - 1) / 41 * 2048 * sizeFactor / 100,
    py: ((rawY - offsetY) - 1) / 41 * 2048 * sizeFactor / 100,
  }
}

export function cropRegion(
  px: number, py: number,
  mapSize: number, cropSize: number,
): { sx: number; sy: number; sw: number; sh: number } {
  let sx = Math.round(px - cropSize / 2)
  let sy = Math.round(py - cropSize / 2)
  sx = Math.max(0, Math.min(sx, mapSize - cropSize))
  sy = Math.max(0, Math.min(sy, mapSize - cropSize))
  return { sx, sy, sw: cropSize, sh: cropSize }
}

/**
 * Builds the canonical XIVAPI map asset URL path from a Map.Id string.
 * Matches the format used by garland.ts:
 *   `ui/map/${folder}/${sub}/${folder}${sub}_m.tex`
 * (no underscore between folder and sub in the filename segment)
 */
export function buildMapAssetUrl(mapStringId: string): string {
  if (!mapStringId.includes('/')) return ''
  const [folder, sub] = mapStringId.split('/')
  if (!folder || !sub) return ''
  return `ui/map/${folder}/${sub}/${folder}${sub}_m.tex`
}

/**
 * Converts absolute pixel coordinates on a square map image to CSS percentage strings.
 * @param px  X coordinate in pixels
 * @param py  Y coordinate in pixels
 * @param mapPx  Total map image width/height in pixels (default 2048)
 */
export function pixelToPercent(px: number, py: number, mapPx = 2048): { left: string; top: string } {
  return {
    left: `${(px / mapPx) * 100}%`,
    top: `${(py / mapPx) * 100}%`,
  }
}

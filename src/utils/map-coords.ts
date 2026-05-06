export function convertToPixel(opts: {
  rawX: number; rawY: number;
  offsetX: number; offsetY: number;
  sizeFactor: number;
}): { px: number; py: number } {
  return {
    px: (opts.rawX - opts.offsetX) * opts.sizeFactor / 100 + 1024,
    py: (opts.rawY - opts.offsetY) * opts.sizeFactor / 100 + 1024,
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

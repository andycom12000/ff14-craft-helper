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

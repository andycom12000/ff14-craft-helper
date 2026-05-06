import { describe, it, expect } from 'vitest'
import { convertToPixel, cropRegion, buildMapAssetUrl, pixelToPercent } from '@/utils/map-coords'

describe('convertToPixel', () => {
  it('converts raw coords to pixel position', () => {
    const result = convertToPixel({ rawX: 100, rawY: 200, offsetX: 0, offsetY: 0, sizeFactor: 100 })
    expect(result.px).toBe(1124)
    expect(result.py).toBe(1224)
  })

  it('applies offset and sizeFactor', () => {
    const result = convertToPixel({ rawX: 300, rawY: 400, offsetX: 100, offsetY: 100, sizeFactor: 200 })
    expect(result.px).toBe(1424)
    expect(result.py).toBe(1624)
  })
})

describe('cropRegion', () => {
  it('returns centered crop region', () => {
    const result = cropRegion(500, 600, 2048, 200)
    expect(result.sx).toBe(400)
    expect(result.sy).toBe(500)
    expect(result.sw).toBe(200)
    expect(result.sh).toBe(200)
  })

  it('clamps to map bounds', () => {
    const result = cropRegion(50, 50, 2048, 200)
    expect(result.sx).toBe(0)
    expect(result.sy).toBe(0)
  })
})

describe('buildMapAssetUrl', () => {
  it('builds the canonical xivapi map asset path matching existing garland.ts format', () => {
    // IMPORTANT: format must match what src/api/garland.ts:126 currently produces.
    // garland.ts uses `ui/map/${folder}/${sub}/${folder}${sub}_m.tex` — NO underscore between folder and sub.
    // Do NOT change format — refactor must be a behavior-preserving extraction.
    expect(buildMapAssetUrl('r1f1/00')).toBe('ui/map/r1f1/00/r1f100_m.tex')
    expect(buildMapAssetUrl('w1d3/01')).toBe('ui/map/w1d3/01/w1d301_m.tex')
  })

  it('returns empty string for malformed id', () => {
    expect(buildMapAssetUrl('')).toBe('')
    expect(buildMapAssetUrl('no-slash')).toBe('')
  })
})

describe('pixelToPercent', () => {
  it('converts pixel coords to css percentage with default 2048 map', () => {
    expect(pixelToPercent(1024, 1024)).toEqual({ left: '50%', top: '50%' })
    expect(pixelToPercent(512, 0)).toEqual({ left: '25%', top: '0%' })
  })

  it('honors custom map pixel size', () => {
    expect(pixelToPercent(512, 512, 1024)).toEqual({ left: '50%', top: '50%' })
  })
})

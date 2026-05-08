import { describe, it, expect } from 'vitest'
import { convertToPixel, cropRegion, buildMapAssetUrl, pixelToPercent } from '@/utils/map-coords'

describe('convertToPixel', () => {
  // The FFXIV formula is (coord - 1) / 41 * 2048 * sizeFactor/100.
  // Reference: src/components/timer/NodeMinimap.vue (gameCoordToPixel).
  // Realistic in-game coords are 1..42, not arbitrary numbers.
  it('places coord 1 at the texture origin (px=0)', () => {
    const r = convertToPixel({ rawX: 1, rawY: 1, sizeFactor: 100 })
    expect(r.px).toBe(0)
    expect(r.py).toBe(0)
  })

  it('places coord 21 at ~50% of the texture for sizeFactor=100', () => {
    const r = convertToPixel({ rawX: 21, rawY: 21, sizeFactor: 100 })
    // (21-1)/41 * 2048 = 999.02
    expect(r.px).toBeCloseTo(999.02, 1)
    expect(r.py).toBeCloseTo(999.02, 1)
  })

  it('zooms 2× for sizeFactor=200 (housing-style maps)', () => {
    const r = convertToPixel({ rawX: 11, rawY: 11, sizeFactor: 200 })
    // (11-1)/41 * 2048 * 2 = 999.02
    expect(r.px).toBeCloseTo(999.02, 1)
    expect(r.py).toBeCloseTo(999.02, 1)
  })

  it('honors offset', () => {
    const r = convertToPixel({ rawX: 11, rawY: 11, offsetX: 1, offsetY: 1, sizeFactor: 100 })
    // ((11-1)-1)/41 * 2048 = 449.56
    expect(r.px).toBeCloseTo(449.56, 1)
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

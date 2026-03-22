import { describe, it, expect } from 'vitest'
import { convertToPixel, cropRegion } from '@/utils/map-coords'

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

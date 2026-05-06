import { describe, it, expect } from 'vitest'
import data from '../../../public/data/aetherytes.json'

describe('aetherytes.json', () => {
  it('has schema=1', () => {
    expect(data.schema).toBe(1)
  })

  it('has at least 3 zones in initial commit', () => {
    expect(Object.keys(data.zones).length).toBeGreaterThanOrEqual(3)
  })

  it('every aetheryte has name, x, y, tpCostBase', () => {
    for (const [zid, zone] of Object.entries(data.zones)) {
      expect(zone.zoneName, `zone ${zid} missing name`).toBeTruthy()
      for (const a of zone.aetherytes) {
        expect(a.name, `zone ${zid} aetheryte missing name`).toBeTruthy()
        expect(typeof a.x, `zone ${zid} aetheryte ${a.name} x not a number`).toBe('number')
        expect(typeof a.y, `zone ${zid} aetheryte ${a.name} y not a number`).toBe('number')
        expect(typeof a.tpCostBase, `zone ${zid} aetheryte ${a.name} tpCostBase not a number`).toBe('number')
        expect(a.tpCostBase, `zone ${zid} aetheryte ${a.name} tpCostBase not > 0`).toBeGreaterThan(0)
      }
    }
  })
})

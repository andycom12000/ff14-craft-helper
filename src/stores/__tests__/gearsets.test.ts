import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGearsetsStore } from '@/stores/gearsets'
import { JOB_NAMES } from '@/utils/jobs'

describe('useGearsetsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  describe('updateAllGearsets', () => {
    it('applies a single defined key to every job', () => {
      const store = useGearsetsStore()

      store.updateAllGearsets({ cp: 567 })

      for (const job of Object.keys(JOB_NAMES)) {
        expect(store.gearsets[job].cp).toBe(567)
      }
    })

    it('applies multiple keys at once without touching omitted keys', () => {
      const store = useGearsetsStore()

      // Seed one job with known starting values so we can assert non-patched keys survive.
      store.updateGearset('CRP', { level: 90, craftsmanship: 1111, control: 2222, cp: 333 })

      store.updateAllGearsets({ craftsmanship: 4000, control: 3800 })

      for (const job of Object.keys(JOB_NAMES)) {
        expect(store.gearsets[job].craftsmanship).toBe(4000)
        expect(store.gearsets[job].control).toBe(3800)
      }
      // CRP's level and cp should be unchanged by the bulk update
      expect(store.gearsets.CRP.level).toBe(90)
      expect(store.gearsets.CRP.cp).toBe(333)
    })

    it('ignores undefined keys in the patch', () => {
      const store = useGearsetsStore()
      store.updateGearset('BSM', { level: 80, craftsmanship: 1234, control: 1500, cp: 450 })

      store.updateAllGearsets({ level: undefined, cp: 600 })

      expect(store.gearsets.BSM.level).toBe(80) // untouched because undefined
      expect(store.gearsets.BSM.cp).toBe(600)
    })

    it('is a no-op when every key is undefined', () => {
      const store = useGearsetsStore()
      const snapshot = JSON.parse(JSON.stringify(store.gearsets))

      store.updateAllGearsets({ level: undefined, craftsmanship: undefined, control: undefined, cp: undefined })

      expect(store.gearsets).toEqual(snapshot)
    })

    it('affects all 8 DoH jobs', () => {
      const store = useGearsetsStore()

      store.updateAllGearsets({ level: 100, craftsmanship: 5000, control: 5000, cp: 700 })

      const expected = { level: 100, craftsmanship: 5000, control: 5000, cp: 700 }
      for (const job of Object.keys(JOB_NAMES)) {
        expect(store.gearsets[job]).toEqual(expected)
      }
      expect(Object.keys(store.gearsets).length).toBeGreaterThanOrEqual(8)
    })
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { CompanyCraftSequence } from '@/services/local-data-source.types'
import {
  useWorkshopProjectsStore,
  serializePhaseKey,
  parsePhaseKey,
  getProjectProgress,
  getRemainingMaterials,
  getTotalMaterials,
  isPhaseComplete,
} from '@/stores/workshop-projects'
import { SEQ_TATANORA_BOW, SEQ_TATANORA_STERN } from '@/__tests__/fixtures/company-craft'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('workshop-projects CRUD', () => {
  it('creates a project with given sequences', () => {
    const store = useWorkshopProjectsStore()
    const id = store.createProject({
      name: 'Tatanora 號',
      category: 'submersible',
      sequences: [{ sequenceId: 1 }, { sequenceId: 2 }],
    })
    expect(id).toBeTruthy()
    const proj = store.getProject(id)
    expect(proj?.name).toBe('Tatanora 號')
    expect(proj?.sequences).toHaveLength(2)
    expect(proj?.phaseProgress).toEqual({})
    expect(proj?.completedAt).toBeUndefined()
  })

  it('deletes a project by id', () => {
    const store = useWorkshopProjectsStore()
    const id = store.createProject({
      name: 'X', category: 'workshop',
      sequences: [{ sequenceId: 99 }],
    })
    store.deleteProject(id)
    expect(store.getProject(id)).toBeNull()
  })

  it('updates phaseProgress immutably and exposes via getDelivered', () => {
    const store = useWorkshopProjectsStore()
    const id = store.createProject({
      name: 'X', category: 'workshop',
      sequences: [{ sequenceId: 1 }],
    })
    const key = serializePhaseKey({ sequenceId: 1, partIndex: 0, processIndex: 0 })
    store.setDelivered(id, key, 0, 5)
    expect(store.getDelivered(id, key, 0)).toBe(5)
    store.setDelivered(id, key, 0, 12)
    expect(store.getDelivered(id, key, 0)).toBe(12)
  })

  it('clamps setDelivered to non-negative', () => {
    const store = useWorkshopProjectsStore()
    const id = store.createProject({
      name: 'X', category: 'workshop',
      sequences: [{ sequenceId: 1 }],
    })
    const key = serializePhaseKey({ sequenceId: 1, partIndex: 0, processIndex: 0 })
    store.setDelivered(id, key, 0, -5)
    expect(store.getDelivered(id, key, 0)).toBe(0)
  })

  it('increments progressVersion only when value actually changes', () => {
    const store = useWorkshopProjectsStore()
    const id = store.createProject({
      name: 'X', category: 'workshop',
      sequences: [{ sequenceId: 1 }],
    })
    const key = serializePhaseKey({ sequenceId: 1, partIndex: 0, processIndex: 0 })
    const before = store.progressVersion
    store.setDelivered(id, key, 0, 3)
    expect(store.progressVersion).toBe(before + 1)
    store.setDelivered(id, key, 0, 3)  // same value
    expect(store.progressVersion).toBe(before + 1)  // no increment
    store.setDelivered(id, key, 0, 4)
    expect(store.progressVersion).toBe(before + 2)
  })

  it('serializePhaseKey ↔ parsePhaseKey round-trip', () => {
    const key = serializePhaseKey({ sequenceId: 3, partIndex: 1, processIndex: 2 })
    expect(key).toBe('3:1:2')
    expect(parsePhaseKey(key)).toEqual({ sequenceId: 3, partIndex: 1, processIndex: 2 })
  })
})

function makeProject(store: ReturnType<typeof useWorkshopProjectsStore>) {
  return store.createProject({
    name: 'X', category: 'submersible',
    sequences: [{ sequenceId: 1 }, { sequenceId: 2 }],
  })
}

describe('workshop-projects selectors', () => {
  const SEQS: CompanyCraftSequence[] = [SEQ_TATANORA_BOW, SEQ_TATANORA_STERN]

  it('getTotalMaterials sums supplyItem amounts across sequences', () => {
    const store = useWorkshopProjectsStore()
    const id = makeProject(store)
    const total = getTotalMaterials(store.getProject(id)!, SEQS)
    expect(total.get(5057)).toBe(19)  // SEQ_A: 12+4=16, SEQ_B: 3, total 19
    expect(total.get(5058)).toBe(6)
  })

  it('getRemainingMaterials subtracts delivered counts', () => {
    const store = useWorkshopProjectsStore()
    const id = makeProject(store)
    const proj = store.getProject(id)!
    const keyA1 = serializePhaseKey({ sequenceId: 1, partIndex: 0, processIndex: 0 })
    store.setDelivered(id, keyA1, 0, 12)  // 5057 fully delivered in phase A1
    store.setDelivered(id, keyA1, 1, 4)   // 5058 partial (4 of 6)
    const remaining = getRemainingMaterials(proj, SEQS)
    // 5057 total 19, delivered 12, remaining 7
    expect(remaining.get(5057)).toBe(7)
    // 5058 total 6, delivered 4, remaining 2
    expect(remaining.get(5058)).toBe(2)
  })

  it('isPhaseComplete returns true when every supplyItem hits amount', () => {
    const store = useWorkshopProjectsStore()
    const id = makeProject(store)
    const key = serializePhaseKey({ sequenceId: 1, partIndex: 0, processIndex: 0 })
    expect(isPhaseComplete(store.getProject(id)!, SEQ_TATANORA_BOW.phases[0], key)).toBe(false)
    store.setDelivered(id, key, 0, 12)
    store.setDelivered(id, key, 1, 6)
    expect(isPhaseComplete(store.getProject(id)!, SEQ_TATANORA_BOW.phases[0], key)).toBe(true)
  })

  it('getProjectProgress is fraction of completed phases over total phases', () => {
    const store = useWorkshopProjectsStore()
    const id = makeProject(store)
    // Total phases: SEQ_A 2 + SEQ_B 1 = 3
    expect(getProjectProgress(store.getProject(id)!, SEQS)).toBe(0)
    const keyA1 = serializePhaseKey({ sequenceId: 1, partIndex: 0, processIndex: 0 })
    store.setDelivered(id, keyA1, 0, 12)
    store.setDelivered(id, keyA1, 1, 6)
    // 1 of 3 phases complete
    expect(getProjectProgress(store.getProject(id)!, SEQS)).toBeCloseTo(1 / 3)
  })

  it('selectors accept pre-built seqById map', () => {
    const store = useWorkshopProjectsStore()
    const id = makeProject(store)
    const seqById = new Map(SEQS.map(s => [s.id, s]))
    const total = getTotalMaterials(store.getProject(id)!, [], seqById)
    expect(total.get(5057)).toBe(19)
  })
})

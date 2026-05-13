import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  useWorkshopProjectsStore,
  serializePhaseKey,
  parsePhaseKey,
} from '@/stores/workshop-projects'

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

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBomStore } from '@/stores/bom'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('targetSig', () => {
  it('canonical CSV stable regardless of insert order', () => {
    const a = useBomStore()
    a.addTarget({ kind: 'recipe', itemId: 100, recipeId: 1, name: 'A', icon: '', quantity: 2 })
    a.addTarget({ kind: 'recipe', itemId: 50, recipeId: 2, name: 'B', icon: '', quantity: 1 })
    const sigA = a.targetSig

    setActivePinia(createPinia())
    const b = useBomStore()
    b.addTarget({ kind: 'recipe', itemId: 50, recipeId: 2, name: 'B', icon: '', quantity: 1 })
    b.addTarget({ kind: 'recipe', itemId: 100, recipeId: 1, name: 'A', icon: '', quantity: 2 })
    expect(b.targetSig).toBe(sigA)
  })

  it('empty target list returns empty string', () => {
    const s = useBomStore()
    expect(s.targetSig).toBe('')
  })

  it('itemId order normalized regardless of insert order with quantities', () => {
    const s = useBomStore()
    s.addTarget({ kind: 'recipe', itemId: 200, recipeId: 1, name: '', icon: '', quantity: 3 })
    s.addTarget({ kind: 'recipe', itemId: 100, recipeId: 2, name: '', icon: '', quantity: 5 })
    expect(s.targetSig).toBe('100:5,200:3')
  })
})

describe('routeViewSession debounce + persistence', () => {
  it('debounce: rapid mutations within 500ms produce 1 localStorage write', () => {
    const s = useBomStore()
    s.addTarget({ kind: 'recipe', itemId: 100, recipeId: 1, name: '', icon: '', quantity: 1 })
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    setItemSpy.mockClear()
    for (let i = 0; i < 5; i++) {
      s.toggleChecked(i + 200)
    }
    vi.advanceTimersByTime(600)
    const routeWrites = setItemSpy.mock.calls.filter(([k]) => String(k).startsWith('bom-route::'))
    expect(routeWrites).toHaveLength(1)
  })

  it('reload restores checked set for same target list', () => {
    const a = useBomStore()
    a.addTarget({ kind: 'recipe', itemId: 100, recipeId: 1, name: '', icon: '', quantity: 1 })
    a.toggleChecked(50)
    vi.advanceTimersByTime(600)

    setActivePinia(createPinia())
    const b = useBomStore()
    b.addTarget({ kind: 'recipe', itemId: 100, recipeId: 1, name: '', icon: '', quantity: 1 })
    expect(b.routeViewSession.checked.has(50)).toBe(true)
  })

  it('changing target list resets checked', () => {
    const s = useBomStore()
    s.addTarget({ kind: 'recipe', itemId: 100, recipeId: 1, name: '', icon: '', quantity: 1 })
    s.toggleChecked(50)
    expect(s.routeViewSession.checked.has(50)).toBe(true)
    s.addTarget({ kind: 'recipe', itemId: 200, recipeId: 2, name: '', icon: '', quantity: 1 })
    expect(s.routeViewSession.checked.has(50)).toBe(false)
  })
})

describe('LRU 8 cap on bom-route::* keys', () => {
  it('keeps at most 8 sigs in localStorage', () => {
    for (let i = 1; i <= 9; i++) {
      setActivePinia(createPinia())
      const s = useBomStore()
      s.addTarget({ kind: 'recipe', itemId: 100 + i, recipeId: 1, name: '', icon: '', quantity: 1 })
      s.toggleChecked(999)
      vi.advanceTimersByTime(600)
    }
    let count = 0
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)!.startsWith('bom-route::')) count++
    }
    expect(count).toBeLessThanOrEqual(8)
  })
})

describe('routeViewPrefs', () => {
  it('persists optimizeBy across sessions', () => {
    const a = useBomStore()
    a.setOptimizeBy('hop')
    setActivePinia(createPinia())
    const b = useBomStore()
    expect(b.routeViewPrefs.optimizeBy).toBe('hop')
  })
})

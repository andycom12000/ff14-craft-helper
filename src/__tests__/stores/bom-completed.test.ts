import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBomStore, pruneStaleCompletedEntries } from '@/stores/bom'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function addRecipeTarget(s: ReturnType<typeof useBomStore>, itemId: number, quantity = 1) {
  s.addTarget({ kind: 'recipe', itemId, recipeId: itemId, name: '', icon: '', quantity })
}

describe('bomCompletedKey', () => {
  it('combines targetSig + acquisitionModeSig', () => {
    const s = useBomStore()
    expect(s.bomCompletedKey).toBe('|')
    addRecipeTarget(s, 100, 2)
    expect(s.bomCompletedKey).toBe('100:2|')
  })

  it('changes when target quantity changes', () => {
    const s = useBomStore()
    addRecipeTarget(s, 100, 1)
    const key1 = s.bomCompletedKey
    s.updateTargetQuantity(100, 3)
    expect(s.bomCompletedKey).not.toBe(key1)
  })

  it('changes when an acquisitionMode override is set', () => {
    const s = useBomStore()
    addRecipeTarget(s, 100, 1)
    const before = s.bomCompletedKey
    s.acquisitionMode.set(500, 'npc')
    // Force watcher; mutating Map in place doesn't trigger reactivity
    s.acquisitionMode = new Map(s.acquisitionMode)
    expect(s.bomCompletedKey).not.toBe(before)
  })
})

describe('toggleBomCompleted', () => {
  it('toggles itemId in/out of the bomCompleted set', () => {
    const s = useBomStore()
    addRecipeTarget(s, 100)
    expect(s.isBomCompleted(500)).toBe(false)
    s.toggleBomCompleted(500)
    expect(s.isBomCompleted(500)).toBe(true)
    s.toggleBomCompleted(500)
    expect(s.isBomCompleted(500)).toBe(false)
  })

  it('persists to localStorage with bom-completed:: prefix after debounce', () => {
    const s = useBomStore()
    addRecipeTarget(s, 100)
    s.toggleBomCompleted(500)
    const setSpy = vi.spyOn(Storage.prototype, 'setItem')
    setSpy.mockClear()
    vi.advanceTimersByTime(600)
    const writes = setSpy.mock.calls.filter(([k]) => String(k).startsWith('bom-completed::'))
    expect(writes.length).toBeGreaterThan(0)
  })

  it('debounces rapid toggles into a single write', () => {
    const s = useBomStore()
    addRecipeTarget(s, 100)
    const setSpy = vi.spyOn(Storage.prototype, 'setItem')
    setSpy.mockClear()
    for (let i = 200; i < 210; i++) s.toggleBomCompleted(i)
    vi.advanceTimersByTime(600)
    const writes = setSpy.mock.calls.filter(([k]) => String(k).startsWith('bom-completed::'))
    expect(writes).toHaveLength(1)
  })
})

describe('recalc behavior', () => {
  it('changing target qty makes previously-checked items appear uncompleted', () => {
    const s = useBomStore()
    addRecipeTarget(s, 100, 1)
    s.toggleBomCompleted(500)
    expect(s.isBomCompleted(500)).toBe(true)
    s.updateTargetQuantity(100, 5)
    expect(s.isBomCompleted(500)).toBe(false)
  })

  it('restoring the original target list re-loads the original completed set', () => {
    const s = useBomStore()
    addRecipeTarget(s, 100, 1)
    s.toggleBomCompleted(500)
    vi.advanceTimersByTime(600)

    s.updateTargetQuantity(100, 5)
    expect(s.isBomCompleted(500)).toBe(false)

    s.updateTargetQuantity(100, 1)
    expect(s.isBomCompleted(500)).toBe(true)
  })

  it('reloads completed set in a fresh store with same target list', () => {
    const a = useBomStore()
    addRecipeTarget(a, 100, 2)
    a.toggleBomCompleted(500)
    vi.advanceTimersByTime(600)

    setActivePinia(createPinia())
    const b = useBomStore()
    addRecipeTarget(b, 100, 2)
    expect(b.isBomCompleted(500)).toBe(true)
  })
})

describe('pruneStaleCompletedEntries', () => {
  it('removes entries older than maxAgeMs', () => {
    const now = 100_000_000
    localStorage.setItem(
      'bom-completed::fresh',
      JSON.stringify({ items: [1], _mtime: now - 1000 }),
    )
    localStorage.setItem(
      'bom-completed::stale',
      JSON.stringify({ items: [2], _mtime: now - 60_000 }),
    )
    pruneStaleCompletedEntries(30_000, now)
    expect(localStorage.getItem('bom-completed::fresh')).not.toBeNull()
    expect(localStorage.getItem('bom-completed::stale')).toBeNull()
  })

  it('removes corrupted entries (unparseable JSON)', () => {
    localStorage.setItem('bom-completed::broken', '{not json')
    pruneStaleCompletedEntries(30_000, Date.now())
    expect(localStorage.getItem('bom-completed::broken')).toBeNull()
  })

  it('does not touch entries outside the bom-completed:: namespace', () => {
    localStorage.setItem('bom-route::keep-me', JSON.stringify({ _mtime: 0 }))
    pruneStaleCompletedEntries(1, Date.now())
    expect(localStorage.getItem('bom-route::keep-me')).not.toBeNull()
  })
})

describe('persist edge cases', () => {
  it('removes the LS key when the completed Set goes empty', () => {
    const s = useBomStore()
    addRecipeTarget(s, 100)
    s.toggleBomCompleted(500)
    vi.advanceTimersByTime(600)
    const key = `bom-completed::${s.bomCompletedKey}`
    expect(localStorage.getItem(key)).not.toBeNull()

    s.toggleBomCompleted(500) // back to empty
    vi.advanceTimersByTime(600)
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('LRU eviction tolerates corrupted entries (unparseable JSON)', () => {
    // Seed 16 valid + 1 corrupted to force eviction past the cap.
    for (let i = 1; i <= 16; i++) {
      localStorage.setItem(`bom-completed::v${i}`, JSON.stringify({ items: [i], _mtime: i }))
    }
    localStorage.setItem('bom-completed::corrupt', '{nope')
    const s = useBomStore()
    addRecipeTarget(s, 999)
    s.toggleBomCompleted(1)
    vi.advanceTimersByTime(600)
    // Corrupted entry removed by the eviction sweep, no throw.
    expect(localStorage.getItem('bom-completed::corrupt')).toBeNull()
  })
})

describe('LRU 16 cap on bom-completed::* keys', () => {
  it('keeps at most 16 sigs in localStorage', () => {
    // Seed 16 keys first so the next write triggers eviction.
    for (let i = 1; i <= 16; i++) {
      localStorage.setItem(
        `bom-completed::seeded-${i}`,
        JSON.stringify({ items: [i], _mtime: i }),
      )
    }
    const s = useBomStore()
    addRecipeTarget(s, 999)
    s.toggleBomCompleted(1)
    vi.advanceTimersByTime(600)

    let count = 0
    for (let i = 0; i < localStorage.length; i++) {
      if (localStorage.key(i)!.startsWith('bom-completed::')) count++
    }
    expect(count).toBeLessThanOrEqual(16)
  })
})

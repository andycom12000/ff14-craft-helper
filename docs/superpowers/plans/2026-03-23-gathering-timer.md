# Gathering Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gathering timer page that tracks timed FF14 gathering nodes with countdowns, audio alerts, market prices, and minimaps.

**Architecture:** New Pinia store (`timer`) for tracking state, new API module (`garland.ts`) for node data from Garland Tools + XIVAPI, new services for Eorzea time calculation and alarm management. New `TimerView.vue` page with responsive layout (2-col grid on ultra-wide, classic sidebar on desktop, FAB+Drawer on mobile). Interactive minimap on desktop, static fallback on mobile. ET clock in global sidebar (`App.vue`).

**Tech Stack:** Vue 3, Pinia (persisted), Element Plus, Web Audio API, Garland Tools API, XIVAPI v2, Universalis API (existing)

**Spec:** `docs/superpowers/specs/2026-03-23-gathering-timer-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/services/eorzea-clock.ts` | ET time calculation, spawn time logic, countdown formatting |
| `src/__tests__/services/eorzea-clock.test.ts` | Tests for ET clock service |
| `src/api/garland.ts` | Fetch timed nodes from Garland Browse API + XIVAPI name/coord resolution |
| `src/__tests__/api/garland.test.ts` | Tests for Garland API module |
| `src/stores/timer.ts` | Pinia store: tracked items, alarm settings, node cache |
| `src/__tests__/stores/timer.test.ts` | Tests for timer store |
| `src/services/alarm-manager.ts` | Interval-based alarm checker, Web Audio playback |
| `src/__tests__/services/alarm-manager.test.ts` | Tests for alarm manager |
| `src/utils/map-coords.ts` | Map coordinate conversion (raw → pixel, crop region) |
| `src/__tests__/utils/map-coords.test.ts` | Tests for coordinate math |
| `src/components/timer/NodeCard.vue` | Single tracked node card (countdown, price, alarm toggle) |
| `src/components/timer/NodeMinimap.vue` | Interactive/static minimap per node |
| `src/components/timer/AddTrackingPanel.vue` | Search + browse tabs for adding nodes |
| `src/components/timer/AlarmSettingsPanel.vue` | Alert timing, sound, volume controls |
| `src/components/timer/GlobalAlarmToggle.vue` | Top-bar alarm on/off toggle |
| `src/components/EorzeaClock.vue` | ET + LT clock for sidebar |
| `src/views/TimerView.vue` | Main timer page with responsive layout |
| `public/sounds/chime.mp3` | Built-in sound preset |
| `public/sounds/alert.mp3` | Built-in sound preset |
| `public/sounds/soft.mp3` | Built-in sound preset |

### Modified Files

| File | Change |
|------|--------|
| `src/router/index.ts` | Add `/timer` route |
| `src/App.vue` | Add timer menu item + EorzeaClock component in sidebar |

---

## Task 1: Eorzea Clock Service

**Files:**
- Create: `src/services/eorzea-clock.ts`
- Test: `src/__tests__/services/eorzea-clock.test.ts`

- [ ] **Step 1: Write failing tests for `getEorzeaTime`**

```typescript
// src/__tests__/services/eorzea-clock.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getEorzeaTime, getNextSpawn, formatCountdown } from '@/services/eorzea-clock'

describe('getEorzeaTime', () => {
  it('returns hour and minute from real timestamp', () => {
    // 1 ET hour = 175 real seconds
    // At real epoch 0, ET = 0:00
    vi.spyOn(Date, 'now').mockReturnValue(0)
    const et = getEorzeaTime()
    expect(et.hour).toBe(0)
    expect(et.minute).toBe(0)
  })

  it('returns correct ET for a known real timestamp', () => {
    // 175 real seconds = 1 ET hour
    vi.spyOn(Date, 'now').mockReturnValue(175 * 1000)
    const et = getEorzeaTime()
    expect(et.hour).toBe(1)
    expect(et.minute).toBe(0)
  })

  it('wraps at 24 ET hours', () => {
    // 24 ET hours = 24 * 175 = 4200 real seconds
    vi.spyOn(Date, 'now').mockReturnValue(4200 * 1000)
    const et = getEorzeaTime()
    expect(et.hour).toBe(0)
    expect(et.minute).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/services/eorzea-clock.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `getEorzeaTime`**

```typescript
// src/services/eorzea-clock.ts
const ET_FACTOR = 3600 / 175  // ~20.571x real time

export function getEorzeaTime(): { hour: number; minute: number } {
  const etTotalMs = Date.now() * ET_FACTOR
  const etTotalMinutes = Math.floor(etTotalMs / 60000)
  const hour = Math.floor(etTotalMinutes / 60) % 24
  const minute = etTotalMinutes % 60
  return { hour, minute }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/services/eorzea-clock.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing tests for `getNextSpawn`**

```typescript
describe('getNextSpawn', () => {
  const node = {
    spawnTimes: [2, 14],  // spawns at ET 2:00 and 14:00
    duration: 120,         // lasts 120 ET minutes (2 ET hours)
  }

  it('returns isActive=true when current ET is within spawn window', () => {
    const result = getNextSpawn(node, { hour: 2, minute: 30 })
    expect(result.isActive).toBe(true)
  })

  it('returns isActive=false when outside spawn window', () => {
    const result = getNextSpawn(node, { hour: 5, minute: 0 })
    expect(result.isActive).toBe(false)
  })

  it('calculates seconds until next spawn', () => {
    // Current: ET 5:00, next spawn: ET 14:00 → 9 ET hours = 9*175 = 1575 real seconds
    const result = getNextSpawn(node, { hour: 5, minute: 0 })
    expect(result.realSecondsUntil).toBe(9 * 175)
  })

  it('wraps around midnight for next spawn', () => {
    // Current: ET 15:00, next spawn: ET 2:00 → 11 ET hours
    const result = getNextSpawn(node, { hour: 15, minute: 0 })
    expect(result.realSecondsUntil).toBe(11 * 175)
  })

  it('returns 0 seconds when active', () => {
    const result = getNextSpawn(node, { hour: 14, minute: 0 })
    expect(result.isActive).toBe(true)
    expect(result.realSecondsUntil).toBe(0)
  })
})
```

- [ ] **Step 6: Implement `getNextSpawn`**

```typescript
export function getNextSpawn(
  node: { spawnTimes: number[]; duration: number },
  currentET: { hour: number; minute: number },
): { realSecondsUntil: number; isActive: boolean } {
  const nowMinutes = currentET.hour * 60 + currentET.minute

  // Check if currently active
  for (const spawnHour of node.spawnTimes) {
    const startMin = spawnHour * 60
    const endMin = startMin + node.duration
    if (endMin <= 1440) {
      if (nowMinutes >= startMin && nowMinutes < endMin) {
        return { realSecondsUntil: 0, isActive: true }
      }
    } else {
      // Wraps past midnight
      if (nowMinutes >= startMin || nowMinutes < endMin - 1440) {
        return { realSecondsUntil: 0, isActive: true }
      }
    }
  }

  // Find next spawn
  let minEtMinutesUntil = Infinity
  for (const spawnHour of node.spawnTimes) {
    const spawnMin = spawnHour * 60
    let diff = spawnMin - nowMinutes
    if (diff <= 0) diff += 1440
    if (diff < minEtMinutesUntil) minEtMinutesUntil = diff
  }

  const realSeconds = Math.round(minEtMinutesUntil * 175 / 60)
  return { realSecondsUntil: realSeconds, isActive: false }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/services/eorzea-clock.test.ts`
Expected: PASS

- [ ] **Step 8: Write failing test for `formatCountdown`**

```typescript
describe('formatCountdown', () => {
  it('formats seconds as MM:SS', () => {
    expect(formatCountdown(754)).toBe('12:34')
  })

  it('handles zero', () => {
    expect(formatCountdown(0)).toBe('00:00')
  })

  it('handles over an hour', () => {
    expect(formatCountdown(3661)).toBe('61:01')
  })
})
```

- [ ] **Step 9: Implement `formatCountdown`**

```typescript
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
```

- [ ] **Step 10: Run all tests and verify pass**

Run: `npx vitest run src/__tests__/services/eorzea-clock.test.ts`
Expected: All PASS

- [ ] **Step 11: Commit**

```bash
git add src/services/eorzea-clock.ts src/__tests__/services/eorzea-clock.test.ts
git commit -m "feat(timer): add eorzea clock service with spawn time calculation"
```

---

## Task 2: Map Coordinate Utility

**Files:**
- Create: `src/utils/map-coords.ts`
- Test: `src/__tests__/utils/map-coords.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/utils/map-coords.test.ts
import { describe, it, expect } from 'vitest'
import { convertToPixel, cropRegion } from '@/utils/map-coords'

describe('convertToPixel', () => {
  it('converts raw coords to pixel position', () => {
    // sizeFactor=100, offset=0 → pixel = raw + 1024
    const result = convertToPixel(100, 200, 0, 0, 100)
    expect(result.px).toBe(1124)
    expect(result.py).toBe(1224)
  })

  it('applies offset and sizeFactor', () => {
    const result = convertToPixel(300, 400, 100, 100, 200)
    // (300 - 100) * 200 / 100 + 1024 = 400 + 1024 = 1424
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/__tests__/utils/map-coords.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// src/utils/map-coords.ts
export function convertToPixel(
  rawX: number, rawY: number,
  offsetX: number, offsetY: number,
  sizeFactor: number,
): { px: number; py: number } {
  return {
    px: (rawX - offsetX) * sizeFactor / 100 + 1024,
    py: (rawY - offsetY) * sizeFactor / 100 + 1024,
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
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/utils/map-coords.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/map-coords.ts src/__tests__/utils/map-coords.test.ts
git commit -m "feat(timer): add map coordinate conversion utility"
```

---

## Task 3: Garland API Module

**Files:**
- Create: `src/api/garland.ts`
- Test: `src/__tests__/api/garland.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/api/garland.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchAllTimedNodes } from '@/api/garland'

describe('fetchAllTimedNodes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches and filters timed nodes from Garland Browse API', async () => {
    const mockBrowseData = [
      { i: 1, n: 'Test Location', l: 90, t: 0, z: 100, s: 3, lt: 'Unspoiled', ti: [2, 14] },
      { i: 2, n: 'Normal Node', l: 50, t: 1, z: 101, s: 1 }, // no lt → not timed
      { i: 3, n: 'Legend Spot', l: 100, t: 2, z: 102, s: 4, lt: 'Legendary', ti: [0, 12] },
    ]

    // Garland browse response — only mock needed since Task 3 only fetches from Garland
    const garlandResp = { ok: true, json: () => Promise.resolve(mockBrowseData) }

    vi.mocked(globalThis.fetch).mockResolvedValue(garlandResp as Response)

    const nodes = await fetchAllTimedNodes()
    expect(nodes).toHaveLength(2)
    expect(nodes[0].nodeType).toBe('Unspoiled')
    expect(nodes[1].nodeType).toBe('Legendary')
  })

  it('returns empty array on fetch error', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('network'))
    const nodes = await fetchAllTimedNodes()
    expect(nodes).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/__tests__/api/garland.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `fetchAllTimedNodes`**

The Garland Browse API returns an array of node objects. We filter to entries that have the `lt` field (limited type). Then we batch-query XIVAPI for item names.

Refer to:
- Existing API patterns in `src/api/xivapi.ts` (fetch + try-catch + typed returns)
- Garland browse data format: `{ i, n, l, t, z, s, lt, ti }` where `lt` is the limited type string and `ti` is the ET hours array
- XIVAPI Item sheet: `https://xivapi-v2.xivcdn.com/api/sheet/Item?rows=X,Y,Z&fields=Name`

```typescript
// src/api/garland.ts
const GARLAND_BROWSE = 'https://garlandtools.org/db/doc/browse/en/2/node.json'
const XIVAPI_SHEET = 'https://xivapi-v2.xivcdn.com/api'

export interface GatheringNode {
  id: number
  itemId: number
  itemName: string
  level: number
  stars: number
  gatheringClass: 'MIN' | 'BTN'
  nodeType: 'Unspoiled' | 'Legendary' | 'Ephemeral' | 'Concealed'
  zone: string
  coords: { x: number; y: number }
  spawnTimes: number[]
  duration: number
  mapId: number
  rawCoords: { x: number; y: number }
}

interface GarlandBrowseEntry {
  i: number       // node ID
  n: string       // location name
  l: number       // level
  t: number       // gathering type (0=Mining, 1=Quarrying, 2=Logging, 3=Harvesting)
  z: number       // zone ID
  s: number       // spawn tier
  lt?: string     // limited type: Unspoiled, Legendary, Ephemeral, Concealed
  ti?: number[]   // time indices (ET hours)
}

function classFromType(t: number): 'MIN' | 'BTN' {
  return t <= 1 ? 'MIN' : 'BTN'
}

function durationFromType(lt: string): number {
  // Ephemeral: 4 ET hours, others: 2 ET hours
  return lt === 'Ephemeral' ? 240 : 120
}

async function fetchItemNames(itemIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  if (itemIds.length === 0) return map
  try {
    const url = `${XIVAPI_SHEET}/sheet/Item?rows=${itemIds.join(',')}&fields=Name`
    const resp = await fetch(url)
    if (!resp.ok) return map
    const data = await resp.json()
    for (const row of data.rows) {
      map.set(row.row_id, row.fields?.Name ?? `Item #${row.row_id}`)
    }
  } catch { /* non-critical */ }
  return map
}

export async function fetchAllTimedNodes(): Promise<GatheringNode[]> {
  try {
    const resp = await fetch(GARLAND_BROWSE)
    if (!resp.ok) throw new Error(`Garland API failed: ${resp.status}`)
    const data: GarlandBrowseEntry[] = await resp.json()

    const timedEntries = data.filter((e) => e.lt && e.ti && e.ti.length > 0)

    // TODO: batch-query XIVAPI for item names once we resolve item IDs
    // For now, Garland browse doesn't include item IDs directly in browse data.
    // Item IDs will need to be resolved from individual node detail or XIVAPI GatheringPoint sheet.
    // Initial implementation uses zone name as placeholder.

    return timedEntries.map((e) => ({
      id: e.i,
      itemId: 0,         // resolved later via XIVAPI
      itemName: e.n,     // location name as placeholder
      level: e.l,
      stars: e.s > 2 ? e.s - 2 : 0,
      gatheringClass: classFromType(e.t),
      nodeType: e.lt as GatheringNode['nodeType'],
      zone: e.n,
      coords: { x: 0, y: 0 },       // resolved later via XIVAPI
      spawnTimes: e.ti!,
      duration: durationFromType(e.lt!),
      mapId: 0,
      rawCoords: { x: 0, y: 0 },
    }))
  } catch (error) {
    console.error('[API] fetchAllTimedNodes error:', error)
    return []
  }
}
```

Note: The browse endpoint provides node-level data but not individual item IDs/names. A follow-up task will add XIVAPI GatheringPoint resolution to fill in itemId, itemName, coords, and mapId. This is intentionally deferred to keep this task focused.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/api/garland.test.ts`
Expected: PASS (adjust mock data to match actual implementation)

- [ ] **Step 5: Commit**

```bash
git add src/api/garland.ts src/__tests__/api/garland.test.ts
git commit -m "feat(timer): add Garland Browse API module for timed nodes"
```

---

## Task 4: Timer Pinia Store

**Files:**
- Create: `src/stores/timer.ts`
- Test: `src/__tests__/stores/timer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/stores/timer.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTimerStore } from '@/stores/timer'

describe('useTimerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('has correct default state', () => {
    const store = useTimerStore()
    expect(store.trackedItems).toEqual([])
    expect(store.globalAlarmEnabled).toBe(true)
    expect(store.alarmSettings.volume).toBe(70)
    expect(store.alarmSettings.soundFile).toBe('chime')
  })

  it('adds a tracked item', () => {
    const store = useTimerStore()
    store.addTrackedItem(123, 456)
    expect(store.trackedItems).toHaveLength(1)
    expect(store.trackedItems[0]).toEqual({ nodeId: 123, itemId: 456, alarmEnabled: true })
  })

  it('does not add duplicate tracked item', () => {
    const store = useTimerStore()
    store.addTrackedItem(123, 456)
    store.addTrackedItem(123, 456)
    expect(store.trackedItems).toHaveLength(1)
  })

  it('removes a tracked item', () => {
    const store = useTimerStore()
    store.addTrackedItem(123, 456)
    store.removeTrackedItem(123)
    expect(store.trackedItems).toHaveLength(0)
  })

  it('toggles individual item alarm', () => {
    const store = useTimerStore()
    store.addTrackedItem(123, 456)
    store.toggleItemAlarm(123)
    expect(store.trackedItems[0].alarmEnabled).toBe(false)
    store.toggleItemAlarm(123)
    expect(store.trackedItems[0].alarmEnabled).toBe(true)
  })

  it('checks if a node is tracked', () => {
    const store = useTimerStore()
    store.addTrackedItem(123, 456)
    expect(store.isTracked(123)).toBe(true)
    expect(store.isTracked(999)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/__tests__/stores/timer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement timer store**

Follow the pattern from `src/stores/settings.ts`: Pinia `defineStore` with `ref()` + `persist`.

```typescript
// src/stores/timer.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { GatheringNode } from '@/api/garland'

export interface TrackedItem {
  nodeId: number
  itemId: number
  alarmEnabled: boolean
}

export interface AlarmSettings {
  firstAlert: { enabled: boolean; etMinutesBefore: number }
  secondAlert: { enabled: boolean; etMinutesBefore: number }
  soundFile: string
  volume: number
}

export const useTimerStore = defineStore('timer', () => {
  const trackedItems = ref<TrackedItem[]>([])
  const globalAlarmEnabled = ref(true)
  const alarmSettings = ref<AlarmSettings>({
    firstAlert: { enabled: true, etMinutesBefore: 120 },
    secondAlert: { enabled: true, etMinutesBefore: 0 },
    soundFile: 'chime',
    volume: 70,
  })
  const nodeCache = ref<GatheringNode[]>([])
  const nodeCacheTimestamp = ref(0)

  function addTrackedItem(nodeId: number, itemId: number) {
    if (trackedItems.value.some((t) => t.nodeId === nodeId)) return
    trackedItems.value.push({ nodeId, itemId, alarmEnabled: true })
  }

  function removeTrackedItem(nodeId: number) {
    trackedItems.value = trackedItems.value.filter((t) => t.nodeId !== nodeId)
  }

  function toggleItemAlarm(nodeId: number) {
    const item = trackedItems.value.find((t) => t.nodeId === nodeId)
    if (item) item.alarmEnabled = !item.alarmEnabled
  }

  function isTracked(nodeId: number): boolean {
    return trackedItems.value.some((t) => t.nodeId === nodeId)
  }

  return {
    trackedItems, globalAlarmEnabled, alarmSettings,
    nodeCache, nodeCacheTimestamp,
    addTrackedItem, removeTrackedItem, toggleItemAlarm, isTracked,
  }
}, {
  persist: {
    pick: ['trackedItems', 'globalAlarmEnabled', 'alarmSettings'],
  },
})
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/stores/timer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/timer.ts src/__tests__/stores/timer.test.ts
git commit -m "feat(timer): add Pinia timer store with tracking and alarm settings"
```

---

## Task 5: Alarm Manager Service

**Files:**
- Create: `src/services/alarm-manager.ts`
- Test: `src/__tests__/services/alarm-manager.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/services/alarm-manager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shouldTriggerAlarm, createAlarmChecker } from '@/services/alarm-manager'

describe('shouldTriggerAlarm', () => {
  it('returns true when within first alert window', () => {
    // firstAlert etMinutesBefore=120 → 120*175/60 = 350 real seconds
    const result = shouldTriggerAlarm({
      realSecondsUntil: 350,
      isActive: false,
      alarmSettings: {
        firstAlert: { enabled: true, etMinutesBefore: 120 },
        secondAlert: { enabled: false, etMinutesBefore: 0 },
        soundFile: 'chime',
        volume: 70,
      },
      globalAlarmEnabled: true,
      itemAlarmEnabled: true,
    })
    expect(result).toBe('first')
  })

  it('returns false when global alarm disabled', () => {
    const result = shouldTriggerAlarm({
      realSecondsUntil: 300,
      isActive: false,
      alarmSettings: {
        firstAlert: { enabled: true, etMinutesBefore: 120 },
        secondAlert: { enabled: false, etMinutesBefore: 0 },
        soundFile: 'chime',
        volume: 70,
      },
      globalAlarmEnabled: false,
      itemAlarmEnabled: true,
    })
    expect(result).toBe(false)
  })

  it('returns false when item alarm disabled', () => {
    const result = shouldTriggerAlarm({
      realSecondsUntil: 300,
      isActive: false,
      alarmSettings: {
        firstAlert: { enabled: true, etMinutesBefore: 120 },
        secondAlert: { enabled: false, etMinutesBefore: 0 },
        soundFile: 'chime',
        volume: 70,
      },
      globalAlarmEnabled: true,
      itemAlarmEnabled: false,
    })
    expect(result).toBe(false)
  })

  it('returns second when node just became active', () => {
    const result = shouldTriggerAlarm({
      realSecondsUntil: 0,
      isActive: true,
      alarmSettings: {
        firstAlert: { enabled: true, etMinutesBefore: 120 },
        secondAlert: { enabled: true, etMinutesBefore: 0 },
        soundFile: 'chime',
        volume: 70,
      },
      globalAlarmEnabled: true,
      itemAlarmEnabled: true,
    })
    expect(result).toBe('second')
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/__tests__/services/alarm-manager.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement alarm manager**

```typescript
// src/services/alarm-manager.ts
import type { AlarmSettings } from '@/stores/timer'

interface AlarmCheckInput {
  realSecondsUntil: number
  isActive: boolean
  alarmSettings: AlarmSettings
  globalAlarmEnabled: boolean
  itemAlarmEnabled: boolean
}

/**
 * Check if an alarm should trigger. Returns 'first', 'second', or false.
 * Uses a 2-second tolerance window for the check interval.
 */
export function shouldTriggerAlarm(input: AlarmCheckInput): 'first' | 'second' | false {
  const { realSecondsUntil, isActive, alarmSettings, globalAlarmEnabled, itemAlarmEnabled } = input
  if (!globalAlarmEnabled || !itemAlarmEnabled) return false

  // Second alert: when node becomes active (etMinutesBefore = 0 means on spawn)
  if (alarmSettings.secondAlert.enabled) {
    const secondRealSec = alarmSettings.secondAlert.etMinutesBefore * 175 / 60
    if (isActive && secondRealSec === 0) return 'second'
    if (!isActive && Math.abs(realSecondsUntil - secondRealSec) < 2) return 'second'
  }

  // First alert: before spawn
  if (alarmSettings.firstAlert.enabled && !isActive) {
    const firstRealSec = alarmSettings.firstAlert.etMinutesBefore * 175 / 60
    if (Math.abs(realSecondsUntil - firstRealSec) < 2) return 'first'
  }

  return false
}

let audioContext: AudioContext | null = null

export async function playAlarmSound(soundFile: string, volume: number): Promise<void> {
  if (!audioContext) audioContext = new AudioContext()
  if (audioContext.state === 'suspended') await audioContext.resume()

  const isCustom = soundFile.startsWith('data:') || soundFile.startsWith('blob:')
  const url = isCustom ? soundFile : `/ff14-craft-helper/sounds/${soundFile}.mp3`

  const resp = await fetch(url)
  const buffer = await resp.arrayBuffer()
  const audioBuffer = await audioContext.decodeAudioData(buffer)

  const source = audioContext.createBufferSource()
  const gain = audioContext.createGain()
  source.buffer = audioBuffer
  gain.gain.value = volume / 100
  source.connect(gain)
  gain.connect(audioContext.destination)
  source.start()
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/services/alarm-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/alarm-manager.ts src/__tests__/services/alarm-manager.test.ts
git commit -m "feat(timer): add alarm manager with trigger logic and audio playback"
```

---

## Task 6: Sound Assets

**Files:**
- Create: `public/sounds/chime.mp3`
- Create: `public/sounds/alert.mp3`
- Create: `public/sounds/soft.mp3`

- [ ] **Step 1: Generate sound files**

Use Web Audio API offline rendering or source from freesound.org (CC0). Each file ≤ 50KB, .mp3 format.

Alternatively, create a simple script using `AudioContext.createOscillator()` to generate tones and export as .mp3. Three variations:
- `chime`: 880Hz sine wave, 0.3s, fade out
- `alert`: 1000Hz square wave, 0.15s × 2 beeps
- `soft`: 440Hz sine wave, 0.5s, slow fade

- [ ] **Step 2: Verify files exist and are ≤ 50KB each**

Run: `ls -la public/sounds/`

- [ ] **Step 3: Commit**

```bash
git add public/sounds/
git commit -m "feat(timer): add built-in alarm sound presets"
```

---

## Task 7: Route + Sidebar (ET Clock + Timer Menu Item)

**Files:**
- Create: `src/components/EorzeaClock.vue`
- Modify: `src/router/index.ts`
- Modify: `src/App.vue`

- [ ] **Step 1: Create EorzeaClock component**

```vue
<!-- src/components/EorzeaClock.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getEorzeaTime } from '@/services/eorzea-clock'

const etTime = ref('00:00')
const ltTime = ref('00:00')
let intervalId: ReturnType<typeof setInterval>

function update() {
  const et = getEorzeaTime()
  etTime.value = `${String(et.hour).padStart(2, '0')}:${String(et.minute).padStart(2, '0')}`
  const now = new Date()
  ltTime.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

onMounted(() => {
  update()
  intervalId = setInterval(update, 1000)
})
onUnmounted(() => clearInterval(intervalId))
</script>

<template>
  <div class="eorzea-clock">
    <div class="clock-row">
      <span class="clock-label">ET</span>
      <span class="clock-value">{{ etTime }}</span>
    </div>
    <div class="clock-row">
      <span class="clock-label">LT</span>
      <span class="clock-value">{{ ltTime }}</span>
    </div>
  </div>
</template>

<style scoped>
.eorzea-clock {
  padding: 12px 20px;
  border-top: 1px solid var(--app-border);
  margin-top: auto;
}
.clock-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  line-height: 1.8;
}
.clock-label {
  font-size: 11px;
  color: var(--app-text-muted);
  font-weight: 600;
  letter-spacing: 1px;
}
.clock-value {
  font-family: 'Consolas', 'Fira Code', monospace;
  font-size: 14px;
  color: var(--app-text);
  letter-spacing: 2px;
}
</style>
```

- [ ] **Step 2: Add `/timer` route**

In `src/router/index.ts`, add before the `/market` route:

```typescript
{
  path: '/timer',
  name: 'timer',
  component: () => import('@/views/TimerView.vue'),
},
```

- [ ] **Step 3: Add timer menu item and EorzeaClock to App.vue**

In `src/App.vue`:

1. Import `Timer` (or `AlarmClock`) icon from `@element-plus/icons-vue` and `EorzeaClock` component
2. Add menu item after the market entry (before divider):
```html
<el-menu-item index="/timer">
  <el-icon><AlarmClock /></el-icon>
  <span>採集計時器</span>
</el-menu-item>
```
3. Add `<EorzeaClock />` inside `<el-aside>` after the `<el-menu>` closing tag

- [ ] **Step 4: Create minimal TimerView placeholder**

```vue
<!-- src/views/TimerView.vue -->
<script setup lang="ts">
</script>

<template>
  <div class="view-container">
    <h2>採集計時器</h2>
    <p style="color: var(--app-text-muted)">Coming soon...</p>
  </div>
</template>
```

- [ ] **Step 5: Run dev server and verify**

Run: `npm run dev`
Verify: New "採集計時器" menu item visible, ET clock ticking in sidebar, `/timer` route loads placeholder.

- [ ] **Step 6: Commit**

```bash
git add src/components/EorzeaClock.vue src/views/TimerView.vue src/router/index.ts src/App.vue
git commit -m "feat(timer): add timer route, sidebar menu item, and ET clock"
```

---

## Task 8: NodeCard Component

**Files:**
- Create: `src/components/timer/NodeCard.vue`

- [ ] **Step 1: Create NodeCard component**

This is a presentational component. Props:
- `node: GatheringNode` — the node data
- `countdown: string` — formatted MM:SS countdown
- `isActive: boolean` — whether currently gatherable
- `price: number | null` — market price (null = loading)
- `alarmEnabled: boolean` — per-item alarm state
- `globalAlarmOff: boolean` — whether global alarm is off

Emits:
- `toggle-alarm` — when per-item toggle clicked
- `toggle-map` — when card body clicked to expand/collapse map

Refer to the mockup in `.superpowers/brainstorm/13753-1774193866/alarm-switches.html` for visual design. Use:
- Gradient backgrounds per status (active=green, upcoming=blue, later=gray)
- Monospace countdown at 22px
- Small toggle switch next to countdown
- Price in gold color, right-aligned
- `cursor: pointer`, hover transition 200ms
- Opacity 0.5 when item alarm off, 0.7 when global alarm off

Full implementation. No skeleton — this is a single `.vue` file with `<script setup>`, `<template>`, `<style scoped>`.

- [ ] **Step 2: Verify it renders in isolation**

Create a temporary test in TimerView with hardcoded props to verify the card renders correctly.

- [ ] **Step 3: Commit**

```bash
git add src/components/timer/NodeCard.vue
git commit -m "feat(timer): add NodeCard component with status colors and alarm toggle"
```

---

## Task 9: NodeMinimap Component

**Files:**
- Create: `src/components/timer/NodeMinimap.vue`

- [ ] **Step 1: Create NodeMinimap component**

Props:
- `node: GatheringNode` — contains mapId, rawCoords, coords, zone
- `interactive: boolean` — true on desktop, false on mobile
- `nearbyNodes?: GatheringNode[]` — other tracked nodes in same zone
- `statusColor: string` — marker color

Interactive mode features:
- Container 100% × 260px, `overflow: hidden`
- Inner div with full map image (`<img>`) positioned so node is centered
- `mousedown`/`mousemove`/`mouseup` for drag-to-pan
- `wheel` event for zoom (0.4x–2.0x, 0.2x step)
- +/− zoom buttons bottom-left
- Zone name top-left, coords bottom-right
- Nearby tracked nodes as dimmed markers

Static mode:
- 200×200px container
- CSS `object-position` to crop around node point
- Zone name and coords overlay only

Use `window.matchMedia('(min-width: 768px)')` to auto-detect mode.

Map image URL: `https://beta.xivapi.com/api/1/asset/map/{mapId}?format=png`

Use `convertToPixel` from `src/utils/map-coords.ts` for positioning.

- [ ] **Step 2: Test with hardcoded data in TimerView**

- [ ] **Step 3: Commit**

```bash
git add src/components/timer/NodeMinimap.vue
git commit -m "feat(timer): add NodeMinimap with interactive desktop and static mobile modes"
```

---

## Task 10: AddTrackingPanel Component

**Files:**
- Create: `src/components/timer/AddTrackingPanel.vue`

- [ ] **Step 1: Create AddTrackingPanel**

Two tabs: Search / Browse

**Search tab:**
- Text input with debounce (300ms)
- Filters `nodeCache` from timer store by item name match
- Each result shows: name, nodeType, level, gathering class
- "+ 追蹤" button calls `store.addTrackedItem()`
- Already-tracked items show "已追蹤" in muted state

**Browse tab:**
- Tree structure: gathering class (採礦師/園藝師) → node type → items
- Uses Element Plus `el-tree` or manual accordion
- Each leaf item has "+ 追蹤" button

Props: none (reads from timer store directly)
Emits: none (writes to store directly)

- [ ] **Step 2: Verify search and browse work with dev server**

- [ ] **Step 3: Commit**

```bash
git add src/components/timer/AddTrackingPanel.vue
git commit -m "feat(timer): add tracking panel with search and browse tabs"
```

---

## Task 11: AlarmSettingsPanel Component

**Files:**
- Create: `src/components/timer/AlarmSettingsPanel.vue`

- [ ] **Step 1: Create AlarmSettingsPanel**

Reads/writes from `useTimerStore().alarmSettings`.

Controls:
- First alert: `el-switch` + `el-input-number` (ET minutes, step 10, min 0, max 600)
- Second alert: `el-switch` + `el-input-number`
- Sound: `el-select` with options (chime/alert/soft/custom) + preview button (▶)
- Volume: `el-slider` 0-100
- Custom sound upload: `<input type="file" accept=".mp3,.wav,.ogg">`, validate ≤ 500KB, store as base64

Preview button calls `playAlarmSound()` from alarm-manager.

- [ ] **Step 2: Verify controls work in dev server**

- [ ] **Step 3: Commit**

```bash
git add src/components/timer/AlarmSettingsPanel.vue
git commit -m "feat(timer): add alarm settings panel with sound preview and custom upload"
```

---

## Task 12: GlobalAlarmToggle Component

**Files:**
- Create: `src/components/timer/GlobalAlarmToggle.vue`

- [ ] **Step 1: Create GlobalAlarmToggle**

Small component for the top bar. Shows:
- Bell SVG icon (Lucide `Bell` or `BellOff`)
- "提醒" / "提醒已暫停" label
- `el-switch` bound to `store.globalAlarmEnabled`

When off: icon changes to bell-slash, label text becomes muted.

- [ ] **Step 2: Commit**

```bash
git add src/components/timer/GlobalAlarmToggle.vue
git commit -m "feat(timer): add global alarm toggle component"
```

---

## Task 13: TimerView — Full Assembly

**Files:**
- Modify: `src/views/TimerView.vue`

- [ ] **Step 1: Implement complete TimerView**

This is the main assembly. Replace the placeholder from Task 7.

Layout (refer to responsive mockups):
- **Top bar:** title + filter chips + GlobalAlarmToggle + (ultra-wide: inline search)
- **Warning banner:** shown when global alarm off (yellow, with info icon)
- **Tracking list:** NodeCard components, sorted by `getNextSpawn` ascending
  - ≥ 2560px: `display: grid; grid-template-columns: 1fr 1fr; max-width: 1400px`
  - 1440–2559px: single column + right side panel (AddTrackingPanel + AlarmSettingsPanel)
  - 768–1439px: single column + FAB button → el-drawer
  - ≤ 767px: compact cards + FAB → fullscreen drawer
- **NodeMinimap:** inside each NodeCard, toggled on click
- **Price integration:** use `getMarketData` from `src/api/universalis.ts`, keyed by `node.itemId`

Reactive data:
- `setInterval` every second to update all countdowns
- Sort tracked items by `realSecondsUntil` (active items first, then ascending)
- Filter by `gatheringClass` and `nodeType` (controlled by filter chips)
- Node cache loaded on mount (calls `fetchAllTimedNodes` if cache expired)

CSS media queries for responsive breakpoints matching the spec.

- [ ] **Step 2: Load node data and verify tracking list works**

Run dev server, verify:
- Nodes load from Garland API
- Search works
- Adding/removing tracked items works
- Countdown ticks every second
- Cards sorted by spawn time

- [ ] **Step 3: Verify responsive layouts at each breakpoint**

Test at 2560px, 1920px, 1024px, 375px using browser dev tools.

- [ ] **Step 4: Verify alarm system**

- Track a node that spawns soon
- Confirm sound plays at the configured alert time
- Toggle global/individual alarms and verify behavior

- [ ] **Step 5: Commit**

```bash
git add src/views/TimerView.vue
git commit -m "feat(timer): implement full TimerView with responsive layout and alarm integration"
```

---

## Task 14: XIVAPI Node Detail Resolution (Enhancement)

**Files:**
- Modify: `src/api/garland.ts`
- Modify: `src/__tests__/api/garland.test.ts`

This task fills in the placeholder data (itemId, itemName, coords, mapId) left by Task 3. The Garland Browse API returns node-level data but not item details. We need to join with XIVAPI sheets.

- [ ] **Step 1: Add `resolveNodeDetails` function**

New function that takes the basic nodes from Task 3 and enriches them with XIVAPI data.

**XIVAPI v2 sheet endpoints** (same base as existing `src/api/xivapi.ts`):
- `https://xivapi-v2.xivcdn.com/api/sheet/GatheringPoint?rows=<ids>&fields=GatheringPointBase,TerritoryType`
- `https://xivapi-v2.xivcdn.com/api/sheet/GatheringPointBase?rows=<ids>&fields=Item[0],Item[1],Item[2],...`
- `https://xivapi-v2.xivcdn.com/api/sheet/Item?rows=<ids>&fields=Name`
- `https://xivapi-v2.xivcdn.com/api/sheet/TerritoryType?rows=<ids>&fields=Map,PlaceName`
- `https://xivapi-v2.xivcdn.com/api/sheet/Map?rows=<ids>&fields=SizeFactor,OffsetX,OffsetY`

**Data join strategy:**
```
GarlandNode.id → GatheringPoint.row_id
  → GatheringPointBase → Item[0..7] (item IDs)
  → TerritoryType → Map (mapId, sizeFactor, offsetX, offsetY)
                   → PlaceName (zone name in Chinese)
Item IDs → Item sheet → Name (Chinese item name)
```

```typescript
// Add to src/api/garland.ts
async function resolveNodeDetails(
  nodes: GatheringNode[],
): Promise<GatheringNode[]> {
  if (nodes.length === 0) return nodes

  try {
    // Step 1: Query GatheringPoint for all node IDs
    const nodeIds = nodes.map((n) => n.id)
    const gpUrl = `${XIVAPI_SHEET}/sheet/GatheringPoint?rows=${nodeIds.join(',')}&fields=GatheringPointBase,TerritoryType`
    const gpResp = await fetch(gpUrl)
    if (!gpResp.ok) return nodes
    const gpData = await gpResp.json()

    // Build maps: nodeId → baseId, nodeId → territoryId
    const baseIds = new Set<number>()
    const territoryIds = new Set<number>()
    const nodeToBase = new Map<number, number>()
    const nodeToTerritory = new Map<number, number>()
    for (const row of gpData.rows) {
      const baseId = row.fields?.GatheringPointBase?.row_id
      const terrId = row.fields?.TerritoryType?.row_id
      if (baseId) { nodeToBase.set(row.row_id, baseId); baseIds.add(baseId) }
      if (terrId) { nodeToTerritory.set(row.row_id, terrId); territoryIds.add(terrId) }
    }

    // Step 2: Query GatheringPointBase for item IDs
    const gpbUrl = `${XIVAPI_SHEET}/sheet/GatheringPointBase?rows=${[...baseIds].join(',')}&fields=Item[0],Item[1],Item[2],Item[3],Item[4],Item[5],Item[6],Item[7]`
    const gpbResp = await fetch(gpbUrl)
    const gpbData = gpbResp.ok ? await gpbResp.json() : { rows: [] }

    const baseToItems = new Map<number, number[]>()
    for (const row of gpbData.rows) {
      const items: number[] = []
      for (let i = 0; i < 8; i++) {
        const itemId = row.fields?.[`Item[${i}]`]?.row_id
        if (itemId && itemId > 0) items.push(itemId)
      }
      baseToItems.set(row.row_id, items)
    }

    // Step 3: Query Item names
    const allItemIds = new Set<number>()
    baseToItems.forEach((items) => items.forEach((id) => allItemIds.add(id)))
    const itemNames = await fetchItemNames([...allItemIds])

    // Step 4: Query TerritoryType → Map + PlaceName
    const ttUrl = `${XIVAPI_SHEET}/sheet/TerritoryType?rows=${[...territoryIds].join(',')}&fields=Map,PlaceName`
    const ttResp = await fetch(ttUrl)
    const ttData = ttResp.ok ? await ttResp.json() : { rows: [] }

    const territoryToMap = new Map<number, number>()
    const territoryToPlace = new Map<number, string>()
    for (const row of ttData.rows) {
      const mapId = row.fields?.Map?.row_id
      const placeName = row.fields?.PlaceName?.fields?.Name
      if (mapId) territoryToMap.set(row.row_id, mapId)
      if (placeName) territoryToPlace.set(row.row_id, placeName)
    }

    // Step 5: Enrich nodes
    return nodes.map((node) => {
      const baseId = nodeToBase.get(node.id)
      const terrId = nodeToTerritory.get(node.id)
      const items = baseId ? baseToItems.get(baseId) ?? [] : []
      const firstItemId = items[0] ?? 0

      return {
        ...node,
        itemId: firstItemId,
        itemName: itemNames.get(firstItemId) ?? node.itemName,
        zone: terrId ? territoryToPlace.get(terrId) ?? node.zone : node.zone,
        mapId: terrId ? territoryToMap.get(terrId) ?? 0 : 0,
        // Note: raw coords for pixel conversion need Map sheet offset/sizeFactor
        // which is fetched in NodeMinimap component on demand
      }
    })
  } catch (error) {
    console.error('[API] resolveNodeDetails error:', error)
    return nodes // return unresolved on failure
  }
}
```

- [ ] **Step 2: Update `fetchAllTimedNodes` to call `resolveNodeDetails`**

At the end of `fetchAllTimedNodes`, after building the basic nodes array:
```typescript
const enriched = await resolveNodeDetails(basicNodes)
return enriched
```

- [ ] **Step 3: Write tests for `resolveNodeDetails`**

```typescript
it('enriches nodes with XIVAPI item names and map data', async () => {
  const basicNodes = [{ id: 1, itemId: 0, itemName: 'placeholder', /* ... */ }]

  vi.mocked(globalThis.fetch).mockImplementation((url: any) => {
    const u = typeof url === 'string' ? url : url.toString()
    if (u.includes('GatheringPoint?')) return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ rows: [{
        row_id: 1,
        fields: {
          GatheringPointBase: { row_id: 100 },
          TerritoryType: { row_id: 200 },
        }
      }]})
    } as Response)
    if (u.includes('GatheringPointBase?')) return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ rows: [{
        row_id: 100,
        fields: { 'Item[0]': { row_id: 5001 } }
      }]})
    } as Response)
    if (u.includes('sheet/Item?')) return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ rows: [{
        row_id: 5001,
        fields: { Name: '暗物質礦' }
      }]})
    } as Response)
    if (u.includes('TerritoryType?')) return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ rows: [{
        row_id: 200,
        fields: {
          Map: { row_id: 50 },
          PlaceName: { fields: { Name: '薩納蘭高地' } }
        }
      }]})
    } as Response)
    return Promise.resolve({ ok: false } as Response)
  })

  // Call resolveNodeDetails (exported for testing)
  // Verify: itemId=5001, itemName='暗物質礦', zone='薩納蘭高地', mapId=50
})
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/__tests__/api/garland.test.ts`
Expected: PASS

- [ ] **Step 5: Verify minimap shows actual game map images in dev server**

- [ ] **Step 6: Commit**

```bash
git add src/api/garland.ts src/__tests__/api/garland.test.ts
git commit -m "feat(timer): resolve item names, coords, and map IDs via XIVAPI"
```

---

## Task 15: Price Integration

**Files:**
- Modify: `src/views/TimerView.vue`

- [ ] **Step 1: Add price fetching to TimerView**

- On mount and every 5 minutes, fetch prices for all tracked items via `getAggregatedPrices` from `src/api/universalis.ts`
- Display own-server minimum price on each NodeCard
- On card click/expand, show `CrossWorldPriceDetail` popover (reuse existing component)
- Follow `settings.priceDisplayMode` for NQ/HQ/minOf

- [ ] **Step 2: Verify prices display correctly**

- [ ] **Step 3: Commit**

```bash
git add src/views/TimerView.vue
git commit -m "feat(timer): integrate Universalis market prices on node cards"
```

---

## Task 16: Final Polish and Testing

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Verify accessibility**

- All interactive elements have `cursor: pointer`
- Focus-visible rings on toggle switches
- `prefers-reduced-motion` disables pulse animations
- Color contrast meets WCAG 4.5:1

- [ ] **Step 3: Manual E2E test**

Full flow:
1. Navigate to /timer
2. Search for a node → add to tracking
3. Browse categories → add another node
4. Verify countdowns tick
5. Toggle individual alarm off → card dims
6. Toggle global alarm off → warning banner + all cards dim
7. Toggle global back on → individual states restored
8. Expand card → minimap appears (interactive on desktop)
9. Check responsive at 2560/1920/768/375
10. Wait for alarm trigger → sound plays
11. Adjust volume → verify
12. Upload custom sound → verify preview + alarm

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(timer): polish and accessibility improvements"
```

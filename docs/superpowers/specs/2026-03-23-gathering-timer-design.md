# Gathering Timer System — Design Spec

## Overview

A gathering timer page that tracks timed gathering nodes in FF14. Users add items to a tracking list, see real-time countdowns, market prices, and receive audio alerts before nodes spawn.

## Requirements Summary

| Item | Decision |
|------|----------|
| Data source | Garland Browse API (primary) + XIVAPI (item names, coords) |
| Node types | All: Unspoiled, Legendary, Ephemeral, Concealed |
| Adding items | Search by name + browse by category |
| Alert system | Two-stage alerts, user-configurable timing and enable/disable per stage |
| Sound | Built-in presets (3) + custom upload + volume slider |
| Price display | Own server price + expandable cross-server detail |
| Persistence | localStorage via pinia-plugin-persistedstate |
| ET Clock | Global sidebar, shows both ET and local time |
| Sorting | By next spawn time |
| Filtering | Gathering class (MIN/BTN) + node type |
| Alarm switches | Global on/off + per-item on/off |

## Data Architecture

### New Store: `src/stores/timer.ts`

```typescript
interface GatheringNode {
  id: number
  itemId: number
  itemName: string
  level: number
  stars: number
  gatheringClass: 'MIN' | 'BTN'
  nodeType: 'Unspoiled' | 'Legendary' | 'Ephemeral' | 'Concealed'
  zone: string
  coords: { x: number; y: number }
  spawnTimes: number[]   // ET hours, e.g. [0, 12]
  duration: number       // ET minutes
}

interface TrackedItem {
  nodeId: number
  itemId: number
  alarmEnabled: boolean
}

interface AlarmSettings {
  firstAlert: { enabled: boolean; etMinutesBefore: number }
  secondAlert: { enabled: boolean; etMinutesBefore: number }
  soundFile: string      // built-in name or custom base64/URL
  volume: number         // 0-100
}

// Store state
interface TimerState {
  trackedItems: TrackedItem[]
  globalAlarmEnabled: boolean
  alarmSettings: AlarmSettings
  nodeCache: GatheringNode[]
  nodeCacheTimestamp: number
}
```

**Persisted:** `trackedItems`, `globalAlarmEnabled`, `alarmSettings`

**Not persisted:** `nodeCache`, `nodeCacheTimestamp` (re-fetched on startup, TTL 24h)

### New API Module: `src/api/garland.ts`

```typescript
fetchAllTimedNodes(): Promise<GatheringNode[]>
```

- `GET garlandtools.org/db/doc/browse/en/2/node.json`
- Filter entries with `lt` (limited type) field
- Batch-query XIVAPI for Chinese item names
- Cache to store with 24h TTL

### New Service: `src/services/eorzea-clock.ts`

```typescript
getEorzeaTime(): { hour: number; minute: number }
// 1 ET hour = 175 real seconds
// Formula: ET_ms = Date.now() * (3600 / 175)

getNextSpawn(node: GatheringNode, currentET: { hour, minute }): {
  realSecondsUntil: number
  isActive: boolean
}

formatCountdown(seconds: number): string
// Returns "MM:SS" format
```

### New Service: `src/services/alarm-manager.ts`

- `setInterval` every second, checks tracked items against spawn times
- Trigger condition: `globalAlarmEnabled && item.alarmEnabled && reachedAlertTime`
- Plays sound via Web Audio API (`AudioContext` + `GainNode` for volume)
- Custom sounds stored as base64 in localStorage, max 500KB per file

## UI Design

### Page: `src/views/TimerView.vue`

New route: `/timer` (採集計時器)

### Layout Strategy (Responsive)

| Viewport | List Layout | Add/Track Panel | max-width | Card Width |
|----------|------------|-----------------|-----------|------------|
| ≥ 2560px | 2-column grid | Top search bar + browse button | 1400px | ~550px |
| 1440–2559px | Single column + side panel | Right panel 300px | 1200px | ~700px |
| 768–1439px | Single column full width | FAB → Drawer | 100% | ~700px |
| ≤ 767px | Compact single-line cards | FAB → fullscreen Drawer | 100% | 100% |

### Node Card Design

Each tracked item displayed as a card with:

- **Status indicator:** colored dot (green=active, blue=upcoming, gray=later)
- **Countdown timer:** monospace font, 22-24px, prominent positioning
- **Item info:** name, level/stars, gathering class, node type
- **Location:** zone name + coordinates
- **Price:** own-server minimum price (monospace, gold color), expandable for cross-server
- **Per-item alarm toggle:** small toggle switch next to countdown

**Visual states by alarm:**
- Global ON + Item ON: normal display, purple toggle
- Global ON + Item OFF: card opacity 0.5, bell-slash icon, gray toggle
- Global OFF: yellow warning banner, all cards opacity 0.7, individual toggles hidden (state preserved)

### Card Depth & Style (per UI/UX Pro Max)

- Gradient backgrounds with subtle glow borders per status color
- `box-shadow` for depth (no flat design)
- SVG icons only (Lucide), no emojis
- `cursor: pointer` on all interactive elements
- Hover: border brightness increase + subtle scale(1.005), 200ms transition
- Loading: skeleton screens (animate-pulse)
- `prefers-reduced-motion` respected
- `focus-visible` rings for keyboard navigation

### Color System

| Token | Value | Usage |
|-------|-------|-------|
| Primary | #7C3AED | Buttons, active tabs, toggle on |
| Secondary | #A78BFA | Labels, accents, filter chips |
| CTA | #F43F5E | — |
| Background | #0F0F23 | Page background |
| Text | #E2E8F0 | Body text |
| Muted | #94A3B8 | Secondary text |
| Subtle | #64748B | Tertiary text, locations |
| Active | #4ADE80 | Currently gatherable nodes |
| Upcoming | #60A5FA | Upcoming nodes |
| Later | #94A3B8 | Later nodes |
| Price | #FBBF24 | Gil amounts |
| Warning | #FBBF24 | Global alarm off banner |

### Top Bar

- Page title "採集計時器"
- Filter chips: gathering class + node type
- Global alarm toggle: bell icon + "提醒" label + toggle switch
- (≥ 2560px) Inline search input + browse button

### Right Panel (1440–2559px) / Drawer (< 1440px)

**Add to tracking:**
- Two tabs: Search / Browse
- Search: text input, results list with "+ 追蹤" button
- Browse: tree view (class → node type → items)

**Alert settings:**
- First alert: enable toggle + ET minutes before (number input)
- Second alert: enable toggle + ET minutes before
- Sound: dropdown (3 presets + custom) + preview button
- Volume: slider 0-100
- Upload custom: file input (.mp3/.wav/.ogg, ≤ 500KB)

### ET Clock (Global — `App.vue` sidebar)

Located at sidebar bottom, visible on all pages:

```
┌──────────────────┐
│ ET  14:32        │
│ LT  22:15        │
└──────────────────┘
```

- Monospace font, updates every second
- ET = Eorzea Time, LT = Local Time

## Price Integration

- Reuse existing `api/universalis.ts` for market data
- Display own-server minimum price on each card
- Cross-server detail via Popover/Drawer (reuse `CrossWorldPriceDetail.vue`)
- Price refresh: on page load + periodic (every 5 min for visible items)
- Price source follows `settings.priceDisplayMode` (NQ/HQ/minOf)

## Sound System

**Built-in presets (bundled as static assets in `public/sounds/`):**
1. `chime` — clear bell tone (default)
2. `alert` — short alert beep
3. `soft` — gentle notification

Source: royalty-free sounds generated via Web Audio API synthesis or sourced from freesound.org (CC0 license). Each ≤ 50KB, .mp3 format.

**Custom sound:**
- Upload via file input, validate ≤ 500KB, .mp3/.wav/.ogg
- Store as base64 string in localStorage
- Preview with play button before confirming

**Playback:**
- Web Audio API: `AudioContext` → `fetch` → `decodeAudioData` → `AudioBufferSourceNode` → `GainNode` → `destination`
- `GainNode.gain.value` = `alarmSettings.volume / 100`
- Respect browser autoplay policies (user gesture required for first play)

## Minimap

Each node card can be expanded to reveal a minimap showing the gathering point location. Two modes based on device:

- **Desktop (≥ 768px):** Interactive minimap — drag to pan, scroll to zoom
- **Mobile (< 768px):** Static minimap — fixed 200×200 crop, no interaction

Detection via CSS media query + `window.matchMedia` in component logic.

**Map image source:**
- XIVAPI asset API: `https://beta.xivapi.com/api/1/asset/map/{mapId}` (game map images)
- Map ID resolved from the node's zone data via XIVAPI `Map` sheet

**Coordinate conversion:**
- XIVAPI provides raw coordinates; conversion to map pixel position uses:
  ```
  pixelX = (rawX - offsetX) * sizeFactor / 100 + 1024
  pixelY = (rawY - offsetY) * sizeFactor / 100 + 1024
  ```
  where `offsetX`, `offsetY`, `sizeFactor` come from the `Map` sheet
- Display coordinates (X:25.3, Y:30.1) are separate from pixel positions

**Interactive mode (desktop):**
- Container: 100% width × 260px height, overflow hidden
- Inner map: full map image, positioned so gathering point is centered
- Drag to pan: mousedown/mousemove/mouseup on inner container
- Zoom: scroll wheel or +/− buttons (0.4x–2.0x range, 0.2x step)
- Shows nearby points of interest: aetherytes (blue diamond), other tracked nodes (dimmed gray dots)
- Zoom controls: bottom-left corner, zoom level indicator between +/− buttons
- Zone name: top-left overlay
- Coordinates: bottom-right overlay

**Static mode (mobile):**
- Minimap size: 200×200px (cropped around the gathering point)
- No drag/zoom controls
- Zone name and coordinates overlay only

**Shared behavior:**
- Marker: colored dot matching node status color, with subtle pulse animation on active nodes
- Shown on card expand (click/tap card body to toggle)
- Map images lazy-loaded and cached in memory (same zone = same image)
- Expand/collapse animation: max-height + opacity transition, 300ms

**New component: `src/components/timer/NodeMinimap.vue`**
- Props: `node: GatheringNode`, `interactive: boolean`, `nearbyNodes?: GatheringNode[]`
- Handles both modes via `interactive` prop (bound to media query)

**Data additions to `GatheringNode`:**
```typescript
interface GatheringNode {
  // ... existing fields ...
  mapId: number          // XIVAPI Map row ID
  rawCoords: { x: number; y: number }  // raw coords for pixel conversion
}
```

**New utility: `src/utils/map-coords.ts`**
```typescript
convertToPixel(rawX, rawY, offsetX, offsetY, sizeFactor): { px: number; py: number }
cropRegion(px, py, mapSize, cropSize): { sx, sy, sw, sh }
```

**Data additions to `GatheringNode`:**
```typescript
interface GatheringNode {
  // ... existing fields ...
  mapId: number          // XIVAPI Map row ID
  rawCoords: { x: number; y: number }  // raw coords for pixel conversion
}
```

**New utility: `src/utils/map-coords.ts`**
```typescript
convertToPixel(rawX, rawY, offsetX, offsetY, sizeFactor): { px: number; py: number }
cropRegion(px, py, mapSize, cropSize): { sx, sy, sw, sh }
```

## Non-Goals

- No fishing (FSH) nodes — timed fishing works differently and is out of scope
- No interactive/pannable map viewer
- No integration with in-game macros
- No push notifications beyond browser tab (no service worker)
- No social/sharing features
- No route planning between nodes

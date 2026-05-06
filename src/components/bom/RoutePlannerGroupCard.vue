<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBomStore } from '@/stores/bom'
import { useZoneName } from '@/composables/useZoneName'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { getZoneMetaSync } from '@/services/zone-meta'
import { convertToPixel, pixelToPercent } from '@/utils/map-coords'
import type { Group, GroupRow } from '@/services/route-planner'

// ---------------------------------------------------------------------------
// Props / Emits
// ---------------------------------------------------------------------------

const props = defineProps<{
  group: Group
}>()

const emit = defineEmits<{
  'open-map-sheet': [zoneId: number, coords: { x: number; y: number }]
}>()

// ---------------------------------------------------------------------------
// Store + helpers
// ---------------------------------------------------------------------------

const bomStore = useBomStore()
const isPhone = useMediaQuery('(max-width: 767px)')

// ---------------------------------------------------------------------------
// Zone name
// ---------------------------------------------------------------------------

const zoneName = useZoneName(() => props.group.zoneId)

// ---------------------------------------------------------------------------
// Collapse state
// ---------------------------------------------------------------------------

const isCollapsed = computed(() =>
  bomStore.routeViewSession.collapsedGroups.has(props.group.zoneId),
)

function toggleCollapse() {
  bomStore.toggleGroupCollapsed(props.group.zoneId)
}

// ---------------------------------------------------------------------------
// Header counts
// totalGil: GroupRow carries itemPrice in source but not qty (qty lives on RouteRow).
// We sum itemPrice across rows as a "per-item" cost proxy — this matches what
// the spec says: "use row.source.itemPrice summed if present, else just 件數".
// ---------------------------------------------------------------------------

const totalGil = computed(() => {
  let sum = 0
  for (const row of props.group.rows) {
    sum += row.source.itemPrice ?? 0
  }
  return sum
})

// ---------------------------------------------------------------------------
// Checked state
// ---------------------------------------------------------------------------

function isChecked(itemId: number): boolean {
  return bomStore.routeViewSession.checked.has(itemId)
}

function toggleChecked(itemId: number) {
  bomStore.toggleChecked(itemId)
}

// ---------------------------------------------------------------------------
// Row label helpers
// ---------------------------------------------------------------------------

function rowModeName(row: GroupRow): string {
  if (row.source.vendorName !== undefined) {
    // NPC vendor — try npcId via vendorName fallback
    return row.source.vendorName
  }
  if (row.source.nodeLevel !== undefined) {
    return `Lv${row.source.nodeLevel} 採點`
  }
  return '?'
}

function rowModeIcon(row: GroupRow): string {
  return row.source.vendorName !== undefined ? '⛟' : '⛏'
}

function rowIsNpc(row: GroupRow): boolean {
  return row.source.vendorName !== undefined
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

const XIVAPI_ASSET_BASE = 'https://xivapi.com/'

const mapMeta = computed(() => getZoneMetaSync(props.group.zoneId))
const mapImageUrl = computed(() => {
  const url = mapMeta.value?.mapAssetUrl
  if (!url) return null
  return `${XIVAPI_ASSET_BASE}${url}`
})

// ---------------------------------------------------------------------------
// Hover state (row ↔ marker sync)
// ---------------------------------------------------------------------------

const hoveredItemId = ref<number | null>(null)

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

interface MapMarker {
  itemId: number
  left: string
  top: string
  isNpc: boolean
  isDone: boolean
  isHovered: boolean
  label: string
  order: number
}

const mapMarkers = computed((): MapMarker[] => {
  const meta = mapMeta.value
  const sizeFactor = meta?.sizeFactor ?? 100

  return props.group.rows.map((row) => {
    const { px, py } = convertToPixel({
      rawX: row.source.x,
      rawY: row.source.y,
      offsetX: 0,
      offsetY: 0,
      sizeFactor,
    })
    const { left, top } = pixelToPercent(px, py)
    const isDone = bomStore.routeViewSession.checked.has(row.itemId)
    const isHovered = hoveredItemId.value === row.itemId

    return {
      itemId: row.itemId,
      left,
      top,
      isNpc: rowIsNpc(row),
      isDone,
      isHovered,
      label: rowModeName(row),
      order: row.orderInZone,
    }
  })
})

// Aetheryte marker position
const aetheryteMarker = computed(() => {
  const aeth = props.group.aetheryte
  if (!aeth) return null
  const meta = mapMeta.value
  const sizeFactor = meta?.sizeFactor ?? 100
  const { px, py } = convertToPixel({
    rawX: aeth.x,
    rawY: aeth.y,
    offsetX: 0,
    offsetY: 0,
    sizeFactor,
  })
  const { left, top } = pixelToPercent(px, py)
  return { left, top, name: aeth.name }
})

// ---------------------------------------------------------------------------
// Phone: emit open-map-sheet
// ---------------------------------------------------------------------------

function openMapSheet(row: GroupRow) {
  emit('open-map-sheet', props.group.zoneId, { x: row.source.x, y: row.source.y })
}

// ---------------------------------------------------------------------------
// Image error handler
// ---------------------------------------------------------------------------

function onMapError(e: Event) {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
}
</script>

<template>
  <div
    class="rpgc"
    :class="{ 'is-hero': group.isHero }"
    data-testid="group-card"
  >
    <!-- ── Header ──────────────────────────────────────────────────────────── -->
    <div
      class="rpgc__header"
      data-testid="group-header"
      role="button"
      tabindex="0"
      :aria-expanded="!isCollapsed"
      @click="toggleCollapse"
      @keydown.enter.prevent="toggleCollapse"
      @keydown.space.prevent="toggleCollapse"
    >
      <!-- Zone name -->
      <span class="rpgc__zone-name">🌍 {{ zoneName }}</span>

      <!-- Aetheryte chip -->
      <span
        v-if="group.aetheryte"
        class="rpgc__aeth-chip"
      >
        📍 {{ group.aetheryte.name }} {{ group.tpCost }}G
      </span>
      <span v-else class="rpgc__aeth-chip rpgc__aeth-chip--warn">📍 ?G</span>

      <!-- Count + gil -->
      <span class="rpgc__count">
        {{ group.rows.length }} 件<template v-if="totalGil > 0"> · {{ totalGil }}G</template>
      </span>

      <!-- Chevron -->
      <span class="rpgc__chevron" :class="{ 'is-collapsed': isCollapsed }" aria-hidden="true">▾</span>
    </div>

    <!-- ── Body ───────────────────────────────────────────────────────────── -->
    <div v-if="!isCollapsed" class="rpgc__body">
      <!-- Map (desktop only, ≥768px) -->
      <div
        v-if="!isPhone && mapImageUrl"
        class="rpgc__map-col"
        data-testid="map-col"
        aria-hidden="true"
      >
        <div class="rpgc__map-container" :class="{ 'is-hero': group.isHero }">
          <img
            :src="mapImageUrl"
            :alt="`${zoneName} 地圖`"
            class="rpgc__map-img"
            loading="lazy"
            decoding="async"
            @error="onMapError"
          />

          <!-- Aetheryte marker (✦, cocoa) -->
          <div
            v-if="aetheryteMarker"
            class="rpgc__marker rpgc__marker--aeth"
            :style="{ left: aetheryteMarker.left, top: aetheryteMarker.top }"
            :title="aetheryteMarker.name"
          >✦</div>

          <!-- Row markers -->
          <div
            v-for="marker in mapMarkers"
            :key="marker.itemId"
            class="rpgc__marker"
            :class="{
              'rpgc__marker--npc': marker.isNpc,
              'rpgc__marker--gather': !marker.isNpc,
              'is-done': marker.isDone,
              'is-hovered': marker.isHovered,
            }"
            :style="{ left: marker.left, top: marker.top }"
            :title="marker.label"
          >
            <span class="rpgc__marker-num">{{ marker.order }}</span>
          </div>
        </div>
      </div>

      <!-- Checklist -->
      <div class="rpgc__checklist">
        <div
          v-for="row in group.rows"
          :key="row.itemId"
          class="rpgc__row"
          :class="{ 'is-checked': isChecked(row.itemId) }"
          :data-testid="`row-${row.itemId}`"
          @mouseenter="hoveredItemId = row.itemId"
          @mouseleave="hoveredItemId = null"
        >
          <!-- Checkbox -->
          <span
            class="rpgc__checkbox"
            role="checkbox"
            :aria-checked="isChecked(row.itemId)"
            tabindex="0"
            :data-testid="`row-checkbox-${row.itemId}`"
            @click="toggleChecked(row.itemId)"
            @keydown.enter.prevent="toggleChecked(row.itemId)"
            @keydown.space.prevent="toggleChecked(row.itemId)"
          >
            <span v-if="isChecked(row.itemId)" class="rpgc__check-mark">✓</span>
          </span>

          <!-- Order badge -->
          <span class="rpgc__order-badge">{{ row.orderInZone }}</span>

          <!-- Mode icon -->
          <span class="rpgc__mode-icon" aria-hidden="true">{{ rowModeIcon(row) }}</span>

          <!-- Row info -->
          <div class="rpgc__row-info">
            <span class="rpgc__row-name">{{ rowModeName(row) }}</span>
            <span class="rpgc__row-meta">
              X:{{ row.source.x.toFixed(1) }} Y:{{ row.source.y.toFixed(1) }}
            </span>
            <span v-if="row.source.itemPrice" class="rpgc__row-price">
              {{ row.source.itemPrice }}G
            </span>
          </div>

          <!-- Phone: map button -->
          <button
            v-if="isPhone"
            type="button"
            class="rpgc__map-btn"
            :data-testid="`row-map-btn-${row.itemId}`"
            :aria-label="`查看 ${zoneName} 地圖`"
            @click.stop="openMapSheet(row)"
          >🗺️ 地圖</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* -----------------------------------------------------------------------
   Card shell
----------------------------------------------------------------------- */
.rpgc {
  background: var(--app-cream-surface, var(--app-surface));
  border: 1px solid var(--app-border);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.rpgc.is-hero {
  background: var(--app-cream-emphasis, color-mix(in srgb, var(--app-cream-surface, #faf7f2) 80%, var(--app-craft-dim) 20%));
  grid-column: span 2;
}

/* -----------------------------------------------------------------------
   Header
----------------------------------------------------------------------- */
.rpgc__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid transparent;
  transition: background-color 0.12s ease-out;
  flex-wrap: wrap;
}

.rpgc__header:hover {
  background: color-mix(in srgb, var(--app-craft) 5%, transparent);
}

.rpgc__header:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: -2px;
}

/* When body is visible, show header bottom border */
.rpgc:has(.rpgc__body) .rpgc__header {
  border-bottom-color: var(--app-border);
}

.rpgc__zone-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rpgc.is-hero .rpgc__zone-name {
  font-size: 15px;
}

.rpgc__aeth-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-craft) 12%, transparent);
  color: var(--app-craft);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.rpgc__aeth-chip--warn {
  background: color-mix(in srgb, var(--app-text-muted) 12%, transparent);
  color: var(--app-text-muted);
}

.rpgc__count {
  font-size: 12px;
  color: var(--app-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.rpgc__chevron {
  font-size: 14px;
  color: var(--app-text-muted);
  transition: transform 0.15s ease-out;
  flex-shrink: 0;
  display: inline-block;
}

.rpgc__chevron.is-collapsed {
  transform: rotate(-90deg);
}

/* -----------------------------------------------------------------------
   Body — two-column layout ≥768px
----------------------------------------------------------------------- */
.rpgc__body {
  display: flex;
  flex-direction: column;
}

@media (min-width: 768px) {
  .rpgc__body {
    flex-direction: row;
    align-items: flex-start;
  }
}

/* -----------------------------------------------------------------------
   Map column (desktop)
----------------------------------------------------------------------- */
.rpgc__map-col {
  flex-shrink: 0;
  width: 240px;
  padding: 12px;
  border-right: 1px solid var(--app-border);
}

.rpgc__map-container {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 11;
  background: var(--app-cream-emphasis, var(--app-cream-surface, var(--app-surface)));
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--app-border);
}

/* Hero: slightly taller map (~+40px equivalent via ratio tweak) */
.rpgc__map-container.is-hero {
  aspect-ratio: 16 / 12.5;
}

.rpgc__map-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* -----------------------------------------------------------------------
   Markers — Cocoa-only, no strawberry/matcha/blueberry
   NPC  = cocoa filled circle (--app-craft bg, cream border)
   Gather = cocoa outlined (cream fill, cocoa border)
   Done state = ink-muted (NOT green)
   Hover ring = toast-gold
----------------------------------------------------------------------- */
.rpgc__marker {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  pointer-events: none;
  box-shadow: 0 1px 4px oklch(0.28 0.04 55 / 0.25);
}

/* Aetheryte marker */
.rpgc__marker--aeth {
  background: var(--app-craft);
  color: var(--app-cream-surface, #faf7f2);
  border: 2px solid var(--app-cream-surface, #faf7f2);
  font-size: 11px;
  width: 18px;
  height: 18px;
  z-index: 2;
}

/* NPC: cocoa filled */
.rpgc__marker--npc {
  background: var(--app-craft);
  color: var(--app-cream-surface, #faf7f2);
  border: 2px solid var(--app-cream-surface, #faf7f2);
}

/* Gather: cream fill, cocoa border */
.rpgc__marker--gather {
  background: var(--app-cream-surface, #faf7f2);
  color: var(--app-craft);
  border: 2px solid var(--app-craft);
}

/* Done state: ink-muted, NOT green */
.rpgc__marker.is-done {
  background: var(--app-text-muted, #9ca3af);
  border-color: var(--app-cream-surface, #faf7f2);
  color: var(--app-cream-surface, #faf7f2);
}

.rpgc__marker--gather.is-done {
  background: var(--app-cream-surface, #faf7f2);
  border-color: var(--app-text-muted, #9ca3af);
  color: var(--app-text-muted, #9ca3af);
}

/* Hover ring — toast-gold (Sunlight Spotlight Rule) */
.rpgc__marker.is-hovered {
  outline: 2px solid var(--app-toast-gold, oklch(0.78 0.14 78));
  outline-offset: 2px;
}

.rpgc__marker-num {
  line-height: 1;
}

/* -----------------------------------------------------------------------
   Checklist
----------------------------------------------------------------------- */
.rpgc__checklist {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.rpgc__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--app-border);
  background: transparent;
  transition: background-color 0.12s ease-out;
  cursor: default;
}

.rpgc__row:last-child {
  border-bottom: none;
}

.rpgc__row:hover {
  background: color-mix(in srgb, var(--app-craft) 4%, transparent);
}

/* Checked row: strikethrough + warm tint background (NOT green) */
.rpgc__row.is-checked {
  background: var(--app-cream-emphasis, color-mix(in srgb, var(--app-cream-surface, #faf7f2) 70%, var(--app-craft-dim) 30%));
}

.rpgc__row.is-checked .rpgc__row-name,
.rpgc__row.is-checked .rpgc__row-meta {
  text-decoration: line-through;
  color: var(--app-text-muted);
}

/* Checkbox */
.rpgc__checkbox {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1.5px solid color-mix(in srgb, var(--app-craft) 50%, var(--app-border));
  background: var(--app-cream-surface, #faf7f2);
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.1s ease-out, border-color 0.1s ease-out;
  color: var(--app-craft);
  font-size: 12px;
  font-weight: 700;
}

.rpgc__checkbox:hover {
  background: color-mix(in srgb, var(--app-craft) 12%, transparent);
}

.rpgc__checkbox:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
}

.rpgc__check-mark {
  line-height: 1;
  font-size: 11px;
  color: var(--app-craft);
}

/* Order badge */
.rpgc__order-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-craft) 15%, transparent);
  color: var(--app-craft);
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

/* Mode icon */
.rpgc__mode-icon {
  font-size: 14px;
  flex-shrink: 0;
  font-family: 'Apple Symbols', 'Segoe UI Symbol', 'Noto Sans Symbols 2', 'Symbola', ui-monospace, monospace;
}

/* Row info */
.rpgc__row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.rpgc__row-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.1s ease-out;
}

.rpgc__row-meta {
  font-size: 11.5px;
  color: var(--app-text-muted);
  font-family: 'Fira Code', ui-monospace, monospace;
  letter-spacing: 0.02em;
  transition: color 0.1s ease-out;
}

/* Price: app-text at 600 weight (not toast-gold) */
.rpgc__row-price {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text);
}

/* Phone: map button */
.rpgc__map-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--app-border);
  background: var(--app-bg);
  color: var(--app-text-muted);
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background-color 0.12s ease-out;
}

.rpgc__map-btn:hover {
  background: var(--app-surface-hover, var(--app-cream-emphasis));
  color: var(--app-text);
}

.rpgc__map-btn:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
}
</style>

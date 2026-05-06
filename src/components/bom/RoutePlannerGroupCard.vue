<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBomStore } from '@/stores/bom'
import { useZoneName } from '@/composables/useZoneName'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { getZoneMetaSync } from '@/services/zone-meta'
import { convertToPixel, pixelToPercent } from '@/utils/map-coords'
import type { Group, GroupRow } from '@/services/route-planner'
import type { FlatMaterial } from '@/stores/bom'
import ItemName from '@/components/common/ItemName.vue'

// ---------------------------------------------------------------------------
// Props / Emits
// ---------------------------------------------------------------------------

const props = withDefaults(defineProps<{
  group: Group
  /** 1-based stop number across the whole route (Stop 01, 02, …). */
  stopNumber: number
  /** Total stops in the route — drives "stop X / Y" hint and last-stop detection. */
  totalStops: number
  /** zoneId of the next stop, or null if this is the last stop. */
  nextZoneId: number | null
  /** Stepper provides its own next/prev — hide the in-card "↓ 下一站" footer. */
  hideNextHint?: boolean
  /** Single-card stepper mode: ignore collapsed-by-zone state and always
   * show the body. */
  forceExpanded?: boolean
  /** Single-card stepper mode: stretch the map to ~50% of the card width. */
  bigMap?: boolean
}>(), {
  hideNextHint: false,
  forceExpanded: false,
  bigMap: false,
})

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
const nextZoneName = useZoneName(() => props.nextZoneId ?? -1)
const stopLabel = computed(() => String(props.stopNumber).padStart(2, '0'))
const isLastStop = computed(() => props.nextZoneId === null)

// ---------------------------------------------------------------------------
// Collapse state
// ---------------------------------------------------------------------------

const isCollapsed = computed(() => {
  // forceExpanded is set by the stepper view, where there's only ever one
  // card on screen — collapsing would just hide the only thing the user
  // came here to see.
  if (props.forceExpanded) return false
  return bomStore.routeViewSession.collapsedGroups.has(props.group.zoneId)
})

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

// Quick lookup from itemId → flat material (icon + qty + fallback name).
// Built once per recompute of flatMaterials so each row's `materialFor`
// call is O(1).
const materialIndex = computed(() => {
  const m = new Map<number, FlatMaterial>()
  for (const flat of bomStore.flatMaterials) m.set(flat.itemId, flat)
  return m
})

function materialFor(itemId: number): FlatMaterial | undefined {
  return materialIndex.value.get(itemId)
}

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

// xivapi v1 serves map assets via the asset proxy with ?format=png. The legacy
// xivapi.com host blocks CORS for these textures; beta.xivapi.com does not.
const XIVAPI_ASSET_BASE = 'https://beta.xivapi.com/api/1/asset/'

const mapMeta = computed(() => getZoneMetaSync(props.group.zoneId))
const mapImageUrl = computed(() => {
  const url = mapMeta.value?.mapAssetUrl
  if (!url) return null
  return `${XIVAPI_ASSET_BASE}${url}?format=png`
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
// Map zoom + pan (big-map mode only).
// Wheel = zoom (toward cursor), mouse drag = pan. Reset on stop change.
// Markers + image share the same transform so they move together.
// ---------------------------------------------------------------------------

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const dragging = ref(false)
const dragStart = ref({ x: 0, y: 0, panX: 0, panY: 0 })
const mapColRef = ref<HTMLElement | null>(null)

// Reset transform whenever the active stop (group) changes.
watch(() => props.group.zoneId, () => {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
})

const transformStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
  transformOrigin: '0 0',
}))

function clampPan(nextZoom: number) {
  // Keep the visible region from drifting past the map edge by more than
  // half the container — gives the user a soft tether back to the centre.
  const el = mapColRef.value?.querySelector('.rpgc__map-container') as HTMLElement | null
  if (!el) return
  const w = el.clientWidth
  const h = el.clientHeight
  const maxPanX = w * (nextZoom - 1)
  const maxPanY = h * (nextZoom - 1)
  panX.value = Math.min(0, Math.max(-maxPanX, panX.value))
  panY.value = Math.min(0, Math.max(-maxPanY, panY.value))
}

function onMapWheel(e: WheelEvent) {
  if (!props.bigMap) return
  e.preventDefault()
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const delta = e.deltaY < 0 ? 0.2 : -0.2
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value + delta))
  if (nextZoom === zoom.value) return
  // Zoom toward cursor: keep cursor stationary in zone-space.
  const ratio = nextZoom / zoom.value
  panX.value = mx - (mx - panX.value) * ratio
  panY.value = my - (my - panY.value) * ratio
  zoom.value = nextZoom
  clampPan(nextZoom)
}

function onMapMousedown(e: MouseEvent) {
  if (!props.bigMap || zoom.value <= 1) return
  dragging.value = true
  dragStart.value = { x: e.clientX, y: e.clientY, panX: panX.value, panY: panY.value }
  window.addEventListener('mousemove', onMapMousemove)
  window.addEventListener('mouseup', onMapMouseup)
}

function onMapMousemove(e: MouseEvent) {
  if (!dragging.value) return
  panX.value = dragStart.value.panX + (e.clientX - dragStart.value.x)
  panY.value = dragStart.value.panY + (e.clientY - dragStart.value.y)
  clampPan(zoom.value)
}

function onMapMouseup() {
  dragging.value = false
  window.removeEventListener('mousemove', onMapMousemove)
  window.removeEventListener('mouseup', onMapMouseup)
}

function resetZoom() {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
}

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
    :class="{ 'is-last': isLastStop, 'is-big-map': bigMap }"
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
      <!-- Stop badge (the wayfinding signal — sequence is the whole point of this view) -->
      <span class="rpgc__stop-badge" :aria-label="`第 ${stopNumber} 站，共 ${totalStops} 站`">
        <span class="rpgc__stop-num">{{ stopLabel }}</span>
      </span>

      <!-- Zone name -->
      <span class="rpgc__zone-name">{{ zoneName }}</span>

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
        ref="mapColRef"
        class="rpgc__map-col"
        data-testid="map-col"
        aria-hidden="true"
      >
        <div
          class="rpgc__map-container"
          :class="{ 'is-hero': group.isHero, 'is-zoomed': zoom > 1, 'is-dragging': dragging }"
          @wheel="onMapWheel"
          @mousedown="onMapMousedown"
        >
          <div class="rpgc__map-stage" :style="transformStyle">
            <img
              :src="mapImageUrl"
              :alt="`${zoneName} 地圖`"
              class="rpgc__map-img"
              loading="lazy"
              decoding="async"
              draggable="false"
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

          <!-- Zoom controls (big-map only) -->
          <div v-if="bigMap" class="rpgc__zoom-controls">
            <button
              type="button"
              class="rpgc__zoom-btn"
              aria-label="放大"
              :disabled="zoom >= MAX_ZOOM"
              @click.stop="() => { zoom = Math.min(MAX_ZOOM, zoom + 0.4); clampPan(zoom) }"
            >＋</button>
            <button
              type="button"
              class="rpgc__zoom-btn"
              aria-label="縮小"
              :disabled="zoom <= MIN_ZOOM"
              @click.stop="() => { zoom = Math.max(MIN_ZOOM, zoom - 0.4); clampPan(zoom) }"
            >－</button>
            <button
              type="button"
              class="rpgc__zoom-btn"
              aria-label="重設"
              :disabled="zoom === 1 && panX === 0 && panY === 0"
              @click.stop="resetZoom"
            >⟲</button>
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

          <!-- Item info (icon + name + qty) — what the player is buying -->
          <div class="rpgc__item">
            <img
              v-if="materialFor(row.itemId)?.icon"
              :src="materialFor(row.itemId)!.icon"
              alt=""
              class="rpgc__item-icon"
              loading="lazy"
              decoding="async"
              crossorigin="anonymous"
            />
            <div class="rpgc__item-text">
              <span class="rpgc__item-name">
                <ItemName :item-id="row.itemId" :fallback="materialFor(row.itemId)?.name" />
              </span>
              <span v-if="materialFor(row.itemId)?.totalAmount" class="rpgc__item-qty">
                ×{{ materialFor(row.itemId)!.totalAmount }}
              </span>
            </div>
          </div>

          <!-- NPC / source info — where to get it (right-aligned) -->
          <div class="rpgc__src">
            <span class="rpgc__src-mode" aria-hidden="true">{{ rowModeIcon(row) }}</span>
            <div class="rpgc__src-text">
              <span class="rpgc__src-name">{{ rowModeName(row) }}</span>
              <span class="rpgc__src-meta">
                X:{{ row.source.x.toFixed(1) }} Y:{{ row.source.y.toFixed(1) }}
              </span>
            </div>
            <span v-if="row.source.itemPrice" class="rpgc__src-price">
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

    <!-- ── Next-stop hint ──────────────────────────────────────────────────── -->
    <template v-if="!hideNextHint">
      <div v-if="!isLastStop" class="rpgc__next" aria-hidden="true">
        <span class="rpgc__next-arrow">↓</span>
        <span class="rpgc__next-label">下一站</span>
        <span class="rpgc__next-name">{{ nextZoneName }}</span>
      </div>
      <div v-else class="rpgc__next rpgc__next--last" aria-hidden="true">
        <em class="rpgc__finish">收工</em>
      </div>
    </template>
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

/* `is-hero` no longer paints a brighter surface — the bright variant
 * stood out so much it broke the rhythm of the timeline and gave the
 * wrong wayfinding signal (a card that's just got more items shouldn't
 * look like the start of the route). The hero status is now communicated
 * solely through the stop-number badge above. */

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
  font-size: 14.5px;
  font-weight: 600;
  color: var(--app-text);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* -----------------------------------------------------------------------
   Stop badge — primary wayfinding cue. Big, cocoa, mono numerals.
----------------------------------------------------------------------- */
.rpgc__stop-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--app-craft);
  color: var(--app-cream-surface, #faf7f2);
  font-family: 'Fira Code', ui-monospace, monospace;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow: 0 1px 4px oklch(0.28 0.04 55 / 0.25);
}

.rpgc__stop-num {
  font-size: 13px;
  line-height: 1;
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

/* Single-card stepper mode: pin the body to a viewport-relative height so
 * the page itself doesn't scroll. The map column derives its width from
 * body height via aspect-ratio (always square); the checklist column
 * scrolls within. */
.rpgc.is-big-map .rpgc__body {
  /* Body height = viewport minus chrome above & below the card body.
   * Empirically measured chrome stack at 1280×1253 viewport: page header
   * + sticky stack (totals/tabs/toolbar) + eyebrow + stepper + card
   * header + nav row + paddings ≈ 580px. Cap at 720 so tall monitors
   * don't waste space on a giant map. */
  height: min(720px, calc(100dvh - 580px));
  min-height: 420px;
  align-items: stretch;
  overflow: hidden;
}

.rpgc.is-big-map .rpgc__map-col {
  flex-shrink: 0;
  padding: 16px;
  display: flex;
  position: relative;
  /* Explicitly size width to the same expression as body height — gives a
   * perfect square once the col is stretched vertically by the flex body. */
  width: min(720px, calc(100dvh - 580px));
}

.rpgc.is-big-map .rpgc__map-container {
  width: 100%;
  height: 100%;
}

.rpgc.is-big-map .rpgc__checklist {
  overflow-y: auto;
  scrollbar-width: thin;
  min-height: 0;
  flex: 1;
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

/* Big-map mode: keep the map square — FFXIV maps are 2048×2048 — so the
 * markers don't squash and the player can locate quadrants at a glance. */
.rpgc.is-big-map .rpgc__map-container {
  aspect-ratio: 1 / 1;
}

.rpgc.is-big-map .rpgc__marker {
  width: 26px;
  height: 26px;
  font-size: 11px;
}

.rpgc.is-big-map .rpgc__marker--aeth {
  width: 24px;
  height: 24px;
  font-size: 14px;
}

/* Zoom + pan: the stage holds the image AND markers so they transform
 * together. Container clips the overflow when zoomed in. */
.rpgc__map-stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  will-change: transform;
}

.rpgc__map-container.is-zoomed {
  cursor: grab;
}

.rpgc__map-container.is-dragging {
  cursor: grabbing;
}

.rpgc__zoom-controls {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 4;
}

.rpgc__zoom-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--app-surface) 92%, transparent);
  color: var(--app-text);
  border-radius: 6px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: background-color 0.12s ease-out;
}

.rpgc__zoom-btn:hover:not(:disabled) {
  background: var(--app-surface);
}

.rpgc__zoom-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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

/* Checked row: dim + strikethrough, matching the Batch TodoList style.
 * No tint background — it read as "this row is selected/active" rather
 * than "this row is done", which is the opposite of the intended
 * affordance. Lower opacity + line-through tells the user "out of the
 * way, finished" without competing visually with the still-open rows. */
.rpgc__row.is-checked {
  opacity: 0.55;
}

.rpgc__row.is-checked .rpgc__row-name,
.rpgc__row.is-checked .rpgc__row-meta,
.rpgc__row.is-checked .rpgc__item-name,
.rpgc__row.is-checked .rpgc__src-name,
.rpgc__row.is-checked .rpgc__src-meta {
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

/* ── Item block (left) — what to buy ───────────────────────────────────── */
.rpgc__item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.rpgc__item-icon {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  flex-shrink: 0;
}

.rpgc__item-text {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.rpgc__item-name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--app-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.1s ease-out;
}

.rpgc__item-qty {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-muted);
  flex-shrink: 0;
}

/* ── Source block (right) — where to get it ───────────────────────────── */
.rpgc__src {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  text-align: right;
}

.rpgc__src-mode {
  font-size: 14px;
  flex-shrink: 0;
  font-family: 'Apple Symbols', 'Segoe UI Symbol', 'Noto Sans Symbols 2', 'Symbola', ui-monospace, monospace;
  color: var(--app-text-muted);
}

.rpgc__src-text {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 0;
}

.rpgc__src-name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--app-text);
  white-space: nowrap;
  transition: color 0.1s ease-out;
}

.rpgc__src-meta {
  font-size: 11px;
  color: var(--app-text-muted);
  font-family: 'Fira Code', ui-monospace, monospace;
  letter-spacing: 0.02em;
  transition: color 0.1s ease-out;
  white-space: nowrap;
}

.rpgc__src-price {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text);
  flex-shrink: 0;
  font-family: 'Fira Code', ui-monospace, monospace;
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

/* -----------------------------------------------------------------------
   Next-stop hint — the timeline connector. The arrow + zone name lives
   inside the card so the visual continuity (one card → next card) reads
   without needing a separate connector element between cards.
----------------------------------------------------------------------- */
.rpgc__next {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-top: 1px dashed var(--app-border);
  background: color-mix(in srgb, var(--app-craft-dim) 10%, transparent);
  font-size: 12px;
  color: var(--app-text-muted);
}

.rpgc__next-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-craft) 20%, transparent);
  color: var(--app-craft);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
}

.rpgc__next-label {
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.rpgc__next-name {
  font-weight: 600;
  color: var(--app-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rpgc__next--last {
  justify-content: center;
  background: transparent;
  border-top-style: solid;
  padding: 12px 14px;
}

.rpgc__finish {
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
  font-size: 16px;
  color: var(--app-toast-gold, oklch(0.78 0.14 78));
  letter-spacing: 0.04em;
}
</style>

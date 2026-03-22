<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { GatheringNode } from '@/api/garland'
import { convertToPixel } from '@/utils/map-coords'

const props = withDefaults(defineProps<{
  node: GatheringNode
  interactive?: boolean
  nearbyNodes?: GatheringNode[]
  statusColor: string
}>(), {
  nearbyNodes: () => [],
})

// ---------------------------------------------------------------------------
// Mode detection
// ---------------------------------------------------------------------------
const isInteractive = computed(() => {
  if (props.interactive !== undefined) return props.interactive
  return window.matchMedia('(min-width: 768px)').matches
})

// ---------------------------------------------------------------------------
// Map image URL
// ---------------------------------------------------------------------------
const mapUrl = computed(() =>
  props.node.mapId !== 0
    ? `https://beta.xivapi.com/api/1/asset/map/${props.node.mapId}?format=png`
    : '',
)

const mapLoaded = ref(false)
const mapError = ref(false)

function onMapLoad() { mapLoaded.value = true }
function onMapError() { mapError.value = true }

// ---------------------------------------------------------------------------
// Pixel coordinate helpers
// Raw map images from XIVAPI are 2048×2048. The rawCoords are already in
// pixel space on that canvas (populated by the Garland API layer).
// When coords are 0,0 we fall back to centre (1024,1024).
// ---------------------------------------------------------------------------
const MAP_PX = 2048

function nodeToPx(n: GatheringNode): { px: number; py: number } {
  if (n.rawCoords.x === 0 && n.rawCoords.y === 0) {
    return { px: MAP_PX / 2, py: MAP_PX / 2 }
  }
  // rawCoords are already pixel positions on the 2048-map
  return { px: n.rawCoords.x, py: n.rawCoords.y }
}

// ---------------------------------------------------------------------------
// Interactive mode — pan + zoom
// ---------------------------------------------------------------------------
const zoom = ref(1.0)
const MIN_ZOOM = 0.4
const MAX_ZOOM = 2.0
const ZOOM_STEP = 0.2

// panOffset: translate applied so the node marker stays near center initially
const panX = ref(0)
const panY = ref(0)

// Container size (set on mount, fallback 100% / 260px)
const containerW = ref(400)
const containerH = ref(260)
const containerRef = ref<HTMLElement | null>(null)

onMounted(() => {
  if (containerRef.value) {
    containerW.value = containerRef.value.clientWidth || 400
    containerH.value = containerRef.value.clientHeight || 260
    // Centre on node
    const { px, py } = nodeToPx(props.node)
    panX.value = containerW.value / 2 - px * zoom.value
    panY.value = containerH.value / 2 - py * zoom.value
  }
})

// Drag state
const dragging = ref(false)
const dragStart = ref({ x: 0, y: 0, panX: 0, panY: 0 })

function onMousedown(e: MouseEvent) {
  dragging.value = true
  dragStart.value = { x: e.clientX, y: e.clientY, panX: panX.value, panY: panY.value }
}

function onMousemove(e: MouseEvent) {
  if (!dragging.value) return
  panX.value = dragStart.value.panX + (e.clientX - dragStart.value.x)
  panY.value = dragStart.value.panY + (e.clientY - dragStart.value.y)
}

function onMouseup() {
  dragging.value = false
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
  const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value + delta))
  // Zoom toward cursor position
  const rect = containerRef.value?.getBoundingClientRect()
  if (rect) {
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    panX.value = mx - (mx - panX.value) * (newZoom / zoom.value)
    panY.value = my - (my - panY.value) * (newZoom / zoom.value)
  }
  zoom.value = newZoom
}

function zoomIn() {
  const newZoom = Math.min(MAX_ZOOM, zoom.value + ZOOM_STEP)
  // Zoom toward center
  const cx = containerW.value / 2
  const cy = containerH.value / 2
  panX.value = cx - (cx - panX.value) * (newZoom / zoom.value)
  panY.value = cy - (cy - panY.value) * (newZoom / zoom.value)
  zoom.value = newZoom
}

function zoomOut() {
  const newZoom = Math.max(MIN_ZOOM, zoom.value - ZOOM_STEP)
  const cx = containerW.value / 2
  const cy = containerH.value / 2
  panX.value = cx - (cx - panX.value) * (newZoom / zoom.value)
  panY.value = cy - (cy - panY.value) * (newZoom / zoom.value)
  zoom.value = newZoom
}

// Cleanup listeners attached to window
onUnmounted(() => {
  window.removeEventListener('mousemove', onMousemove)
  window.removeEventListener('mouseup', onMouseup)
})

function attachWindowListeners() {
  window.addEventListener('mousemove', onMousemove)
  window.addEventListener('mouseup', onMouseup)
}

// Transform for the inner wrapper
const innerTransform = computed(
  () => `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
)

// Marker positions in pixel space (relative to image at native size)
const mainMarkerPx = computed(() => nodeToPx(props.node))

const nearbyMarkers = computed(() =>
  (props.nearbyNodes ?? [])
    .filter((n) => n.id !== props.node.id)
    .map((n) => ({ ...nodeToPx(n), id: n.id })),
)

// ---------------------------------------------------------------------------
// Static (mobile) mode — object-position crop
// ---------------------------------------------------------------------------
const STATIC_SIZE = 200  // container px

const staticObjectPosition = computed(() => {
  if (props.node.mapId === 0) return 'center center'
  const { px, py } = nodeToPx(props.node)
  // The image natural size is MAP_PX × MAP_PX; we display it at STATIC_SIZE
  // object-position: x% y% where 0% = left/top edge at center, 100% = right/bottom at center
  const xPct = (px / MAP_PX) * 100
  const yPct = (py / MAP_PX) * 100
  return `${xPct.toFixed(1)}% ${yPct.toFixed(1)}%`
})

// ---------------------------------------------------------------------------
// Coord label
// ---------------------------------------------------------------------------
const coordsLabel = computed(() => {
  const { x, y } = props.node.coords
  if (x === 0 && y === 0) return ''
  return `(${x.toFixed(1)}, ${y.toFixed(1)})`
})
</script>

<template>
  <!-- No mapId: show skeleton -->
  <div v-if="node.mapId === 0" class="minimap-skeleton">
    <span class="skeleton-text">地圖載入中...</span>
  </div>

  <!-- Interactive (desktop) -->
  <div
    v-else-if="isInteractive"
    ref="containerRef"
    class="minimap-interactive"
    :class="{ dragging }"
    @mousedown="(e) => { onMousedown(e); attachWindowListeners() }"
    @wheel.prevent="onWheel"
  >
    <!-- Inner pan/zoom wrapper, transform-origin: top-left -->
    <div class="minimap-inner" :style="{ transform: innerTransform, transformOrigin: '0 0' }">
      <img
        :src="mapUrl"
        class="minimap-img"
        draggable="false"
        :style="{ width: `${MAP_PX}px`, height: `${MAP_PX}px` }"
        @load="onMapLoad"
        @error="onMapError"
      />

      <!-- Nearby node markers (dimmed) -->
      <div
        v-for="m in nearbyMarkers"
        :key="m.id"
        class="marker marker-nearby"
        :style="{ left: `${m.px}px`, top: `${m.py}px` }"
      />

      <!-- Main node marker -->
      <div
        class="marker marker-main"
        :style="{
          left: `${mainMarkerPx.px}px`,
          top: `${mainMarkerPx.py}px`,
          '--marker-color': statusColor,
        }"
      />
    </div>

    <!-- Overlays (outside the pan/zoom wrapper so they stay fixed) -->
    <div class="overlay overlay-topleft">{{ node.zone }}</div>
    <div v-if="coordsLabel" class="overlay overlay-bottomright">{{ coordsLabel }}</div>

    <!-- Zoom buttons -->
    <div class="zoom-controls">
      <button class="zoom-btn" title="Zoom in" @click.stop="zoomIn">+</button>
      <button class="zoom-btn" title="Zoom out" @click.stop="zoomOut">−</button>
    </div>

    <!-- Loading / error states -->
    <div v-if="!mapLoaded && !mapError" class="minimap-loading">地圖載入中...</div>
    <div v-if="mapError" class="minimap-loading">地圖載入失敗</div>
  </div>

  <!-- Static (mobile) -->
  <div v-else class="minimap-static">
    <img
      :src="mapUrl"
      class="minimap-static-img"
      draggable="false"
      :style="{ objectPosition: staticObjectPosition }"
      @load="onMapLoad"
      @error="onMapError"
    />
    <div class="overlay overlay-topleft">{{ node.zone }}</div>
    <div v-if="coordsLabel" class="overlay overlay-bottomright">{{ coordsLabel }}</div>
    <div v-if="!mapLoaded && !mapError" class="minimap-loading">地圖載入中...</div>
  </div>
</template>

<style scoped>
/* ------------------------------------------------------------------ */
/* Skeleton                                                             */
/* ------------------------------------------------------------------ */
.minimap-skeleton {
  width: 100%;
  height: 80px;
  background: rgba(148, 163, 184, 0.08);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.skeleton-text {
  font-size: 12px;
  color: var(--app-text-muted, #94A3B8);
  opacity: 0.6;
}

/* ------------------------------------------------------------------ */
/* Interactive (desktop)                                                */
/* ------------------------------------------------------------------ */
.minimap-interactive {
  position: relative;
  width: 100%;
  height: 260px;
  overflow: hidden;
  background: #0a0e1a;
  border-radius: 6px;
  cursor: grab;
  user-select: none;
}

.minimap-interactive.dragging {
  cursor: grabbing;
}

.minimap-inner {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}

.minimap-img {
  display: block;
  image-rendering: auto;
}

/* ------------------------------------------------------------------ */
/* Markers                                                              */
/* ------------------------------------------------------------------ */
.marker {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  pointer-events: none;
}

.marker-main {
  width: 14px;
  height: 14px;
  background-color: var(--marker-color, #4ADE80);
  box-shadow: 0 0 8px var(--marker-color, #4ADE80);
  border: 2px solid rgba(255,255,255,0.9);
  z-index: 2;
}

.marker-nearby {
  width: 8px;
  height: 8px;
  background-color: rgba(148, 163, 184, 0.5);
  border: 1px solid rgba(255,255,255,0.3);
  z-index: 1;
}

/* ------------------------------------------------------------------ */
/* Overlays                                                             */
/* ------------------------------------------------------------------ */
.overlay {
  position: absolute;
  z-index: 10;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
  padding: 2px 6px;
  border-radius: 4px;
  pointer-events: none;
  white-space: nowrap;
}

.overlay-topleft {
  top: 6px;
  left: 6px;
}

.overlay-bottomright {
  bottom: 6px;
  right: 6px;
}

/* ------------------------------------------------------------------ */
/* Zoom controls                                                        */
/* ------------------------------------------------------------------ */
.zoom-controls {
  position: absolute;
  bottom: 6px;
  left: 6px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.zoom-btn {
  width: 24px;
  height: 24px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.15s;
}

.zoom-btn:hover {
  background: rgba(74, 222, 128, 0.25);
}

/* ------------------------------------------------------------------ */
/* Loading overlay                                                      */
/* ------------------------------------------------------------------ */
.minimap-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--app-text-muted, #94A3B8);
  background: rgba(10, 14, 26, 0.7);
  z-index: 20;
  pointer-events: none;
}

/* ------------------------------------------------------------------ */
/* Static (mobile)                                                      */
/* ------------------------------------------------------------------ */
.minimap-static {
  position: relative;
  width: 200px;
  height: 200px;
  overflow: hidden;
  border-radius: 6px;
  background: #0a0e1a;
}

.minimap-static-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>

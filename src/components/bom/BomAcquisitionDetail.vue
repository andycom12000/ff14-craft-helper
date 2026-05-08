<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElSkeleton } from 'element-plus'
import { useBomStore } from '@/stores/bom'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { getZoneMetaSync } from '@/services/zone-meta'
import { convertToPixel, pixelToPercent } from '@/utils/map-coords'

// ---------------------------------------------------------------------------
// Props / Emits
// ---------------------------------------------------------------------------

const props = defineProps<{
  itemId: number
  mode: 'npc' | 'gather'
}>()

const emit = defineEmits<{
  'open-map-sheet': [zoneId: number, coords: { x: number; y: number }]
}>()

// ---------------------------------------------------------------------------
// Store + media query
// ---------------------------------------------------------------------------

const bomStore = useBomStore()
const isPhone = useMediaQuery('(max-width: 767px)')

// ---------------------------------------------------------------------------
// Aetheryte data (lazy-loaded, module-level cache)
// ---------------------------------------------------------------------------

interface AetheryteEntry {
  name: string
  tpCostBase: number
}

interface AetherytesData {
  schema?: number
  zones: Record<string, { zoneName?: string; aetherytes: AetheryteEntry[] }>
}

let _aetherytesCache: AetherytesData | null = null

async function loadAetherytes(): Promise<AetherytesData> {
  if (_aetherytesCache) return _aetherytesCache
  const resp = await fetch(`${import.meta.env.BASE_URL}data/aetherytes.json`)
  _aetherytesCache = (await resp.json()) as AetherytesData
  return _aetherytesCache
}

const aetherytesData = ref<AetherytesData | null>(null)

// ---------------------------------------------------------------------------
// Fetch state
// ---------------------------------------------------------------------------

const isFetching = ref(false)
const hasFetched = ref(false)

async function fetchLocations() {
  if (hasFetched.value) return
  isFetching.value = true
  try {
    await Promise.all([
      bomStore.fetchItemLocationsForRoute([props.itemId]),
      loadAetherytes().then((data) => {
        aetherytesData.value = data
      }),
    ])
  } finally {
    isFetching.value = false
    hasFetched.value = true
  }
}

onMounted(() => {
  void fetchLocations()
})

// ---------------------------------------------------------------------------
// Locations (reactive from store)
// ---------------------------------------------------------------------------

const locations = computed(() => bomStore.itemLocations.get(props.itemId) ?? null)

// Discriminated union for typed template access
type DisplaySource =
  | { kind: 'npc'; npcId: number; zoneId: number; x: number; y: number; price?: number }
  | { kind: 'gather'; nodeId: number; type: 'MIN' | 'BTN' | 'FSH'; level: number; zoneId: number; x: number; y: number }

const displaySources = computed<DisplaySource[]>(() => {
  if (!locations.value) return []
  if (props.mode === 'npc') {
    return [...locations.value.npcVendors]
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
      .map(v => ({ kind: 'npc' as const, ...v }))
  }
  return [...locations.value.gatherNodes]
    .sort((a, b) => a.level - b.level)
    .map(n => ({ kind: 'gather' as const, ...n }))
})

// Keep sortedSources as an alias for code that already uses it (markers, zone IDs)
const sortedSources = displaySources

const hasSources = computed(() => displaySources.value.length > 0)

const isEmpty = computed(
  () => hasFetched.value && !isFetching.value && !hasSources.value,
)

// ---------------------------------------------------------------------------
// Gather type label
// ---------------------------------------------------------------------------

function gatherTypeLabel(type: 'MIN' | 'BTN' | 'FSH'): string {
  if (type === 'MIN') return '金'
  if (type === 'BTN') return '栽'
  return '魚'
}

// ---------------------------------------------------------------------------
// NPC name resolution — one computed per source is not ergonomic with a list.
// Instead we use a helper that calls the composable internals directly.
// Since useNpcName takes a MaybeRefOrGetter, we can call it in computed with a plain number.
// ---------------------------------------------------------------------------

import { useLocaleStore } from '@/stores/locale'
import { getNpcNameSync } from '@/services/zone-meta'
import type { Locale } from '@/services/zone-meta'

const localeStore = useLocaleStore()

function resolveNpcName(npcId: number): string {
  const locale = localeStore.current as Locale
  return getNpcNameSync(npcId, locale) ?? getNpcNameSync(npcId, 'en') ?? `#npc:${npcId}`
}

function resolveZoneName(zoneId: number): string {
  const locale = localeStore.current as Locale
  const meta = getZoneMetaSync(zoneId)
  return meta?.zoneNameByLocale.get(locale) ?? meta?.zoneNameByLocale.get('en') ?? `#zone:${zoneId}`
}

// ---------------------------------------------------------------------------
// Aetheryte chip helpers
// ---------------------------------------------------------------------------

function getFirstAetheryte(zoneId: number): AetheryteEntry | null {
  if (!aetherytesData.value) return null
  const zoneEntry = aetherytesData.value.zones[String(zoneId)]
  if (!zoneEntry || !zoneEntry.aetherytes.length) return null
  return zoneEntry.aetherytes[0]
}

async function copyTp(aetheryteName: string) {
  try {
    await navigator.clipboard.writeText(`/tp ${aetheryteName}`)
    ElMessage({ message: `已複製：/tp ${aetheryteName}`, type: 'success', duration: 2000 })
  } catch {
    ElMessage({ message: '複製失敗', type: 'error', duration: 2000 })
  }
}

// ---------------------------------------------------------------------------
// Map — zone chips + active zone
// ---------------------------------------------------------------------------

const activeZoneId = ref<number | null>(null)

// All unique zone IDs from sources
const sourceZoneIds = computed((): number[] => {
  const seen = new Set<number>()
  for (const src of sortedSources.value) {
    seen.add(src.zoneId)
  }
  return [...seen]
})

// Auto-select the first zone that has a map asset
watch(
  sourceZoneIds,
  (ids) => {
    if (activeZoneId.value !== null) return
    for (const id of ids) {
      const meta = getZoneMetaSync(id)
      if (meta?.mapAssetUrl) {
        activeZoneId.value = id
        return
      }
    }
    if (ids.length > 0) activeZoneId.value = ids[0]
  },
  { immediate: true },
)

const activeZoneMeta = computed(() =>
  activeZoneId.value !== null ? getZoneMetaSync(activeZoneId.value) : null,
)

// xivapi v1 serves map assets via the asset proxy with ?format=png. The legacy
// xivapi.com host blocks CORS for these textures; beta.xivapi.com does not.
const XIVAPI_ASSET_BASE = 'https://beta.xivapi.com/api/1/asset/'

const mapImageUrl = computed(() => {
  const url = activeZoneMeta.value?.mapAssetUrl
  if (!url) return null
  return `${XIVAPI_ASSET_BASE}${url}?format=png`
})

const hasMap = computed(() => !!mapImageUrl.value)

// ---------------------------------------------------------------------------
// Map markers
// ---------------------------------------------------------------------------

interface Marker {
  left: string
  top: string
  isPrimary: boolean
  isGather: boolean
  label: string
}

const activeZoneMarkers = computed((): Marker[] => {
  if (activeZoneId.value === null) return []
  const meta = getZoneMetaSync(activeZoneId.value)
  const sizeFactor = meta?.sizeFactor ?? 100

  return sortedSources.value
    .filter((src) => src.zoneId === activeZoneId.value)
    .map((src, idx) => {
      const { px, py } = convertToPixel({
        rawX: src.x,
        rawY: src.y,
        offsetX: 0,
        offsetY: 0,
        sizeFactor,
      })
      const { left, top } = pixelToPercent(px, py)
      return {
        left,
        top,
        isPrimary: idx === 0 && activeZoneId.value === displaySources.value[0]?.zoneId,
        isGather: props.mode === 'gather',
        label:
          src.kind === 'npc'
            ? resolveNpcName(src.npcId)
            : `Lv${src.level}`,
      }
    })
})

// ---------------------------------------------------------------------------
// Pre-computed aetheryte per displayed source (Fix 3: hoist template calls)
// ---------------------------------------------------------------------------

const sourceAetherytes = computed((): (AetheryteEntry | null)[] =>
  displaySources.value.map(src => getFirstAetheryte(src.zoneId)),
)

// ---------------------------------------------------------------------------
// Phone: open map sheet
// ---------------------------------------------------------------------------

function openMapSheet(src: { zoneId: number; x: number; y: number }) {
  emit('open-map-sheet', src.zoneId, { x: src.x, y: src.y })
}
</script>

<template>
  <div class="bad" data-bom-acquisition-detail>
    <!-- Loading skeleton -->
    <div v-if="isFetching" class="bad__skeleton">
      <el-skeleton :rows="3" animated />
    </div>

    <!-- Empty state -->
    <div v-else-if="isEmpty" class="bad__empty">
      <span class="bad__empty-text">查無位置資料</span>
    </div>

    <!-- Main content -->
    <template v-else-if="hasSources">
      <!-- Map block first (was below the source list; user prefers it on top
           so the spatial context lands before the textual one). -->
      <div
        v-if="!isPhone && hasMap"
        class="bad__map-block"
        data-map-canvas
      >
        <!-- Map container first; zone-selector chips below (was above —
             user prefers the spatial picture to land before the controls). -->
        <div class="bad__map-container">
          <img
            :src="mapImageUrl!"
            :alt="`${resolveZoneName(activeZoneId!)} 地圖`"
            class="bad__map-img"
            loading="lazy"
            decoding="async"
            @error="(e) => { (e.target as HTMLImageElement).style.display = 'none' }"
          />

          <!-- Markers -->
          <div
            v-for="(marker, i) in activeZoneMarkers"
            :key="i"
            class="bad-marker"
            :class="{
              'gather': marker.isGather,
              'is-primary': marker.isPrimary,
            }"
            :style="{ left: marker.left, top: marker.top }"
            :title="marker.label"
            aria-hidden="true"
          />
        </div>

        <!-- Zone chips (when multiple zones) -->
        <div v-if="sourceZoneIds.length > 1" class="bad__zone-chips">
          <button
            v-for="zid in sourceZoneIds"
            :key="zid"
            type="button"
            class="bad__zone-chip"
            :class="{ 'is-active': zid === activeZoneId }"
            :aria-pressed="activeZoneId === zid"
            @click="activeZoneId = zid"
          >{{ resolveZoneName(zid) }}</button>
        </div>
      </div>

      <!-- Source list -->
      <div class="bad__sources">
        <div
          v-for="(src, idx) in displaySources"
          :key="src.kind === 'npc' ? src.npcId : src.nodeId"
          class="bad__source-row"
          :class="{ 'is-primary': idx === 0 }"
          data-source-row
        >
          <!-- Mode icon -->
          <span class="bad__src-icon" aria-hidden="true">{{ mode === 'npc' ? '⛟' : '⛏' }}</span>

          <!-- Name → 地點 → X,Y, one per line -->
          <div class="bad__src-info">
            <span class="bad__src-name">
              <template v-if="src.kind === 'npc'">
                {{ resolveNpcName(src.npcId) }}
              </template>
              <template v-else>
                Lv{{ src.level }} 採{{ gatherTypeLabel(src.type) }}點
              </template>
            </span>
            <span class="bad__src-zone">{{ resolveZoneName(src.zoneId) }}</span>
            <span class="bad__src-coords">
              X:{{ src.x.toFixed(1) }} &nbsp;Y:{{ src.y.toFixed(1) }}
            </span>

            <!-- Aetheryte chip (pre-computed, no repeated calls) -->
            <span
              v-if="sourceAetherytes[idx]"
              class="bad__src-aeth"
            >
              <span class="bad__aeth-label">
                <span aria-hidden="true">◉</span> {{ sourceAetherytes[idx]!.name }}
                {{ sourceAetherytes[idx]!.tpCostBase }}G
              </span>
              <button
                type="button"
                class="bad__tp-btn"
                :aria-label="`複製傳送指令到 ${sourceAetherytes[idx]!.name}`"
                @click.stop="copyTp(sourceAetherytes[idx]!.name)"
              >⎘ /tp</button>
            </span>
          </div>

          <!-- Phone: map button -->
          <button
            v-if="isPhone"
            type="button"
            class="bad__map-btn"
            data-map-button
            :aria-label="`查看 ${resolveZoneName(src.zoneId)} 地圖`"
            @click.stop="openMapSheet(src)"
          ><span aria-hidden="true">⊞</span> 地圖</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* -----------------------------------------------------------------------
   Container
----------------------------------------------------------------------- */
.bad {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0 14px;
  border-top: 1px dashed var(--app-border);
}



/* -----------------------------------------------------------------------
   Skeleton / empty
----------------------------------------------------------------------- */
.bad__skeleton {
  padding: 0 14px;
}

.bad__empty {
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bad__empty-text {
  font-size: 13px;
  color: var(--app-text-muted);
  font-family: 'Fira Code', ui-monospace, monospace;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--app-craft) 70%, var(--app-text-muted));
}

/* -----------------------------------------------------------------------
   Source list
----------------------------------------------------------------------- */
.bad__sources {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.bad__source-row {
  display: flex;
  align-items: flex-start;
  /* Tighter icon ↔ info gap so the text block sits ~5px further left,
   * reclaiming row width for the new 3-line stack (name / zone / coords). */
  gap: 5px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
  transition: background-color 0.12s ease-out;
}

.bad__source-row:last-child {
  border-bottom: none;
}

.bad__source-row.is-primary {
  background: color-mix(in srgb, var(--app-craft-dim) 20%, var(--app-cream-surface, var(--app-surface)));
}

.bad__src-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-craft) 12%, transparent);
  color: var(--app-craft);
  font-size: 13px;
  font-family: 'Apple Symbols', 'Segoe UI Symbol', 'Noto Sans Symbols 2', 'Symbola', ui-monospace, monospace;
  flex-shrink: 0;
  margin-top: 1px;
}

.bad__src-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.bad__src-name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--app-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bad__src-loc {
  font-size: 12px;
  color: var(--app-text-muted);
  font-family: 'Fira Code', ui-monospace, monospace;
  letter-spacing: 0.02em;
}

/* Zone name on its own line — sans-serif, slightly muted. */
.bad__src-zone {
  font-size: 12px;
  color: var(--app-text-muted);
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Coordinates on their own line — mono so X/Y digits column-align across
 * cards. Slightly more muted than zone name to reinforce the hierarchy. */
.bad__src-coords {
  font-size: 11.5px;
  color: var(--app-text-muted);
  font-family: 'Fira Code', ui-monospace, monospace;
  letter-spacing: 0.04em;
  opacity: 0.8;
}

.bad__src-aeth {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bad__aeth-label {
  font-size: 12px;
  color: var(--app-text-muted);
}

.bad__tp-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--app-craft) 35%, transparent);
  background: color-mix(in srgb, var(--app-craft) 8%, transparent);
  color: var(--app-craft);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.12s ease-out;
  font-family: 'Fira Code', ui-monospace, monospace;
  letter-spacing: 0.02em;
}

.bad__tp-btn:hover {
  background: color-mix(in srgb, var(--app-craft) 18%, transparent);
}

.bad__tp-btn:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
}

/* Phone: map button */
.bad__map-btn {
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
  align-self: flex-start;
  margin-top: 2px;
  transition: background-color 0.12s ease-out;
}

.bad__map-btn:hover {
  background: var(--app-surface-hover);
  color: var(--app-text);
}

.bad__map-btn:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
}

/* -----------------------------------------------------------------------
   Map block
----------------------------------------------------------------------- */
.bad__map-block {
  padding: 0 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bad__zone-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bad__zone-chip {
  padding: 3px 10px;
  border: 1px solid var(--app-border);
  background: var(--app-bg);
  color: var(--app-text-muted);
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.12s ease-out, color 0.12s ease-out;
}

.bad__zone-chip:hover {
  background: var(--app-surface-hover);
  color: var(--app-text);
}

.bad__zone-chip.is-active {
  background: var(--app-craft);
  color: var(--app-cream-surface, #faf7f2);
  border-color: var(--app-craft);
}

.bad__zone-chip:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
}

.bad__map-container {
  position: relative;
  aspect-ratio: 16 / 11;
  /* Was 320px — bumped 15% so the spatial layout reads at a glance instead
   * of forcing the user to lean in. */
  max-width: 368px;
  width: 100%;
  background: var(--app-cream-emphasis, var(--app-cream-surface, var(--app-surface)));
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--app-border);
}

.bad__map-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* -----------------------------------------------------------------------
   Markers (Jam-Jar Rule: cocoa-only, no strawberry/matcha)
   NPC  = cocoa filled circle + cream border
   Gather = cocoa outlined circle (cream fill + cocoa border)
   Primary = toast-gold outline ring (Sunlight Spotlight Rule)
----------------------------------------------------------------------- */
.bad-marker {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: var(--app-craft);
  border: 2px solid var(--app-cream-surface, #faf7f2);
  box-shadow: 0 2px 5px oklch(0.28 0.04 55 / 0.3);
  pointer-events: none;
}

.bad-marker.gather {
  background: var(--app-cream-surface, #faf7f2);
  border-color: var(--app-craft);
}

.bad-marker.is-primary {
  outline: 2px solid var(--app-toast-gold);
  outline-offset: 2px;
}

/* Desktop: minimap + zone chips pinned on the left, sources flow on the
 * right as a 2-column grid. The map provides spatial context once; the
 * right column devotes the rest of the row to the actual to-do list.
 * Media query lives at the bottom of the stylesheet so it wins against
 * the base `.bad__sources { display: flex }` declaration above. */
@media (min-width: 768px) {
  .bad {
    flex-direction: row;
    align-items: flex-start;
    /* Map ↔ source-list gap matches the source grid's column gap (12px)
     * so the visual rhythm is even — sources sit one column-gap to the
     * right of the map instead of being pushed far away. */
    gap: 12px;
  }

  .bad__map-block {
    flex-shrink: 0;
    width: 368px;
  }

  .bad__sources {
    flex: 1;
    min-width: 0;
    display: grid;
    /* Fixed 2 columns per request — tall vendor lists wrap into two side-
     * by-side stacks instead of one long ladder. */
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 12px;
  }

  /* Inside the grid the row separators come from the grid gap; drop the
   * bottom border so adjacent cells don't get a double-line. Round the
   * corners so each cell reads as its own card. */
  .bad__source-row {
    border-bottom: none;
    border: 1px solid var(--app-border);
    border-radius: 8px;
  }
}
</style>

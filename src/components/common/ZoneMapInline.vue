<script setup lang="ts">
import { computed } from 'vue'
import { getZoneMetaSync } from '@/services/zone-meta'
import { useZoneName } from '@/composables/useZoneName'
import { convertToPixel, pixelToPercent } from '@/utils/map-coords'

/**
 * Renders a single zone map with an optional NPC/gather marker.
 * Used inline by VendorRoster (desktop) and by ZoneMapSheet (mobile drawer).
 *
 * No chrome: the host decides framing, header, actions. This component
 * just owns the map image + marker math.
 */
const props = defineProps<{
  zoneId: number | null
  highlightCoords?: { x: number; y: number } | null
}>()

const zoneName = useZoneName(() => props.zoneId ?? 0)
const meta = computed(() => (props.zoneId ? getZoneMetaSync(props.zoneId) : null))

const mapUrl = computed(() => {
  const m = meta.value
  if (!m?.mapAssetUrl) return ''
  return `https://beta.xivapi.com/api/1/asset/${m.mapAssetUrl}?format=png`
})

const markerStyle = computed(() => {
  if (!props.highlightCoords || !meta.value) return null
  const px = convertToPixel({
    rawX: props.highlightCoords.x,
    rawY: props.highlightCoords.y,
    offsetX: 0,
    offsetY: 0,
    sizeFactor: meta.value.sizeFactor,
  })
  return pixelToPercent(px.px, px.py)
})
</script>

<template>
  <div class="zm-canvas" data-testid="zone-map-canvas">
    <img
      v-if="mapUrl"
      :src="mapUrl"
      :alt="`${zoneName} 地圖`"
      loading="lazy"
      decoding="async"
      class="zm-bg"
    />
    <div
      v-if="markerStyle"
      class="zm-marker"
      :style="markerStyle"
      aria-hidden="true"
      data-testid="zone-map-marker"
    />
  </div>
</template>

<style scoped>
.zm-canvas {
  position: relative;
  aspect-ratio: 16 / 11;
  width: 100%;
  background: var(--app-cream-emphasis, var(--app-surface-2));
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--app-border);
}

.zm-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.zm-marker {
  position: absolute;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--app-craft);
  border: 3px solid var(--app-cream-surface, var(--app-surface));
  outline: 3px solid var(--accent-gold, var(--app-craft));
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 8px oklch(0.28 0.04 55 / 0.4);
}
</style>

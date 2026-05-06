<script setup lang="ts">
import { computed } from 'vue'
import { useZoneName } from '@/composables/useZoneName'
import { getZoneMetaSync } from '@/services/zone-meta'
import { convertToPixel, pixelToPercent } from '@/utils/map-coords'

const props = defineProps<{
  modelValue: boolean
  zoneId: number | null
  highlightCoords?: { x: number; y: number } | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const zoneName = useZoneName(() => props.zoneId ?? 0)
const meta = computed(() => (props.zoneId ? getZoneMetaSync(props.zoneId) : null))
const mapUrl = computed(() => {
  const m = meta.value
  if (!m?.mapAssetUrl) return ''
  return `https://xivapi.com/${m.mapAssetUrl}`
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
  <el-drawer
    :model-value="modelValue"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    direction="btt"
    size="80%"
    :with-header="false"
    :append-to-body="true"
    class="zms-drawer"
    :aria-label="`${zoneName} 地圖`"
  >
    <div class="zms" data-testid="zone-map-sheet">
      <div class="zms__handle" aria-hidden="true" />
      <div class="zms__head">
        <span class="zms__title">{{ zoneName }}</span>
      </div>
      <div class="zms__canvas" data-testid="zone-map-canvas">
        <img
          v-if="mapUrl"
          :src="mapUrl"
          :alt="`${zoneName} 地圖`"
          loading="lazy"
          decoding="async"
          class="zms__bg"
        />
        <div
          v-if="markerStyle"
          class="zms__marker"
          :style="markerStyle"
          aria-hidden="true"
          data-testid="zone-map-marker"
        />
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.zms {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  gap: 12px;
}

.zms__handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--app-border);
  margin: 4px auto 0;
}

.zms__head {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 0;
}

.zms__title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 17px;
  color: var(--app-text);
}

.zms__canvas {
  position: relative;
  flex: 1;
  min-height: 0;
  aspect-ratio: 16 / 11;
  width: 100%;
  max-height: 100%;
  background: var(--app-cream-emphasis);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--app-border);
}

.zms__bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.zms__marker {
  position: absolute;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--app-craft);
  border: 3px solid var(--app-cream-surface);
  outline: 3px solid var(--app-toast-gold);
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 8px oklch(0.28 0.04 55 / 0.4);
}
</style>

<style>
/* el-drawer is appended to body — scoped styles can't reach it */
.zms-drawer.el-drawer {
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  max-height: 88vh;
}

.zms-drawer .el-drawer__body {
  padding: 0 !important;
  display: flex;
  flex-direction: column;
}
</style>

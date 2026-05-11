<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useZoneName } from '@/composables/useZoneName'
import { getZoneMetaSync } from '@/services/zone-meta'
import { convertToPixel, pixelToPercent } from '@/utils/map-coords'
import { buildTpCommand } from '@/utils/ff14-map-link'

const props = defineProps<{
  modelValue: boolean
  zoneId: number | null
  highlightCoords?: { x: number; y: number } | null
  /**
   * Optional aetheryte name. When provided, the sheet header shows a
   * "complement /tp" action that copies `/tp <name>` to the clipboard.
   * Pass `null` or omit to hide the action (BOM consumers stay unchanged).
   */
  aetheryteName?: string | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const zoneName = useZoneName(() => props.zoneId ?? 0)
const meta = computed(() => (props.zoneId ? getZoneMetaSync(props.zoneId) : null))

async function copyTp() {
  if (!props.aetheryteName) return
  try {
    await navigator.clipboard.writeText(buildTpCommand(props.aetheryteName))
    ElMessage({ message: `已複製：/tp ${props.aetheryteName}`, type: 'success', duration: 1500 })
  } catch {
    ElMessage({ message: '複製失敗', type: 'error', duration: 1500 })
  }
}
const mapUrl = computed(() => {
  const m = meta.value
  if (!m?.mapAssetUrl) return ''
  // xivapi.com v1 stopped serving the raw .tex path; route through the beta
  // asset endpoint (same pattern used by NodeMinimap / icon-url).
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
        <button
          v-if="aetheryteName"
          type="button"
          class="zms__tp"
          :aria-label="`複製 /tp ${aetheryteName}`"
          @click="copyTp"
        >
          <span class="zms__tp-cmd">/tp</span>
          <span class="zms__tp-name">{{ aetheryteName }}</span>
        </button>
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
  gap: 14px;
  padding: 4px 0;
  position: relative;
}

.zms__title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 17px;
  color: var(--app-text);
}

.zms__tp {
  appearance: none;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 5px 10px 5px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklch, var(--accent-gold, var(--app-craft)) 35%, transparent);
  background: color-mix(in oklch, var(--accent-gold, var(--app-craft)) 8%, transparent);
  color: var(--accent-gold, var(--app-craft));
  cursor: pointer;
  transition: background 140ms cubic-bezier(0.165, 0.84, 0.44, 1),
              border-color 140ms cubic-bezier(0.165, 0.84, 0.44, 1);
}

.zms__tp:hover {
  background: color-mix(in oklch, var(--accent-gold, var(--app-craft)) 16%, transparent);
  border-color: color-mix(in oklch, var(--accent-gold, var(--app-craft)) 55%, transparent);
}

.zms__tp:focus-visible {
  outline: 2px solid var(--accent-gold, var(--app-craft));
  outline-offset: 2px;
}

.zms__tp-cmd {
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  opacity: 0.78;
}

.zms__tp-name {
  font-family: 'Noto Sans TC', sans-serif;
  font-size: 13px;
  font-weight: 500;
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

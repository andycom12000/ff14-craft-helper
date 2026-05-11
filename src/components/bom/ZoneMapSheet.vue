<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { useZoneName } from '@/composables/useZoneName'
import { buildTpCommand } from '@/utils/ff14-map-link'
import ZoneMapInline from '@/components/common/ZoneMapInline.vue'

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

async function copyTp() {
  if (!props.aetheryteName) return
  try {
    await navigator.clipboard.writeText(buildTpCommand(props.aetheryteName))
    ElMessage({ message: `已複製：/tp ${props.aetheryteName}`, type: 'success', duration: 1500 })
  } catch {
    ElMessage({ message: '複製失敗', type: 'error', duration: 1500 })
  }
}
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
      <ZoneMapInline
        class="zms__map"
        :zone-id="zoneId"
        :highlight-coords="highlightCoords"
      />
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

.zms__map {
  flex: 1;
  min-height: 0;
  max-height: 100%;
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

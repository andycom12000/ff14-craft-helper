<script setup lang="ts">
import { computed } from 'vue'
import { useBomStore } from '@/stores/bom'
import { useSettingsStore } from '@/stores/settings'
import { getPrice, type AcquisitionSource } from '@/stores/bom'
import ItemName from '@/components/common/ItemName.vue'
import GilDisplay from '@/components/common/GilDisplay.vue'

interface Props {
  itemId: number
  name: string
  icon: string
  amount: number
  /** True if this row corresponds to a node with a recipe (i.e. craftable). */
  isCraftable: boolean
  /** True if this row sits inside a drill-down panel (offset visuals). */
  nested?: boolean
  /** Hide the segmented control (used for target/finished-goods rows). */
  immutable?: boolean
}

const props = defineProps<Props>()
const bom = useBomStore()
const settings = useSettingsStore()

const mode = computed<AcquisitionSource>(() => bom.getEffectiveMode(props.itemId))

const availability = computed(() => bom.acquisitionAvailability.get(props.itemId))

// Until availability data lands, default to permissive (show every chip
// the item could possibly support) so the user never sees fewer options
// than reality. After the lookup, hide chips that don't apply.
const segments = computed(() => {
  const av = availability.value
  const out: { value: AcquisitionSource; label: string; icon: string }[] = []
  if (!av || av.canMarket) out.push({ value: 'market', label: '市場', icon: 'M' })
  if (props.isCraftable) out.push({ value: 'craft', label: '自製', icon: 'C' })
  if (!av || av.canGather) out.push({ value: 'gather', label: '自採', icon: 'G' })
  if (!av || av.canNpc) out.push({ value: 'npc', label: 'NPC', icon: 'N' })
  return out
})

const marketPrice = computed<number | null>(() => {
  const info = bom.prices.get(props.itemId)
  if (!info) return null
  const v = getPrice(info, settings.priceDisplayMode)
  return v > 0 ? v : null
})

const npcPrice = computed<number | null>(() => availability.value?.npcPrice ?? null)

const unitPrice = computed<number | null>(() => {
  if (mode.value === 'market') return marketPrice.value
  if (mode.value === 'npc') return npcPrice.value
  return null
})

const lineTotal = computed<number | null>(() => {
  if (mode.value === 'gather') return 0
  if (mode.value === 'craft') return null
  if (unitPrice.value === null) return null
  return unitPrice.value * props.amount
})

const unitDisplay = computed(() => {
  if (mode.value === 'gather' || mode.value === 'craft') return '—'
  return null
})

const totalDisplay = computed(() => {
  if (mode.value === 'gather') return '免費'
  if (mode.value === 'craft') return '—'
  return null
})

const isExpanded = computed(() => bom.isRowExpanded(props.itemId))
const isRowToggleable = computed(
  () => props.isCraftable && mode.value === 'craft' && !props.immutable,
)

function selectMode(m: AcquisitionSource) {
  if (props.immutable) return
  if (m === mode.value) return
  bom.setAcquisitionMode(props.itemId, m)
  if (m === 'craft' && !bom.isRowExpanded(props.itemId)) {
    bom.toggleRowExpanded(props.itemId)
  }
}

function onRowClick() {
  if (!isRowToggleable.value) return
  bom.toggleRowExpanded(props.itemId)
}
</script>

<template>
  <div
    class="dec-row"
    :class="{
      'is-nested': nested,
      'is-expanded': isExpanded,
      'is-row-toggleable': isRowToggleable,
    }"
    :role="isRowToggleable ? 'button' : undefined"
    :tabindex="isRowToggleable ? 0 : undefined"
    :aria-expanded="isRowToggleable ? isExpanded : undefined"
    :aria-label="isRowToggleable ? (isExpanded ? `收合 ${name} 子配方` : `展開 ${name} 子配方`) : undefined"
    @click="onRowClick"
    @keydown.enter.prevent="onRowClick"
    @keydown.space.prevent="onRowClick"
  >
    <img
      :src="icon"
      :alt="name"
      crossorigin="anonymous"
      loading="lazy"
      decoding="async"
      class="dec-row__icon"
    />

    <div class="dec-row__name">
      <ItemName :item-id="itemId" :fallback="name" />
    </div>

    <div class="dec-row__qty">×{{ amount }}</div>

    <div class="dec-row__filler" aria-hidden="true" />

    <div v-if="!immutable" class="dec-row__seg" role="group" aria-label="取得來源" @click.stop>
      <button
        v-for="s in segments"
        :key="s.value"
        type="button"
        class="dec-seg"
        :class="{
          'is-active': mode === s.value,
          'is-craft': s.value === 'craft' && mode === 'craft',
        }"
        :aria-pressed="mode === s.value"
        :data-mode="s.value"
        @click.stop="selectMode(s.value)"
      >
        <span class="dec-seg__icon" aria-hidden="true">{{ s.icon }}</span>
        <span class="dec-seg__label">{{ s.label }}</span>
      </button>
    </div>
    <div v-else class="dec-row__locked">
      <span class="dec-seg dec-seg--locked"><span class="dec-seg__icon">C</span><span class="dec-seg__label">自製</span></span>
    </div>

    <div class="dec-row__unit">
      <template v-if="unitDisplay">{{ unitDisplay }}</template>
      <GilDisplay v-else :value="unitPrice" />
    </div>

    <div class="dec-row__total">
      <template v-if="totalDisplay">{{ totalDisplay }}</template>
      <GilDisplay v-else :value="lineTotal" />
    </div>

    <span
      v-if="isRowToggleable"
      class="dec-row__chev"
      :class="{ 'is-open': isExpanded }"
      aria-hidden="true"
    >▾</span>
    <span v-else class="dec-row__chev dec-row__chev--placeholder" aria-hidden="true" />
  </div>
</template>

<style scoped>
.dec-row {
  display: grid;
  grid-template-columns:
    28px
    minmax(0, 320px)
    44px
    minmax(0, 1fr)
    260px
    96px
    104px
    24px;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--app-border);
  min-height: 56px;
  background: var(--app-surface);
  transition: background-color 0.15s var(--ease-out-quart, ease-out);
}

.dec-row:last-child {
  border-bottom: none;
}

.dec-row:hover {
  background: var(--app-surface-hover);
}

.dec-row.is-row-toggleable {
  cursor: pointer;
}

.dec-row.is-row-toggleable:hover {
  background: color-mix(in srgb, var(--app-craft-dim) 18%, var(--app-surface));
}

.dec-row.is-row-toggleable:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: -2px;
}

.dec-row.is-expanded {
  background: color-mix(in srgb, var(--app-craft-dim) 35%, var(--app-surface));
}

.dec-row.is-expanded.is-row-toggleable:hover {
  background: color-mix(in srgb, var(--app-craft-dim) 45%, var(--app-surface));
}

.dec-row.is-nested {
  background: color-mix(in srgb, var(--app-craft-dim) 12%, transparent);
  padding-left: 36px;
  min-height: 48px;
  font-size: 13.5px;
}

.dec-row__icon {
  width: 28px;
  height: 28px;
  border-radius: 4px;
}

.dec-row__name {
  font-size: 14.5px;
  font-weight: 500;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.dec-row.is-nested .dec-row__name {
  font-size: 13.5px;
}

.dec-row__qty {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 13px;
  color: var(--app-text-muted);
  white-space: nowrap;
}

.dec-row__seg {
  display: inline-flex;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  padding: 2px;
  background: var(--app-bg);
  gap: 1px;
  justify-self: center;
}

.dec-row__filler {
  /* Spacer column between qty and seg so name/qty cluster on the left while
   * seg/unit/total cluster on the right at wide viewports — without it,
   * minmax(0, 1fr) on name absorbs all slack and pushes qty far from name. */
}

.dec-seg {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 0;
  background: transparent;
  border-radius: 999px;
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color 0.15s var(--ease-out-quart, ease-out),
    color 0.15s var(--ease-out-quart, ease-out);
}

.dec-seg:hover:not(.is-active) {
  color: var(--app-text);
  background: var(--app-surface-hover);
}

.dec-seg.is-active {
  background: var(--app-text);
  color: var(--app-bg);
  box-shadow: 0 1px 3px oklch(0.28 0.04 55 / 0.20);
}

.dec-seg.is-active.is-craft {
  background: var(--app-craft);
  color: oklch(0.98 0.012 85);
  box-shadow: 0 1px 4px var(--app-craft-dim);
}

.dec-seg__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: color-mix(in srgb, currentColor 12%, transparent);
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0;
}

.dec-seg.is-active.is-craft .dec-seg__icon {
  background: oklch(0.98 0.012 85 / 0.18);
}

.dec-seg__label {
  letter-spacing: 0.02em;
}

.dec-seg--locked {
  background: var(--app-craft-dim);
  color: var(--app-craft);
  cursor: default;
  padding: 5px 10px;
}

.dec-row__locked {
  display: inline-flex;
  justify-self: center;
}

.dec-row__unit {
  text-align: right;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 13px;
  color: var(--app-text-muted);
}

.dec-row__total {
  text-align: right;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
}

.dec-row__chev {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--app-craft);
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  transition: transform 0.18s var(--ease-out-quart, ease-out);
  pointer-events: none;
}

.dec-row__chev.is-open {
  transform: rotate(180deg);
}

.dec-row__chev--placeholder {
  visibility: hidden;
}

.dec-seg:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}

@container (max-width: 720px) {
  .dec-row {
    grid-template-columns: 28px minmax(0, 1fr) 36px 28px;
    grid-template-areas:
      'icon name qty chev'
      'seg seg seg seg'
      'unit unit total total';
    row-gap: 8px;
    padding: 12px;
  }
  .dec-row__icon { grid-area: icon; }
  .dec-row__name { grid-area: name; }
  .dec-row__qty { grid-area: qty; text-align: right; }
  .dec-row__filler { display: none; }
  .dec-row__seg, .dec-row__locked { grid-area: seg; }
  .dec-row__unit { grid-area: unit; text-align: left; }
  .dec-row__total { grid-area: total; }
  .dec-row__chev { grid-area: chev; }
}
</style>

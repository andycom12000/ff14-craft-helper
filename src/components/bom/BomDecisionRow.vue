<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElSkeletonItem } from 'element-plus'
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

// Local picker-expansion override. When the user clicks the collapsed
// chip on a settled row, we show the full picker for one decision cycle;
// after they pick (or click the chip again), we collapse back. This is
// independent of `bom.expandedRows`, which controls the drill-down panel.
const pickerExpanded = ref(false)

// Re-collapse the picker whenever the user navigates away (the row
// re-renders with a different itemId via the v-for key, so this only
// applies to subsequent toggles within the same row instance).
watch(
  () => props.itemId,
  () => {
    pickerExpanded.value = false
  },
)

const isUserSettled = computed(() => bom.isModeUserSettled(props.itemId))
const showFullPicker = computed(
  () => !isUserSettled.value || pickerExpanded.value,
)

const mode = computed<AcquisitionSource>(() => bom.getEffectiveMode(props.itemId))

const availability = computed(() => bom.acquisitionAvailability.get(props.itemId))

// Until availability data lands, default to permissive (show every chip
// the item could possibly support) so the user never sees fewer options
// than reality. After the lookup, hide chips that don't apply.
const segments = computed(() => {
  const av = availability.value
  const out: { value: AcquisitionSource; label: string; icon: string }[] = []
  if (!av || av.canMarket) out.push({ value: 'market', label: '市場', icon: '⌖' })
  if (props.isCraftable) out.push({ value: 'craft', label: '自製', icon: '⚒' })
  if (!av || av.canGather) out.push({ value: 'gather', label: '自採', icon: '⛏' })
  if (!av || av.canNpc) out.push({ value: 'npc', label: 'NPC', icon: '⛟' })
  return out
})

const marketPrice = computed<number | null>(() => {
  const info = bom.prices.get(props.itemId)
  if (!info) return null
  const v = getPrice(info, settings.priceDisplayMode)
  return v > 0 ? v : null
})

const npcPrice = computed<number | null>(() => availability.value?.npcPrice ?? null)

const isTarget = computed(() => bom.targets.some((t) => t.itemId === props.itemId))
const showCrossWorld = computed(
  () =>
    isTarget.value &&
    mode.value === 'market' &&
    settings.crossServer,
)
const crossWorldEntry = computed(() => bom.crossWorldBestPriceMap.get(props.itemId))
const crossWorldStatus = computed(() => bom.crossWorldFetchStatus.get(props.itemId))
const crossWorldFetching = computed(() => bom.fetchingCrossWorldIds.has(props.itemId))
const isHomeServer = computed(
  () => crossWorldEntry.value?.worldName === settings.server,
)

const unitPrice = computed<number | null>(() => {
  if (showCrossWorld.value && crossWorldEntry.value) {
    return crossWorldEntry.value.minPrice
  }
  if (mode.value === 'market') return marketPrice.value
  if (mode.value === 'npc') return npcPrice.value
  return null
})

async function onRetryCrossWorld() {
  await bom.retryCrossWorldFetch(props.itemId)
}

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

const isPriceFailed = computed(
  () =>
    mode.value === 'market' &&
    bom.priceFetchStatus.get(props.itemId) === 'failed',
)
const isPriceRetrying = computed(() => bom.isPriceFetching(props.itemId))

async function retryPrice() {
  if (isPriceRetrying.value) return
  await bom.fetchPrices([props.itemId])
}

const isExpanded = computed(() => bom.isRowExpanded(props.itemId))
const isRowToggleable = computed(() => {
  if (props.immutable) return false
  if (mode.value === 'craft') return props.isCraftable
  // npc/gather drill = location detail; market drill = cross-world price table.
  return mode.value === 'npc' || mode.value === 'gather' || mode.value === 'market'
})

const emit = defineEmits<{
  // Auto-expand fired with no focus shift, so SR needs a polite poke.
  // Parent owns the live region — one queue, one announcement.
  'announce-expand': [{ modeLabel: string; itemName: string }]
}>()

function selectMode(m: AcquisitionSource) {
  if (props.immutable) return
  const isChanging = m !== mode.value
  // Always call setAcquisitionMode — on a no-op pick it still marks the
  // row settled, collapsing the picker back to a chip.
  bom.setAcquisitionMode(props.itemId, m)
  if (isChanging && isRowToggleable.value && !bom.isRowExpanded(props.itemId)) {
    bom.toggleRowExpanded(props.itemId)
    const label = segments.value.find((s) => s.value === m)?.label ?? m
    emit('announce-expand', { modeLabel: label, itemName: props.name })
  }
  pickerExpanded.value = false
}

function toggleCollapsedPicker(event: Event) {
  // Stop the click from bubbling to the row's drill-down toggle. The
  // chip lives inside `.dec-row__seg`, which already swallows clicks via
  // @click.stop on the wrapper, but we explicitly stop here too in case
  // the click hits the chip's edit icon directly.
  event.stopPropagation()
  pickerExpanded.value = !pickerExpanded.value
}

const activeSegment = computed(() => segments.value.find((s) => s.value === mode.value))

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
    :aria-label="isRowToggleable ? (isExpanded ? `收合 ${name} 詳細` : `展開 ${name} 詳細`) : undefined"
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
      <span
        v-if="showCrossWorld && crossWorldEntry"
        class="bdr__cross-pill"
        :class="{ 'is-home': isHomeServer }"
        data-testid="cross-world-pill"
      >
        {{ crossWorldEntry.worldName }}<small v-if="isHomeServer">你</small>
      </span>
      <span
        v-else-if="showCrossWorld && crossWorldStatus === 'failed'"
        class="bdr__cross-retry"
        role="button"
        tabindex="0"
        :aria-label="`重試跨服查價：${name}`"
        :aria-disabled="crossWorldFetching || undefined"
        data-testid="cross-world-retry"
        @click.stop="onRetryCrossWorld"
        @keydown.enter.stop="onRetryCrossWorld"
      >
        {{ crossWorldFetching ? '跨服查價中…' : '跨服查價失敗 重試' }}
      </span>
      <ElSkeletonItem
        v-else-if="showCrossWorld && crossWorldFetching"
        variant="text"
        class="bdr__cross-skel"
      />
      <span
        v-else-if="showCrossWorld && crossWorldStatus === 'ok' && !crossWorldEntry"
        class="bdr__cross-empty"
      >
        跨服無掛單
      </span>
    </div>

    <div class="dec-row__qty">×{{ amount }}</div>

    <div class="dec-row__filler" aria-hidden="true" />

    <div v-if="!immutable" class="dec-row__seg" role="group" aria-label="取得來源" @click.stop>
      <!-- Settled row, collapsed: show the active mode as a single chip
           with a small edit affordance. Click anywhere on it to expand
           the picker; clicking again (or picking a mode) collapses it. -->
      <button
        v-if="!showFullPicker && activeSegment"
        type="button"
        class="dec-seg dec-seg--collapsed is-active"
        :class="{ 'is-craft': mode === 'craft' }"
        :data-mode="mode"
        :aria-label="`${activeSegment.label} · 點擊更換`"
        :title="`${activeSegment.label} · 點擊更換`"
        @click.stop="toggleCollapsedPicker"
      >
        <span class="dec-seg__icon" aria-hidden="true">{{ activeSegment.icon }}</span>
        <span class="dec-seg__label">{{ activeSegment.label }}</span>
        <span class="dec-seg__edit" aria-hidden="true">✎</span>
      </button>

      <!-- Full picker: shown when the row is unsettled (auto-default not
           yet confirmed) or when the user just clicked the chip to edit. -->
      <template v-else>
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
      </template>
    </div>
    <div v-else class="dec-row__locked">
      <span class="dec-seg dec-seg--locked"><span class="dec-seg__icon">⚒</span><span class="dec-seg__label">自製</span></span>
    </div>

    <div class="dec-row__unit">
      <button
        v-if="isPriceFailed"
        type="button"
        class="dec-row__retry"
        :disabled="isPriceRetrying"
        :aria-label="`重試查價：${name}`"
        @click.stop="retryPrice"
      >{{ isPriceRetrying ? '查價中…' : '查價失敗 重試' }}</button>
      <template v-else-if="unitDisplay">{{ unitDisplay }}</template>
      <GilDisplay v-else :value="unitPrice" />
    </div>

    <div class="dec-row__total">
      <template v-if="isPriceFailed">—</template>
      <template v-else-if="totalDisplay">{{ totalDisplay }}</template>
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
  padding: 10px 4px;
  border-bottom: 1px solid var(--app-border);
  min-height: 56px;
  /* Transparent bg — the row is a list item, not a card. The panel
   * dropped its card chrome to avoid card-in-card; matching the row
   * here keeps the section reading as a flat editorial list. */
  background: transparent;
  transition: background-color 0.15s var(--ease-out-quart, ease-out);
}

.dec-row:last-child {
  border-bottom: none;
}

.dec-row:hover {
  background: color-mix(in srgb, var(--app-craft-dim) 8%, transparent);
}

.dec-row.is-row-toggleable {
  cursor: pointer;
}

.dec-row.is-row-toggleable:hover {
  background: color-mix(in srgb, var(--app-craft-dim) 14%, transparent);
}

.dec-row.is-row-toggleable:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: -2px;
}

.dec-row.is-expanded {
  background: color-mix(in srgb, var(--app-craft-dim) 22%, transparent);
}

.dec-row.is-expanded.is-row-toggleable:hover {
  background: color-mix(in srgb, var(--app-craft-dim) 30%, transparent);
}

.dec-row.is-nested {
  background: color-mix(in srgb, var(--app-craft-dim) 10%, transparent);
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
  /* Symbola / system emoji fonts render the geometric glyphs (⌖ ⚒ ⛏ ⛟)
   * cleanly across zh-TW / zh-CN / ja / en. Fall back to mono so the
   * letterform sticks if the system has no symbol font. */
  font-family: 'Apple Symbols', 'Segoe UI Symbol', 'Noto Sans Symbols 2',
    'Symbola', 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1;
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

/* Collapsed chip — the entire active mode rendered as a single
 * pseudo-pill with an edit pencil. Clicking it expands the picker.
 * Looks like an active segment plus a trailing ✎ that fades in on
 * hover/focus so the resting state stays clean. */
.dec-seg--collapsed {
  padding: 5px 10px 5px 12px;
  /* Slightly tighter gap between label + edit pencil than the standard
   * icon→label gap, so the pencil reads as an inline affordance, not a
   * separate token. */
  gap: 6px;
}

.dec-seg--collapsed:hover,
.dec-seg--collapsed:focus-visible {
  filter: brightness(1.08);
}

.dec-seg__edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1;
  /* Pad-left so the pencil sits flush-right of the label without a
   * gap reading as separation. */
  padding-left: 4px;
  border-left: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  opacity: 0.7;
  transition: opacity 0.12s var(--ease-out-quart, ease-out);
}

.dec-seg--collapsed:hover .dec-seg__edit,
.dec-seg--collapsed:focus-visible .dec-seg__edit {
  opacity: 1;
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

.dec-row__retry {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  border: 1px solid color-mix(in srgb, var(--app-warning, oklch(0.62 0.13 55)) 40%, transparent);
  background: color-mix(in srgb, var(--app-warning, oklch(0.62 0.13 55)) 8%, transparent);
  color: var(--app-warning, oklch(0.45 0.13 55));
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  padding: 3px 9px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s var(--ease-out-quart, ease-out);
}

.dec-row__retry:hover:not(:disabled) {
  background: color-mix(in srgb, var(--app-warning, oklch(0.62 0.13 55)) 18%, transparent);
}

.dec-row__retry:disabled {
  cursor: progress;
  opacity: 0.7;
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
  /* Post-1440 split (完成品 + 材料 二欄) lands each pane in this branch
   * even on a wide viewport. Layout reads as:
   *   row 1: [icon] [name] ······ [chev]
   *   row 2: [segmented control spans full width]
   *   row 3: [單價 ×N]    ············    [總價]
   * Unit and qty sit adjacent on the bottom-left so the user reads
   * "200 Gil ×4 = 800" naturally; no diagonal glance to a top-right
   * qty. Total anchors the bottom-right. */
  .dec-row {
    grid-template-columns: 28px auto auto 1fr auto 28px;
    grid-template-areas:
      'icon name name name name chev'
      'seg  seg  seg  seg  seg  seg'
      '.    unit qty  .    total .';
    column-gap: 6px;
    row-gap: 8px;
    padding: 12px;
  }
  .dec-row__icon { grid-area: icon; }
  .dec-row__name { grid-area: name; }
  .dec-row__qty {
    grid-area: qty;
    text-align: left;
    align-self: baseline;
    justify-self: start;
    font-size: 12.5px;
    color: var(--app-text-muted);
    /* Small breathing room between the price number and "×N". */
    padding-left: 4px;
  }
  .dec-row__filler { display: none; }
  .dec-row__seg, .dec-row__locked { grid-area: seg; justify-self: start; }
  .dec-row__unit {
    grid-area: unit;
    text-align: left;
    justify-self: end;
  }
  .dec-row__total {
    grid-area: total;
    text-align: right;
    justify-self: end;
  }
  .dec-row__chev { grid-area: chev; }
}

.bdr__cross-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: oklch(0.58 0.20 15);
  background: transparent;
  border: 1px solid oklch(0.58 0.20 15 / 0.35);
}

.bdr__cross-pill.is-home {
  color: var(--app-text);
  border-color: oklch(0.65 0.18 65 / 0.4);
  font-weight: 600;
}

.bdr__cross-pill small {
  font-size: 9.5px;
  padding: 1px 4px;
  border-radius: 999px;
  background: oklch(0.65 0.18 65 / 0.2);
  color: oklch(0.65 0.18 65);
  letter-spacing: 0.05em;
}

.bdr__cross-retry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--app-craft);
  background: transparent;
  border: 1px dashed var(--app-craft);
  cursor: pointer;
}

.bdr__cross-skel {
  display: inline-block;
  width: 4em;
  margin-left: 8px;
  vertical-align: middle;
}

.bdr__cross-empty {
  margin-left: 8px;
  font-size: 11px;
  color: var(--app-text-muted);
  font-style: italic;
}
</style>

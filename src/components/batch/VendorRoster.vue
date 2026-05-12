<script setup lang="ts">
import { computed } from 'vue'
import type { NpcPurchaseCandidate } from '@/stores/batch'
import { useBatchStore } from '@/stores/batch'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useZoneName } from '@/composables/useZoneName'
import { useNpcName } from '@/composables/useNpcName'
import { formatGil } from '@/utils/format'
import ItemName from '@/components/common/ItemName.vue'

const props = defineProps<{ candidates: NpcPurchaseCandidate[] }>()
const batch = useBatchStore()
const isMobile = useIsMobile()

/**
 * Group candidates by `npcId` so the same NPC isn't listed once per item.
 * A vendor is a single physical spot; "go to 喬西" once buys everything.
 * Groups sort by total savings (most-rewarding trip first).
 */
interface VendorStall {
  npcId: number
  zoneId: number
  coords: { x: number; y: number }
  aetheryteName: string | null
  items: NpcPurchaseCandidate[]
  totalSavings: number
}

const stalls = computed<VendorStall[]>(() => {
  const byNpc = new Map<number, VendorStall>()
  for (const c of props.candidates) {
    let s = byNpc.get(c.npcId)
    if (!s) {
      s = {
        npcId: c.npcId,
        zoneId: c.zoneId,
        coords: c.coords,
        aetheryteName: c.aetheryteName,
        items: [],
        totalSavings: 0,
      }
      byNpc.set(c.npcId, s)
    }
    s.items.push(c)
    s.totalSavings += c.savings
  }
  return [...byNpc.values()].sort((a, b) => b.totalSavings - a.totalSavings)
})

const totalPotentialSavings = computed(() =>
  props.candidates.reduce((acc, c) => acc + c.savings, 0),
)

const selectedSavings = computed(() => {
  let total = 0
  for (const c of props.candidates) {
    if (batch.selectedNpcIds.has(c.itemId)) total += c.savings
  }
  return total
})

const anySelected = computed(() => selectedSavings.value > 0)

const allSelected = computed(() =>
  props.candidates.length > 0 &&
  props.candidates.every(c => batch.selectedNpcIds.has(c.itemId)),
)

function isChecked(id: number) {
  return batch.selectedNpcIds.has(id)
}

function toggle(id: number) {
  batch.toggleNpcPurchase(id)
}

function toggleAll() {
  if (allSelected.value) batch.clearNpcPurchaseSelection()
  else batch.selectAllNpcPurchases()
}

function toggleStall(stall: VendorStall) {
  const allOn = stall.items.every(c => batch.selectedNpcIds.has(c.itemId))
  for (const c of stall.items) {
    const on = batch.selectedNpcIds.has(c.itemId)
    if (allOn && on) batch.toggleNpcPurchase(c.itemId)
    else if (!allOn && !on) batch.toggleNpcPurchase(c.itemId)
  }
}

function stallSelectedCount(stall: VendorStall): number {
  return stall.items.filter(c => batch.selectedNpcIds.has(c.itemId)).length
}

// VendorRoster is a planning surface (decide what to NPC-buy). Vendor /tp +
// map actions live on the execution surface (ShoppingList NpcShoppingGroup).
</script>

<template>
  <details v-if="stalls.length > 0" class="sug sug-npc" open>
    <summary class="sug-head">
      <svg class="sug-chev" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M3.5 2 L7 5 L3.5 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="sug-title">NPC 採購建議</span>
      <span class="sug-summary">
        {{ candidates.length }} 項素材 · {{ stalls.length }} 處攤位
      </span>
      <div class="sug-stats">
        <span v-if="anySelected" class="sug-saved">
          已省 <span class="num">{{ formatGil(selectedSavings) }}</span>
        </span>
        <span v-else class="sug-saved sug-saved--latent">
          可省 <span class="num">{{ formatGil(totalPotentialSavings) }}</span>
        </span>
        <button type="button" class="sug-btn" @click.stop="toggleAll">
          {{ allSelected ? '全部取消' : '全選' }}
        </button>
      </div>
    </summary>

    <div class="sug-body">
      <!-- Desktop: NPC-grouped flat list -->
      <div v-if="!isMobile" class="npc-list" role="table">
        <template v-for="stall in stalls" :key="stall.npcId">
          <NpcStallHeader
            :stall="stall"
            :selected-count="stallSelectedCount(stall)"
            @toggle-all="toggleStall(stall)"
          />
          <NpcItemRow
            v-for="row in stall.items"
            :key="row.itemId"
            :row="row"
            :checked="isChecked(row.itemId)"
            @toggle="toggle(row.itemId)"
          />
        </template>
      </div>

      <!-- Mobile: stall card stack -->
      <ul v-else class="npc-mobile" role="list">
        <NpcMobileStall
          v-for="stall in stalls"
          :key="stall.npcId"
          :stall="stall"
          :selected-count="stallSelectedCount(stall)"
          @toggle-item="toggle"
          @toggle-stall="toggleStall(stall)"
        />
      </ul>
    </div>
  </details>
</template>

<script lang="ts">
import { defineComponent, h, computed as vueComputed, type PropType } from 'vue'

interface VendorStallType {
  npcId: number
  zoneId: number
  coords: { x: number; y: number }
  aetheryteName: string | null
  items: NpcPurchaseCandidate[]
  totalSavings: number
}

/** Stall sub-header: declares the NPC once for its block of items.
 *  Carries the route-actionable controls (/tp + map) at vendor level. */
export const NpcStallHeader = defineComponent({
  name: 'NpcStallHeader',
  props: {
    stall: { type: Object as PropType<VendorStallType>, required: true },
    selectedCount: { type: Number, required: true },
  },
  emits: ['toggle-all'],
  setup(props, { emit }) {
    const npcName = useNpcName(vueComputed(() => props.stall.npcId))
    const zoneName = useZoneName(vueComputed(() => props.stall.zoneId))
    return () => {
      const total = props.stall.items.length
      const partial = props.selectedCount > 0 && props.selectedCount < total
      const allOn = props.selectedCount === total
      return h(
        'div',
        {
          class: ['npc-stall', { 'is-engaged': props.selectedCount > 0 }],
          role: 'rowheader',
        },
        [
          h('button', {
            type: 'button',
            class: 'npc-stall__select',
            'aria-label': allOn ? `取消 ${npcName.value} 的全部素材` : `加入 ${npcName.value} 的全部素材`,
            'aria-pressed': allOn,
            onClick: () => emit('toggle-all'),
          }, [
            h('span', { class: ['npc-stall__select-box', { 'is-on': allOn, 'is-partial': partial }] }),
            h('span', { class: 'npc-stall__npc-label' }, 'NPC'),
            h('span', { class: 'npc-stall__name' }, npcName.value),
            h('span', { class: 'npc-stall__sep', 'aria-hidden': 'true' }, '·'),
            h('span', { class: 'npc-stall__zone' }, zoneName.value),
            h('span', { class: 'npc-stall__coords' }, [
              props.stall.coords.x.toFixed(1),
              ', ',
              props.stall.coords.y.toFixed(1),
            ]),
            h('span', { class: 'npc-stall__count' }, `共 ${total} 項`),
          ]),
        ],
      )
    }
  },
})

/** Single-item row under a stall header. Flat, no expand — vendor info
 *  already lives at the header above. The row is just the buying decision
 *  (check), the visualization (cost compare), and the value tag (savings %). */
export const NpcItemRow = defineComponent({
  name: 'NpcItemRow',
  props: {
    row: { type: Object as PropType<NpcPurchaseCandidate>, required: true },
    checked: { type: Boolean, required: true },
  },
  emits: ['toggle'],
  setup(props, { emit }) {
    return () =>
      h(
        'div',
        {
          class: ['npc-row', { 'is-checked': props.checked }],
          role: 'row',
          onClick: () => emit('toggle'),
        },
        [
          h(
            'label',
            { class: 'npc-row__check', onClick: (e: Event) => e.stopPropagation() },
            [
              h('input', {
                type: 'checkbox',
                class: 'npc-row__checkbox',
                checked: props.checked,
                'aria-label': `NPC 採購：${props.row.name}`,
                onChange: () => emit('toggle'),
              }),
            ],
          ),
          props.row.icon
            ? h('img', {
                src: props.row.icon,
                alt: '',
                'aria-hidden': 'true',
                loading: 'lazy',
                decoding: 'async',
                class: 'npc-row__icon',
              })
            : h('span', { class: 'npc-row__icon' }),
          h('span', { class: 'npc-row__name' }, [
            h(ItemName, { itemId: props.row.itemId, fallback: props.row.name }),
            props.row.isFinishedProduct
              ? h('span', { class: 'npc-row__fp' }, '成品')
              : null,
          ]),
          h('span', { class: 'npc-row__qty' }, `×${props.row.amount}`),
          h('span', { class: 'npc-row__compare' }, [
            h(
              'span',
              { class: 'npc-row__market' },
              formatGil(props.row.marketPrice * props.row.amount),
            ),
            h('span', { class: 'npc-row__arrow', 'aria-hidden': 'true' }, '→'),
            h(
              'span',
              { class: 'npc-row__npc' },
              formatGil(props.row.npcPrice * props.row.amount),
            ),
          ]),
          h(
            'span',
            { class: 'npc-row__savings' },
            `−${Math.round(props.row.savingsRatio * 100)}%`,
          ),
        ],
      )
  },
})

/** Mobile stall card: one card per NPC, items stacked inside. /tp + map
 *  actions removed — they live on the ShoppingList NpcShoppingGroup card,
 *  the execution surface. This roster card is the planning surface. */
export const NpcMobileStall = defineComponent({
  name: 'NpcMobileStall',
  props: {
    stall: { type: Object as PropType<VendorStallType>, required: true },
    selectedCount: { type: Number, required: true },
  },
  emits: ['toggle-item', 'toggle-stall'],
  setup(props, { emit }) {
    const npcName = useNpcName(vueComputed(() => props.stall.npcId))
    const zoneName = useZoneName(vueComputed(() => props.stall.zoneId))
    return () => {
      const total = props.stall.items.length
      const allOn = props.selectedCount === total
      const partial = props.selectedCount > 0 && !allOn
      return h('li', { class: ['npc-mobile-stall', { 'is-engaged': props.selectedCount > 0 }] }, [
        // Stall head
        h('button', {
          type: 'button',
          class: 'npc-mobile-stall__head',
          onClick: () => emit('toggle-stall'),
          'aria-label': allOn ? `取消 ${npcName.value}` : `全部加入 ${npcName.value}`,
        }, [
          h('span', { class: ['npc-mobile-stall__box', { 'is-on': allOn, 'is-partial': partial }] }),
          h('div', { class: 'npc-mobile-stall__id' }, [
            h('span', { class: 'npc-mobile-stall__name' }, npcName.value),
            h('span', { class: 'npc-mobile-stall__zone' }, zoneName.value),
          ]),
          h('span', { class: 'npc-mobile-stall__count' }, `${total} 項`),
        ]),
        // Items
        h('ul', { class: 'npc-mobile-stall__items', role: 'list' },
          props.stall.items.map(item =>
            h('li', { class: 'npc-mobile-item', key: item.itemId }, [
              h(
                'label',
                {
                  class: 'npc-mobile-item__check',
                  onClick: (e: Event) => e.stopPropagation(),
                },
                [
                  h('input', {
                    type: 'checkbox',
                    class: 'npc-mobile-item__checkbox',
                    checked: useBatchStore().selectedNpcIds.has(item.itemId),
                    'aria-label': `NPC 採購：${item.name}`,
                    onChange: () => emit('toggle-item', item.itemId),
                  }),
                ],
              ),
              item.icon
                ? h('img', {
                    src: item.icon,
                    class: 'npc-mobile-item__icon',
                    alt: '',
                    'aria-hidden': 'true',
                    loading: 'lazy',
                  })
                : null,
              h('div', { class: 'npc-mobile-item__body' }, [
                h('div', { class: 'npc-mobile-item__line1' }, [
                  h('span', { class: 'npc-mobile-item__name' }, item.name),
                  h('span', { class: 'npc-mobile-item__qty' }, `×${item.amount}`),
                ]),
                h('div', { class: 'npc-mobile-item__line2' }, [
                  h('span', { class: 'npc-mobile-item__market' }, formatGil(item.marketPrice * item.amount)),
                  h('span', { class: 'npc-mobile-item__arrow', 'aria-hidden': 'true' }, ' → '),
                  h('span', { class: 'npc-mobile-item__npc' }, formatGil(item.npcPrice * item.amount)),
                ]),
              ]),
              h('span', { class: 'npc-mobile-item__savings' },
                `−${Math.round(item.savingsRatio * 100)}%`),
            ]),
          ),
        ),
      ])
    }
  },
})
</script>

<style scoped>
/* === Shared <details class="sug"> vocabulary ============================ */
.sug {
  padding: 4px 0 6px;
}

.sug-head {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 4px 0;
  flex-wrap: wrap;
}
.sug-head::-webkit-details-marker { display: none; }

.sug-chev {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  color: var(--app-craft);
  opacity: 0.75;
  transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
  transform: translateY(1px);
}
.sug[open] > .sug-head .sug-chev {
  transform: translateY(1px) rotate(90deg);
}

.sug-title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 700;
  font-size: 15.5px;
  color: var(--app-craft);
  letter-spacing: 0.005em;
}
.sug-summary {
  font-size: 12.5px;
  color: var(--app-text-muted);
}
.sug-stats {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.sug-saved {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-success);
}
.sug-saved--latent {
  color: var(--app-text-muted);
  font-weight: 500;
}
.sug-saved .num { font-variant-numeric: tabular-nums; }

.sug-btn {
  font-family: 'Noto Sans TC', sans-serif;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--app-surface-hover, var(--app-surface));
  border: 0;
  color: var(--app-text-muted);
  cursor: pointer;
  transition: background 160ms cubic-bezier(0.22, 1, 0.36, 1), color 160ms;
}
.sug-btn:hover {
  background: color-mix(in oklch, var(--accent-gold) 18%, transparent);
  color: var(--app-text);
}
.sug-btn:focus-visible {
  outline: 2px solid var(--accent-gold);
  outline-offset: 2px;
}

.sug-body { padding-top: 6px; }

/* === Desktop list === */
.npc-list {
  border: 1px solid var(--app-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--app-surface);
  box-shadow: 0 1px 2px oklch(0.40 0.05 60 / 0.04);
}

/* Item row — flex, packed left. Sparse data shouldn't be stretched across the
 * full table width with a filler column (that produces a visible empty bay in
 * the middle of every row). Trailing whitespace lives at the right edge
 * outside the visual cluster, which reads as "row ends here" instead of
 * "row is broken in half". Column widths live on the per-element rules below
 * so they survive the cascade from later rule blocks. */

/* === Stall header === */
:deep(.npc-stall) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  background: color-mix(in oklch, var(--app-craft) 5%, var(--app-surface));
  border-top: 1px solid var(--app-border);
  font-size: 13.5px;
}

:deep(.npc-list > template:first-of-type .npc-stall),
:deep(.npc-stall:first-of-type) {
  border-top: none;
}

:deep(.npc-stall.is-map-open) {
  background: color-mix(in oklch, var(--app-craft) 10%, var(--app-surface));
}

:deep(.npc-stall__npc-label) {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.12em;
  color: var(--app-craft);
  background: color-mix(in oklch, var(--app-craft) 14%, transparent);
  padding: 2px 6px;
  border-radius: 3px;
  margin-right: 4px;
  transform: translateY(-1px);
}

:deep(.npc-stall__select) {
  appearance: none;
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  background: transparent;
  border: 0;
  padding: 4px 6px;
  margin: -4px -6px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--app-text);
  text-align: left;
  min-width: 0;
  transition: background 140ms ease-out;
}

:deep(.npc-stall__select:hover) {
  background: color-mix(in oklch, var(--app-craft) 8%, transparent);
}

:deep(.npc-stall__select:focus-visible) {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
}

:deep(.npc-stall__select-box) {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1.5px solid color-mix(in oklch, var(--app-craft) 50%, var(--app-border));
  flex-shrink: 0;
  position: relative;
  transition: background 140ms ease-out, border-color 140ms ease-out;
  transform: translateY(2px);
}

:deep(.npc-stall__select-box.is-on) {
  background: var(--app-craft);
  border-color: var(--app-craft);
}

:deep(.npc-stall__select-box.is-on)::after {
  content: '';
  position: absolute;
  inset: 2px 3px 3px 2px;
  border-right: 2px solid var(--app-surface);
  border-bottom: 2px solid var(--app-surface);
  transform: rotate(45deg) translate(-1px, -1px);
}

:deep(.npc-stall__select-box.is-partial) {
  background: color-mix(in oklch, var(--app-craft) 50%, transparent);
  border-color: var(--app-craft);
}

:deep(.npc-stall__select-box.is-partial)::after {
  content: '';
  position: absolute;
  inset: 5px 2px 5px 2px;
  background: var(--app-surface);
}

:deep(.npc-stall__name) {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  color: var(--app-text);
}

:deep(.npc-stall__sep) {
  color: var(--app-text-muted);
  opacity: 0.5;
}

:deep(.npc-stall__zone) {
  color: var(--app-text-muted);
  font-size: 12.5px;
}

:deep(.npc-stall__coords) {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  color: var(--app-craft);
  opacity: 0.78;
  margin-left: 6px;
}

:deep(.npc-stall__count) {
  font-size: 11.5px;
  color: var(--app-text-muted);
  margin-left: 8px;
  font-family: 'Fira Code', ui-monospace, monospace;
}

:deep(.npc-stall__tp),
:deep(.npc-stall__map) {
  appearance: none;
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  border: 1px solid color-mix(in oklch, var(--app-craft) 35%, transparent);
  background: transparent;
  color: var(--app-craft);
  font-family: 'Noto Sans TC', sans-serif;
  font-size: 12.5px;
  padding: 4px 9px;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 140ms ease-out, border-color 140ms ease-out;
}

:deep(.npc-stall__tp:hover:not(:disabled)),
:deep(.npc-stall__map:hover) {
  background: color-mix(in oklch, var(--app-craft) 12%, transparent);
  border-color: color-mix(in oklch, var(--app-craft) 55%, transparent);
}

:deep(.npc-stall__tp:focus-visible),
:deep(.npc-stall__map:focus-visible) {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
}

:deep(.npc-stall__tp.is-disabled) {
  color: var(--app-text-muted);
  border-color: color-mix(in oklch, var(--app-text-muted) 24%, transparent);
  cursor: not-allowed;
  opacity: 0.75;
}

:deep(.npc-stall__tp-cmd) {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  opacity: 0.78;
}

:deep(.npc-stall__map.is-open) {
  background: color-mix(in oklch, var(--app-craft) 18%, transparent);
  border-color: color-mix(in oklch, var(--app-craft) 60%, transparent);
}

/* Inline map row — sits below the stall's items, full-width within the
 * table card. Cocoa wash to belong to the stall above. */
.npc-inline-map {
  padding: 12px 14px 14px;
  background: color-mix(in oklch, var(--app-craft) 6%, var(--app-surface));
  border-top: 1px dashed color-mix(in oklch, var(--app-craft) 25%, transparent);
}

/* === Item row === */
:deep(.npc-row) {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
  cursor: pointer;
  transition: background 140ms ease-out;
}

:deep(.npc-row:hover) {
  background: color-mix(in oklch, var(--app-craft) 6%, var(--app-surface));
}

:deep(.npc-row.is-checked) {
  background: color-mix(in oklch, var(--app-craft) 4%, var(--app-surface));
}

:deep(.npc-row__check) {
  /* WCAG 2.5.5 AAA: touch target ≥ 44×44. Visible checkbox stays 16px;
   * the label wrapper carries the full hit area. */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  width: 44px;
  height: 44px;
  margin-left: -10px;   /* tuck the wider label into row padding so the row's
                           visual left gutter stays narrow */
  flex-shrink: 0;
}

:deep(.npc-row__checkbox) {
  width: 16px;
  height: 16px;
  accent-color: var(--app-craft);
  cursor: pointer;
}

:deep(.npc-row__icon) {
  width: 24px;
  height: 24px;
  border-radius: 3px;
  flex-shrink: 0;
}

:deep(.npc-row__name) {
  font-size: 13.5px;
  color: var(--app-text);
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 140px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.npc-row__fp) {
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in oklch, var(--app-craft) 16%, transparent);
  color: var(--app-craft);
}

:deep(.npc-row__qty) {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  color: var(--app-text-muted);
  text-align: right;
  width: 40px;
  flex-shrink: 0;
}

:deep(.npc-row__compare) {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  justify-content: flex-end;
  width: 110px;
  flex-shrink: 0;
}

:deep(.npc-row__market) {
  color: var(--app-text-muted);
  text-decoration: line-through;
  text-decoration-color: color-mix(in oklch, var(--app-text-muted) 50%, transparent);
}

:deep(.npc-row__arrow) {
  color: var(--app-text-muted);
  opacity: 0.45;
}

:deep(.npc-row__npc) {
  color: var(--app-craft);
  font-weight: 600;
}

:deep(.npc-row__savings) {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--app-success);
  font-variant-numeric: tabular-nums;
  text-align: right;
  width: 52px;
  flex-shrink: 0;
}

/* === Mobile === */
.npc-mobile {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

:deep(.npc-mobile-stall) {
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface);
  overflow: hidden;
}

:deep(.npc-mobile-stall.is-engaged) {
  border-color: color-mix(in oklch, var(--app-craft) 35%, var(--app-border));
}

:deep(.npc-mobile-stall__head) {
  appearance: none;
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 12px 14px 10px;
  background: color-mix(in oklch, var(--app-craft) 6%, var(--app-surface));
  border: 0;
  border-bottom: 1px solid var(--app-border);
  width: 100%;
  text-align: left;
  cursor: pointer;
}

:deep(.npc-mobile-stall__box) {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1.5px solid color-mix(in oklch, var(--app-craft) 50%, var(--app-border));
  position: relative;
}

:deep(.npc-mobile-stall__box.is-on) {
  background: var(--app-craft);
  border-color: var(--app-craft);
}

:deep(.npc-mobile-stall__box.is-on)::after {
  content: '';
  position: absolute;
  inset: 2px 3px 3px 2px;
  border-right: 2px solid var(--app-surface);
  border-bottom: 2px solid var(--app-surface);
  transform: rotate(45deg) translate(-1px, -1px);
}

:deep(.npc-mobile-stall__box.is-partial) {
  background: color-mix(in oklch, var(--app-craft) 50%, transparent);
  border-color: var(--app-craft);
}

:deep(.npc-mobile-stall__id) {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

:deep(.npc-mobile-stall__name) {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 15px;
  color: var(--app-text);
}

:deep(.npc-mobile-stall__zone) {
  font-size: 12px;
  color: var(--app-text-muted);
}

:deep(.npc-mobile-stall__count) {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11.5px;
  color: var(--app-craft);
}

:deep(.npc-mobile-stall__actions) {
  display: flex;
  gap: 8px;
  padding: 8px 14px;
  background: color-mix(in oklch, var(--app-craft) 3%, var(--app-surface));
  border-bottom: 1px solid var(--app-border);
}

:deep(.npc-mobile-stall__tp),
:deep(.npc-mobile-stall__map) {
  appearance: none;
  flex: 1;
  border: 1px solid color-mix(in oklch, var(--app-craft) 35%, transparent);
  background: transparent;
  color: var(--app-craft);
  font-family: 'Noto Sans TC', sans-serif;
  font-size: 13px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
}

:deep(.npc-mobile-stall__tp.is-disabled) {
  color: var(--app-text-muted);
  border-color: color-mix(in oklch, var(--app-text-muted) 24%, transparent);
  opacity: 0.7;
}

:deep(.npc-mobile-stall__items) {
  list-style: none;
  margin: 0;
  padding: 0;
}

:deep(.npc-mobile-item) {
  display: grid;
  grid-template-columns: 44px 26px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;  /* trimmed so 44px touch target wrapper drives row height */
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:deep(.npc-mobile-item:last-child) {
  border-bottom: none;
}

:deep(.npc-mobile-item__check) {
  /* WCAG 2.5.5 AAA touch target. Visible box stays 18px. */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-left: -10px;
  cursor: pointer;
}

:deep(.npc-mobile-item__checkbox) {
  width: 18px;
  height: 18px;
  accent-color: var(--app-craft);
}

:deep(.npc-mobile-item__icon) {
  width: 24px;
  height: 24px;
  border-radius: 3px;
}

:deep(.npc-mobile-item__body) {
  min-width: 0;
}

:deep(.npc-mobile-item__line1) {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13.5px;
  color: var(--app-text);
}

:deep(.npc-mobile-item__qty) {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11.5px;
  color: var(--app-text-muted);
}

:deep(.npc-mobile-item__line2) {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11.5px;
  margin-top: 2px;
}

:deep(.npc-mobile-item__market) {
  color: var(--app-text-muted);
  text-decoration: line-through;
}

:deep(.npc-mobile-item__npc) {
  color: var(--app-craft);
  font-weight: 600;
}

:deep(.npc-mobile-item__savings) {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 13px;
  font-weight: 700;
  color: var(--app-success);
}

@media (max-width: 640px) {
  .sug-head { gap: 8px; }
  .sug-summary { flex-basis: 100%; margin-left: 24px; }
  .sug-stats { flex-basis: 100%; margin-left: 24px; }
}
</style>

<style>
[data-theme="dark"] .sug-npc :deep(.npc-stall) {
  background: color-mix(in oklch, var(--app-craft) 12%, var(--app-surface));
}

[data-theme="dark"] .sug-npc :deep(.npc-row.is-checked) {
  background: color-mix(in oklch, var(--app-craft) 10%, var(--app-surface));
}

[data-theme="dark"] .sug-npc :deep(.npc-row:hover) {
  background: color-mix(in oklch, var(--app-craft) 16%, var(--app-surface));
}
</style>

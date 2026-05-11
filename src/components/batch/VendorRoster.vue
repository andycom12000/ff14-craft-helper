<script setup lang="ts">
import { ref, computed } from 'vue'
import type { NpcPurchaseCandidate } from '@/stores/batch'
import { useBatchStore } from '@/stores/batch'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useZoneName } from '@/composables/useZoneName'
import { useNpcName } from '@/composables/useNpcName'
import { formatGil } from '@/utils/format'
import { buildTpCommand } from '@/utils/ff14-map-link'
import { ElMessage } from 'element-plus'
import ItemName from '@/components/common/ItemName.vue'
import ZoneMapSheet from '@/components/bom/ZoneMapSheet.vue'

const props = defineProps<{ candidates: NpcPurchaseCandidate[] }>()
const batch = useBatchStore()
const isMobile = useIsMobile()

const selectedSavings = computed(() => {
  let total = 0
  for (const c of props.candidates) {
    if (batch.selectedNpcIds.has(c.itemId)) total += c.savings
  }
  return total
})

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

// Map drawer
const mapOpen = ref(false)
const mapZoneId = ref<number | null>(null)
const mapCoords = ref<{ x: number; y: number } | null>(null)
const mapAetheryte = ref<string | null>(null)

function openMap(c: NpcPurchaseCandidate) {
  mapZoneId.value = c.zoneId
  mapCoords.value = c.coords
  mapAetheryte.value = c.aetheryteName
  mapOpen.value = true
}

async function copyTp(c: NpcPurchaseCandidate) {
  if (!c.aetheryteName) {
    ElMessage({ message: '此 NPC 附近沒有傳送點資料', type: 'info', duration: 1500 })
    return
  }
  try {
    await navigator.clipboard.writeText(buildTpCommand(c.aetheryteName))
    ElMessage({ message: `已複製：/tp ${c.aetheryteName}`, type: 'success', duration: 1500 })
  } catch {
    ElMessage({ message: '複製失敗', type: 'error', duration: 1500 })
  }
}
</script>

<template>
  <section v-if="candidates.length > 0" class="npc-block" aria-label="NPC 採購建議">
    <header class="block-header">
      <div class="block-title">
        <span class="block-label">⛟ NPC 採購建議</span>
        <span class="block-hint">勾選想跟 NPC 買的素材，購物清單會自動移除這些項目</span>
      </div>
      <div class="block-stats">
        <span class="block-saved">已省 {{ formatGil(selectedSavings) }}</span>
        <el-button size="small" @click="toggleAll">
          {{ allSelected ? '全部取消' : '全選' }}
        </el-button>
      </div>
    </header>

    <!-- Mobile: stacked cards -->
    <ul v-if="isMobile" class="npc-cards" role="list">
      <NpcRowMobile
        v-for="row in candidates"
        :key="row.itemId"
        :row="row"
        :checked="isChecked(row.itemId)"
        @toggle="toggle"
        @visit="openMap"
        @tp="copyTp"
      />
    </ul>

    <!-- Desktop: el-table with expand row showing the NPC detail strip -->
    <el-table
      v-else
      :data="candidates"
      size="small"
      class="npc-table"
      row-key="itemId"
    >
      <el-table-column type="expand">
        <template #default="{ row }">
          <NpcDetailStrip
            :row="row"
            @visit="openMap"
            @tp="copyTp"
          />
        </template>
      </el-table-column>
      <el-table-column label="" width="44" align="center">
        <template #default="{ row }">
          <el-checkbox
            :model-value="isChecked(row.itemId)"
            :aria-label="`NPC 採購：${row.name}`"
            @change="() => toggle(row.itemId)"
          />
        </template>
      </el-table-column>
      <el-table-column label="" width="36">
        <template #default="{ row }">
          <img v-if="row.icon" :src="row.icon" alt="" aria-hidden="true" loading="lazy" decoding="async" class="row-icon" />
        </template>
      </el-table-column>
      <el-table-column label="素材">
        <template #default="{ row }">
          <ItemName :item-id="row.itemId" :fallback="row.name" />
          <el-tag v-if="row.isFinishedProduct" size="small" type="info" style="margin-left: 4px">成品</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="數量" prop="amount" width="60" align="right" />
      <el-table-column label="市場成本" width="96" align="right">
        <template #default="{ row }">
          <span class="mono-num strike">{{ formatGil(row.marketPrice * row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="NPC 成本" width="96" align="right">
        <template #default="{ row }">
          <span class="mono-num npc-cost">{{ formatGil(row.npcPrice * row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="省" width="72" align="right">
        <template #default="{ row }">
          <span class="savings-badge">−{{ Math.round(row.savingsRatio * 100) }}%</span>
        </template>
      </el-table-column>
      <el-table-column label="NPC" min-width="160">
        <template #default="{ row }">
          <NpcCellInline :npc-id="row.npcId" :zone-id="row.zoneId" />
        </template>
      </el-table-column>
    </el-table>

    <ZoneMapSheet
      v-model="mapOpen"
      :zone-id="mapZoneId"
      :highlight-coords="mapCoords ?? undefined"
      :aetheryte-name="mapAetheryte ?? undefined"
    />
  </section>
</template>

<script lang="ts">
import { defineComponent, h, computed as vueComputed, type PropType } from 'vue'

// Tiny inline cell: NPC name + zone, locale-aware. Lives in this file so the
// el-table slot can render per-row composable lookups without per-row wrappers
// at call-site.
export const NpcCellInline = defineComponent({
  name: 'NpcCellInline',
  props: {
    npcId: { type: Number, required: true },
    zoneId: { type: Number, required: true },
  },
  setup(props) {
    const npcName = useNpcName(vueComputed(() => props.npcId))
    const zoneName = useZoneName(vueComputed(() => props.zoneId))
    return () =>
      h('span', { class: 'npc-cell' }, [
        h('span', { class: 'npc-cell__name' }, npcName.value),
        h('span', { class: 'npc-cell__zone' }, zoneName.value),
      ])
  },
})

// Detail strip shown when a row expands. Mirrors BOM BomAcquisitionDetail
// source-row layout: ⛟ icon · NPC name → zone → X,Y · aetheryte chip · map button.
export const NpcDetailStrip = defineComponent({
  name: 'NpcDetailStrip',
  props: {
    row: { type: Object as PropType<NpcPurchaseCandidate>, required: true },
  },
  emits: ['visit', 'tp'],
  setup(props, { emit }) {
    const npcName = useNpcName(vueComputed(() => props.row.npcId))
    const zoneName = useZoneName(vueComputed(() => props.row.zoneId))
    return () =>
      h('div', { class: 'npc-strip', 'data-source-row': '' }, [
        h('span', { class: 'npc-strip__icon', 'aria-hidden': 'true' }, '⛟'),
        h('div', { class: 'npc-strip__info' }, [
          h('span', { class: 'npc-strip__name' }, npcName.value),
          h('span', { class: 'npc-strip__zone' }, zoneName.value),
          h('span', { class: 'npc-strip__coords' }, [
            'X:',
            props.row.coords.x.toFixed(1),
            '  Y:',
            props.row.coords.y.toFixed(1),
          ]),
          props.row.aetheryteName
            ? h('span', { class: 'npc-strip__aeth' }, [
                h('span', { class: 'npc-strip__aeth-name' }, [
                  h('span', { 'aria-hidden': 'true' }, '◉ '),
                  props.row.aetheryteName,
                ]),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'npc-strip__tp',
                    'aria-label': `複製傳送指令到 ${props.row.aetheryteName}`,
                    onClick: (e: Event) => {
                      e.stopPropagation()
                      emit('tp', props.row)
                    },
                  },
                  '⎘ /tp',
                ),
              ])
            : null,
        ]),
        h(
          'button',
          {
            type: 'button',
            class: 'npc-strip__map',
            'aria-label': '查看地圖',
            onClick: (e: Event) => {
              e.stopPropagation()
              emit('visit', props.row)
            },
          },
          [h('span', { 'aria-hidden': 'true' }, '⊞ '), '地圖'],
        ),
      ])
  },
})

// Mobile row: stack layout (no el-table on phone).
export const NpcRowMobile = defineComponent({
  name: 'NpcRowMobile',
  props: {
    row: { type: Object as PropType<NpcPurchaseCandidate>, required: true },
    checked: { type: Boolean, required: true },
  },
  emits: ['toggle', 'visit', 'tp'],
  setup(props, { emit }) {
    const npcName = useNpcName(vueComputed(() => props.row.npcId))
    const zoneName = useZoneName(vueComputed(() => props.row.zoneId))
    return () =>
      h(
        'li',
        {
          class: ['npc-card', { 'npc-card--checked': props.checked }],
        },
        [
          h(
            'label',
            { class: 'npc-card__check', onClick: (e: Event) => e.stopPropagation() },
            [
              h('input', {
                type: 'checkbox',
                class: 'npc-card__checkbox',
                checked: props.checked,
                'aria-label': `NPC 採購：${props.row.name}`,
                onChange: () => emit('toggle', props.row.itemId),
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
                class: 'npc-card__icon',
              })
            : null,
          h('div', { class: 'npc-card__body' }, [
            h('div', { class: 'npc-card__line1' }, [
              h('span', { class: 'npc-card__name' }, props.row.name),
              props.row.isFinishedProduct
                ? h(
                    'span',
                    { class: 'npc-card__tag' },
                    '成品',
                  )
                : null,
            ]),
            h('div', { class: 'npc-card__line2' }, [
              h('span', { class: 'npc-card__qty' }, `×${props.row.amount}`),
              h('span', { class: 'npc-card__compare' }, [
                h('span', { class: 'mono-num strike' }, formatGil(props.row.marketPrice * props.row.amount)),
                ' → ',
                h('span', { class: 'mono-num npc-cost' }, formatGil(props.row.npcPrice * props.row.amount)),
              ]),
            ]),
            h('div', { class: 'npc-card__line3' }, [
              h('span', { class: 'npc-card__npc' }, [
                h('span', { 'aria-hidden': 'true' }, '⛟ '),
                npcName.value,
              ]),
              h('span', { class: 'npc-card__sep', 'aria-hidden': 'true' }, '·'),
              h('span', { class: 'npc-card__zone' }, zoneName.value),
            ]),
            h('div', { class: 'npc-card__actions' }, [
              props.row.aetheryteName
                ? h(
                    'button',
                    {
                      type: 'button',
                      class: 'npc-card__tp',
                      onClick: (e: Event) => {
                        e.stopPropagation()
                        emit('tp', props.row)
                      },
                    },
                    `⎘ /tp ${props.row.aetheryteName}`,
                  )
                : null,
              h(
                'button',
                {
                  type: 'button',
                  class: 'npc-card__map',
                  onClick: (e: Event) => {
                    e.stopPropagation()
                    emit('visit', props.row)
                  },
                },
                '⊞ 地圖',
              ),
            ]),
          ]),
          h(
            'span',
            { class: 'npc-card__savings' },
            `−${Math.round(props.row.savingsRatio * 100)}%`,
          ),
        ],
      )
  },
})
</script>

<style scoped>
.npc-block {
  margin-bottom: 20px;
  max-width: 1080px;
}

/* Header — matches SelfCraftSuggestions exactly */
.block-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 10px;
}

.block-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.block-label {
  font-family: 'Noto Serif TC', serif;
  font-size: 15px;
  font-weight: 700;
  color: var(--app-text);
  letter-spacing: 0.02em;
}

.block-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.block-stats {
  display: flex;
  align-items: center;
  gap: 10px;
}

.block-saved {
  font-size: 13px;
  color: var(--app-success);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* Table — same chrome as SelfCraftSuggestions, hover wash uses craft cocoa
   (this is the crafting register's NPC-sub-flow) */
.npc-table {
  --el-table-bg-color: var(--app-surface);
  --el-table-tr-bg-color: var(--app-surface);
  --el-table-header-bg-color: oklch(0.955 0.028 80);
  --el-table-row-hover-bg-color: color-mix(in srgb, var(--app-craft-dim) 30%, transparent);
  --el-table-border-color: var(--app-border);
  --el-table-expanded-cell-bg-color: color-mix(in srgb, var(--app-craft-dim) 18%, transparent);
  border: 1px solid var(--app-border);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 2px oklch(0.40 0.05 60 / 0.04);
}

.row-icon {
  width: 20px;
  height: 20px;
  border-radius: 2px;
}

.mono-num {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

.strike {
  color: var(--app-text-muted);
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--app-text-muted) 50%, transparent);
}

.npc-cost {
  color: var(--app-craft);
  font-weight: 600;
}

.savings-badge {
  color: var(--app-success);
  font-weight: 600;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

/* NPC cell inline (collapsed) */
:deep(.npc-cell) {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
}

:deep(.npc-cell__name) {
  color: var(--app-craft);
  font-weight: 500;
}

:deep(.npc-cell__name)::before {
  content: '⛟  ';
  font-size: 11px;
  opacity: 0.7;
}

:deep(.npc-cell__zone) {
  color: var(--app-text-muted);
  font-size: 11.5px;
}

/* Detail strip (expanded) — mirrors BomAcquisitionDetail .bad__source-row */
:deep(.npc-strip) {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 12px;
}

:deep(.npc-strip__icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-craft) 14%, transparent);
  color: var(--app-craft);
  font-family: 'Apple Symbols', 'Segoe UI Symbol', 'Noto Sans Symbols 2',
    'Symbola', 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  flex-shrink: 0;
  margin-top: 2px;
}

:deep(.npc-strip__info) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

:deep(.npc-strip__name) {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 14px;
  color: var(--app-text);
}

:deep(.npc-strip__zone) {
  font-size: 12.5px;
  color: var(--app-text-muted);
}

:deep(.npc-strip__coords) {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11.5px;
  color: var(--app-text-muted);
  letter-spacing: 0.02em;
}

:deep(.npc-strip__aeth) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  flex-wrap: wrap;
}

:deep(.npc-strip__aeth-name) {
  font-size: 12.5px;
  color: var(--app-craft);
  font-weight: 500;
}

:deep(.npc-strip__tp),
:deep(.npc-strip__map) {
  appearance: none;
  display: inline-flex;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--app-craft) 35%, transparent);
  background: transparent;
  color: var(--app-craft);
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11.5px;
  letter-spacing: 0.02em;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 140ms ease-out, border-color 140ms ease-out;
}

:deep(.npc-strip__tp:hover),
:deep(.npc-strip__map:hover) {
  background: color-mix(in srgb, var(--app-craft) 12%, transparent);
  border-color: color-mix(in srgb, var(--app-craft) 55%, transparent);
}

:deep(.npc-strip__map) {
  margin-top: 2px;
  align-self: flex-start;
  flex-shrink: 0;
}

/* Mobile cards */
.npc-cards {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--el-border-color-lighter);
}

:deep(.npc-card) {
  display: grid;
  grid-template-columns: 36px 28px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:deep(.npc-card:last-child) {
  border-bottom: none;
}

:deep(.npc-card--checked) {
  background: color-mix(in srgb, var(--app-craft-dim) 22%, transparent);
}

:deep(.npc-card__check) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: var(--touch-target-min);
}

:deep(.npc-card__checkbox) {
  width: 18px;
  height: 18px;
  accent-color: var(--app-craft);
}

:deep(.npc-card__icon) {
  width: 26px;
  height: 26px;
  border-radius: 3px;
}

:deep(.npc-card__body) {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

:deep(.npc-card__line1) {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  color: var(--el-text-color-primary);
}

:deep(.npc-card__name) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

:deep(.npc-card__tag) {
  flex-shrink: 0;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-craft) 14%, transparent);
  color: var(--app-craft);
}

:deep(.npc-card__line2) {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

:deep(.npc-card__line3) {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  margin-top: 2px;
}

:deep(.npc-card__npc) {
  color: var(--app-craft);
  font-weight: 500;
}

:deep(.npc-card__sep) {
  color: var(--el-text-color-placeholder);
}

:deep(.npc-card__zone) {
  color: var(--app-text-muted);
}

:deep(.npc-card__actions) {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}

:deep(.npc-card__tp),
:deep(.npc-card__map) {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--app-craft) 30%, transparent);
  background: transparent;
  color: var(--app-craft);
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11.5px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}

:deep(.npc-card__savings) {
  color: var(--app-success);
  font-weight: 700;
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
  padding-left: 4px;
}

@media (max-width: 640px) {
  .npc-block {
    margin-bottom: 18px;
  }

  .block-header {
    flex-direction: column;
    align-items: stretch;
    margin-bottom: 8px;
  }

  .block-stats {
    justify-content: space-between;
  }
}
</style>

<style>
/* Dark mode — same shade adjustment as SelfCraftSuggestions */
[data-theme="dark"] .npc-table {
  --el-table-header-bg-color: var(--app-surface-2);
  --el-table-row-hover-bg-color: color-mix(in srgb, var(--app-craft-dim) 36%, transparent);
}
</style>

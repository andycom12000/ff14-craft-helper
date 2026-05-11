<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { MaterialWithPrice } from '@/services/shopping-list'
import type { NpcPurchaseCandidate } from '@/stores/batch'
import { useZoneName } from '@/composables/useZoneName'
import { useNpcName } from '@/composables/useNpcName'
import { buildTpCommand, buildMapFlagLink } from '@/utils/ff14-map-link'
import { formatGil } from '@/utils/format'
import ItemName from '@/components/common/ItemName.vue'

const props = defineProps<{
  row: MaterialWithPrice
  candidate: NpcPurchaseCandidate | null
  merged: boolean   // true → gray out the info bar (same NPC as prev row)
  done: boolean     // in batchStore.doneNpcIds
}>()

const emit = defineEmits<{ 'toggle-done': [itemId: number] }>()

const zoneId = () => props.candidate?.zoneId ?? 0
const npcId = () => props.candidate?.npcId ?? 0

const zoneName = useZoneName(zoneId)
const npcName = useNpcName(npcId)

async function copyTp() {
  if (!props.candidate) return
  await navigator.clipboard.writeText(buildTpCommand(zoneName.value))
  ElMessage({ message: `已複製 /tp ${zoneName.value}`, type: 'success', duration: 1500 })
}

async function copyFlag() {
  if (!props.candidate) return
  const { x, y } = props.candidate.coords
  await navigator.clipboard.writeText(buildMapFlagLink(zoneName.value, x, y))
  ElMessage({ message: '已複製地圖座標', type: 'success', duration: 1500 })
}
</script>

<template>
  <li class="npc-row" :class="{ 'npc-row--done': done }">
    <!-- Main row: check · icon · name · qty · unitPrice · subtotal -->
    <div class="npc-row__main">
      <label class="npc-row__check" @click.stop>
        <el-checkbox
          :model-value="done"
          :aria-label="`標記已採買：${row.name}`"
          @change="emit('toggle-done', row.itemId)"
        />
      </label>

      <img
        v-if="row.icon"
        :src="row.icon"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        class="npc-row__icon"
      />

      <span class="npc-row__name">
        <ItemName :item-id="row.itemId" :fallback="row.name" />
        <el-tag v-if="row.isFinishedProduct" size="small" type="success" class="npc-row__fp-badge">成品</el-tag>
      </span>

      <span class="npc-row__qty">× {{ row.amount }}</span>
      <span class="npc-row__price">{{ formatGil(row.unitPrice) }}</span>
      <span class="npc-row__subtotal">{{ formatGil(row.unitPrice * row.amount) }}</span>
    </div>

    <!-- NPC info bar -->
    <div
      v-if="candidate"
      class="npc-row__info-bar"
      :class="{ 'npc-row__info-bar--merged': merged }"
    >
      <span class="npc-row__location">
        <span class="npc-row__loc-label">於：</span>{{ zoneName }}
        <span class="npc-row__sep" aria-hidden="true"> · </span>
        <span class="npc-row__loc-label">NPC：</span>{{ npcName }}
        <span class="npc-row__sep" aria-hidden="true"> · </span>
        (x: {{ candidate.coords.x.toFixed(1) }}, y: {{ candidate.coords.y.toFixed(1) }})
      </span>
      <template v-if="!merged">
        <button type="button" class="npc-action-btn" :aria-label="`複製 /tp 指令：${zoneName}`" @click.stop="copyTp">
          <span aria-hidden="true" class="npc-action-btn__icon">⌘</span> 複製 /tp
        </button>
        <button type="button" class="npc-action-btn" aria-label="複製地圖座標" @click.stop="copyFlag">
          <span aria-hidden="true" class="npc-action-btn__icon">⌖</span> 地圖
        </button>
      </template>
    </div>
  </li>
</template>

<style scoped>
.npc-row {
  border-bottom: 1px solid var(--el-border-color-lighter);
  transition: opacity 0.15s;
}

.npc-row:last-child {
  border-bottom: none;
}

.npc-row--done .npc-row__name {
  text-decoration: line-through;
}

.npc-row--done .npc-row__main {
  opacity: 0.55;
}

/* Main row grid */
.npc-row__main {
  display: grid;
  grid-template-columns: 44px 36px 1fr auto auto auto;
  align-items: center;
  gap: 6px;
  padding: 7px 8px 4px;
  min-height: 36px;
}

.npc-row__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.npc-row__icon {
  width: 22px;
  height: 22px;
  border-radius: 2px;
  flex-shrink: 0;
}

.npc-row__name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13.5px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.npc-row__fp-badge {
  flex-shrink: 0;
}

.npc-row__qty {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.npc-row__price {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.npc-row__subtotal {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-gold, #c8a435);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  min-width: 52px;
  text-align: right;
}

/* NPC info bar */
.npc-row__info-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 4px 8px 6px 52px; /* indent to align under name column (44+8px) */
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: color-mix(in oklch, var(--toast-crust) 6%, transparent);
  border-radius: 0 0 6px 6px;
  margin: 0 4px 2px;
}

.npc-row__info-bar--merged {
  opacity: 0.45;
  pointer-events: none;
}

.npc-row__location {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.npc-row__loc-label {
  color: var(--toast-crust);
  font-weight: 500;
}

.npc-row__sep {
  color: var(--el-text-color-placeholder);
}

/* Ghost action buttons */
.npc-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  appearance: none;
  border: 1px solid color-mix(in oklch, var(--toast-crust) 30%, transparent);
  border-radius: 4px;
  background: transparent;
  color: var(--toast-crust);
  font-size: 11.5px;
  font-weight: 500;
  padding: 2px 7px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.npc-action-btn:hover {
  background: color-mix(in oklch, var(--toast-crust) 12%, transparent);
  border-color: color-mix(in oklch, var(--toast-crust) 55%, transparent);
  color: color-mix(in oklch, var(--toast-crust) 90%, var(--el-text-color-primary));
}

.npc-action-btn:focus-visible {
  outline: 2px solid var(--toast-crust);
  outline-offset: 1px;
}

.npc-action-btn__icon {
  font-size: 12px;
  line-height: 1;
}

/* Mobile: stack layout */
@media (max-width: 640px) {
  .npc-row__main {
    grid-template-columns: 40px 30px 1fr auto;
    padding: 8px 4px 4px;
    gap: 8px;
  }

  /* Move price and subtotal to second line via subgrid would be complex; simplest: hide unit price */
  .npc-row__price {
    display: none;
  }

  .npc-row__info-bar {
    padding-left: 42px;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .npc-row__location {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
  }
}

@media (pointer: coarse) {
  .npc-action-btn {
    padding: 6px 12px;
    font-size: 13px;
  }
}
</style>

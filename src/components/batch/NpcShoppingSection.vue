<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ServerGroup, MaterialWithPrice } from '@/services/shopping-list'
import type { NpcPurchaseCandidate } from '@/stores/batch'
import { useBatchStore } from '@/stores/batch'
import { formatGil } from '@/utils/format'
import NpcShoppingRow from './NpcShoppingRow.vue'
import ZoneMapSheet from '@/components/bom/ZoneMapSheet.vue'

const props = defineProps<{
  group: ServerGroup
  candidates: NpcPurchaseCandidate[]
}>()

const batchStore = useBatchStore()

/** O(1) lookup: itemId → NpcPurchaseCandidate */
const candidateMap = computed(() => {
  const m = new Map<number, NpcPurchaseCandidate>()
  for (const c of props.candidates) m.set(c.itemId, c)
  return m
})

/** True when row[i] shares the same NPC+zone as row[i-1] */
function isMergedWithPrev(i: number): boolean {
  if (i === 0) return false
  const items = props.group.items
  const prev = candidateMap.value.get(items[i - 1].itemId)
  const curr = candidateMap.value.get(items[i].itemId)
  return prev?.npcId === curr?.npcId && prev?.zoneId === curr?.zoneId
}

function isDone(row: MaterialWithPrice): boolean {
  return batchStore.doneNpcIds.has(row.itemId)
}

function handleToggleDone(itemId: number) {
  const wasDone = batchStore.doneNpcIds.has(itemId)
  batchStore.markNpcPurchaseDone(itemId, !wasDone)
}

// Map sheet — one drawer shared across all rows in this section
const mapSheetOpen = ref(false)
const mapSheetZoneId = ref<number | null>(null)
const mapSheetCoords = ref<{ x: number; y: number } | null>(null)

function handleOpenMap(zoneId: number, coords: { x: number; y: number }) {
  mapSheetZoneId.value = zoneId
  mapSheetCoords.value = coords
  mapSheetOpen.value = true
}
</script>

<template>
  <div class="npc-section">
    <!-- Section header -->
    <div class="npc-header">
      <div class="npc-header__info">
        <span class="npc-header__icon" aria-hidden="true">⛟</span>
        <span class="npc-header__label">NPC 採購</span>
        <span class="npc-header__count">{{ group.items.length }} 項</span>
      </div>
      <span class="npc-header__subtotal">小計 {{ formatGil(group.subtotal) }} Gil</span>
    </div>

    <!-- Rows -->
    <ul class="npc-rows" role="list">
      <NpcShoppingRow
        v-for="(row, i) in group.items"
        :key="row.itemId"
        :row="row"
        :candidate="candidateMap.get(row.itemId) ?? null"
        :merged="isMergedWithPrev(i)"
        :done="isDone(row)"
        @toggle-done="handleToggleDone"
        @open-map="handleOpenMap"
      />
    </ul>

    <ZoneMapSheet
      v-model="mapSheetOpen"
      :zone-id="mapSheetZoneId"
      :highlight-coords="mapSheetCoords ?? undefined"
    />
  </div>
</template>

<style scoped>
.npc-section {
  border: 1px solid var(--app-border);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 2px oklch(0.40 0.05 60 / 0.04);
  background: var(--app-surface);
}

/* Header */
.npc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: color-mix(in oklch, var(--toast-crust) 8%, var(--app-surface));
  border-bottom: 1px solid var(--app-border);
}

.npc-header__info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.npc-header__icon {
  font-size: 16px;
  color: var(--toast-crust);
  flex-shrink: 0;
}

.npc-header__label {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  letter-spacing: 0.01em;
}

.npc-header__count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: color-mix(in oklch, var(--toast-crust) 12%, transparent);
  border-radius: 999px;
  padding: 1px 8px;
}

.npc-header__subtotal {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-muted, var(--el-text-color-secondary));
  font-variant-numeric: tabular-nums;
}

/* Rows list */
.npc-rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
</style>

<style>
/* Unscoped: dark-mode token adjustments */
[data-theme="dark"] .npc-section {
  background: var(--app-surface);
}

[data-theme="dark"] .npc-header {
  background: color-mix(in oklch, var(--toast-crust) 12%, var(--app-surface));
}
</style>

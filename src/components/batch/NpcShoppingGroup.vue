<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { ServerGroup, MaterialWithPrice } from '@/services/shopping-list'
import { useBatchStore } from '@/stores/batch'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useNpcName } from '@/composables/useNpcName'
import { useZoneName } from '@/composables/useZoneName'
import { buildTpCommand } from '@/utils/ff14-map-link'
import { trackEvent } from '@/utils/analytics'
import { formatGil } from '@/utils/format'
import ItemName from '@/components/common/ItemName.vue'
import ZoneMapInline from '@/components/common/ZoneMapInline.vue'

/**
 * Renders one server-group worth of NPC-committed items.
 *
 * Visual contract: items render in the same <el-table> shape as market server
 * groups (.material-table). Only the header above differs — NPC stalls show
 * vendor identity (name + zone + coords) and route helpers (/tp, map), where
 * market groups show a single server pill. Below the header, columns and row
 * heights match the market table exactly so the two surfaces read as siblings.
 *
 * The group.server is a `npc:<npcId>` sentinel; NPC + zone + coords +
 * aetheryteName live on each row (set by store/batch.ts:finalShoppingItems).
 */
const props = defineProps<{
  group: ServerGroup
}>()

const batchStore = useBatchStore()
const isMobile = useIsMobile()
const mobileExpanded = ref(new Set<string>())

const firstItem = computed<MaterialWithPrice | undefined>(() => props.group.items[0])
const npcId = computed(() => firstItem.value?.npcId ?? 0)
const zoneId = computed(() => firstItem.value?.zoneId ?? 0)
const aetheryteName = computed(() => firstItem.value?.aetheryteName ?? null)
const coords = computed(() => firstItem.value?.coords ?? null)

const npcName = useNpcName(npcId)
const zoneName = useZoneName(zoneId)

const mapOpen = ref(false)

async function copyTp() {
  if (!aetheryteName.value) {
    ElMessage({ message: '此 NPC 附近沒有傳送點資料', type: 'info', duration: 1500 })
    return
  }
  try {
    await navigator.clipboard.writeText(buildTpCommand(aetheryteName.value))
    trackEvent('aetheryte_tp_copy', { source: 'npc_shop' })
    ElMessage({
      message: `已複製：/tp ${aetheryteName.value}`,
      type: 'success',
      duration: 1500,
    })
  } catch {
    ElMessage({ message: '複製失敗', type: 'error', duration: 1500 })
  }
}

function getRowKey(row: MaterialWithPrice): string {
  const fp = row.isFinishedProduct ? '|fp' : ''
  return `${row.itemId}|${row.type}${fp}`
}

function isRowChecked(row: MaterialWithPrice): boolean {
  return batchStore.isShoppingChecked(row.itemId, row.type, row.isFinishedProduct)
}

function rowClassName({ row }: { row: MaterialWithPrice }) {
  return isRowChecked(row) ? 'row-checked' : ''
}

function toggleMobileExpand(row: MaterialWithPrice) {
  const key = getRowKey(row)
  if (mobileExpanded.value.has(key)) {
    mobileExpanded.value.delete(key)
  } else {
    mobileExpanded.value.add(key)
  }
}

function isMobileExpanded(row: MaterialWithPrice): boolean {
  return mobileExpanded.value.has(getRowKey(row))
}
</script>

<template>
  <article class="npc-shop server-group" :class="{ 'is-map-open': mapOpen }">
    <header class="server-header server-header--npc">
      <div class="server-info">
        <span class="npc-pill">NPC</span>
        <span class="npc-name">{{ npcName }}</span>
        <span class="npc-sep" aria-hidden="true">·</span>
        <span class="npc-zone">{{ zoneName }}</span>
        <span v-if="coords" class="npc-coords">{{ coords.x.toFixed(1) }}, {{ coords.y.toFixed(1) }}</span>
        <el-text size="small" type="info" class="npc-count">{{ group.items.length }} 項</el-text>
      </div>
      <div class="server-actions">
        <span class="server-subtotal">{{ formatGil(group.subtotal) }} Gil</span>
        <button
          type="button"
          class="npc-action"
          :class="{ 'is-disabled': !aetheryteName }"
          :disabled="!aetheryteName"
          :aria-label="aetheryteName ? `複製 /tp ${aetheryteName}` : '此 NPC 附近無傳送點'"
          :title="aetheryteName ? undefined : '此 NPC 附近無傳送點'"
          @click="copyTp"
        >複製 /tp</button>
        <button
          type="button"
          class="npc-action"
          :class="{ 'is-open': mapOpen }"
          :aria-expanded="mapOpen"
          :aria-label="mapOpen ? `收起 ${zoneName} 地圖` : `展開 ${zoneName} 地圖`"
          @click="mapOpen = !mapOpen"
        >{{ mapOpen ? '收起地圖' : '展開地圖' }}</button>
      </div>
    </header>

    <!-- Desktop: same el-table as market server groups -->
    <el-table
      v-if="!isMobile"
      :data="group.items"
      size="small"
      class="material-table"
      :row-key="getRowKey"
      :row-class-name="rowClassName"
    >
      <el-table-column label="" width="44" align="center">
        <template #default="{ row }">
          <div @click.stop>
            <el-checkbox
              :model-value="isRowChecked(row)"
              :aria-label="`標記已採購：${row.name}`"
              @change="() => batchStore.toggleShoppingItem(row.itemId, row.type, row.isFinishedProduct)"
            />
          </div>
        </template>
      </el-table-column>
      <el-table-column label="" width="36">
        <template #default="{ row }">
          <img v-if="row.icon" :src="row.icon" alt="" aria-hidden="true" loading="lazy" decoding="async" class="material-icon" />
        </template>
      </el-table-column>
      <el-table-column label="素材" min-width="120">
        <template #default="{ row }">
          <span class="material-name">
            <ItemName :item-id="row.itemId" :fallback="row.name" />
          </span>
        </template>
      </el-table-column>
      <el-table-column label="類型" width="55">
        <template #default="{ row }">
          <el-tag size="small" type="info" :class="['quality-tag', 'quality-tag--nq']">
            {{ row.type.toUpperCase() }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="數量" prop="amount" width="50" />
      <el-table-column label="單價" width="70" align="right">
        <template #default="{ row }">{{ formatGil(row.unitPrice) }}</template>
      </el-table-column>
      <el-table-column label="小計" width="80" align="right">
        <template #default="{ row }">
          <el-text type="warning">{{ formatGil(row.unitPrice * row.amount) }}</el-text>
        </template>
      </el-table-column>
    </el-table>

    <!-- Mobile: same .material-cards stack as market groups -->
    <ul v-else class="material-cards">
      <li
        v-for="row in group.items"
        :key="getRowKey(row)"
        class="material-card"
        :class="{ 'material-card--checked': isRowChecked(row), 'material-card--expanded': isMobileExpanded(row) }"
      >
        <div class="material-card__row" @click="toggleMobileExpand(row)">
          <label class="material-card__check" @click.stop>
            <el-checkbox
              :model-value="isRowChecked(row)"
              :aria-label="`標記已採購：${row.name}`"
              @change="() => batchStore.toggleShoppingItem(row.itemId, row.type, row.isFinishedProduct)"
            />
          </label>
          <img v-if="row.icon" :src="row.icon" alt="" aria-hidden="true" loading="lazy" decoding="async" class="material-card__icon" />
          <div class="material-card__body">
            <div class="material-card__line1">
              <span class="material-card__name">
                <ItemName :item-id="row.itemId" :fallback="row.name" />
              </span>
              <el-tag size="small" type="info" class="material-card__type quality-tag quality-tag--nq">NQ</el-tag>
            </div>
            <div class="material-card__line2">
              <span class="material-card__qty">× {{ row.amount }}</span>
              <span class="material-card__price">{{ formatGil(row.unitPrice) }}</span>
              <strong class="material-card__subtotal">{{ formatGil(row.unitPrice * row.amount) }}</strong>
            </div>
          </div>
        </div>
      </li>
    </ul>

    <div v-if="mapOpen && zoneId" class="npc-shop__map">
      <ZoneMapInline :zone-id="zoneId" :highlight-coords="coords ?? undefined" />
    </div>
  </article>
</template>

<style scoped>
/* === Card surface (matches ShoppingList .material-table treatment) === */
.npc-shop {
  margin-bottom: 16px;
  break-inside: avoid;
}

/* === Header (mirrors .server-header from ShoppingList; NPC variant carries
 *   richer identity + route actions instead of the single server pill) === */
.server-header--npc {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: var(--space-sm);
  padding: 0 4px;
  flex-wrap: wrap;
}

.server-info {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.npc-pill {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.12em;
  color: var(--app-craft);
  background: color-mix(in oklch, var(--app-craft) 14%, transparent);
  padding: 2px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}

.npc-name {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 13.5px;
  color: var(--app-text);
}

.npc-sep {
  color: var(--app-text-muted);
  opacity: 0.55;
}

.npc-zone {
  font-size: 12.5px;
  color: var(--app-text-muted);
}

.npc-coords {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  color: var(--app-craft);
  opacity: 0.78;
}

.npc-count {
  margin-left: 4px;
}

.server-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.server-subtotal {
  color: var(--app-text-muted);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.npc-action {
  appearance: none;
  border: 1px solid color-mix(in oklch, var(--app-craft) 35%, transparent);
  background: transparent;
  color: var(--app-craft);
  font-family: 'Noto Sans TC', sans-serif;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 140ms ease-out, border-color 140ms ease-out;
}

.npc-action:hover:not(:disabled) {
  background: color-mix(in oklch, var(--app-craft) 12%, transparent);
  border-color: color-mix(in oklch, var(--app-craft) 55%, transparent);
}

.npc-action:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
}

.npc-action.is-disabled {
  color: var(--app-text-muted);
  border-color: color-mix(in oklch, var(--app-text-muted) 24%, transparent);
  cursor: not-allowed;
  opacity: 0.75;
}

.npc-action.is-open {
  background: color-mix(in oklch, var(--app-craft) 18%, transparent);
  border-color: color-mix(in oklch, var(--app-craft) 60%, transparent);
}

/* === Inherit .material-table chrome from ShoppingList (global el-table vars)
 *   We still set the same vars locally so the table looks identical even when
 *   this card renders outside of ShoppingList's scope. === */
.material-table {
  --el-table-bg-color: var(--app-surface);
  --el-table-tr-bg-color: var(--app-surface);
  --el-table-header-bg-color: oklch(0.955 0.028 80);
  --el-table-row-hover-bg-color: oklch(0.65 0.18 65 / 0.05);
  --el-table-border-color: var(--app-border);
  border: 1px solid var(--app-border);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 2px oklch(0.40 0.05 60 / 0.04);
}

.material-icon {
  width: 20px;
  height: 20px;
  border-radius: 2px;
}

.material-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.quality-tag.quality-tag--nq.el-tag {
  background: color-mix(in oklch, var(--app-craft) 12%, transparent);
  border-color: color-mix(in oklch, var(--app-craft) 22%, transparent);
  color: color-mix(in oklch, var(--app-craft) 78%, var(--el-text-color-secondary));
}

:deep(.row-checked td) {
  opacity: 0.45;
  text-decoration: line-through;
}

/* === Inline map: full width below the table === */
.npc-shop__map {
  margin-top: 8px;
  padding: 12px 14px 14px;
  background: color-mix(in oklch, var(--app-craft) 6%, var(--app-surface));
  border: 1px dashed color-mix(in oklch, var(--app-craft) 25%, transparent);
  border-radius: 10px;
}

/* === Mobile cards: same shape as ShoppingList .material-card === */
.material-cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--app-surface);
}

.material-card {
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: transparent;
  transition: background-color 0.15s, opacity 0.15s;
}

.material-card:last-child {
  border-bottom: none;
}

.material-card--checked .material-card__body {
  opacity: 0.45;
}

.material-card--checked .material-card__name {
  text-decoration: line-through;
}

.material-card__row {
  display: grid;
  grid-template-columns: 36px 30px 1fr;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  min-height: var(--touch-target-min, 44px);
}

.material-card__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: var(--touch-target-min, 44px);
}

.material-card__icon {
  width: 28px;
  height: 28px;
  border-radius: 3px;
}

.material-card__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.material-card__line1 {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--app-text);
}

.material-card__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.material-card__type {
  flex-shrink: 0;
}

.material-card__line2 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: var(--app-text-muted);
}

.material-card__qty {
  font-variant-numeric: tabular-nums;
}

.material-card__price {
  font-variant-numeric: tabular-nums;
  color: var(--app-text-muted);
}

.material-card__price::before {
  content: '·';
  margin-right: 6px;
  color: var(--app-text-muted);
}

.material-card__subtotal {
  margin-left: auto;
  color: var(--accent-gold);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 13px;
}

@media (max-width: 640px) {
  .server-header--npc {
    padding: 0;
  }
  .server-actions {
    flex-basis: 100%;
    margin-left: 0;
    justify-content: flex-end;
  }
}

@media (max-width: 640px) {
  :deep(.material-table .el-table__cell),
  :deep(.material-table .cell) {
    padding-left: 4px;
    padding-right: 4px;
  }
  :deep(.material-table .el-table__cell) {
    font-size: 12px;
  }
  :deep(.material-table .el-table__cell:last-child),
  :deep(.material-table .el-table__header th:last-child) {
    display: none;
  }
}
</style>

<style>
[data-theme="dark"] .material-table {
  --el-table-header-bg-color: var(--app-surface-2);
  --el-table-row-hover-bg-color: var(--app-accent-soft);
}
</style>

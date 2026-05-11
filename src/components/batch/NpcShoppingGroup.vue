<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { ServerGroup, MaterialWithPrice } from '@/services/shopping-list'
import { useBatchStore } from '@/stores/batch'
import { useNpcName } from '@/composables/useNpcName'
import { useZoneName } from '@/composables/useZoneName'
import { buildTpCommand } from '@/utils/ff14-map-link'
import { formatGil } from '@/utils/format'
import ItemName from '@/components/common/ItemName.vue'
import ZoneMapInline from '@/components/common/ZoneMapInline.vue'

/**
 * Renders one server-group worth of NPC-committed items as a stall card:
 *   ┌─────────────────────────────────────────────────────┐
 *   │ NPC  喬西 · 利姆薩·羅敏薩  10.0, 8.0   小計 28 Gil   │
 *   │                       [複製 /tp] [展開地圖]          │
 *   ├─────────────────────────────────────────────────────┤
 *   │ ☐ 🧂  紅寶石番茄    ×1   16 Gil                      │
 *   │ ☐ 🍞  野洋蔥        ×1    7 Gil                      │
 *   │ ☐ 🥔  大蒜          ×1    5 Gil                      │
 *   └─────────────────────────────────────────────────────┘
 *
 * The group.server is expected to be a `npc:<npcId>` sentinel; NPC + zone +
 * coords + aetheryteName all carry on the row metadata
 * (set by store/batch.ts:finalShoppingItems applyNpcOverrides).
 */
const props = defineProps<{
  group: ServerGroup
}>()

const batchStore = useBatchStore()

/** Pull NPC info from the first row in the group — all rows in a `npc:<id>`
 *  group share the same vendor (that's the whole point of the sentinel). */
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
    ElMessage({
      message: `已複製：/tp ${aetheryteName.value}`,
      type: 'success',
      duration: 1500,
    })
  } catch {
    ElMessage({ message: '複製失敗', type: 'error', duration: 1500 })
  }
}

function isChecked(row: MaterialWithPrice) {
  return batchStore.isShoppingChecked(row.itemId, row.type, row.isFinishedProduct)
}

function toggleChecked(row: MaterialWithPrice) {
  batchStore.toggleShoppingItem(row.itemId, row.type, row.isFinishedProduct)
}
</script>

<template>
  <article class="npc-shop" :class="{ 'is-map-open': mapOpen }">
    <header class="npc-shop__head">
      <div class="npc-shop__identity">
        <span class="npc-shop__kind">NPC</span>
        <span class="npc-shop__name">{{ npcName }}</span>
        <span class="npc-shop__sep" aria-hidden="true">·</span>
        <span class="npc-shop__zone">{{ zoneName }}</span>
        <span v-if="coords" class="npc-shop__coords">{{ coords.x.toFixed(1) }}, {{ coords.y.toFixed(1) }}</span>
        <span class="npc-shop__count">{{ group.items.length }} 項</span>
      </div>
      <div class="npc-shop__actions">
        <span class="npc-shop__subtotal">{{ formatGil(group.subtotal) }} Gil</span>
        <button
          type="button"
          class="npc-shop__btn"
          :class="{ 'is-disabled': !aetheryteName }"
          :disabled="!aetheryteName"
          :aria-label="aetheryteName ? `複製 /tp ${aetheryteName}` : '此 NPC 附近無傳送點'"
          :title="aetheryteName ? undefined : '此 NPC 附近無傳送點'"
          @click="copyTp"
        >複製 /tp</button>
        <button
          type="button"
          class="npc-shop__btn"
          :class="{ 'is-open': mapOpen }"
          :aria-expanded="mapOpen"
          :aria-label="mapOpen ? `收起 ${zoneName} 地圖` : `展開 ${zoneName} 地圖`"
          @click="mapOpen = !mapOpen"
        >{{ mapOpen ? '收起地圖' : '展開地圖' }}</button>
      </div>
    </header>

    <ul class="npc-shop__items" role="list">
      <li v-for="row in group.items" :key="`${row.itemId}-${row.type}`" class="npc-shop__row">
        <label class="npc-shop__check" @click.stop>
          <input
            type="checkbox"
            :checked="isChecked(row)"
            :aria-label="`標記已採購：${row.name}`"
            @change="toggleChecked(row)"
          />
        </label>
        <img
          v-if="row.icon"
          :src="row.icon"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          class="npc-shop__icon"
        />
        <span class="npc-shop__item-name">
          <ItemName :item-id="row.itemId" :fallback="row.name" />
        </span>
        <span class="npc-shop__qty">×{{ row.amount }}</span>
        <span class="npc-shop__price">{{ formatGil(row.unitPrice * row.amount) }} Gil</span>
      </li>
    </ul>

    <div v-if="mapOpen && zoneId" class="npc-shop__map">
      <ZoneMapInline :zone-id="zoneId" :highlight-coords="coords ?? undefined" />
    </div>
  </article>
</template>

<style scoped>
.npc-shop {
  border: 1px solid var(--app-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--app-surface);
  margin-bottom: 12px;
}

.npc-shop.is-map-open .npc-shop__head {
  background: color-mix(in oklch, var(--app-craft) 10%, var(--app-surface));
}

.npc-shop__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: color-mix(in oklch, var(--app-craft) 6%, var(--app-surface));
  border-bottom: 1px solid var(--app-border);
  flex-wrap: wrap;
}

.npc-shop__identity {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.npc-shop__kind {
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

.npc-shop__name {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 14.5px;
  color: var(--app-text);
}

.npc-shop__sep {
  color: var(--app-text-muted);
  opacity: 0.55;
}

.npc-shop__zone {
  font-size: 12.5px;
  color: var(--app-text-muted);
}

.npc-shop__coords {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  color: var(--app-craft);
  opacity: 0.78;
}

.npc-shop__count {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11.5px;
  color: var(--app-text-muted);
  margin-left: 4px;
}

.npc-shop__actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.npc-shop__subtotal {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-text);
  margin-right: 4px;
}

.npc-shop__btn {
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

.npc-shop__btn:hover:not(:disabled) {
  background: color-mix(in oklch, var(--app-craft) 12%, transparent);
  border-color: color-mix(in oklch, var(--app-craft) 55%, transparent);
}

.npc-shop__btn:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
}

.npc-shop__btn.is-disabled {
  color: var(--app-text-muted);
  border-color: color-mix(in oklch, var(--app-text-muted) 24%, transparent);
  cursor: not-allowed;
  opacity: 0.75;
}

.npc-shop__btn.is-open {
  background: color-mix(in oklch, var(--app-craft) 18%, transparent);
  border-color: color-mix(in oklch, var(--app-craft) 60%, transparent);
}

.npc-shop__items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.npc-shop__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  border-top: 1px solid var(--app-border);
}

.npc-shop__row:first-child {
  border-top: 0;
}

.npc-shop__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-left: -10px;
  cursor: pointer;
  flex-shrink: 0;
}

.npc-shop__check input {
  width: 16px;
  height: 16px;
  accent-color: var(--app-craft);
  cursor: pointer;
}

.npc-shop__icon {
  width: 24px;
  height: 24px;
  border-radius: 3px;
  flex-shrink: 0;
}

.npc-shop__item-name {
  font-size: 13.5px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text);
}

.npc-shop__qty {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  color: var(--app-text-muted);
  width: 40px;
  text-align: right;
  flex-shrink: 0;
}

.npc-shop__price {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12.5px;
  color: var(--app-craft);
  font-weight: 600;
  min-width: 72px;
  text-align: right;
  flex-shrink: 0;
}

.npc-shop__map {
  padding: 12px 14px 14px;
  background: color-mix(in oklch, var(--app-craft) 6%, var(--app-surface));
  border-top: 1px dashed color-mix(in oklch, var(--app-craft) 25%, transparent);
}

@media (max-width: 640px) {
  .npc-shop__head {
    padding: 10px 12px;
  }

  .npc-shop__actions {
    flex-basis: 100%;
    margin-left: 0;
    justify-content: flex-end;
  }
}

[data-theme="dark"] .npc-shop__head {
  background: color-mix(in oklch, var(--app-craft) 14%, var(--app-surface));
}
</style>

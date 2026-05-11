<script setup lang="ts">
import { computed } from 'vue'
import type { NpcPurchaseCandidate } from '@/stores/batch'
import { useZoneName } from '@/composables/useZoneName'
import { useNpcName } from '@/composables/useNpcName'
import { useBatchStore } from '@/stores/batch'
import ItemName from '@/components/common/ItemName.vue'
import { formatGil } from '@/utils/format'

const props = defineProps<{
  npcId: number
  zoneId: number
  coords: { x: number; y: number }
  aetheryteName: string | null
  items: NpcPurchaseCandidate[]
}>()

const emit = defineEmits<{
  'open-map': [zoneId: number, coords: { x: number; y: number }, aetheryteName: string | null]
}>()

const batchStore = useBatchStore()

const npcName = useNpcName(() => props.npcId)
const zoneName = useZoneName(() => props.zoneId)

const selectedCount = computed(
  () => props.items.filter(c => batchStore.selectedNpcIds.has(c.itemId)).length,
)

const stallSavings = computed(() => {
  let total = 0
  for (const c of props.items) {
    if (batchStore.selectedNpcIds.has(c.itemId)) total += c.savings
  }
  return total
})

function isChecked(itemId: number) {
  return batchStore.selectedNpcIds.has(itemId)
}

function toggle(itemId: number) {
  batchStore.toggleNpcPurchase(itemId)
}

function selectAllInStall() {
  for (const c of props.items) {
    if (!batchStore.selectedNpcIds.has(c.itemId)) batchStore.toggleNpcPurchase(c.itemId)
  }
}

function visit() {
  emit('open-map', props.zoneId, props.coords, props.aetheryteName)
}
</script>

<template>
  <article class="vendor-stall" :class="{ 'vendor-stall--engaged': selectedCount > 0 }">
    <!-- Stall identity: NPC name + zone wayfinding -->
    <header class="vendor-stall__head">
      <div class="vendor-stall__identity">
        <h4 class="vendor-stall__name">{{ npcName }}</h4>
        <p class="vendor-stall__where">
          <span class="vendor-stall__zone">{{ zoneName }}</span>
          <span class="vendor-stall__coord">{{ coords.x.toFixed(1) }}, {{ coords.y.toFixed(1) }}</span>
        </p>
      </div>
      <button
        v-if="selectedCount < items.length"
        type="button"
        class="vendor-stall__select-all"
        @click="selectAllInStall"
      >全部加入</button>
    </header>

    <!-- Item shelf -->
    <ul class="vendor-stall__shelf" role="list">
      <li
        v-for="c in items"
        :key="c.itemId"
        class="vendor-stall__row"
        :class="{ 'vendor-stall__row--picked': isChecked(c.itemId) }"
      >
        <label class="vendor-stall__pick" @click.stop>
          <input
            type="checkbox"
            class="vendor-stall__checkbox"
            :checked="isChecked(c.itemId)"
            :aria-label="`加入採購：${c.name}`"
            @change="toggle(c.itemId)"
          />
        </label>
        <img
          v-if="c.icon"
          :src="c.icon"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          class="vendor-stall__icon"
        />
        <div class="vendor-stall__item-body">
          <span class="vendor-stall__item-name">
            <ItemName :item-id="c.itemId" :fallback="c.name" />
            <el-tag
              v-if="c.isFinishedProduct"
              size="small"
              type="info"
              class="vendor-stall__fp-badge"
            >成品</el-tag>
          </span>
          <span class="vendor-stall__qty">×{{ c.amount }}</span>
        </div>
        <span class="vendor-stall__compare">
          <span class="vendor-stall__market">{{ formatGil(c.marketPrice) }}</span>
          <span class="vendor-stall__arrow" aria-hidden="true">→</span>
          <span class="vendor-stall__npc">{{ formatGil(c.npcPrice) }}</span>
        </span>
        <span class="vendor-stall__savings">−{{ Math.round(c.savingsRatio * 100) }}%</span>
      </li>
    </ul>

    <!-- Footer: stall total + visit CTA -->
    <footer class="vendor-stall__foot">
      <p class="vendor-stall__tally">
        <template v-if="selectedCount > 0">
          <span class="vendor-stall__tally-count">{{ selectedCount }}/{{ items.length }}</span>
          <span class="vendor-stall__tally-sep" aria-hidden="true">·</span>
          <span class="vendor-stall__tally-save">省 {{ formatGil(stallSavings) }} Gil</span>
        </template>
        <template v-else>
          <span class="vendor-stall__tally-hint">勾選想買的素材</span>
        </template>
      </p>
      <button
        type="button"
        class="vendor-stall__visit"
        :class="{ 'vendor-stall__visit--ready': selectedCount > 0 }"
        @click="visit"
      >
        <span>前往拜訪</span>
        <span aria-hidden="true" class="vendor-stall__visit-arrow">▸</span>
      </button>
    </footer>
  </article>
</template>

<style scoped>
.vendor-stall {
  display: flex;
  flex-direction: column;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 14px;
  overflow: hidden;
  transition: border-color 180ms var(--ease-out-quart, cubic-bezier(0.165, 0.84, 0.44, 1)),
              box-shadow 180ms var(--ease-out-quart, cubic-bezier(0.165, 0.84, 0.44, 1));
}

.vendor-stall--engaged {
  border-color: color-mix(in oklch, var(--app-craft) 35%, var(--app-border));
  box-shadow: 0 2px 14px color-mix(in oklch, var(--app-craft) 10%, transparent);
}

/* Head — NPC identity */
.vendor-stall__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 14px;
  background: color-mix(in oklch, var(--app-craft) 5%, var(--app-surface));
  border-bottom: 1px solid var(--app-border);
}

.vendor-stall__identity {
  min-width: 0;
}

.vendor-stall__name {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 17px;
  line-height: 1.25;
  color: var(--app-text);
  margin: 0;
  letter-spacing: 0.01em;
}

.vendor-stall__where {
  margin: 4px 0 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12px;
  color: var(--app-text-muted);
}

.vendor-stall__zone {
  font-family: 'Noto Sans TC', sans-serif;
}

.vendor-stall__coord {
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--app-craft);
  opacity: 0.78;
}

.vendor-stall__select-all {
  appearance: none;
  background: transparent;
  border: none;
  color: var(--app-craft);
  font-family: 'Noto Sans TC', sans-serif;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 6px;
  margin: -4px -6px;
  border-radius: 6px;
  transition: background 140ms var(--ease-out-quart, cubic-bezier(0.165, 0.84, 0.44, 1)),
              color 140ms var(--ease-out-quart, cubic-bezier(0.165, 0.84, 0.44, 1));
  flex-shrink: 0;
  white-space: nowrap;
}

.vendor-stall__select-all:hover {
  background: color-mix(in oklch, var(--app-craft) 10%, transparent);
}

.vendor-stall__select-all:focus-visible {
  outline: 2px solid var(--accent-gold, var(--app-craft));
  outline-offset: 2px;
}

/* Shelf */
.vendor-stall__shelf {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}

.vendor-stall__row {
  display: grid;
  grid-template-columns: 32px 26px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 8px 18px;
  transition: background 140ms var(--ease-out-quart, cubic-bezier(0.165, 0.84, 0.44, 1)),
              opacity 140ms;
  opacity: 0.62;
}

.vendor-stall__row--picked {
  opacity: 1;
  background: color-mix(in oklch, var(--app-craft) 4%, transparent);
}

.vendor-stall__row:hover {
  background: color-mix(in oklch, var(--app-craft) 6%, transparent);
  opacity: 1;
}

.vendor-stall__pick {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.vendor-stall__checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--app-craft);
  cursor: pointer;
}

.vendor-stall__icon {
  width: 24px;
  height: 24px;
  border-radius: 3px;
  flex-shrink: 0;
}

.vendor-stall__item-body {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.vendor-stall__item-name {
  font-family: 'Noto Sans TC', sans-serif;
  font-size: 13.5px;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vendor-stall__fp-badge {
  margin-left: 4px;
  flex-shrink: 0;
}

.vendor-stall__qty {
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11.5px;
  color: var(--app-text-muted);
  letter-spacing: 0.02em;
}

.vendor-stall__compare {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.vendor-stall__market {
  color: var(--app-text-muted);
  text-decoration: line-through;
  text-decoration-color: color-mix(in oklch, var(--app-text-muted) 50%, transparent);
}

.vendor-stall__arrow {
  color: var(--app-text-muted);
  opacity: 0.45;
}

.vendor-stall__npc {
  color: var(--app-craft);
  font-weight: 600;
}

.vendor-stall__savings {
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--app-success);
  font-variant-numeric: tabular-nums;
  min-width: 44px;
  text-align: right;
}

/* Foot — tally + visit CTA */
.vendor-stall__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px 14px;
  border-top: 1px solid var(--app-border);
  background: color-mix(in oklch, var(--app-craft) 2%, var(--app-surface));
}

.vendor-stall__tally {
  margin: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  font-family: 'Noto Sans TC', sans-serif;
  font-size: 12.5px;
  color: var(--app-text-muted);
  min-width: 0;
}

.vendor-stall__tally-count {
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  color: var(--app-craft);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.vendor-stall__tally-sep {
  color: var(--app-text-muted);
  opacity: 0.5;
}

.vendor-stall__tally-save {
  font-family: 'Noto Serif TC', serif;
  font-style: italic;
  font-size: 12.5px;
  color: var(--app-success);
}

.vendor-stall__tally-hint {
  font-style: italic;
  color: var(--app-text-muted);
  opacity: 0.85;
}

.vendor-stall__visit {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid color-mix(in oklch, var(--app-craft) 28%, transparent);
  background: transparent;
  color: var(--app-craft);
  font-family: 'Noto Sans TC', sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 160ms var(--ease-out-quart, cubic-bezier(0.165, 0.84, 0.44, 1)),
              border-color 160ms var(--ease-out-quart, cubic-bezier(0.165, 0.84, 0.44, 1)),
              transform 120ms var(--ease-out-quart, cubic-bezier(0.165, 0.84, 0.44, 1)),
              box-shadow 160ms var(--ease-out-quart, cubic-bezier(0.165, 0.84, 0.44, 1));
  flex-shrink: 0;
}

.vendor-stall__visit:hover {
  background: color-mix(in oklch, var(--app-craft) 8%, transparent);
  border-color: color-mix(in oklch, var(--app-craft) 50%, transparent);
  transform: translateY(-1px);
}

.vendor-stall__visit--ready {
  background: var(--accent-gold, var(--app-craft));
  border-color: var(--accent-gold, var(--app-craft));
  color: var(--app-surface);
}

.vendor-stall__visit--ready:hover {
  background: color-mix(in oklch, var(--accent-gold, var(--app-craft)) 88%, white);
  border-color: color-mix(in oklch, var(--accent-gold, var(--app-craft)) 88%, white);
  box-shadow: 0 2px 10px color-mix(in oklch, var(--accent-gold, var(--app-craft)) 28%, transparent);
}

.vendor-stall__visit:focus-visible {
  outline: 2px solid var(--accent-gold, var(--app-craft));
  outline-offset: 2px;
}

.vendor-stall__visit-arrow {
  font-size: 10px;
  line-height: 1;
}

/* Mobile */
@media (max-width: 640px) {
  .vendor-stall__head {
    padding: 14px 14px 12px;
  }

  .vendor-stall__row {
    grid-template-columns: 28px 24px minmax(0, 1fr) auto;
    padding: 8px 14px;
    gap: 8px;
  }

  /* Hide the "省%" badge — implied by the strikethrough comparison */
  .vendor-stall__savings {
    display: none;
  }

  .vendor-stall__foot {
    padding: 10px 14px 12px;
  }

  .vendor-stall__name {
    font-size: 16px;
  }
}
</style>

<style>
/* Dark mode: warm up the cocoa accent so it reads in dim backgrounds */
[data-theme="dark"] .vendor-stall__head {
  background: color-mix(in oklch, var(--app-craft) 12%, var(--app-surface));
}

[data-theme="dark"] .vendor-stall__foot {
  background: color-mix(in oklch, var(--app-craft) 6%, var(--app-surface));
}

[data-theme="dark"] .vendor-stall__row--picked,
[data-theme="dark"] .vendor-stall__row:hover {
  background: color-mix(in oklch, var(--app-craft) 14%, transparent);
}
</style>

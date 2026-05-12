<script setup lang="ts">
import { computed } from 'vue'
import { useBatchStore } from '@/stores/batch'
import type { SelfCraftCandidate } from '@/stores/batch'
import { formatGil } from '@/utils/format'
import ItemName from '@/components/common/ItemName.vue'

const props = defineProps<{ candidates: SelfCraftCandidate[] }>()
const batch = useBatchStore()

const totalPotentialSavings = computed(() =>
  props.candidates.reduce((acc, c) => acc + c.savings, 0),
)

const selectedSavings = computed(() => {
  let total = 0
  for (const c of props.candidates) {
    if (batch.selectedSelfCraftIds.has(c.itemId)) total += c.savings
  }
  return total
})

const anySelected = computed(() => selectedSavings.value > 0)

const allSelected = computed(() =>
  props.candidates.length > 0 &&
  props.candidates.every(c => batch.selectedSelfCraftIds.has(c.itemId)),
)

function isChecked(id: number) {
  return batch.selectedSelfCraftIds.has(id)
}

function toggle(id: number) {
  batch.toggleSelfCraft(id)
}

function toggleAll() {
  if (allSelected.value) batch.clearSelfCraftSelection()
  else batch.selectAllSelfCraft()
}
</script>

<template>
  <details v-if="candidates.length > 0" class="sug sug-craft" open>
    <summary class="sug-head">
      <svg class="sug-chev" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M3.5 2 L7 5 L3.5 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="sug-title">自製建議</span>
      <span class="sug-summary">{{ candidates.length }} 項素材可自製</span>
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
      <div class="sc-list" role="table">
      <div
        v-for="row in candidates"
        :key="row.itemId"
        class="sc-row"
        :class="{ 'is-checked': isChecked(row.itemId) }"
        @click="toggle(row.itemId)"
      >
        <label class="sc-row__check" @click.stop>
          <input
            type="checkbox"
            :checked="isChecked(row.itemId)"
            :aria-label="`改為自製：${row.name}`"
            @change="toggle(row.itemId)"
          />
        </label>
        <img
          v-if="row.icon"
          :src="row.icon"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          class="sc-row__icon"
        />
        <span class="sc-row__name">
          <ItemName :item-id="row.itemId" :fallback="row.name" />
          <span v-if="row.hqRequired" class="sc-row__tag sc-row__tag--hq">需 HQ</span>
        </span>
        <span class="sc-row__qty">×{{ row.amount }}</span>
        <span class="sc-row__filler" aria-hidden="true" />
        <span class="sc-row__compare">
          <span class="sc-row__buy">{{ formatGil(row.buyCost) }}</span>
          <span class="sc-row__arrow" aria-hidden="true">→</span>
          <span class="sc-row__craft">{{ formatGil(row.craftCost) }}</span>
        </span>
        <span class="sc-row__savings">−{{ Math.round(row.savingsRatio * 100) }}%</span>
      </div>
      </div>
    </div>
  </details>
</template>

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
.sug-saved .num {
  font-variant-numeric: tabular-nums;
}

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

.sug-body {
  padding-top: 6px;
}

/* === Card surface (matches VendorRoster .npc-list) =================== */
.sc-list {
  border: 1px solid var(--app-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--app-surface);
  box-shadow: 0 1px 2px oklch(0.40 0.05 60 / 0.04);
}

/* === Row ============================================================= */
.sc-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
  cursor: pointer;
  transition: background 140ms ease-out;
}
.sc-row:first-child {
  border-top: 0;
}
.sc-row:hover {
  background: color-mix(in oklch, var(--app-craft) 6%, var(--app-surface));
}
.sc-row.is-checked {
  background: color-mix(in oklch, var(--app-craft) 4%, var(--app-surface));
}

.sc-row__check {
  width: 44px;
  height: 44px;
  margin-left: -10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.sc-row__check input {
  width: 16px;
  height: 16px;
  accent-color: var(--app-craft);
  cursor: pointer;
}

.sc-row__icon {
  width: 22px;
  height: 22px;
  border-radius: 3px;
  flex-shrink: 0;
}

.sc-row__name {
  font-size: 13.5px;
  color: var(--app-text);
  min-width: 100px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-row__tag {
  font-size: 10.5px;
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.04em;
}
.sc-row__tag--hq {
  background: color-mix(in oklch, var(--app-warning) 14%, transparent);
  color: var(--app-warning);
}

.sc-row__qty {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  color: var(--app-text-muted);
  width: 36px;
  text-align: right;
  flex-shrink: 0;
}

.sc-row__filler {
  flex: 1;
}

.sc-row__compare {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  width: 110px;
  display: inline-flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 6px;
  flex-shrink: 0;
}
.sc-row__buy {
  color: var(--app-text-muted);
  text-decoration: line-through;
  text-decoration-color: color-mix(in oklch, var(--app-text-muted) 50%, transparent);
}
.sc-row__arrow { color: var(--app-text-muted); opacity: 0.45; }
.sc-row__craft {
  color: var(--app-craft);
  font-weight: 600;
}

.sc-row__savings {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--app-success);
  width: 52px;
  text-align: right;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .sug-head { gap: 8px; }
  .sug-summary { flex-basis: 100%; margin-left: 24px; }
  .sug-stats { flex-basis: 100%; margin-left: 24px; }
  .sug-body { padding-left: 0; }
  .sc-row__name { min-width: 0; flex: 1; }
  .sc-row__filler { display: none; }
}
</style>

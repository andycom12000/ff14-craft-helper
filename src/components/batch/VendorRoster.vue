<script setup lang="ts">
import { computed, ref } from 'vue'
import type { NpcPurchaseCandidate } from '@/stores/batch'
import { useBatchStore } from '@/stores/batch'
import { formatGil } from '@/utils/format'
import VendorStallCard from './VendorStallCard.vue'
import ZoneMapSheet from '@/components/bom/ZoneMapSheet.vue'

const props = defineProps<{ candidates: NpcPurchaseCandidate[] }>()

const batchStore = useBatchStore()

/**
 * Group candidates by `npcId`. Each stall keeps a representative zoneId/coords/
 * aetheryteName from its first candidate — vendors are single-location, so any
 * candidate's coords serve the whole stall.
 */
interface VendorStall {
  npcId: number
  zoneId: number
  coords: { x: number; y: number }
  aetheryteName: string | null
  items: NpcPurchaseCandidate[]
}

const stalls = computed<VendorStall[]>(() => {
  const byNpc = new Map<number, VendorStall>()
  for (const c of props.candidates) {
    let stall = byNpc.get(c.npcId)
    if (!stall) {
      stall = {
        npcId: c.npcId,
        zoneId: c.zoneId,
        coords: c.coords,
        aetheryteName: c.aetheryteName,
        items: [],
      }
      byNpc.set(c.npcId, stall)
    }
    stall.items.push(c)
  }
  // Stalls with the biggest potential savings first — surfaces the most useful
  // trip without committing the user to anything.
  return [...byNpc.values()].sort((a, b) => {
    const sum = (s: VendorStall) =>
      s.items.reduce((acc, c) => acc + c.savings, 0)
    return sum(b) - sum(a)
  })
})

const totalPotentialSavings = computed(() =>
  props.candidates.reduce((acc, c) => acc + c.savings, 0),
)

const selectedSavings = computed(() => {
  let total = 0
  for (const c of props.candidates) {
    if (batchStore.selectedNpcIds.has(c.itemId)) total += c.savings
  }
  return total
})

const allSelected = computed(() =>
  props.candidates.length > 0 &&
  props.candidates.every(c => batchStore.selectedNpcIds.has(c.itemId)),
)

const anySelected = computed(() => selectedSavings.value > 0)

function toggleAll() {
  if (allSelected.value) batchStore.clearNpcPurchaseSelection()
  else batchStore.selectAllNpcPurchases()
}

// Map drawer state — one drawer instance shared across all stalls
const mapOpen = ref(false)
const mapZoneId = ref<number | null>(null)
const mapCoords = ref<{ x: number; y: number } | null>(null)
const mapAetheryte = ref<string | null>(null)

function openMap(zoneId: number, coords: { x: number; y: number }, aetheryteName: string | null) {
  mapZoneId.value = zoneId
  mapCoords.value = coords
  mapAetheryte.value = aetheryteName
  mapOpen.value = true
}
</script>

<template>
  <section v-if="stalls.length > 0" class="vendor-roster" aria-label="今天的店家名簿">
    <!-- Editorial Hero Pattern: eyebrow → italic display → gold chalk rule → aside -->
    <header class="vendor-roster__hero">
      <p class="vendor-roster__eyebrow">
        <span class="vendor-roster__eyebrow-cn">今日採購</span>
        <span class="vendor-roster__eyebrow-sep" aria-hidden="true">·</span>
        <span class="vendor-roster__eyebrow-en">STOREFRONT</span>
      </p>
      <h3 class="vendor-roster__title">今天的店家名簿</h3>
      <span class="vendor-roster__rule" aria-hidden="true" />
      <p class="vendor-roster__aside">
        <template v-if="anySelected">
          已加入採購清單，預計省下
          <span class="vendor-roster__aside-num">{{ formatGil(selectedSavings) }}</span>
          Gil。
        </template>
        <template v-else>
          這些店家比市場便宜，今天最多可以省下
          <span class="vendor-roster__aside-num">{{ formatGil(totalPotentialSavings) }}</span>
          Gil。
        </template>
      </p>

      <button
        type="button"
        class="vendor-roster__toggle-all"
        @click="toggleAll"
      >{{ allSelected ? '清空' : '全部加入' }}</button>
    </header>

    <!-- Stalls grid: auto-fit, vendor-first -->
    <div class="vendor-roster__stalls">
      <VendorStallCard
        v-for="stall in stalls"
        :key="stall.npcId"
        :npc-id="stall.npcId"
        :zone-id="stall.zoneId"
        :coords="stall.coords"
        :aetheryte-name="stall.aetheryteName"
        :items="stall.items"
        @open-map="openMap"
      />
    </div>

    <!-- Shared map drawer -->
    <ZoneMapSheet
      v-model="mapOpen"
      :zone-id="mapZoneId"
      :highlight-coords="mapCoords ?? undefined"
      :aetheryte-name="mapAetheryte ?? undefined"
    />
  </section>
</template>

<style scoped>
.vendor-roster {
  margin: 0 0 28px;
  max-width: 1080px;
}

/* === Editorial Hero Pattern === */
.vendor-roster__hero {
  position: relative;
  padding: 18px 0 18px;
  margin-bottom: 18px;
}

.vendor-roster__eyebrow {
  margin: 0 0 10px;
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--accent-gold, var(--app-craft));
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.vendor-roster__eyebrow-cn {
  font-family: 'Noto Sans TC', sans-serif;
  letter-spacing: 0.18em;
}

.vendor-roster__eyebrow-sep {
  opacity: 0.55;
}

.vendor-roster__title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 700;
  font-size: clamp(22px, 2.6vw, 28px);
  line-height: 1.15;
  color: var(--app-text);
  margin: 0;
  letter-spacing: 0.01em;
}

/* Gold chalk underline — short rule under the title */
.vendor-roster__rule {
  display: block;
  width: 56px;
  height: 2px;
  background: var(--accent-gold, var(--app-craft));
  margin: 10px 0 12px;
  border-radius: 2px;
}

.vendor-roster__aside {
  margin: 0;
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
  font-size: 16px;
  line-height: 1.6;
  color: var(--app-text-muted);
  max-width: 56ch;
}

.vendor-roster__aside-num {
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-style: normal;
  font-size: 14px;
  font-weight: 600;
  color: var(--app-success);
  padding: 0 2px;
}

.vendor-roster__toggle-all {
  position: absolute;
  top: 18px;
  right: 0;
  appearance: none;
  background: transparent;
  border: 1px solid var(--app-border);
  color: var(--app-text-muted);
  font-family: 'Noto Sans TC', sans-serif;
  font-size: 12.5px;
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 140ms var(--ease-out-quart, cubic-bezier(0.165, 0.84, 0.44, 1)),
              color 140ms var(--ease-out-quart, cubic-bezier(0.165, 0.84, 0.44, 1)),
              border-color 140ms var(--ease-out-quart, cubic-bezier(0.165, 0.84, 0.44, 1));
}

.vendor-roster__toggle-all:hover {
  background: color-mix(in oklch, var(--app-craft) 8%, transparent);
  color: var(--app-text);
  border-color: color-mix(in oklch, var(--app-craft) 40%, var(--app-border));
}

.vendor-roster__toggle-all:focus-visible {
  outline: 2px solid var(--accent-gold, var(--app-craft));
  outline-offset: 2px;
}

/* === Stall grid === */
.vendor-roster__stalls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 14px;
}

@media (max-width: 640px) {
  .vendor-roster {
    margin-bottom: 22px;
  }

  .vendor-roster__hero {
    padding: 10px 0 14px;
    margin-bottom: 14px;
  }

  .vendor-roster__toggle-all {
    top: 10px;
  }

  .vendor-roster__aside {
    font-size: 14px;
    max-width: none;
  }

  .vendor-roster__stalls {
    grid-template-columns: 1fr;
  }
}
</style>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElSkeleton } from 'element-plus'
import { useBomStore } from '@/stores/bom'
import { useLocaleStore } from '@/stores/locale'
import { sortRoute } from '@/services/route-planner'
import { getNpcNameSync } from '@/services/zone-meta'
import type { AetheryteInfo, RouteRow, ChosenSource, RouteOutput } from '@/services/route-planner'
import type { Locale } from '@/services/local-data-source.types'
import RoutePlannerEyebrow from '@/components/bom/RoutePlannerEyebrow.vue'
import RoutePlannerToolbar from '@/components/bom/RoutePlannerToolbar.vue'
import RoutePlannerGroupCard from '@/components/bom/RoutePlannerGroupCard.vue'
import ZoneMapSheet from '@/components/bom/ZoneMapSheet.vue'

// ── Module-level aetherytes cache ─────────────────────────────────────────────

let _aetherytesData: Map<number, AetheryteInfo[]> | null = null

async function loadAetherytes(): Promise<Map<number, AetheryteInfo[]>> {
  if (_aetherytesData) return _aetherytesData
  try {
    const resp = await fetch('/data/aetherytes.json')
    if (!resp.ok) throw new Error('aetherytes load failed')
    const json = await resp.json()
    const map = new Map<number, AetheryteInfo[]>()
    for (const [zid, zone] of Object.entries(json.zones ?? {})) {
      map.set(Number(zid), (zone as { aetherytes?: AetheryteInfo[] }).aetherytes ?? [])
    }
    _aetherytesData = map
  } catch {
    _aetherytesData = new Map() // empty on failure; rows show ?G via sortRoute fallback
  }
  return _aetherytesData
}

// ── Stores ────────────────────────────────────────────────────────────────────

const bomStore = useBomStore()
const localeStore = useLocaleStore()

// ── Local state ───────────────────────────────────────────────────────────────

const isLoading = ref(true)
const aetherytesMap = ref<Map<number, AetheryteInfo[]>>(new Map())

// Bottom sheet state
const sheetOpen = ref(false)
const sheetZoneId = ref<number | null>(null)
const sheetCoords = ref<{ x: number; y: number } | null>(null)

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  const data = await loadAetherytes()
  aetherytesMap.value = data
  isLoading.value = false
})

// ── Computed: RouteInput rows ─────────────────────────────────────────────────

const locale = computed(() => localeStore.current as Locale)

const routeRows = computed<RouteRow[]>(() => {
  const out: RouteRow[] = []
  for (const m of bomStore.flatMaterials) {
    if (!m.isRaw) continue
    if (m.itemId < 20) continue // crystal skip
    const mode = bomStore.getEffectiveMode(m.itemId)
    if (mode !== 'npc' && mode !== 'gather') continue
    const loc = bomStore.itemLocations.get(m.itemId)
    if (!loc) continue
    const sources: ChosenSource[] = []
    if (mode === 'npc') {
      for (const v of loc.npcVendors) {
        sources.push({
          zoneId: v.zoneId,
          x: v.x,
          y: v.y,
          vendorName: getNpcNameSync(v.npcId, locale.value) ?? `#npc:${v.npcId}`,
          itemPrice: v.price,
        })
      }
    } else {
      for (const n of loc.gatherNodes) {
        sources.push({
          zoneId: n.zoneId,
          x: n.x,
          y: n.y,
          nodeLevel: n.level,
        })
      }
    }
    if (sources.length === 0) continue // skip rows with no resolvable source
    out.push({ itemId: m.itemId, mode, qty: m.totalAmount, sources })
  }
  return out
})

// ── Computed: sorted route ────────────────────────────────────────────────────

const routeOutput = computed<RouteOutput>(() => {
  return sortRoute({
    rows: routeRows.value,
    aetherytes: aetherytesMap.value,
    optimizeBy: bomStore.routeViewPrefs.optimizeBy,
    excluded: bomStore.routeViewSession.excluded,
  })
})

// ── Computed: progress ────────────────────────────────────────────────────────

const progress = computed(() => {
  const total = routeRows.value.length
  let done = 0
  for (const r of routeRows.value) {
    if (bomStore.routeViewSession.checked.has(r.itemId)) done++
  }
  return { done, total }
})

// ── Completion toast watcher ──────────────────────────────────────────────────

watch(
  () => progress.value.done === progress.value.total && progress.value.total > 0,
  (isComplete) => {
    if (isComplete) {
      ElMessage({
        message:
          '<em style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-size:18px">烤盤已清空 · 收工</em>',
        type: 'success',
        dangerouslyUseHTMLString: true,
        duration: 3000,
      })
    }
  },
)

// ── Toolbar action handlers ───────────────────────────────────────────────────

function onOptimizeByChange(v: 'gil' | 'hop') {
  bomStore.setOptimizeBy(v)
}

function onReset() {
  bomStore.routeViewSession = {
    ...bomStore.routeViewSession,
    checked: new Set(),
  }
}

function onResort() {
  // sortRoute auto-recomputes on its inputs; this handler exists for explicit
  // "nudge" UX feedback. For MVP, we just show a toast — the computed already
  // reflects latest state.
  ElMessage.info('路線已重新排序')
}

// ── Bottom sheet handlers ─────────────────────────────────────────────────────

function onOpenMapSheet(zoneId: number, coords: { x: number; y: number }) {
  sheetZoneId.value = zoneId
  sheetCoords.value = coords
  sheetOpen.value = true
}
</script>

<template>
  <div class="brp">
    <RoutePlannerEyebrow />

    <!-- 1. Loading aetherytes -->
    <div v-if="isLoading" class="brp-loading">
      <el-skeleton :rows="6" animated />
    </div>

    <!-- 2. Empty (no npc/gather rows) -->
    <div v-else-if="routeRows.length === 0" class="brp-empty" data-testid="route-empty">
      <em>今天不用出門，材料都齊了</em>
      <div class="brp-empty__rule" />
    </div>

    <!-- 3. Normal -->
    <template v-else>
      <RoutePlannerToolbar
        :optimize-by="bomStore.routeViewPrefs.optimizeBy"
        :progress="progress"
        @update:optimize-by="onOptimizeByChange"
        @reset="onReset"
        @re-sort="onResort"
      />
      <div class="brp-grid">
        <RoutePlannerGroupCard
          v-for="(g, i) in routeOutput.groups"
          :key="`${g.zoneId}-${i}`"
          :group="g"
          :class="{ 'brp-grid__cell--hero': g.isHero }"
          @open-map-sheet="onOpenMapSheet"
        />
      </div>
    </template>

    <!-- 4. Phone bottom sheet -->
    <ZoneMapSheet
      v-model="sheetOpen"
      :zone-id="sheetZoneId"
      :highlight-coords="sheetCoords"
    />
  </div>
</template>

<style scoped>
.brp {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.brp-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(440px, 1fr));
}

@media (min-width: 1700px) {
  .brp-grid {
    grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
  }
}

.brp-grid__cell--hero {
  grid-column: span 2;
}

@media (max-width: 767px) {
  .brp-grid__cell--hero {
    grid-column: span 1;
  }
}

/* Empty state */
.brp-empty {
  text-align: center;
  padding: 80px 24px;
  color: var(--app-text-muted);
}

.brp-empty em {
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
  font-size: 22px;
  display: block;
}

.brp-empty__rule {
  width: 56px;
  height: 1px;
  background: var(--app-toast-gold);
  margin: 16px auto 0;
}
</style>

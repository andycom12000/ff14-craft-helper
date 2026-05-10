<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { ElMessage, ElSkeleton } from 'element-plus'
import { useBomStore } from '@/stores/bom'
import { useLocaleStore } from '@/stores/locale'
import { sortRoute } from '@/services/route-planner'
import { getNpcNameSync } from '@/services/zone-meta'
import type { AetheryteInfo, RouteRow, ChosenSource, RouteOutput } from '@/services/route-planner'
import type { Locale } from '@/services/local-data-source.types'
import RoutePlannerToolbar from '@/components/bom/RoutePlannerToolbar.vue'
import RoutePlannerGroupCard from '@/components/bom/RoutePlannerGroupCard.vue'
import ZoneMapSheet from '@/components/bom/ZoneMapSheet.vue'
import { percentOf } from '@/utils/format'

// ── Module-level aetherytes cache ─────────────────────────────────────────────

let _aetherytesData: Map<number, AetheryteInfo[]> | null = null

async function loadAetherytes(): Promise<Map<number, AetheryteInfo[]>> {
  if (_aetherytesData) return _aetherytesData
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}data/aetherytes.json`)
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

// Stepper state — which stop is active. Falls back to 0 whenever the route
// shrinks below the current index (e.g. after re-sort or excluding a row).
const currentStopIdx = ref(0)

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

const pct = computed(() => percentOf(progress.value.done, progress.value.total))
const isComplete = computed(
  () => progress.value.total > 0 && progress.value.done >= progress.value.total,
)

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

function onReset() {
  bomStore.routeViewSession = {
    ...bomStore.routeViewSession,
    checked: new Set(),
  }
}

// ── Bottom sheet handlers ─────────────────────────────────────────────────────

function onOpenMapSheet(zoneId: number, coords: { x: number; y: number }) {
  sheetZoneId.value = zoneId
  sheetCoords.value = coords
  sheetOpen.value = true
}

// Skip the Teleport when the host slot isn't in the DOM (unit tests
// mount BomRoutePlanner standalone). Production BomView always renders
// the slot, so this resolves on first mount.
const teleportTargetReady = ref(false)
onMounted(() => {
  teleportTargetReady.value = !!document.getElementById('route-progress-slot')
})

// ── Stepper navigation ───────────────────────────────────────────────────────

watch(
  () => routeOutput.value.groups.length,
  (n) => {
    if (currentStopIdx.value >= n) currentStopIdx.value = Math.max(0, n - 1)
  },
)

const currentGroup = computed(() => routeOutput.value.groups[currentStopIdx.value] ?? null)
const totalStops = computed(() => routeOutput.value.groups.length)

const stepperItems = computed(() => {
  return routeOutput.value.groups.map((g, i) => {
    const allDone = g.rows.every((r) => bomStore.routeViewSession.checked.has(r.itemId))
    return {
      idx: i,
      zoneId: g.zoneId,
      isCurrent: i === currentStopIdx.value,
      isDone: allDone,
    }
  })
})

function gotoStop(idx: number) {
  if (idx < 0 || idx >= totalStops.value) return
  currentStopIdx.value = idx
}

/** Cyclic step — wraps around so tapping in one direction never dead-ends. */
function gotoStep(delta: number) {
  const n = totalStops.value
  if (n === 0) return
  currentStopIdx.value = (currentStopIdx.value + delta + n) % n
}

// Auto-advance to the next unfinished stop after a card's last item gets
// checked off. Defer one tick so the user sees their final ✓ animate before
// the card transitions.
watch(
  () => currentGroup.value?.rows.every((r) => bomStore.routeViewSession.checked.has(r.itemId)) ?? false,
  async (isAllDone) => {
    if (!isAllDone) return
    const idx = currentStopIdx.value
    if (idx + 1 >= totalStops.value) return
    await nextTick()
    setTimeout(() => {
      // Re-check: user may have un-checked between the schedule and the fire.
      if (currentGroup.value?.rows.every((r) => bomStore.routeViewSession.checked.has(r.itemId))) {
        gotoStop(idx + 1)
      }
    }, 600)
  },
)
</script>

<template>
  <div class="brp">
    <!-- 1. Loading aetherytes -->
    <div v-if="isLoading" class="brp-loading">
      <el-skeleton :rows="6" animated />
    </div>

    <!-- 2. Empty (no npc/gather rows) -->
    <div v-else-if="routeRows.length === 0" class="brp-empty" data-testid="route-empty">
      <em>今天不用出門，材料都齊了</em>
      <div class="brp-empty__rule" />
    </div>

    <template v-else>
      <!-- Progress bar lives in BomView's tabs row (beside the segmented
           control) so it doesn't push the stepper down a row. -->
      <Teleport v-if="teleportTargetReady" to="#route-progress-slot">
        <div class="rpt-progress" data-testid="route-toolbar">
          <el-progress
            :percentage="pct"
            :stroke-width="10"
            :show-text="false"
            :status="isComplete ? 'success' : ''"
            class="rpt-progress__bar"
            data-testid="progress"
          />
          <span class="rpt-progress__pct" data-testid="progress-pct">{{ pct }}%</span>
          <span class="rpt-progress__count" data-testid="progress-count">{{ progress.done }} / {{ progress.total }}</span>
        </div>
      </Teleport>

      <RoutePlannerToolbar>
        <button
          v-if="totalStops > 1"
          type="button"
          class="brp-stepper__nav"
          aria-label="上一站"
          @click="gotoStep(-1)"
        >‹</button>
        <nav v-if="totalStops > 1" class="brp-stepper" aria-label="採買路線進度">
          <ol class="brp-stepper__track">
            <li
              v-for="step in stepperItems"
              :key="step.idx"
              class="brp-stepper__item"
              :class="{ 'is-current': step.isCurrent, 'is-done': step.isDone }"
            >
              <button
                type="button"
                class="brp-stepper__chip"
                :aria-current="step.isCurrent ? 'step' : undefined"
                :aria-label="`第 ${step.idx + 1} 站`"
                @click="gotoStop(step.idx)"
              >
                <span class="brp-stepper__num">{{ String(step.idx + 1).padStart(2, '0') }}</span>
                <span v-if="step.isDone" class="brp-stepper__done" aria-hidden="true">✓</span>
              </button>
            </li>
          </ol>
        </nav>
        <div class="brp-actions">
          <button
            v-if="totalStops > 1"
            type="button"
            class="brp-stepper__nav"
            aria-label="下一站"
            @click="gotoStep(1)"
          >›</button>
          <button type="button" class="brp-actions__reset" @click="onReset" aria-label="重設勾選">
            ⌫ 重設
          </button>
        </div>
      </RoutePlannerToolbar>

      <!-- Active card — full main width so the map gets the room it needs. -->
      <RoutePlannerGroupCard
        v-if="currentGroup"
        :key="`stop-${currentStopIdx}`"
        :group="currentGroup"
        :stop-number="currentStopIdx + 1"
        :total-stops="totalStops"
        :next-zone-id="currentStopIdx + 1 < totalStops ? routeOutput.groups[currentStopIdx + 1].zoneId : null"
        :hide-next-hint="true"
        :force-expanded="true"
        :big-map="true"
        @open-map-sheet="onOpenMapSheet"
      />
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
  /* No overflow: hidden — that scopes the toolbar's `position: sticky`
   * to .brp instead of .b-main, which makes the toolbar stick at top:120
   * within the planner card and slam into the nav row underneath. The
   * card body's own height calc keeps the page from overflowing. */
}

/* Horizontal stepper. Lives inside the toolbar's `nav` slot so the user can
 * jump between stops on the same row as the progress bar — no extra row
 * pushing the map off-screen. Number-only chips keep the row narrow even
 * with 20+ stops; horizontal scroll handles overflow. */
.brp-stepper {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

/* Prev/next chips wrap cyclically (‹ from 01 → last, › from last → 01)
 * so one-handed scrubbing never dead-ends. */
.brp-stepper__nav {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--app-border);
  background: var(--app-cream-surface, var(--app-surface));
  color: var(--app-text);
  border-radius: 999px;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.12s ease-out, border-color 0.12s ease-out;
}
.brp-stepper__nav:hover {
  background: color-mix(in srgb, var(--app-craft) 8%, var(--app-cream-surface, var(--app-surface)));
  border-color: color-mix(in srgb, var(--app-craft) 30%, var(--app-border));
}
.brp-stepper__nav:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
}

.brp-stepper__track {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  align-items: center;
  overflow-x: auto;
  scrollbar-width: thin;
  min-width: 0;
}

.brp-stepper__item {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.brp-stepper__item + .brp-stepper__item::before {
  content: '';
  display: inline-block;
  width: 12px;
  height: 1px;
  margin: 0 -2px;
  background: var(--app-border);
}

.brp-stepper__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: 1px solid var(--app-border);
  background: var(--app-cream-surface, var(--app-surface));
  color: var(--app-text-muted);
  border-radius: 999px;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background-color 0.12s ease-out, color 0.12s ease-out, border-color 0.12s ease-out;
  white-space: nowrap;
}

.brp-stepper__chip:hover {
  background: color-mix(in srgb, var(--app-craft) 8%, var(--app-cream-surface, var(--app-surface)));
  color: var(--app-text);
}

.brp-stepper__item.is-current .brp-stepper__chip {
  background: var(--app-craft);
  color: var(--app-cream-surface, #faf7f2);
  border-color: var(--app-craft);
  box-shadow: 0 1px 4px oklch(0.28 0.04 55 / 0.20);
}

.brp-stepper__item.is-done:not(.is-current) .brp-stepper__chip {
  color: var(--app-text-muted);
  border-color: color-mix(in srgb, var(--app-craft) 20%, var(--app-border));
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--app-text-muted) 60%, transparent);
}

.brp-stepper__chip:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
}

/* Mobile: pad the chip out to a 44px touch target so finger taps don't
 * fall on the gap between adjacent stops. The visual chip stays compact
 * via inline padding; the touch target grows via min-height + extra
 * vertical padding. */
@media (max-width: 640px) {
  .brp-stepper__chip {
    min-height: var(--touch-target-min, 44px);
    padding: 9px 12px;
    font-size: 13px;
  }
}

.brp-stepper__done {
  color: var(--app-craft);
  font-weight: 700;
}

.brp-stepper__item.is-current .brp-stepper__done {
  color: var(--app-cream-surface, #faf7f2);
}

.brp-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.brp-actions__reset {
  padding: 5px 11px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-cream-surface, var(--app-surface));
  color: var(--app-text);
  font-size: 11.5px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s ease-out;
}
.brp-actions__reset:hover {
  background: var(--app-cream-hover, var(--app-surface-hover));
}
.brp-actions__reset:focus-visible {
  outline: 2px solid var(--app-toast-gold, oklch(0.78 0.13 75));
  outline-offset: 2px;
}

/* Teleport target lives in BomView's tabs row. Scoped CSS still reaches
 * it because Vue propagates the parent's data-v attribute through. */
.rpt-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.rpt-progress__bar {
  flex: 1;
  min-width: 80px;
}
.rpt-progress__pct {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--app-text);
  white-space: nowrap;
  min-width: 40px;
  text-align: center;
}
.rpt-progress__count {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11.5px;
  color: var(--app-text-muted);
  white-space: nowrap;
  min-width: 56px;
  text-align: right;
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

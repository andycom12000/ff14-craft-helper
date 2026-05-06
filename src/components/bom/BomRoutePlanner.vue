<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
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

function prevStop() {
  gotoStop(currentStopIdx.value - 1)
}

function nextStop() {
  gotoStop(currentStopIdx.value + 1)
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
      <!-- Stepper: horizontal numbered chips. Sits above the active card so
           the user can see the entire route at a glance and jump anywhere
           without scrolling through every stop. -->
      <nav class="brp-stepper" aria-label="採買路線進度">
        <ol class="brp-stepper__track">
          <li
            v-for="step in stepperItems"
            :key="step.idx"
            class="brp-stepper__item"
            :class="{
              'is-current': step.isCurrent,
              'is-done': step.isDone,
            }"
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

      <!-- Stop-to-stop navigation. Sticks to the bottom of the card so the
           user always has prev/next within reach while ticking off items. -->
      <div class="brp-nav">
        <button
          type="button"
          class="brp-nav__btn"
          :disabled="currentStopIdx === 0"
          @click="prevStop"
        >← 上一站</button>
        <span class="brp-nav__count">{{ currentStopIdx + 1 }} / {{ totalStops }}</span>
        <button
          type="button"
          class="brp-nav__btn brp-nav__btn--primary"
          :disabled="currentStopIdx + 1 >= totalStops"
          @click="nextStop"
        >下一站 →</button>
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

/* Horizontal stepper. Stays compact even at 20+ stops by ellipsing the
 * number-only chips; user clicks any chip to jump. Active chip is
 * cocoa-filled to match the card's stop badge. */
.brp-stepper {
  overflow-x: auto;
  scrollbar-width: thin;
}

.brp-stepper__track {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  align-items: center;
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

.brp-stepper__done {
  color: var(--app-craft);
  font-weight: 700;
}

.brp-stepper__item.is-current .brp-stepper__done {
  color: var(--app-cream-surface, #faf7f2);
}

/* Stop-to-stop nav. Lives below the active card; "next" is the prominent
 * CTA so the user's reading flow → "tick off this stop's items, then click
 * next" — feels like a guided checklist. */
.brp-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}

.brp-nav__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.12s ease-out, border-color 0.12s ease-out;
}

.brp-nav__btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--app-craft) 8%, var(--app-surface));
  border-color: color-mix(in srgb, var(--app-craft) 30%, var(--app-border));
}

.brp-nav__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.brp-nav__btn--primary {
  background: var(--app-craft);
  color: var(--app-cream-surface, #faf7f2);
  border-color: var(--app-craft);
}

.brp-nav__btn--primary:hover:not(:disabled) {
  background: oklch(from var(--app-craft) calc(l + 0.06) c h);
  border-color: oklch(from var(--app-craft) calc(l + 0.06) c h);
}

.brp-nav__btn:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: 2px;
}

.brp-nav__count {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 13px;
  color: var(--app-text-muted);
  font-weight: 600;
  letter-spacing: 0.04em;
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

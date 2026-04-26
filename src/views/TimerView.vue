<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, reactive, watch } from 'vue'
import { AlarmClock } from '@element-plus/icons-vue'
import { useTimerStore } from '@/stores/timer'
import { useSettingsStore } from '@/stores/settings'
import { useLocaleStore } from '@/stores/locale'
import { loadingState } from '@/services/local-data-source'
import type { GatheringNode } from '@/api/garland'
import { fetchAllTimedNodes } from '@/api/garland'
import { getEorzeaTime, getNextSpawn, formatCountdown } from '@/services/eorzea-clock'
import {
  shouldTriggerAlarm,
  buildAlarmKey,
  markAlarmFired,
  hasAlarmFired,
  clearFiredAlarmsForNode,
  playAlarmSound,
} from '@/services/alarm-manager'
import { getAggregatedPrices } from '@/api/universalis'
import type { MarketData } from '@/api/universalis'
import NodeCard from '@/components/timer/NodeCard.vue'
import NodeMinimap from '@/components/timer/NodeMinimap.vue'
import AddTrackingPanel from '@/components/timer/AddTrackingPanel.vue'
import AlarmSettingsPanel from '@/components/timer/AlarmSettingsPanel.vue'
import GlobalAlarmToggle from '@/components/timer/GlobalAlarmToggle.vue'
import AppEmptyState from '@/components/common/AppEmptyState.vue'

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------
const store = useTimerStore()
const settings = useSettingsStore()
const localeStore = useLocaleStore()

const isLoadingData = computed(() => {
  const s = loadingState[localeStore.current]
  return s.recipes || s.items || s.rlt
})

// ---------------------------------------------------------------------------
// Responsive breakpoints
// ---------------------------------------------------------------------------
const windowWidth = ref(window.innerWidth)
let resizeHandler: (() => void) | null = null

const showSidePanel = computed(() => windowWidth.value >= 1440)
const isDesktop = computed(() => windowWidth.value >= 768)
const layoutClass = computed(() => {
  if (windowWidth.value >= 2560) return 'grid-2col'
  return 'single-col'
})

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
const gatheringClassFilter = ref<'all' | 'MIN' | 'BTN'>('all')
const nodeTypeFilter = ref<'all' | 'Unspoiled' | 'Legendary' | 'Ephemeral' | 'Concealed'>('all')

// ---------------------------------------------------------------------------
// Drawer state (mobile/tablet)
// ---------------------------------------------------------------------------
const drawerVisible = ref(false)
const drawerSize = computed(() => (windowWidth.value <= 767 ? '100%' : '340px'))

// ---------------------------------------------------------------------------
// Expanded minimap state
// ---------------------------------------------------------------------------
const expandedNodes = reactive(new Set<number>())

function toggleExpanded(nodeId: number) {
  if (expandedNodes.has(nodeId)) {
    expandedNodes.delete(nodeId)
  } else {
    expandedNodes.add(nodeId)
  }
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------
const prices = reactive(new Map<number, number>())
let priceInterval: ReturnType<typeof setInterval> | null = null

async function refreshPrices() {
  const itemIds = store.trackedItems
    .map((t) => t.itemId)
    .filter((id) => id > 0)
  const uniqueIds = [...new Set(itemIds)]
  if (uniqueIds.length === 0) return

  try {
    const result: Map<number, MarketData> = await getAggregatedPrices(settings.server, uniqueIds)
    for (const [itemId, marketData] of result) {
      const mode = settings.priceDisplayMode
      let price = 0
      if (mode === 'hq') {
        price = marketData.minPriceHQ
      } else if (mode === 'minOf') {
        const nq = marketData.minPriceNQ || Infinity
        const hq = marketData.minPriceHQ || Infinity
        price = Math.min(nq, hq) === Infinity ? 0 : Math.min(nq, hq)
      } else {
        price = marketData.minPriceNQ
      }
      prices.set(itemId, price)
    }
  } catch (e) {
    console.warn('[TimerView] price fetch error:', e)
  }
}

// ---------------------------------------------------------------------------
// Node lookup helper
// ---------------------------------------------------------------------------
function findNode(nodeId: number): GatheringNode | undefined {
  return store.nodeCache.find((n) => n.id === nodeId)
}

// ---------------------------------------------------------------------------
// Countdown + alarm state
// ---------------------------------------------------------------------------
interface TrackedNodeState {
  node: GatheringNode
  tracked: { nodeId: number; itemId: number; alarmEnabled: boolean }
  countdown: string
  isActive: boolean
  realSecondsUntil: number
}

const trackedNodeStates = ref<TrackedNodeState[]>([])
const prevActiveStates = reactive(new Map<number, boolean>())
let tickInterval: ReturnType<typeof setInterval> | null = null

function tick() {
  const et = getEorzeaTime()
  const states: TrackedNodeState[] = []

  for (const tracked of store.trackedItems) {
    const node = findNode(tracked.nodeId)
    if (!node) continue

    const spawn = getNextSpawn(node, et)
    const countdown = spawn.isActive ? 'ACTIVE' : formatCountdown(spawn.realSecondsUntil)

    states.push({
      node,
      tracked,
      countdown,
      isActive: spawn.isActive,
      realSecondsUntil: spawn.realSecondsUntil,
    })

    // --- Alarm check ---
    const alertType = shouldTriggerAlarm({
      realSecondsUntil: spawn.realSecondsUntil,
      isActive: spawn.isActive,
      alarmSettings: store.alarmSettings,
      globalAlarmEnabled: store.globalAlarmEnabled,
      itemAlarmEnabled: tracked.alarmEnabled,
    })

    if (alertType) {
      const key = buildAlarmKey(node.id, spawn.relevantSpawnHour, alertType)
      if (!hasAlarmFired(key)) {
        markAlarmFired(key)
        playAlarmSound(store.alarmSettings.soundFile, store.alarmSettings.volume).catch(() => {})
      }
    }

    // --- Transition detection: active -> inactive clears fired alarms ---
    const wasActive = prevActiveStates.get(node.id)
    if (wasActive === true && !spawn.isActive) {
      clearFiredAlarmsForNode(node.id)
    }
    prevActiveStates.set(node.id, spawn.isActive)
  }

  trackedNodeStates.value = states
}

// ---------------------------------------------------------------------------
// Sorted + filtered list
// ---------------------------------------------------------------------------
const sortedTrackedNodes = computed(() => {
  let list = trackedNodeStates.value

  // Apply filters
  if (gatheringClassFilter.value !== 'all') {
    list = list.filter((s) => s.node.gatheringClass === gatheringClassFilter.value)
  }
  if (nodeTypeFilter.value !== 'all') {
    list = list.filter((s) => s.node.nodeType === nodeTypeFilter.value)
  }

  // Sort: active first (by remaining duration desc via realSecondsUntil=0),
  //        then upcoming/later by realSecondsUntil ascending
  return [...list].sort((a, b) => {
    if (a.isActive && !b.isActive) return -1
    if (!a.isActive && b.isActive) return 1
    if (a.isActive && b.isActive) return 0 // both active
    return a.realSecondsUntil - b.realSecondsUntil
  })
})

// ---------------------------------------------------------------------------
// Nearby nodes helper
// ---------------------------------------------------------------------------
function getNearbyNodes(node: GatheringNode): GatheringNode[] {
  return store.nodeCache.filter(
    (n) => n.id !== node.id && n.zone === node.zone && n.mapAssetPath === node.mapAssetPath && n.mapAssetPath !== '',
  )
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
onMounted(async () => {
  // Responsive listener
  resizeHandler = () => { windowWidth.value = window.innerWidth }
  window.addEventListener('resize', resizeHandler)

  // Load node cache if stale (0 or >24h)
  const ONE_DAY = 24 * 60 * 60 * 1000
  if (store.nodeCacheTimestamp === 0 || Date.now() - store.nodeCacheTimestamp > ONE_DAY) {
    const nodes = await fetchAllTimedNodes()
    if (nodes.length > 0) {
      store.nodeCache = nodes
      store.nodeCacheTimestamp = Date.now()
    }
  }

  // Start countdown ticker
  tick()
  tickInterval = setInterval(tick, 1000)

  // Fetch prices immediately + every 5 minutes
  refreshPrices()
  priceInterval = setInterval(refreshPrices, 5 * 60 * 1000)
})

// Re-fetch prices when tracked items change
watch(
  () => store.trackedItems.map((t) => t.itemId).join(','),
  () => { refreshPrices() },
)

// Sync trackedNodeStates the moment add/remove fires, instead of waiting for
// the next 1s tick — otherwise the card lingers until the interval catches up.
watch(() => store.trackedItems.length, () => { tick() })

onUnmounted(() => {
  if (tickInterval) clearInterval(tickInterval)
  if (priceInterval) clearInterval(priceInterval)
  if (resizeHandler) window.removeEventListener('resize', resizeHandler)
})
</script>

<template>
  <div class="timer-view" v-loading="isLoadingData">
    <!-- Top bar -->
    <div class="timer-header mobile-sticky-toolbar">
      <h2 class="timer-title">
        <el-icon class="title-icon"><AlarmClock /></el-icon>
        採集計時器
      </h2>
      <div class="header-controls">
        <!-- Filter chips -->
        <div class="filter-chips">
          <button
            class="chip"
            :class="{ active: gatheringClassFilter === 'all' }"
            @click="gatheringClassFilter = 'all'"
          >
            全部
          </button>
          <button
            class="chip"
            :class="{ active: gatheringClassFilter === 'MIN' }"
            @click="gatheringClassFilter = gatheringClassFilter === 'MIN' ? 'all' : 'MIN'"
          >
            採礦
          </button>
          <button
            class="chip"
            :class="{ active: gatheringClassFilter === 'BTN' }"
            @click="gatheringClassFilter = gatheringClassFilter === 'BTN' ? 'all' : 'BTN'"
          >
            園藝
          </button>
          <span class="filter-separator" />
          <button
            class="chip"
            :class="{ active: nodeTypeFilter === 'all' }"
            @click="nodeTypeFilter = 'all'"
          >
            全類型
          </button>
          <button
            class="chip chip-sm"
            :class="{ active: nodeTypeFilter === 'Unspoiled' }"
            @click="nodeTypeFilter = nodeTypeFilter === 'Unspoiled' ? 'all' : 'Unspoiled'"
          >
            未知
          </button>
          <button
            class="chip chip-sm"
            :class="{ active: nodeTypeFilter === 'Legendary' }"
            @click="nodeTypeFilter = nodeTypeFilter === 'Legendary' ? 'all' : 'Legendary'"
          >
            傳說
          </button>
          <button
            class="chip chip-sm"
            :class="{ active: nodeTypeFilter === 'Ephemeral' }"
            @click="nodeTypeFilter = nodeTypeFilter === 'Ephemeral' ? 'all' : 'Ephemeral'"
          >
            刻限
          </button>
          <button
            class="chip chip-sm"
            :class="{ active: nodeTypeFilter === 'Concealed' }"
            @click="nodeTypeFilter = nodeTypeFilter === 'Concealed' ? 'all' : 'Concealed'"
          >
            隱藏
          </button>
        </div>
        <GlobalAlarmToggle />
      </div>
    </div>

    <!-- Warning banner when global alarm off -->
    <div v-if="!store.globalAlarmEnabled" class="alarm-off-banner">
      <span class="banner-icon">&#x1F515;</span>
      所有提醒已暫停。計時器仍持續運作，但不會播放音效。
    </div>

    <!-- Main content -->
    <div class="timer-content">
      <!-- Tracking list -->
      <div class="tracking-list" :class="layoutClass">
        <template v-if="sortedTrackedNodes.length > 0">
          <NodeCard
            v-for="item in sortedTrackedNodes"
            :key="item.node.id"
            :node="item.node"
            :countdown="item.countdown"
            :isActive="item.isActive"
            :price="prices.get(item.node.itemId) ?? null"
            :alarmEnabled="item.tracked.alarmEnabled"
            :globalAlarmOff="!store.globalAlarmEnabled"
            @toggle-alarm="store.toggleItemAlarm(item.node.id)"
            @toggle-map="toggleExpanded(item.node.id)"
            @remove="store.removeTrackedItem(item.node.id)"
          >
            <NodeMinimap
              v-if="expandedNodes.has(item.node.id)"
              :node="item.node"
              :interactive="isDesktop"
              :nearbyNodes="getNearbyNodes(item.node)"
            />
          </NodeCard>
        </template>
        <AppEmptyState
          v-else
          icon="🌿"
          title="追蹤採集時間"
          :description="showSidePanel ? '從右側面板搜尋素材，加入追蹤就不會錯過採集時段' : '點擊右下角 + 按鈕搜尋素材，加入追蹤'"
        />
      </div>

      <!-- Side panel (1440-2559+) -->
      <div v-if="showSidePanel" class="side-panel">
        <AddTrackingPanel />
        <div class="side-panel-divider" />
        <AlarmSettingsPanel />
      </div>
    </div>

    <!-- FAB for mobile/tablet (<1440px) -->
    <button v-if="!showSidePanel" class="fab" @click="drawerVisible = true">+</button>
    <el-drawer
      v-model="drawerVisible"
      :size="drawerSize"
      direction="rtl"
      title="追蹤管理"
      destroy-on-close
    >
      <AddTrackingPanel />
      <div class="drawer-divider" />
      <AlarmSettingsPanel />
    </el-drawer>
  </div>
</template>

<style scoped>
.timer-view { --page-accent: var(--app-gather); --page-accent-dim: var(--app-gather-dim); }

/* ------------------------------------------------------------------ */
/* View container                                                       */
/* ------------------------------------------------------------------ */
.timer-view {
  padding: 20px 24px;
  max-width: 1200px;
  margin: 0 auto;
}

@media (min-width: 2560px) {
  .timer-view {
    max-width: 1400px;
  }
}

@media (max-width: 767px) {
  .timer-view {
    padding: 12px 10px;
    max-width: 100%;
  }
}

/* ------------------------------------------------------------------ */
/* Header                                                                */
/* ------------------------------------------------------------------ */
.timer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.timer-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text, #E2E8F0);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding-left: 14px;
  border-left: 3px solid var(--page-accent);
}

.title-icon {
  font-size: 22px;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* ------------------------------------------------------------------ */
/* Filter chips                                                         */
/* ------------------------------------------------------------------ */
.filter-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.filter-separator {
  width: 1px;
  height: 20px;
  background: oklch(0.55 0.04 65 /0.2);
  margin: 0 2px;
  flex-shrink: 0;
}

.chip {
  padding: 4px 12px;
  border-radius: 14px;
  border: 1px solid oklch(0.55 0.04 65 /0.2);
  background: oklch(0.55 0.04 65 /0.06);
  color: var(--app-text-muted, #94A3B8);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.chip:hover {
  border-color: oklch(0.55 0.04 65 /0.35);
  background: oklch(0.55 0.04 65 /0.12);
}

.chip.active {
  background: color-mix(in srgb, var(--app-gather) 18%, transparent);
  border-color: color-mix(in srgb, var(--app-gather) 50%, transparent);
  color: var(--app-gather);
  font-weight: 600;
}

.chip-sm {
  font-size: 11px;
  padding: 3px 9px;
}

/* ------------------------------------------------------------------ */
/* Alarm off banner                                                     */
/* ------------------------------------------------------------------ */
.alarm-off-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  background: color-mix(in srgb, var(--element-lightning) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--element-lightning) 30%, transparent);
  border-radius: 8px;
  color: var(--element-lightning);
  font-size: 13px;
  font-weight: 500;
}

.banner-icon {
  font-size: 16px;
  flex-shrink: 0;
}

/* ------------------------------------------------------------------ */
/* Main content layout                                                  */
/* ------------------------------------------------------------------ */
.timer-content {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

/* ------------------------------------------------------------------ */
/* Tracking list                                                        */
/* ------------------------------------------------------------------ */
.tracking-list {
  flex: 1;
  min-width: 0;
}

.tracking-list.single-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tracking-list.grid-2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* ------------------------------------------------------------------ */
/* Empty state                                                          */
/* ------------------------------------------------------------------ */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 12px;
  opacity: 0.6;
}

.empty-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text, #E2E8F0);
  margin: 0 0 8px;
}

.empty-hint {
  font-size: 13px;
  color: var(--app-text-muted, #94A3B8);
  margin: 0;
}

/* ------------------------------------------------------------------ */
/* Side panel (1440+)                                                   */
/* ------------------------------------------------------------------ */
.side-panel {
  flex: 0 0 300px;
  position: sticky;
  top: 20px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px;
  background: var(--app-surface, #1E293B);
  border: 1px solid oklch(0.55 0.04 65 /0.1);
  border-radius: 10px;
}

.side-panel-divider {
  height: 1px;
  background: oklch(0.55 0.04 65 /0.1);
}

/* ------------------------------------------------------------------ */
/* FAB                                                                  */
/* ------------------------------------------------------------------ */
.fab {
  position: fixed;
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  right: calc(24px + env(safe-area-inset-right, 0px));
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  background: var(--app-accent);
  color: var(--app-text);
  font-size: 28px;
  font-weight: 300;
  line-height: 1;
  cursor: pointer;
  box-shadow:
    0 4px 14px oklch(0.65 0.18 65 /0.22),
    0 2px 4px rgba(0, 0, 0, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  z-index: 100;
}

.fab:hover {
  transform: scale(1.05);
  box-shadow:
    0 6px 20px oklch(0.65 0.18 65 /0.3),
    0 3px 6px rgba(0, 0, 0, 0.32);
}

.fab:active {
  transform: scale(0.95);
}

/* ------------------------------------------------------------------ */
/* Drawer divider                                                       */
/* ------------------------------------------------------------------ */
.drawer-divider {
  height: 1px;
  background: oklch(0.55 0.04 65 /0.1);
  margin: 12px 0;
}

/* ------------------------------------------------------------------ */
/* Responsive: 768-1439px                                               */
/* ------------------------------------------------------------------ */
@media (max-width: 1439px) {
  .timer-view {
    max-width: 100%;
  }
}

/* ------------------------------------------------------------------ */
/* Responsive: mobile                                                   */
/* ------------------------------------------------------------------ */
@media (max-width: 767px) {
  .timer-header {
    flex-direction: column;
    gap: 8px;
    padding-top: 12px;
    padding-bottom: 12px;
    margin-bottom: 12px;
  }

  /* Page title is already shown in the global app bar */
  .timer-title {
    display: none;
  }

  .header-controls {
    width: 100%;
    justify-content: space-between;
  }

  .filter-chips {
    gap: 4px;
  }

  .chip {
    padding: 10px 12px;
    font-size: 12px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }

  .chip-sm {
    padding: 8px 10px;
    font-size: 11px;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
  }

  .fab {
    bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    right: calc(16px + env(safe-area-inset-right, 0px));
    width: 48px;
    height: 48px;
    font-size: 24px;
  }
}
</style>

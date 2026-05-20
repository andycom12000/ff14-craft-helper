<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGaSnapshot } from '@/composables/useGaSnapshot'
import { eventLabel } from '@/components/ga-dashboard/event-labels'
import { stripPath } from '@/components/ga-dashboard/paths'
import { fmtInt, fmtPct } from '@/components/ga-dashboard/formatters'
import type { WindowKey } from '@/types/ga-snapshot'

import HeroBand from '@/components/ga-dashboard/pieces/HeroBand.vue'
import LedgerGlance from '@/components/ga-dashboard/pieces/LedgerGlance.vue'
import WindowSelector from '@/components/ga-dashboard/pieces/WindowSelector.vue'
import SectionHead from '@/components/ga-dashboard/pieces/SectionHead.vue'
import TldrLine from '@/components/ga-dashboard/pieces/TldrLine.vue'

import PagesTreemap from '@/components/ga-dashboard/charts/PagesTreemap.vue'
import ChannelsBar from '@/components/ga-dashboard/charts/ChannelsBar.vue'
import PagesTable from '@/components/ga-dashboard/charts/PagesTable.vue'
import SolverBatchFunnels from '@/components/ga-dashboard/charts/SolverBatchFunnels.vue'
import SimulatorFunnel from '@/components/ga-dashboard/charts/SimulatorFunnel.vue'
import Q4FunnelDrops from '@/components/ga-dashboard/charts/Q4FunnelDrops.vue'
import FailuresBar from '@/components/ga-dashboard/charts/FailuresBar.vue'
import WebVitalsStack from '@/components/ga-dashboard/charts/WebVitalsStack.vue'
import FlipBands from '@/components/ga-dashboard/charts/FlipBands.vue'
import ReturningEventsBar from '@/components/ga-dashboard/charts/ReturningEventsBar.vue'
import PagesCompareBar from '@/components/ga-dashboard/charts/PagesCompareBar.vue'

import '@/components/ga-dashboard/tokens.css'

const { snapshot, loading, error, isStale, staleHours, load } = useGaSnapshot()
const win = ref<WindowKey>('7d')

onMounted(load)

const bucket = computed(() => snapshot.value?.windows[win.value] ?? null)

const tldrQ1 = computed(() => {
  const b = bucket.value
  if (!b) return ''
  const pages = b.pages.filter(p => p.views >= 5).sort((x, y) => y.views - x.views)
  const topThree = pages.slice(0, 3).map(p => {
    const s = stripPath(p.path)
    return s === 'home' ? 'home' : `/${s}`
  }).join(' · ')
  const topChannel = [...b.channels].sort((x, y) => y.sessions - x.sessions)[0]
  return `本期注意力集中在 ${topThree}。主要進站來源：${topChannel?.channel ?? '—'}（${fmtInt(topChannel?.sessions ?? 0)} sessions），決定哪個頁面值得繼續投資。`
})

const tldrQ2 = computed(() => {
  const b = bucket.value
  if (!b) return ''
  const real = b.q4Funnels.filter(f => f.flag !== 'noise')
  const worst = [...real].sort((x, y) => (x.to / x.from) - (y.to / y.from))[0]
  const worstRate = worst ? (worst.to / worst.from * 100).toFixed(1) + '%' : '—'
  const failTop = [...b.failures].sort((x, y) => y.count - x.count)[0]
  return `最大流失：${worst?.name ?? '—'} 僅 ${worstRate}（${fmtInt(worst?.to ?? 0)}/${fmtInt(worst?.from ?? 0)}）。首要排除：${failTop?.reason ?? '無 failure'}（${fmtInt(failTop?.count ?? 0)} 次）。`
})

const tldrQ3 = computed(() => {
  const b = bucket.value
  if (!b) return ''
  const g = b.glance.activeUsers
  const topEvt = b.returningEvents[0]
  return `回訪用戶 ${fmtPct(g.returningPct)}（${fmtInt(g.returning)}/${fmtInt(g.total)}），重複使用集中在「${eventLabel(topEvt?.event ?? '')}」（${fmtInt(topEvt?.count ?? 0)} 次／${fmtInt(topEvt?.users ?? 0)} 人）。`
})
</script>

<template>
  <div class="ga-dashboard">
    <div class="wrap">
      <template v-if="loading">
        <div class="state">Loading snapshot…</div>
      </template>

      <template v-else-if="error">
        <div class="state error">
          無法載入 snapshot：{{ error.message }}
          <button @click="load">Retry</button>
        </div>
      </template>

      <template v-else-if="snapshot">
        <HeroBand :snapshot="snapshot" :window="win" />

        <div v-if="isStale" class="stale-badge">
          SNAPSHOT {{ staleHours }}h OLD · CRON MAY HAVE FAILED
        </div>

        <WindowSelector v-model="win" />
        <LedgerGlance :snapshot="snapshot" :window="win" />

        <section class="q">
          <SectionHead num="i." title="Q1 — Where attention landed" aside="pages · channels · per-page health" />
          <TldrLine :text="tldrQ1" />
          <h3 class="sub-head">Pages by view share</h3>
          <PagesTreemap :data="snapshot.windows[win].pages" />
          <h3 class="sub-head">How they arrived</h3>
          <ChannelsBar :data="snapshot.windows[win].channels" />
          <h3 class="sub-head">Per-page health vs median</h3>
          <PagesTable :data="snapshot.windows[win].pages" />
        </section>

        <section class="q">
          <SectionHead num="ii." title="Q2 — Where the flow leaks" aside="funnels · drop rates · friction" />
          <TldrLine :text="tldrQ2" />
          <h3 class="sub-head">Funnels — solver &amp; batch</h3>
          <SolverBatchFunnels :data="{ solver: snapshot.windows[win].solverFunnel, batch: snapshot.windows[win].batchFunnel }" />
          <h3 class="sub-head">Simulator: visit → macro export</h3>
          <SimulatorFunnel :data="snapshot.windows[win].simulatorFunnel" />
          <h3 class="sub-head">Page-level drop rates</h3>
          <Q4FunnelDrops :data="snapshot.windows[win].q4Funnels" />
          <h3 class="sub-head">Top failure reasons</h3>
          <FailuresBar :data="snapshot.windows[win].failures" />
          <h3 class="sub-head">Web vitals</h3>
          <WebVitalsStack :data="snapshot.windows[win].vitals" />
        </section>

        <section class="q">
          <SectionHead num="iii." title="Q3 — Who brings the weight" aside="new vs returning · what they do" />
          <TldrLine :text="tldrQ3" />
          <h3 class="sub-head">The flip — users vs sessions</h3>
          <FlipBands :data="snapshot.windows[win].flip" />
          <h3 class="sub-head">What returnees do</h3>
          <ReturningEventsBar :data="snapshot.windows[win].returningEvents" />
          <h3 class="sub-head">Pages — all users vs returning</h3>
          <PagesCompareBar :data="{ all: snapshot.windows[win].pages, returning: snapshot.windows[win].returningPages }" />
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  max-width: 1720px;
  margin: 0 auto;
  padding: 80px clamp(48px, 5vw, 96px) 120px;
}
.state {
  padding: 60px 0; text-align: center;
  color: var(--ink-muted);
  font-family: 'Cormorant Garamond', serif;
  font-style: italic; font-size: 22px;
}
.state.error { color: var(--danger); }
.state.error button {
  margin-left: 14px;
  background: var(--gold); color: var(--bg-deep);
  border: none; border-radius: 6px;
  padding: 6px 14px;
  font-family: 'Fira Code', monospace; font-size: 12px;
  cursor: pointer;
}
.stale-badge {
  display: inline-block;
  margin-bottom: 24px;
  padding: 6px 14px;
  border: 1px solid var(--warning);
  border-radius: 999px;
  color: var(--warning);
  font-family: 'Fira Code', monospace; font-size: 11px;
  letter-spacing: 0.18em; text-transform: uppercase;
}
section.q { margin-bottom: 96px; }
.sub-head {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600; font-size: 16px; color: var(--ink);
  margin: 44px 0 14px;
  display: flex; align-items: center; gap: 12px;
}
.sub-head::before {
  content: ''; width: 18px; height: 1px;
  background: var(--gold); flex-shrink: 0;
}
</style>

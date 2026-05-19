<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useGaSnapshot } from '@/composables/useGaSnapshot'
import type { WindowKey } from '@/types/ga-snapshot'

import HeroBand from '@/components/ga-dashboard/pieces/HeroBand.vue'
import LedgerGlance from '@/components/ga-dashboard/pieces/LedgerGlance.vue'
import WindowSelector from '@/components/ga-dashboard/pieces/WindowSelector.vue'
import SectionHead from '@/components/ga-dashboard/pieces/SectionHead.vue'

import PagesTreemap from '@/components/ga-dashboard/charts/PagesTreemap.vue'
import ChannelsBar from '@/components/ga-dashboard/charts/ChannelsBar.vue'
import SolverBatchFunnels from '@/components/ga-dashboard/charts/SolverBatchFunnels.vue'
import SimulatorFunnel from '@/components/ga-dashboard/charts/SimulatorFunnel.vue'
import FailuresBar from '@/components/ga-dashboard/charts/FailuresBar.vue'
import WebVitalsStack from '@/components/ga-dashboard/charts/WebVitalsStack.vue'
import EngagementScatter from '@/components/ga-dashboard/charts/EngagementScatter.vue'
import FlipBands from '@/components/ga-dashboard/charts/FlipBands.vue'
import ReturningEventsBar from '@/components/ga-dashboard/charts/ReturningEventsBar.vue'
import PagesCompareBar from '@/components/ga-dashboard/charts/PagesCompareBar.vue'
import Q4FunnelDrops from '@/components/ga-dashboard/charts/Q4FunnelDrops.vue'
import MarketRegionStack from '@/components/ga-dashboard/charts/MarketRegionStack.vue'

import '@/components/ga-dashboard/tokens.css'

const { snapshot, loading, error, isStale, staleHours, load } = useGaSnapshot()
const win = ref<WindowKey>('7d')

onMounted(load)
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
          <SectionHead num="i." title="Q1 — Where attention landed" aside="treemap by views" />
          <PagesTreemap :data="snapshot.windows[win].pages" />
          <h3 class="sub-head">How they arrived</h3>
          <ChannelsBar :data="snapshot.windows[win].channels" />
        </section>

        <section class="q">
          <SectionHead num="ii." title="Q2 — Where the flow leaks" aside="funnels & friction" />
          <h3 class="sub-head">Funnels — solver &amp; batch</h3>
          <SolverBatchFunnels :data="{ solver: snapshot.windows[win].solverFunnel, batch: snapshot.windows[win].batchFunnel }" />
          <h3 class="sub-head">Simulator: visit → macro export</h3>
          <SimulatorFunnel :data="snapshot.windows[win].simulatorFunnel" />
          <h3 class="sub-head">Top failure reasons</h3>
          <FailuresBar :data="snapshot.windows[win].failures" />
          <h3 class="sub-head">Web vitals</h3>
          <WebVitalsStack :data="snapshot.windows[win].vitals" />
          <h3 class="sub-head">Engagement vs depth</h3>
          <EngagementScatter :data="snapshot.windows[win].pages" />
        </section>

        <section class="q">
          <SectionHead num="iii." title="Q3 — Who brings the weight" aside="new vs returning" />
          <h3 class="sub-head">The flip — users vs sessions</h3>
          <FlipBands :data="snapshot.windows[win].flip" />
          <h3 class="sub-head">What returnees do</h3>
          <ReturningEventsBar :data="snapshot.windows[win].returningEvents" />
          <h3 class="sub-head">Pages — all users vs returning</h3>
          <PagesCompareBar :data="{ all: snapshot.windows[win].pages, returning: snapshot.windows[win].returningPages }" />
        </section>

        <section class="q">
          <SectionHead num="iv." title="Q4 — New dimensions" aside="post-PR #40 instrumentation" />
          <h3 class="sub-head">Page funnel drop rates</h3>
          <Q4FunnelDrops :data="snapshot.windows[win].q4Funnels" />
          <h3 class="sub-head">Funnels × market_region</h3>
          <MarketRegionStack :data="snapshot.windows[win].marketRegion" />
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.wrap { max-width: 1180px; margin: 0 auto; padding: 80px 56px 120px; }
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
@media (max-width: 720px) { .wrap { padding: 56px 24px 80px; } }
</style>

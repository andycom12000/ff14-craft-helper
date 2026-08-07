<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useGaSnapshot } from '@/composables/useGaSnapshot'
import type { WindowKey } from '@/types/ga-snapshot'

import HeroBand from '@/components/ga-dashboard/pieces/HeroBand.vue'
import RegionSplitLedger from '@/components/ga-dashboard/pieces/RegionSplitLedger.vue'
import WindowSelector from '@/components/ga-dashboard/pieces/WindowSelector.vue'
import SectionHead from '@/components/ga-dashboard/pieces/SectionHead.vue'
import SubHead from '@/components/ga-dashboard/pieces/SubHead.vue'
import RailNav from '@/components/ga-dashboard/pieces/RailNav.vue'
import EmptyChart from '@/components/ga-dashboard/pieces/EmptyChart.vue'

import PagesTable from '@/components/ga-dashboard/charts/PagesTable.vue'
import SolverBatchFunnels from '@/components/ga-dashboard/charts/SolverBatchFunnels.vue'
import SimulatorFunnel from '@/components/ga-dashboard/charts/SimulatorFunnel.vue'
import Q4FunnelDrops from '@/components/ga-dashboard/charts/Q4FunnelDrops.vue'
import FailuresBar from '@/components/ga-dashboard/charts/FailuresBar.vue'
import WebVitalsStack from '@/components/ga-dashboard/charts/WebVitalsStack.vue'

// v2 — sections IV / V / VI
import ToolUsageByRlv from '@/components/ga-dashboard/charts/ToolUsageByRlv.vue'
import RecipeDifficultyKind from '@/components/ga-dashboard/charts/RecipeDifficultyKind.vue'
import ExpertCollectableMatrix from '@/components/ga-dashboard/charts/ExpertCollectableMatrix.vue'
import MisuseHintTally from '@/components/ga-dashboard/charts/MisuseHintTally.vue'
import ApiFailureEndpoints from '@/components/ga-dashboard/charts/ApiFailureEndpoints.vue'

import '@/components/ga-dashboard/tokens.css'
import '@/components/ga-dashboard/dashboard.css'

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
        <RailNav />
        <HeroBand id="hero" :snapshot="snapshot" :window="win" />

        <div v-if="isStale" class="stale-badge">
          SNAPSHOT {{ staleHours }}h OLD · CRON MAY HAVE FAILED
        </div>

        <WindowSelector v-model="win" />
        <RegionSplitLedger :snapshot="snapshot" :window="win" />

        <section id="sec-1" class="q">
          <SectionHead num="i." title="Q1：注意力落在哪裡" aside="各頁健康度" />
          <SubHead title="各頁健康度 · 對照中位數" />
          <PagesTable :data="snapshot.windows[win].pages" />
        </section>

        <section id="sec-2" class="q">
          <SectionHead num="ii." title="Q2：流程在哪裡漏" aside="漏斗 · 流失率 · 摩擦" />
          <SubHead title="漏斗 · Solver 與批量" />
          <SolverBatchFunnels :data="{ solver: snapshot.windows[win].solverFunnel, batch: snapshot.windows[win].batchFunnel }" />
          <SubHead title="模擬器 · 造訪 → 巨集匯出" />
          <SimulatorFunnel :data="snapshot.windows[win].simulatorFunnel" />
          <SubHead title="頁面流失率" />
          <Q4FunnelDrops :data="snapshot.windows[win].q4Funnels" />
          <SubHead title="主要失敗原因" />
          <FailuresBar :data="snapshot.windows[win].failures" />
          <SubHead title="Web Vitals" />
          <WebVitalsStack :data="snapshot.windows[win].vitals" />
        </section>

        <!-- ============ IV. Q4 — 新訪客在哪一階停下 ============ -->
        <section id="sec-4" class="q">
          <SectionHead num="iv." title="Q4：新訪客在哪一階停下" aside="配方分類 · 漫長爬坡" />

          <SubHead title="工具偏好 · 依配方等級分組" aside="不同 RLV 區間的玩家偏向哪個工具：模擬器 · 批量 · BOM" />
          <ToolUsageByRlv v-if="snapshot.windows[win].toolUsageByRlv" :data="snapshot.windows[win].toolUsageByRlv!" />
          <EmptyChart v-else label="工具偏好 · 依配方等級" hint="此區間尚無事件" />

          <SubHead title="配方難度與類型" aside="RLV 直方圖 · craft_kind 完成率" />
          <RecipeDifficultyKind v-if="snapshot.windows[win].taxonomy" :data="snapshot.windows[win].taxonomy!" />
          <EmptyChart v-else label="配方難度與類型" hint="此區間尚無事件" />

          <SubHead title="高難度 × 收藏品 矩陣" aside="每格的求解完成率與巨集複製率" />
          <ExpertCollectableMatrix v-if="snapshot.windows[win].taxonomy" :data="snapshot.windows[win].taxonomy!.matrix" />
          <EmptyChart v-else label="高難度 × 收藏品矩陣" hint="此區間尚無事件" />
        </section>

        <!-- ============ V. Q5 — 摩擦發生在哪裡 ============ -->
        <section id="sec-5" class="q section-break">
          <SectionHead num="v." title="Q5：摩擦發生在哪裡" aside="達不到的期望" />

          <SubHead title="誤用提示統計" aside="未來 in-app 引導優先序" />
          <MisuseHintTally v-if="snapshot.windows[win].misuseSignals" :data="snapshot.windows[win].misuseSignals!" />
          <EmptyChart v-else label="誤用提示統計" hint="此區間尚無事件" />
        </section>

        <!-- ============ VI. Q6 — 系統哪裡正在裂 ============ -->
        <section id="sec-6" class="q section-break">
          <SectionHead num="vi." title="Q6：系統哪裡正在裂" aside="API 失敗" />

          <SubHead title="API 失敗 · 端點排行，按 API 與狀態碼分類" aside="補完既有 FailuresBar（只看 reason）" />
          <ApiFailureEndpoints v-if="snapshot.windows[win].apiFailures" :data="snapshot.windows[win].apiFailures!" />
          <EmptyChart v-else label="API 失敗端點" hint="此區間尚無事件" />
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
.section-break { margin-top: 120px; }
</style>

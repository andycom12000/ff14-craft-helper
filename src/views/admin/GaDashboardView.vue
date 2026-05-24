<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGaSnapshot } from '@/composables/useGaSnapshot'
import { eventLabel } from '@/components/ga-dashboard/event-labels'
import { stripPath } from '@/components/ga-dashboard/paths'
import { fmtInt, fmtPct } from '@/components/ga-dashboard/formatters'
import type { WindowKey } from '@/types/ga-snapshot'

import HeroBand from '@/components/ga-dashboard/pieces/HeroBand.vue'
import RegionSplitLedger from '@/components/ga-dashboard/pieces/RegionSplitLedger.vue'
import WindowSelector from '@/components/ga-dashboard/pieces/WindowSelector.vue'
import SectionHead from '@/components/ga-dashboard/pieces/SectionHead.vue'
import SubHead from '@/components/ga-dashboard/pieces/SubHead.vue'
import TldrLine from '@/components/ga-dashboard/pieces/TldrLine.vue'
import RailNav from '@/components/ga-dashboard/pieces/RailNav.vue'
import EmptyChart from '@/components/ga-dashboard/pieces/EmptyChart.vue'

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

// v2 — sections IV / V / VI
import OnboardingMilestoneFunnel from '@/components/ga-dashboard/charts/OnboardingMilestoneFunnel.vue'
import ToolUsageByRlv from '@/components/ga-dashboard/charts/ToolUsageByRlv.vue'
import RecipeDifficultyKind from '@/components/ga-dashboard/charts/RecipeDifficultyKind.vue'
import ExpertCollectableMatrix from '@/components/ga-dashboard/charts/ExpertCollectableMatrix.vue'
import MisuseHintTally from '@/components/ga-dashboard/charts/MisuseHintTally.vue'
import RecipeEntrySource from '@/components/ga-dashboard/charts/RecipeEntrySource.vue'
import TimeToFirstAction from '@/components/ga-dashboard/charts/TimeToFirstAction.vue'
import ApiFailureEndpoints from '@/components/ga-dashboard/charts/ApiFailureEndpoints.vue'
import LocaleMissTop from '@/components/ga-dashboard/charts/LocaleMissTop.vue'
import WasmLoadProfile from '@/components/ga-dashboard/charts/WasmLoadProfile.vue'

import { useScrollReveal } from '@/composables/useScrollReveal'
import '@/components/ga-dashboard/tokens.css'
import '@/components/ga-dashboard/dashboard.css'

const { snapshot, loading, error, isStale, staleHours, load } = useGaSnapshot()
const win = ref<WindowKey>('7d')

onMounted(load)

// On-scroll reveal — adds `.reveal` (initial hidden state) then registers the
// element with the shared IntersectionObserver, which toggles `.in-view`.
const { attach } = useScrollReveal()
const vReveal = {
  mounted(el: HTMLElement) {
    el.classList.add('reveal')
    attach(el)
  },
}

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
        <RailNav />
        <HeroBand id="hero" :snapshot="snapshot" :window="win" />

        <div v-if="isStale" class="stale-badge">
          SNAPSHOT {{ staleHours }}h OLD · CRON MAY HAVE FAILED
        </div>

        <WindowSelector v-model="win" />
        <RegionSplitLedger :snapshot="snapshot" :window="win" />

        <section id="sec-1" class="q">
          <SectionHead num="i." title="Q1：注意力落在哪裡" aside="頁面 · 來源 · 各頁健康度" />
          <TldrLine :text="tldrQ1" />
          <SubHead title="頁面瀏覽佔比" />
          <PagesTreemap :data="snapshot.windows[win].pages" />
          <SubHead title="進站來源" />
          <ChannelsBar :data="snapshot.windows[win].channels" />
          <SubHead title="各頁健康度 · 對照中位數" />
          <PagesTable :data="snapshot.windows[win].pages" />
        </section>

        <section id="sec-2" class="q">
          <SectionHead num="ii." title="Q2：流程在哪裡漏" aside="漏斗 · 流失率 · 摩擦" />
          <TldrLine :text="tldrQ2" />
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

        <section id="sec-3" class="q">
          <SectionHead num="iii." title="Q3：誰把份量帶進來" aside="新訪客 vs 回訪 · 他們做什麼" />
          <TldrLine :text="tldrQ3" />
          <SubHead title="翻轉 · 用戶 vs 工作階段" />
          <FlipBands :data="snapshot.windows[win].flip" />
          <SubHead title="回訪者在做什麼" />
          <ReturningEventsBar :data="snapshot.windows[win].returningEvents" />
          <SubHead title="頁面 · 全部 vs 回訪" />
          <PagesCompareBar :data="{ all: snapshot.windows[win].pages, returning: snapshot.windows[win].returningPages }" />
        </section>

        <!-- ============ IV. Q4 — 新訪客在哪一階停下 ============ -->
        <section id="sec-4" class="q">
          <SectionHead v-reveal num="iv." title="Q4：新訪客在哪一階停下" aside="新手引導 · 配方分類 · 漫長爬坡" />

          <SubHead v-reveal title="新手里程碑 · 獨立計數" aside="viewed_recipe · ran_solver · saw_macro · used_batch（彼此獨立，非漏斗）" />
          <OnboardingMilestoneFunnel v-if="snapshot.windows[win].onboardingFunnel" v-reveal :data="snapshot.windows[win].onboardingFunnel!" />
          <EmptyChart v-else v-reveal label="新手里程碑" hint="此區間尚無事件" />

          <SubHead v-reveal title="工具偏好 · 依配方等級分組" aside="不同 RLV 區間的玩家偏向哪個工具：模擬器 · 批量 · BOM" />
          <ToolUsageByRlv v-if="snapshot.windows[win].toolUsageByRlv" v-reveal :data="snapshot.windows[win].toolUsageByRlv!" />
          <EmptyChart v-else v-reveal label="工具偏好 · 依配方等級" hint="此區間尚無事件" />

          <SubHead v-reveal title="配方難度與類型" aside="RLV 直方圖 · craft_kind 完成率" />
          <RecipeDifficultyKind v-if="snapshot.windows[win].taxonomy" v-reveal :data="snapshot.windows[win].taxonomy!" />
          <EmptyChart v-else v-reveal label="配方難度與類型" hint="此區間尚無事件" />

          <SubHead v-reveal title="高難度 × 收藏品 矩陣" aside="每格的求解完成率與巨集複製率" />
          <ExpertCollectableMatrix v-if="snapshot.windows[win].taxonomy" v-reveal :data="snapshot.windows[win].taxonomy!.matrix" />
          <EmptyChart v-else v-reveal label="高難度 × 收藏品矩陣" hint="此區間尚無事件" />
        </section>

        <!-- ============ V. Q5 — 摩擦發生在哪裡 ============ -->
        <section id="sec-5" class="q section-break">
          <SectionHead v-reveal num="v." title="Q5：摩擦發生在哪裡" aside="達不到的期望 · 進入路徑 · 第一個動作" />

          <div class="two-col">
            <div class="col">
              <SubHead v-reveal title="誤用提示統計" aside="未來 in-app 引導優先序" />
              <MisuseHintTally v-if="snapshot.windows[win].misuseSignals" v-reveal :data="snapshot.windows[win].misuseSignals!" />
              <EmptyChart v-else v-reveal label="誤用提示統計" hint="此區間尚無事件" />
            </div>
            <div class="col">
              <SubHead v-reveal title="配方進入路徑" aside="使用者實際從哪裡打開配方" />
              <RecipeEntrySource v-if="snapshot.windows[win].recipeEntrySource" v-reveal :data="snapshot.windows[win].recipeEntrySource!" />
              <EmptyChart v-else v-reveal label="配方進入路徑" hint="此區間尚無事件" />
            </div>
          </div>

          <SubHead v-reveal title="首動作時間 × 第一個事件" aside="進站 → 第一個動作 · 他們先碰什麼" />
          <TimeToFirstAction v-if="snapshot.windows[win].timeToFirstAction" v-reveal :data="snapshot.windows[win].timeToFirstAction!" />
          <EmptyChart v-else v-reveal label="首動作時間" hint="此區間尚無事件" />
        </section>

        <!-- ============ VI. Q6 — 系統哪裡正在裂 ============ -->
        <section id="sec-6" class="q section-break">
          <SectionHead v-reveal num="vi." title="Q6：系統哪裡正在裂" aside="API 失敗 · WASM 載入 · 中文名缺失" />

          <SubHead v-reveal title="API 失敗 · 端點排行，按 API 與狀態碼分類" aside="補完既有 FailuresBar（只看 reason）" />
          <ApiFailureEndpoints v-if="snapshot.windows[win].apiFailures" v-reveal :data="snapshot.windows[win].apiFailures!" />
          <EmptyChart v-else v-reveal label="API 失敗端點" hint="此區間尚無事件" />

          <!-- WASM perf is often the sparsest signal; keep it mid-section so the
               page does not close on an empty box (peak-end). -->
          <SubHead v-reveal title="正式環境 WASM 載入分佈" aside="wasm_load_ms · worker_pool_init_ms · p50 / p95 · cold-start share" />
          <WasmLoadProfile v-if="snapshot.windows[win].perfProfile" v-reveal :data="snapshot.windows[win].perfProfile!" />
          <EmptyChart v-else v-reveal label="WASM 載入分佈" hint="此區間尚無事件" />

          <SubHead v-reveal title="中文名缺失 · top items 排行" aside="資料補完優先序" />
          <LocaleMissTop v-if="snapshot.windows[win].localeMissTop" v-reveal :data="snapshot.windows[win].localeMissTop!" />
          <EmptyChart v-else v-reveal label="中文名缺失" hint="此區間尚無事件" />
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
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 80px;
}
.two-col .col > .subhead { margin-top: 24px; }
</style>

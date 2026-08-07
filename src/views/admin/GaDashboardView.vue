<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGaSnapshot } from '@/composables/useGaSnapshot'
import type { WindowKey } from '@/types/ga-snapshot'
import { fmtPct } from '@/components/ga-dashboard/formatters'

import HeroBand from '@/components/ga-dashboard/pieces/HeroBand.vue'
import TodoLedger from '@/components/ga-dashboard/pieces/TodoLedger.vue'
import RegionSplitLedger from '@/components/ga-dashboard/pieces/RegionSplitLedger.vue'
import WindowSelector from '@/components/ga-dashboard/pieces/WindowSelector.vue'
import SectionHead from '@/components/ga-dashboard/pieces/SectionHead.vue'
import RailNav from '@/components/ga-dashboard/pieces/RailNav.vue'
import EmptyChart from '@/components/ga-dashboard/pieces/EmptyChart.vue'
import L1Item from '@/components/ga-dashboard/pieces/L1Item.vue'
import L2Row from '@/components/ga-dashboard/pieces/L2Row.vue'

import PagesTable from '@/components/ga-dashboard/charts/PagesTable.vue'
import SolverBatchFunnels from '@/components/ga-dashboard/charts/SolverBatchFunnels.vue'
import SimulatorFunnel from '@/components/ga-dashboard/charts/SimulatorFunnel.vue'
import Q4FunnelDrops from '@/components/ga-dashboard/charts/Q4FunnelDrops.vue'
import FailuresBar from '@/components/ga-dashboard/charts/FailuresBar.vue'
import WebVitalsStack from '@/components/ga-dashboard/charts/WebVitalsStack.vue'
import ToolUsageByRlv from '@/components/ga-dashboard/charts/ToolUsageByRlv.vue'
import RecipeDifficultyKind from '@/components/ga-dashboard/charts/RecipeDifficultyKind.vue'
import ExpertCollectableMatrix from '@/components/ga-dashboard/charts/ExpertCollectableMatrix.vue'
import MisuseHintTally from '@/components/ga-dashboard/charts/MisuseHintTally.vue'
import ApiFailureEndpoints from '@/components/ga-dashboard/charts/ApiFailureEndpoints.vue'

import '@/components/ga-dashboard/tokens.css'
import '@/components/ga-dashboard/dashboard.css'

// ============================================================================
// #197 — layout rebuild: two sections, two-layer mirror, rail 4 items, font
// 4→3, two-tier spacing. See spec #194 §C/§E for the full rationale; this
// file only wires the 11 surviving charts (spec #196 already cut 21 → 11)
// into the new Layer I / Layer II slots. Two future charts (功能採用率,
// 裝備水準×求解結果) and one future ledger row (BOM 頁內互動) render as
// EmptyChart placeholders — spec #194 §C2/§C3 name these as net-new.
// ============================================================================

const { snapshot, loading, error, isStale, staleHours, load } = useGaSnapshot()
const win = ref<WindowKey>('7d')

onMounted(load)

// Only read within the `v-else-if="snapshot"` branch below — snapshot is
// guaranteed non-null there.
const bundle = computed(() => snapshot.value!.windows[win.value])

// The todo ledger is fixed to the 28-day window regardless of the selected
// `win` (spec §194 §C1: "待辦固定 28d，放在視窗選擇器下方會像 bug") — it must
// NOT track `bundle`/`win`, or the whole point of placing it above
// WindowSelector (unaffected by the selector) is defeated.
const todoWindowDays = computed(() => snapshot.value!.windows['28d'].window.days)

// Anchor-side readouts (spec §E3) sourced honestly from today's MetricsBundle
// — see AnchorSide.vue's doc comment. No evaluate()/threshold engine exists
// in this branch yet, so most Layer I items pass no `readout` at all.
// Denominator guard aligned to the evaluate() engine's n ≥ 30 minimum sample
// size (spec §194 §B4) — below that, a rate is noise dressed as a finding.
const MIN_DENOMINATOR = 30
const batchFailPct = computed(() => {
  const b = bundle.value.glance.batch
  return b.starts >= MIN_DENOMINATOR ? fmtPct(b.fails / b.starts) : undefined
})
const bomHandoffPct = computed(() => {
  const b = bundle.value.glance.bom
  // Pipeline sets handoffPct to 0 (not null) when calculates === 0 — an
  // unguarded read would render "0.0%" for "nobody used BOM this window",
  // which looks like a real measurement.
  return b.calculates >= MIN_DENOMINATOR ? fmtPct(b.handoffPct) : undefined
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

        <!-- 本期待辦 — page-level ledger, NOT a section (spec §C1). Fixed
             position: hero → todo → WindowSelector, fixed 28-day window
             (independent of the WindowSelector below it). Empty until the
             threshold table + evaluate() engine (spec §B) lands. -->
        <TodoLedger :window-days="todoWindowDays" />

        <WindowSelector v-model="win" />
        <RegionSplitLedger :snapshot="snapshot" :window="win" />

        <!-- ============ Ⅰ. 為什麼會亮 · 解釋現場 — chart left / anchor side
             right (spec §E3). Every item's side column names the todo that
             would point here once the evaluate() engine exists. ============ -->
        <section id="sec-why" class="layer layer-1">
          <SectionHead
            num="I" title="為什麼會亮" aside="8 CHARTS"
            desc="每一張都被上方某條待辦的 anchor 指到。右欄寫的是被指到的那條待辦與其當期讀數。"
          />

          <L1Item
            id="chart-failures" title="批量失敗原因" note="A · BATCH_FAIL_RATE"
            bound-label="批量最佳化失敗率"
            :readout="batchFailPct" readout-note="batch.fails ÷ batch.starts"
          >
            <FailuresBar :data="bundle.failures" />
          </L1Item>

          <L1Item
            id="chart-api" title="universalis 端點失敗" note="A · UNIVERSALIS_ERR"
            bound-label="universalis 真故障率"
            readout-note="待 PR-B 拆分 404「無掛單」後可用"
          >
            <ApiFailureEndpoints v-if="bundle.apiFailures" :data="bundle.apiFailures" />
            <EmptyChart v-else label="API 失敗端點" hint="此區間尚無事件" />
          </L1Item>

          <L1Item
            id="chart-funnels" title="漏斗 · Solver 與批量" note="B · SOLVER_BATCH_COMPLETE"
            bound-label="solver 完成率 · 失敗率 · 批量完成率"
            flag-text="solver 完成率／失敗率埋點待修 · 人機分離未套用 pipeline"
          >
            <SolverBatchFunnels :data="{ solver: bundle.solverFunnel, batch: bundle.batchFunnel }" />
          </L1Item>

          <L1Item
            id="chart-drops" title="頁面流失率" note="B · FUNNEL_CONVERSION"
            bound-label="BOM→批量交棒率 · 各漏斗轉換"
            :readout="bomHandoffPct" readout-note="bom.sentToBatch ÷ bom.calculates"
          >
            <Q4FunnelDrops :data="bundle.q4Funnels" />
          </L1Item>

          <L1Item
            id="chart-sim" title="模擬器 · 造訪 → 巨集匯出" note="B · MACRO_COPY_RATE"
            bound-label="巨集複製率"
            readout-note="尚無彙總分子分母（待 PR-B 追加 glance 欄位）"
            flag-text="巨集複製率埋點待修 · PR-A 剛落地（#198），資料需回填 28 天"
          >
            <SimulatorFunnel :data="bundle.simulatorFunnel" />
          </L1Item>

          <L1Item
            id="chart-misuse" title="誤用提示統計" note="C · MISUSE_×3"
            bound-label="誤用三項（單一配方 · BOM · 佇列）"
            readout-note="三項各自門檻，見下方分項"
          >
            <MisuseHintTally v-if="bundle.misuseSignals" :data="bundle.misuseSignals" />
            <EmptyChart v-else label="誤用提示統計" hint="此區間尚無事件" />
          </L1Item>

          <!-- SLOT FOR FUTURE TICKET: net-new chart, spec §194 C2. Events are
               already emitted (meld_advisor_run, cross-server usage) but the
               chart component + glance.adoption fields don't exist yet. -->
          <L1Item
            id="chart-adoption" title="功能採用率 · 跨服與鑲嵌" note="C · CROSS_SERVER / MELD_ADOPT"
            bound-label="跨伺服器使用率 · 鑲嵌建議採用率"
            readout-note="新指標，資料累積中"
          >
            <EmptyChart label="功能採用率 · 跨服與鑲嵌" hint="新圖尚未實作 · 事件已埋（#198）· spec #194 §C2" />
          </L1Item>

          <L1Item
            id="chart-vitals" title="Web Vitals" note="D · VITALS_×5"
            bound-label="Web Vitals ×5（絆線）"
            readout-note="五項各自門檻，非單一數字"
          >
            <WebVitalsStack :data="bundle.vitals" />
          </L1Item>
        </section>

        <!-- ============ Ⅱ. 背景與觀測 · drill-down — text left / continuous
             report strip right (spec §E3). ============ -->
        <section id="sec-context" class="layer layer-2">
          <SectionHead
            num="II" title="背景與觀測" aside="5 CHARTS + 1 LEDGER"
            desc="連續報表帶。左欄寫的是入場券——沒有券的圖不進這一層。"
          />

          <div class="strip">
            <L2Row
              id="chart-pages" title="各頁健康度"
              ticket="batch 完成率／BOM 交棒率亮時 → 哪一頁 bounce 高、engagement 低"
            >
              <PagesTable :data="bundle.pages" />
            </L2Row>

            <L2Row
              id="chart-rlv" title="配方難度分佈"
              ticket="BOM 交棒率亮時 → 哪個 RLV 區間在斷"
            >
              <RecipeDifficultyKind v-if="bundle.taxonomy" :data="bundle.taxonomy" />
              <EmptyChart v-else label="配方難度與類型" hint="此區間尚無事件" />
            </L2Row>

            <L2Row
              id="chart-matrix" title="配方分類 × 完成率"
              ticket="巨集複製率／solver 完成率亮時 → 哪一類配方的巨集沒人複製"
              flag-text="僅「巨集複製率」欄埋點待修 · 完成率已可信"
              :flag-partial="true"
            >
              <ExpertCollectableMatrix v-if="bundle.taxonomy" :data="bundle.taxonomy.matrix" />
              <EmptyChart v-else label="高難度 × 收藏品矩陣" hint="此區間尚無事件" />
            </L2Row>

            <L2Row
              id="chart-tool" title="工具偏好 · 依 RLV"
              ticket="BOM 交棒率亮時 → BOM 目標與批量目標的 RLV 分佈落差"
              flag-text="BOM／批量兩條分子的 RLV 歸戶待 pipeline PR"
            >
              <ToolUsageByRlv v-if="bundle.toolUsageByRlv" :data="bundle.toolUsageByRlv" />
              <EmptyChart v-else label="工具偏好 · 依配方等級" hint="此區間尚無事件" />
            </L2Row>

            <!-- SLOT FOR FUTURE TICKET: net-new chart, spec §194 C3. -->
            <L2Row
              id="chart-gear" title="裝備水準 × 求解結果"
              ticket="solver 完成率／失敗率亮時 → 哪個裝備水準求不出來"
            >
              <EmptyChart label="裝備水準 × 求解結果" hint="新圖尚未實作 · spec #194 §C3" />
            </L2Row>

            <!-- SLOT FOR FUTURE TICKET: BOM 頁內互動 — ledger row, not a
                 chart (spec §194 C4: only two raw event counts, no third
                 dimension to plot). acquisition_mode_set / breakdown_expand
                 aren't in MetricsBundle yet. -->
            <L2Row id="chart-bom-ledger" full>
              <EmptyChart label="BOM 頁內互動 · ledger 行" hint="acquisition_mode_set／breakdown_expand 尚未產出 · spec #194 §C4" />
            </L2Row>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  max-width: 1720px;
  margin: 0 auto;
  padding: 72px clamp(48px, 5vw, 96px) 140px;
}
.state {
  padding: 60px 0; text-align: center;
  color: var(--ink-muted);
  font-family: 'Fira Code', monospace;
  font-size: 13px; letter-spacing: 0.08em;
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

/* Two-tier spacing scale (spec §194 E4) — replaces the old three-tier
   96/120/56px system and the section-break/dual-grid classes it drove. */
.layer-2 {
  margin-top: 112px;
}
.layer-1, .layer-2 {
  margin-bottom: 0;
}
.strip {
  border-top: 1px solid var(--border);
  margin-top: 24px;
}
</style>

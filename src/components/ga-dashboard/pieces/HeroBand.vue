<script setup lang="ts">
import { computed } from 'vue'
import type { GaSnapshot } from '@/types/ga-snapshot'

// Hero — rebuilt per spec #194 §E2: the 72px display serif + italic English
// verse + 17px serif prose lede is retired in favour of a 34px title plus a
// four-cell monospace readout row. Font 4→3: no more Cormorant Garamond here.
const props = defineProps<{ snapshot: GaSnapshot, window: '7d' | '14d' | '28d' }>()

const bundle = computed(() => props.snapshot.windows[props.window])
const days = computed(() => bundle.value.window.days)
const range = computed(() => `${bundle.value.window.startDate} → ${bundle.value.window.endDate}`)
const g = computed(() => bundle.value.glance)
const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (n: number) => `${(n * 100).toFixed(1)}%`

// The four readout cells — #197 originally left a "SLOT FOR FUTURE TICKET"
// note here assuming spec US #17 (trend trio: current value + WoW delta +
// 7-day sparkline) would eventually mount on the hero cells too. That was a
// misreading of the spec: US #17 says "我想在**首屏的 ledger**……"（首屏 ledger,
// not hero）, and §E2 describes the hero band itself as "一排四格等寬讀數"
// (a row of four monospace readouts) — explicitly not a ledger. US #17 has
// since been delivered on `RegionSplitLedger.vue` (issue #207, three-piece
// trend on every row incl. the observation-layer metrics). There is no
// future ticket that will fill a `.trend-slot` here — the hero band's four
// cells stay as plain current-value readouts, out of US #17's scope by the
// spec's own wording. Do not add trend widgets to this component on the
// strength of this comment; if that's ever wanted it needs its own decision,
// not a leftover hook from a pre-#207 misreading.
const readouts = computed(() => [
  { key: 'active-users', label: 'ACTIVE USERS', value: fmt(g.value.activeUsers.total), note: '總活躍使用者' },
  { key: 'returning', label: 'RETURNING', value: pct(g.value.activeUsers.returningPct), note: '回訪占比' },
  { key: 'solver-complete', label: 'SOLVER COMPLETE', value: pct(g.value.solver.completePct), note: 'Solver 完成率' },
  { key: 'batch-complete', label: 'BATCH COMPLETE', value: pct(g.value.batch.completePct), note: '批量完成率' },
])
</script>

<template>
  <header class="hero">
    <div class="eyebrow">Toast Workshop · Analytics</div>
    <h1 class="title">本期需要決定的事 <span class="win">— {{ days }}d</span></h1>
    <dl class="readout">
      <div v-for="r in readouts" :key="r.key">
        <dt>{{ r.label }}</dt>
        <dd>
          {{ r.value }}
          <small>{{ r.note }}</small>
          <!-- slot: hero-trend (spec US #17 — WoW delta + 7d sparkline, needs trend file) -->
        </dd>
      </div>
    </dl>
    <div class="meta-row">
      <span>Window <strong>{{ range }}</strong></span>
      <span>Property <strong>{{ snapshot.propertyId }}</strong></span>
      <span>Generated <strong>{{ snapshot.generatedAt.slice(0, 10) }}</strong></span>
    </div>
  </header>
</template>

<style scoped>
.hero { margin-bottom: 0; }
.eyebrow {
  font-family: 'Fira Code', monospace;
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.30em; text-transform: uppercase;
  color: var(--gold);
  display: inline-flex; align-items: center; gap: 14px;
  margin-bottom: 20px;
}
.eyebrow::before { content: ''; width: 32px; height: 1px; background: var(--gold); }
.title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 700;
  font-size: 34px; line-height: 1.25; letter-spacing: -0.01em;
  margin: 0 0 22px; color: var(--ink);
}
.title .win {
  font-family: 'Fira Code', monospace;
  font-weight: 600; color: var(--gold); font-size: 30px;
}
.readout {
  display: grid; grid-template-columns: repeat(4, max-content); gap: 0 56px;
  margin: 0;
  padding: 20px 0;
  border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
}
.readout dt {
  font-family: 'Fira Code', monospace; font-size: 10.5px; font-weight: 500;
  letter-spacing: 0.16em; color: var(--ink-faint); margin-bottom: 6px;
}
.readout dd {
  margin: 0; font-family: 'Fira Code', monospace;
  font-size: 27px; font-weight: 500; line-height: 1; color: var(--ink);
}
.readout dd small {
  display: block; margin-top: 7px;
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 11px; font-weight: 400;
  letter-spacing: 0.02em; color: var(--ink-muted);
}
.meta-row {
  margin-top: 18px;
  display: flex; flex-wrap: wrap; gap: 26px;
  font-family: 'Fira Code', monospace;
  font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--ink-faint);
}
.meta-row span strong { color: var(--ink-mid); font-weight: 500; margin-left: 6px; }
</style>

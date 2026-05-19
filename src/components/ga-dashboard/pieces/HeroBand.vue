<script setup lang="ts">
import { computed } from 'vue'
import type { GaSnapshot } from '@/types/ga-snapshot'

const props = defineProps<{ snapshot: GaSnapshot, window: '7d' | '14d' | '28d' }>()

const bundle = computed(() => props.snapshot.windows[props.window])
const days = computed(() => bundle.value.window.days)
const range = computed(() => `${bundle.value.window.startDate} → ${bundle.value.window.endDate}`)
const g = computed(() => bundle.value.glance)
const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
</script>

<template>
  <header class="hero">
    <div class="eyebrow">Toast Workshop · Analytics</div>
    <h1 class="display">Last {{ days }} Days, <em>drawn out in lines.</em></h1>
    <div class="hero-rule" />
    <p class="lede">
      這段視窗工坊裡走進 <span class="figure">{{ fmt(g.activeUsers.total) }}</span> 位活躍使用者，
      <span class="figure">{{ pct(g.activeUsers.returningPct) }}</span> 是回訪。
      Solver 跑 <span class="figure">{{ fmt(g.solver.starts) }}</span> 次收
      <span class="figure">{{ pct(g.solver.completePct) }}</span>，
      批量最佳化 <span class="figure">{{ fmt(g.batch.starts) }}</span> 次收
      <span class="figure">{{ pct(g.batch.completePct) }}</span>。
    </p>
    <div class="meta-row">
      <span>Window <strong>{{ range }}</strong></span>
      <span>Property <strong>{{ snapshot.propertyId }}</strong></span>
      <span>Generated <strong>{{ snapshot.generatedAt.slice(0, 10) }}</strong></span>
    </div>
  </header>
</template>

<style scoped>
.hero { margin-bottom: 88px; }
.eyebrow {
  font-family: 'Fira Code', monospace;
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.30em; text-transform: uppercase;
  color: var(--gold);
  display: inline-flex; align-items: center; gap: 14px;
  margin-bottom: 28px;
}
.eyebrow::before { content: ''; width: 32px; height: 1px; background: var(--gold); }
.display {
  font-family: 'Noto Serif TC', serif;
  font-size: clamp(44px, 6vw, 72px);
  font-weight: 700; line-height: 1.02; letter-spacing: -0.012em;
  color: var(--ink); margin: 0 0 18px;
}
.display em {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic; font-weight: 500;
  color: var(--ink-mid); letter-spacing: -0.005em;
}
.hero-rule {
  height: 1px;
  background: linear-gradient(90deg,
    var(--gold) 0, var(--gold) 92px,
    var(--border) 92px, var(--border) 100%);
  margin: 28px 0 32px;
}
.lede {
  font-family: 'Noto Serif TC', serif;
  font-size: 17px; line-height: 1.85;
  color: var(--ink-mid); max-width: 68ch;
}
.lede .figure {
  font-family: 'Fira Code', monospace;
  font-weight: 500; color: var(--ink); letter-spacing: 0.02em;
}
.meta-row {
  margin-top: 32px;
  display: flex; flex-wrap: wrap; gap: 24px;
  font-family: 'Fira Code', monospace;
  font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--ink-faint);
}
.meta-row span strong { color: var(--ink-mid); font-weight: 500; margin-left: 6px; }
</style>

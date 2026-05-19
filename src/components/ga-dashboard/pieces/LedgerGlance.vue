<script setup lang="ts">
import { computed } from 'vue'
import type { GaSnapshot } from '@/types/ga-snapshot'

const props = defineProps<{ snapshot: GaSnapshot, window: '7d' | '14d' | '28d' }>()
const g = computed(() => props.snapshot.windows[props.window].glance)
const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
</script>

<template>
  <div class="ledger" aria-label="At a glance">
    <div class="ledger-row">
      <div class="ledger-label">Active users</div>
      <div class="ledger-body">
        <span class="num">{{ fmt(g.activeUsers.total) }}</span>
        <span class="muted">new {{ fmt(g.activeUsers.new) }} · returning {{ fmt(g.activeUsers.returning) }}</span>
      </div>
      <div class="ledger-spark">{{ pct(g.activeUsers.returningPct) }} returning</div>
    </div>
    <div class="ledger-row">
      <div class="ledger-label">Solver throughput</div>
      <div class="ledger-body">
        <span class="num">{{ fmt(g.solver.starts) }} → {{ fmt(g.solver.completes) }}</span>
        <span class="muted">{{ fmt(g.solver.fails) }} failed</span>
      </div>
      <div class="ledger-spark success">{{ pct(g.solver.completePct) }} complete</div>
    </div>
    <div class="ledger-row">
      <div class="ledger-label">Batch optimisation</div>
      <div class="ledger-body">
        <span class="num">{{ fmt(g.batch.starts) }} → {{ fmt(g.batch.completes) }}</span>
        <span class="muted">{{ fmt(g.batch.fails) }} failed · {{ fmt(g.batch.cancelled) }} cancelled</span>
      </div>
      <div class="ledger-spark success">{{ pct(g.batch.completePct) }} complete</div>
    </div>
    <div class="ledger-row">
      <div class="ledger-label">BOM → Batch handoff</div>
      <div class="ledger-body">
        <span class="num">{{ fmt(g.bom.calculates) }} → {{ fmt(g.bom.sentToBatch) }}</span>
        <span class="muted">calculations sent to batch</span>
      </div>
      <div class="ledger-spark warn">{{ pct(g.bom.handoffPct) }} handoff</div>
    </div>
    <div class="ledger-row">
      <div class="ledger-label">Infra warnings</div>
      <div class="ledger-body">
        <span class="num">{{ fmt(g.infra.sabUnavailable) }}</span><span class="muted">SAB unavailable</span>
        <span class="num" style="margin-left:18px">{{ fmt(g.infra.wasmLoadFailed) }}</span><span class="muted">WASM load failed</span>
      </div>
      <div class="ledger-spark danger">needs attention</div>
    </div>
  </div>
</template>

<style scoped>
.ledger {
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  padding: 8px 0; margin-bottom: 96px;
}
.ledger-row {
  display: grid; grid-template-columns: 180px 1fr auto;
  gap: 32px; align-items: baseline;
  padding: 22px 4px;
  border-bottom: 1px solid var(--border-soft);
}
.ledger-row:last-child { border-bottom: 0; }
.ledger-label {
  font-family: 'Fira Code', monospace;
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--ink-faint);
}
.ledger-body { font-family: 'Noto Serif TC', serif; font-size: 17px; color: var(--ink); }
.ledger-body .num { font-family: 'Fira Code', monospace; font-weight: 500; letter-spacing: 0.02em; }
.ledger-body .muted { color: var(--ink-muted); font-size: 14px; margin-left: 8px; }
.ledger-spark {
  font-family: 'Fira Code', monospace;
  font-size: 13px; color: var(--gold); letter-spacing: 0.06em; white-space: nowrap;
}
.ledger-spark.warn { color: var(--warning); }
.ledger-spark.danger { color: var(--danger); }
.ledger-spark.success { color: var(--success); }

@media (max-width: 720px) {
  .ledger-row { grid-template-columns: 1fr; gap: 6px; padding: 18px 4px; }
}
</style>

<script setup lang="ts">
import FlagBadge from './FlagBadge.vue'

// Layer I side column (spec #194 §E3 / #197). Functional, not decorative:
// it's the "entry ticket" half of the mirrored two-layer layout — every
// Layer I chart must be able to answer "which todo pointed here".
//
// `readout` / `readoutNote` are optional on purpose: this ticket (#197) only
// builds the skeleton. The judgement engine (thresholds + live verdicts,
// spec #194 §B / tracked separately from this ticket) isn't wired into this
// branch yet, so most charts have no live number to show here yet — callers
// pass whatever they can source honestly from MetricsBundle today and leave
// the rest undefined. Once the evaluate() engine lands, GaDashboardView.vue
// swaps these props for real Verdict data without touching this component.
//
// `ok` is a tri-state on purpose: `undefined` (not passed) renders neutral
// ink — we have no verdict yet, so we must not imply one. Only pass `true`
// (threshold's good side) / `false` (bad side) once a real Verdict backs it.
defineProps<{
  boundLabel: string
  readout?: string
  readoutNote?: string
  ok?: boolean
  flagText?: string
  flagPartial?: boolean
}>()
</script>

<template>
  <aside class="anchor-side">
    <span class="k">ANCHORED BY</span>
    <div class="bind">{{ boundLabel }}</div>
    <div v-if="readout" class="now">
      <b :class="{ ok: ok === true, bad: ok === false }">{{ readout }}</b>
      <i v-if="readoutNote">{{ readoutNote }}</i>
    </div>
    <div v-else class="now pending">
      <b>—</b>
      <i>{{ readoutNote ?? '待判定引擎介接' }}</i>
    </div>
    <FlagBadge v-if="flagText" class="side-flag" :text="flagText" :partial="flagPartial" />
  </aside>
</template>

<style scoped>
.anchor-side {
  padding-top: 2px;
}
.k {
  display: block;
  margin-bottom: 7px;
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--ink-faint);
}
.bind {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--ink-mid);
}
.now {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border-soft);
  font-family: 'Fira Code', monospace;
}
.now b {
  font-size: 22px;
  font-weight: 500;
  color: var(--ink);
}
.now b.ok {
  color: var(--success);
}
.now b.bad {
  color: var(--danger);
}
.now.pending b {
  color: var(--ink-faint);
}
.now i {
  font-style: normal;
  font-size: 11px;
  color: var(--ink-faint);
  margin-left: 8px;
}
.side-flag {
  margin-top: 14px;
  white-space: normal;
}
</style>

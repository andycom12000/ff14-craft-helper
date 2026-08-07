<script setup lang="ts">
import type { TodoRow } from '../todo-select'

// One row of the 本期待辦 ledger — shared by `TodoLedger.vue`'s top-3 list,
// collapsed overflow, extinguished trail, and the empty-state "closest 3"
// list (#206). Extracted into its own SFC so the four call sites don't
// duplicate markup; the row-level CSS therefore lives HERE, not in
// `TodoLedger.vue` — Vue's scoped CSS only matches elements rendered by the
// component that owns the `<style scoped>` block (plus the child's root
// element), so a `.todo-row .sig` rule sitting in the parent would silently
// no-op against elements rendered by this child.
defineProps<{ row: TodoRow }>()
const emit = defineEmits<{ goto: [anchor: string] }>()
</script>

<template>
  <div class="todo-row" :class="{ dim: row.dim }">
    <div class="age" :class="row.ageTone">{{ row.age }}</div>
    <div class="body">
      <div class="sig">{{ row.sig }}</div>
      <!-- Empty `nextStep` = 空狀態近門檻降級列（無下一步，spec #206）。 -->
      <div v-if="row.nextStep" class="next">
        {{ row.nextStep }}
        <!-- Empty `anchor` = 熄滅留痕列／空狀態近門檻列都沒有 deep-link（見 todo-select.ts）。 -->
        <template v-if="row.anchor">
          · <a :href="row.anchor" @click.prevent="emit('goto', row.anchor)">跳至圖表 →</a>
        </template>
      </div>
    </div>
    <div class="num" :class="`state-${row.state}`">{{ row.value }}</div>
    <div class="thr">{{ row.thresholdLabel }}</div>
  </div>
</template>

<style scoped>
.todo-row {
  display: grid;
  grid-template-columns: 32px 1fr 128px 108px;
  align-items: baseline;
  gap: 16px;
  padding: 15px 0 14px;
  border-bottom: 1px solid var(--border-soft);
}
.todo-row .age {
  font-family: 'Fira Code', monospace;
  font-size: 13px;
  text-align: center;
  line-height: 1.2;
}
/* Three-tier age marker (spec US #13–15): fresh = this-week gold solid,
   streak = ongoing day-count, censored = dashed outline (history-length
   capped, not a real measurement — must not carry a number). */
.age.fresh { color: var(--gold); }
.age.streak { color: var(--ink-faint); font-size: 9.5px; letter-spacing: -0.02em; }
.age.censored {
  color: var(--ink-faint);
  font-size: 9.5px;
  border: 1px dashed var(--ink-faint);
  border-radius: 3px;
  padding: 1px 2px;
}
.age.cleared { color: var(--success); }
.todo-row .body .sig {
  font-family: 'Noto Serif TC', serif;
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.5;
}
.todo-row .body .next {
  margin-top: 4px;
  font-size: 13px;
  color: var(--ink-muted);
}
.todo-row .body .next a {
  color: var(--gold);
  text-decoration: none;
  border-bottom: 1px solid var(--gold-glow);
  cursor: pointer;
}
.todo-row .num {
  font-family: 'Fira Code', monospace;
  font-size: 15px;
  font-weight: 500;
  text-align: right;
}
/* Verdict.state → colour (spec §B3): fire = bad (red), clear = good (green),
   grey = CI straddles the threshold (neutral warn, not a colour verdict),
   absent = no data (faint, must not read as a measurement). */
.todo-row .num.state-fire { color: var(--danger); }
.todo-row .num.state-clear { color: var(--success); }
.todo-row .num.state-grey { color: var(--warning); }
.todo-row .num.state-absent { color: var(--ink-faint); }
.todo-row .thr {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: var(--ink-faint);
  text-align: right;
}
/* Shared "de-emphasized" visual for both the 28-day extinguish fade trail
   and the empty-state near-threshold downgrade (spec #206) — same intent
   ("secondary, not this period's headline"), one visual language. */
.todo-row.dim .sig, .todo-row.dim .num { color: var(--ink-muted); }
</style>

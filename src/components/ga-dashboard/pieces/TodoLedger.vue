<script setup lang="ts">
import { computed } from 'vue'

// "本期待辦" — the page-level ledger, NOT a section (spec #194 §C1 / #197).
// Fixed position: hero → todo → WindowSelector. Owns both surrounding gaps
// (spec §E4: hero→待辦 44px, 待辦→視窗選擇器 40px) so callers don't need to
// coordinate margins with their neighbours.
//
// ============================================================================
// SLOT FOR FUTURE TICKET(S): this ticket (#197) only builds the shell. The
// threshold table + evaluate() judgement engine (spec #194 §B) isn't wired
// into this branch yet — `rows` is empty until that lands and a follow-up UI
// ticket fills it in. `TodoRow` below is a presentation-layer shape a future
// caller can produce from `Verdict[]` (spec §B3); it intentionally does NOT
// import from an `ga-evaluate` module that doesn't exist yet.
// ============================================================================
export interface TodoRow {
  id: string
  /** '✦' 本週新亮 · 'N d' 連續 N 天 · '31+' 觀測全期未解（censored）· '✓' 熄滅 */
  age: string
  ageTone: 'fresh' | 'streak' | 'censored' | 'cleared'
  /** Hand-written signal sentence (spec: 訊號可以算，下一步不能算). */
  sig: string
  nextStep: string
  /** Layer I chart id this todo points at, e.g. '#chart-failures'. */
  anchor: string
  value: string
  thresholdLabel: string
  ok?: boolean
  /** Cleared-but-still-shown row (28-day fade trail, spec US #11). */
  dim?: boolean
}

const props = withDefaults(defineProps<{
  windowDays: number
  rows?: TodoRow[]
  footNote?: string
}>(), {
  rows: () => [],
})

const hasRows = computed(() => props.rows.length > 0)
</script>

<template>
  <section id="todo" class="todo-ledger">
    <div class="todo-head">
      <h2>本期待辦 · {{ windowDays }} 天</h2>
      <span v-if="hasRows" class="count">{{ rows.length }} RULES</span>
    </div>

    <template v-if="hasRows">
      <div v-for="row in rows" :key="row.id" class="todo-row" :class="{ dim: row.dim }">
        <div class="age" :class="row.ageTone">{{ row.age }}</div>
        <div class="body">
          <div class="sig">{{ row.sig }}</div>
          <div class="next">{{ row.nextStep }} · <a :href="row.anchor">跳至圖表 →</a></div>
        </div>
        <div class="num" :class="{ ok: row.ok }">{{ row.value }}</div>
        <div class="thr">{{ row.thresholdLabel }}</div>
      </div>
      <div v-if="footNote" class="todo-foot">{{ footNote }}</div>
    </template>

    <div v-else class="todo-empty">
      <span class="te-label">判定引擎尚未介接</span>
      <span class="te-hint">門檻表 + evaluate()（spec #194 §B）落地後，此處會輸出本期前 3 條待辦；下方 Layer I／II 兩層的既有圖表已就位。</span>
    </div>
  </section>
</template>

<style scoped>
.todo-ledger {
  margin: 44px 0 40px;
}
.todo-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--gold);
}
.todo-head h2 {
  font-family: 'Noto Serif TC', serif;
  font-size: 19px;
  font-weight: 600;
  margin: 0;
  color: var(--ink);
  letter-spacing: 0.01em;
}
.todo-head .count {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--gold);
}
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
   capped, not a real measurement). */
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
}
.todo-row .num {
  font-family: 'Fira Code', monospace;
  font-size: 15px;
  font-weight: 500;
  color: var(--danger);
  text-align: right;
}
.todo-row .num.ok { color: var(--success); }
.todo-row .thr {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: var(--ink-faint);
  text-align: right;
}
.todo-row.dim .sig, .todo-row.dim .num { color: var(--ink-muted); }
.todo-foot {
  margin-top: 12px;
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
}

.todo-empty {
  margin-top: 18px;
  padding: 30px 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: center;
  border: 1px dashed var(--border-soft);
  border-radius: 2px;
}
.te-label {
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--ink-faint);
}
.te-hint {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 12.5px;
  color: var(--ink-muted);
  max-width: 62ch;
  margin: 0 auto;
}
</style>

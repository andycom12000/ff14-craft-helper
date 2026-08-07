<script setup lang="ts">
import { computed, ref } from 'vue'
import TodoRowLine from './TodoRowLine.vue'
import type { TodoRow, TodoCounts } from '../todo-select'

// "本期待辦" — the page-level ledger, NOT a section (spec #194 §C1 / #197).
// Fixed position: hero → todo → WindowSelector. Owns both surrounding gaps
// (spec §E4: hero→待辦 44px, 待辦→視窗選擇器 40px) so callers don't need to
// coordinate margins with their neighbours.
//
// Data comes in pre-selected: `GaDashboardView.vue` runs `evaluate()` (spec
// §B) then `buildTodoLedger()` (`../todo-select.ts`) to split the full
// `Verdict[]` into `rows` (top 3), `overflowRows` (fired but didn't make the
// top 3 — spec §194 US #5 / #183 決定 6), `clearedRows` (28-day extinguish
// trail — #191 決定 4) and `emptyRows` (near-threshold list for the
// no-todos state — #183 決定 6). This component only renders the shape it's
// given; it does NOT re-derive any of those selections itself.

const props = withDefaults(defineProps<{
  windowDays: number
  rows?: TodoRow[]
  overflowRows?: TodoRow[]
  clearedRows?: TodoRow[]
  emptyRows?: TodoRow[]
  counts?: TodoCounts
  footNote?: string
}>(), {
  rows: () => [],
  overflowRows: () => [],
  clearedRows: () => [],
  emptyRows: () => [],
})

const hasRows = computed(() => props.rows.length > 0)

// Collapsed by default (spec US #5: "所以我知道還有東西在響，但視線不被稀釋").
const overflowExpanded = ref(false)

// Anchors point at Layer I chart ids, e.g. '#chart-failures'. This app uses
// createWebHashHistory() with no catch-all route (src/router/index.ts) — a
// plain <a href="#chart-x"> click lets vue-router try to resolve
// "/chart-x" as a path, which doesn't match, and the whole page goes blank.
// Smooth-scroll manually instead (same pattern as RailNav.vue's `go()`).
function goToAnchor(anchor: string) {
  const id = anchor.replace(/^#/, '')
  const el = document.getElementById(id)
  if (!el) return
  const top = el.getBoundingClientRect().top + window.scrollY - 40
  window.scrollTo({ top, behavior: 'smooth' })
}
</script>

<template>
  <section id="todo" class="todo-ledger">
    <div class="todo-head">
      <h2>本期待辦 · {{ windowDays }} 天</h2>
      <span v-if="counts" class="count">
        {{ counts.firing }} FIRING / {{ counts.cleared }} CLEARED / {{ counts.total }} RULES
      </span>
      <span v-else-if="hasRows" class="count">{{ rows.length }} SHOWN</span>
    </div>

    <template v-if="hasRows">
      <TodoRowLine v-for="row in rows" :key="row.id" :row="row" @goto="goToAnchor" />

      <!-- 觸發但排不進前 3 的收進可展開的摺疊行（spec §194 US #5 / #183 決定 6）。 -->
      <div v-if="overflowRows.length" class="todo-overflow">
        <button type="button" class="overflow-toggle" @click="overflowExpanded = !overflowExpanded">
          另有 {{ overflowRows.length }} 項超標未入選 {{ overflowExpanded ? '⌃' : '⌄' }}
        </button>
        <template v-if="overflowExpanded">
          <TodoRowLine v-for="row in overflowRows" :key="row.id" :row="row" @goto="goToAnchor" />
        </template>
      </div>
    </template>

    <!-- 完全沒有觸發時顯示「最接近門檻的三項」，回答「那我現在該盯什麼」（#183 決定 6）。
         不足 3 條不補滿——見 todo-select.ts 的選取邏輯。 -->
    <template v-else>
      <div class="todo-empty">
        <span class="te-label">本期無待辦 · {{ windowDays }} 天</span>
        <span class="te-hint">所有可觸發訊號都在門檻內。</span>
      </div>
      <template v-if="emptyRows.length">
        <div class="near-head">最接近門檻的三項（尚未超標）：</div>
        <TodoRowLine v-for="row in emptyRows" :key="row.id" :row="row" @goto="goToAnchor" />
      </template>
    </template>

    <!-- 熄滅留痕（28 天，#191 決定 4）——與「本期是否有待辦」是兩件獨立的事，即使本期完全無待辦
         觸發，一週前才熄滅的裂縫仍然值得留痕，不嵌在上面的 hasRows／空狀態分支裡。 -->
    <div v-if="clearedRows.length" class="todo-cleared">
      <div class="cleared-head">本期熄滅</div>
      <TodoRowLine v-for="row in clearedRows" :key="row.id" :row="row" @goto="goToAnchor" />
    </div>

    <!-- 常駐註腳：不分待辦清單空不空都掛著，N 歸零時（`footNote` 為 undefined）自己消失
         （#183 決定 6）。刻意放在 hasRows / 空狀態兩個分支之外。 -->
    <div v-if="footNote" class="todo-foot">{{ footNote }}</div>
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

.todo-overflow {
  padding: 10px 0;
  border-bottom: 1px solid var(--border-soft);
}
.overflow-toggle {
  background: none;
  border: none;
  padding: 0;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--ink-faint);
  cursor: pointer;
}
.overflow-toggle:hover { color: var(--ink-muted); }

.todo-cleared {
  margin-top: 18px;
}
.cleared-head {
  padding-bottom: 8px;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--ink-faint);
  border-bottom: 1px solid var(--border-soft);
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
}
.near-head {
  margin-top: 20px;
  padding-bottom: 8px;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
  border-bottom: 1px solid var(--border-soft);
}

.todo-foot {
  margin-top: 12px;
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
}
</style>

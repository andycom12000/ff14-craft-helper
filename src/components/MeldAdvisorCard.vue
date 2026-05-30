<script setup lang="ts">
import { computed, ref } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
// ElMessage's style side-effect is loaded by useSimulator (the only host of this
// card) at module scope, so the toast renders correctly without re-importing the
// CSS here — and importing it here would break the jsdom component test.
import type { MeldAdvice, MeldStep } from '@/services/meld-advisor'
import type { CraftStat } from '@/engine/materia'
import { formatMeldStepShort } from '@/engine/materia'
import { formatGil } from '@/utils/format'

const props = withDefaults(defineProps<{
  advice: MeldAdvice | 'loading' | 'stale' | 'no-market' | null
  /** Framing: simulator is ability-oriented, batch is cost-oriented. Slice A
   *  only carries the switch; the ability-mode layout/copy lands in Slice B2. */
  mode?: 'ability' | 'cost'
  /** Whether the "套用" CTA renders. Defaults to true; cost mode (batch) closes
   *  it regardless. When effectively off, no path may emit `apply`. */
  showApply?: boolean
  /** Ability mode (Slice C): a session-only meld override is currently active,
   *  so the inline 「存成配裝…」 reverse-gate may be offered to write it down
   *  permanently. */
  overrideActive?: boolean
}>(), {
  mode: 'ability',
  showApply: true,
  overrideActive: false,
})

const emit = defineEmits<{
  apply: [delta: { craftsmanship: number; control: number; cp: number }]
  'save-to-gearset': [scope: 'this' | 'all']
}>()

/** Resolved CTA visibility. Cost mode is cost-oriented (batch) and has no
 *  single-gearset apply semantics, so it never shows the CTA; ability mode
 *  honours the `showApply` flag (default true). */
const effectiveShowApply = computed(() => props.mode === 'ability' && props.showApply)

const isLoading = computed(() => props.advice === 'loading')
const isStale = computed(() => props.advice === 'stale')
const isNoMarket = computed(() => props.advice === 'no-market')
const isEmpty = computed(() => props.advice === null)
const result = computed(() => {
  if (isLoading.value || isStale.value || isNoMarket.value || isEmpty.value) return null
  return props.advice as MeldAdvice
})

const STAT_LABELS: Record<CraftStat, string> = {
  craftsmanship: '作業',
  control: '加工',
  cp: 'CP',
}
const GRADE_ROMAN: Record<number, string> = { 12: 'Ⅻ', 11: 'Ⅺ', 10: 'Ⅹ' }
const statLabel = (s: CraftStat) => STAT_LABELS[s] ?? s
const gradeLabel = (g: number) => GRADE_ROMAN[g] ?? String(g)
const stepText = (s: MeldStep) =>
  `${statLabel(s.stat)} 魔晶石${gradeLabel(s.grade)} × ${Math.ceil(s.expectedCount)} 顆`

/**
 * Ability-mode clauses: one per materia type, each「{顆數} 顆 {魔晶石名}」.
 * Built from the shared `formatMeldStepShort` helper so the sentence and the
 * session-override chip in FoodMedicine never drift.
 */
const abilityClauses = computed(() => {
  if (!result.value) return []
  return result.value.costOptimal.steps.map((s) => formatMeldStepShort(s))
})

/** Whether the cost-optimal plan has a concrete, actionable meld list. */
const hasActionablePlan = computed(() =>
  !!result.value && result.value.costOptimal.feasible && result.value.costOptimal.steps.length > 0,
)

/** ability mode: HQ materials alone already double-max → meld unnecessary. */
const isHqSufficient = computed(() => !!result.value && result.value.hqSufficient)

function applyToGearset() {
  // Guard: cost mode / showApply=false must never emit apply, even if some
  // future path reaches here (spec Slice A acceptance).
  if (!result.value || !effectiveShowApply.value) return
  emit('apply', result.value.costOptimal.deltaStats)
}

/* Inline "存成配裝…" reverse-gate (Slice C). DESIGN.md forbids reaching for a
   modal first — this is an inline confirm row revealed in place, not a dialog. */
const saveGateOpen = ref(false)
function openSaveGate() {
  saveGateOpen.value = true
}
function cancelSaveGate() {
  saveGateOpen.value = false
}
function saveToGearset(scope: 'this' | 'all') {
  saveGateOpen.value = false
  emit('save-to-gearset', scope)
}

async function copyShoppingList() {
  if (!result.value) return
  const lines = result.value.costOptimal.steps.map(stepText)
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    ElMessage.success('已複製鑲嵌清單')
  } catch {
    ElMessage.error('複製失敗，請手動複製')
  }
}
</script>

<template>
  <div
    class="meld-advisor-card"
    :class="[`mode-${mode}`, { 'is-stale': isStale }]"
  >
    <div class="mac-body" aria-live="polite">
      <p v-if="isEmpty" class="empty-hint">尚未求解，按 solve 後將算出鑲嵌建議</p>

      <div v-else-if="isNoMarket" class="no-market-state">
        <p class="no-market-title">尚未選擇市場伺服器</p>
        <p class="no-market-hint">
          鑲嵌建議需要魔晶石的市場價來估算成本，請先到
          <a class="no-market-link" href="#/settings">設定</a>
          選擇地區與伺服器。
        </p>
      </div>

      <div v-else-if="isLoading" class="loading-state">
        <el-icon data-test="spinner" class="is-loading mac-spinner"><Loading /></el-icon>
        <span>計算中…</span>
      </div>

      <div v-else-if="isStale" class="stale-state">
        <p class="stale-title">先前建議已過期</p>
        <p class="stale-hint">輸入已變更，請重新求解以更新鑲嵌建議</p>
      </div>

      <!-- ABILITY mode (simulator): ability-oriented — "補 N 顆 X 魔晶石即可保證 HQ".
           No BiS / over-meld ceiling, no gap framing, no 複製清單. -->
      <div v-else-if="result && mode === 'ability'" class="result-state result-ability">
        <!-- HQ materials alone double-max → meld lever unnecessary. -->
        <div v-if="isHqSufficient" class="hq-sufficient">
          <p class="hq-sufficient-msg">只要備齊 HQ 素材即可保證 HQ，無需鑲嵌</p>
        </div>

        <!-- Actionable meld plan: lead with the materia ability sentence. -->
        <template v-else-if="hasActionablePlan">
          <p class="ability-sentence">
            補
            <template v-for="(c, i) in abilityClauses" :key="i"
              ><span class="ability-clause">{{ c }}</span
              ><span v-if="i < abilityClauses.length - 1" class="ability-join">、</span></template
            >
            即可保證 HQ
          </p>

          <p class="ability-cost">
            所需鑲嵌費用 約
            <span class="ability-cost-gil">{{ formatGil(result.costOptimal.totalGil) }}</span> gil
            <span v-if="!result.costOptimal.confirmedBySolver" class="caveat">（保守估計）</span>
          </p>

          <div v-if="effectiveShowApply" class="plan-cta">
            <button type="button" class="cta-btn cta-primary" @click="applyToGearset">
              套用鑲嵌（模擬）
            </button>
          </div>

          <!-- Reverse-gate (Slice C): only when a session override is live.
               Inline confirm row, not a modal (DESIGN.md). -->
          <div v-if="effectiveShowApply && overrideActive" class="save-gate">
            <button
              v-if="!saveGateOpen"
              type="button"
              class="save-gate-trigger"
              @click="openSaveGate"
            >
              存成配裝…
            </button>
            <div v-else class="save-gate-confirm">
              <span class="save-gate-prompt">永久寫入哪個範圍？</span>
              <div class="save-gate-actions">
                <button type="button" class="cta-btn cta-ghost" @click="saveToGearset('this')">
                  只存此職業
                </button>
                <button type="button" class="cta-btn cta-ghost" @click="saveToGearset('all')">
                  套用到全部職業
                </button>
                <button type="button" class="save-gate-cancel" @click="cancelSaveGate">
                  取消
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- Infeasible: surface the reason (e.g. 槽位不足,需換底裝). -->
        <p v-else class="infeasible-reason">
          {{ result.costOptimal.reason ?? '無法以鑲嵌達標' }}
        </p>
      </div>

      <!-- COST mode (batch): cost-oriented framing — gap / 全 BiS / 最省錢達標. -->
      <div v-else-if="result" class="result-state">
        <template v-if="result.alreadyMeetsThreshold">
          <p class="met-message">你的裝備已能保證 HQ，無需鑲嵌</p>
          <p class="bis-context">
            往全 BiS 還需 <span class="amount-inline">{{ formatGil(result.bis.totalGil) }}</span> gil（over-meld 空間）
          </p>
        </template>

        <template v-else>
          <div class="gap-headline">
            <span class="gap-label">你能省</span>
            <span class="gap-amount"
              >{{ formatGil(result.gapGil) }}<span class="gap-unit"> gil</span></span
            >
          </div>

          <section class="plan plan-primary">
            <div class="plan-head">
              <h4 class="plan-title">最省錢達標</h4>
              <span class="plan-total">{{ formatGil(result.costOptimal.totalGil) }} gil</span>
            </div>
            <p v-if="!result.costOptimal.feasible" class="infeasible-reason">
              {{ result.costOptimal.reason ?? '不可行' }}
            </p>
            <ul v-else-if="result.costOptimal.steps.length" class="steps-list">
              <li v-for="(s, i) in result.costOptimal.steps" :key="i">
                {{ stepText(s) }}
              </li>
            </ul>
            <small v-if="!result.costOptimal.confirmedBySolver" class="caveat">保守估計</small>

            <div v-if="hasActionablePlan && effectiveShowApply" class="plan-cta">
              <button type="button" class="cta-btn cta-primary" @click="applyToGearset">
                套用到配裝
              </button>
              <button type="button" class="cta-btn cta-ghost" @click="copyShoppingList">
                複製清單
              </button>
            </div>
          </section>

          <div class="plan-divider" role="presentation"></div>

          <section class="plan plan-secondary">
            <div class="plan-head">
              <h4 class="plan-title">全 BiS pentameld</h4>
              <span class="plan-total">{{ formatGil(result.bis.totalGil) }} gil</span>
            </div>
            <small class="caveat">含 overmeld 失敗耗損</small>
          </section>

          <p class="disclaimer">「達標門檻」為精確值；「最省配比」為估算，實際可能略有出入</p>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* De-shelled (Slice A): no frame, no background, no self-title — the card is an
   embeddable segment. The host section (simulator cockpit/rail/m-flat, batch
   meld-card-wrap) provides the single frame + single title. */
.meld-advisor-card {
  transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.meld-advisor-card.is-stale {
  opacity: 0.62;
}

.mac-body {
  padding: 0;
}

/* Empty state */
.empty-hint {
  margin: 0;
  font-size: 14px;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
  text-align: center;
}

/* Loading state */
.loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}

.mac-spinner {
  font-size: 20px;
}

/* Stale state — dimmed but still tells the user why and what to do */
.stale-state {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stale-title {
  margin: 0;
  font-family: 'Noto Serif TC', serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text, oklch(0.28 0.04 55));
}

.stale-hint {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}

/* No-market state — the advisor can't cost a plan without market prices.
   Tell the user exactly why and link straight to the server settings. */
.no-market-state {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.no-market-title {
  margin: 0;
  font-family: 'Noto Serif TC', serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text, oklch(0.28 0.04 55));
}

.no-market-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}

.no-market-link {
  color: var(--app-accent-strong, oklch(0.5 0.12 60));
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.no-market-link:hover {
  color: var(--app-accent, oklch(0.72 0.15 65));
}

/* Result state */
.result-state {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ============================================================
   ABILITY mode (simulator) — ability-oriented, no cost/BiS framing.
   ============================================================ */
.result-ability {
  gap: 10px;
}

/* HQ materials alone already double-max → Verdant Success green state. */
.hq-sufficient {
  padding: 12px 14px;
  background: var(--app-success-tint, oklch(0.55 0.16 145 / 0.10));
  border: 1px solid var(--app-success-border, oklch(0.55 0.16 145 / 0.35));
  border-radius: 8px;
}
.hq-sufficient-msg {
  margin: 0;
  font-family: 'Noto Serif TC', serif;
  font-size: 15px;
  font-weight: 600;
  color: var(--app-success, oklch(0.55 0.16 145));
}

/* Hero ability sentence — the focus: 補 N 顆 X 魔晶石即可保證 HQ.
   Cocoa accent, largest weight; materia counts in Fira Code. Multiple
   materia types join with 、 and wrap naturally across lines. */
.ability-sentence {
  margin: 0;
  font-family: 'Noto Serif TC', serif;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.5;
  color: var(--app-craft, oklch(0.50 0.16 40));
}
.ability-clause {
  white-space: nowrap;
  /* Fira Code first so the 顆數 renders in the mono number face (DESIGN.md:
     numbers are always Fira Code); CJK has no glyphs there and falls back to
     the serif face, so 「8 顆 加工魔晶石Ⅻ」 mixes mono digits + serif text. */
  font-family: 'Fira Code', 'Noto Serif TC', serif;
  font-variant-numeric: tabular-nums;
}
.ability-join {
  /* allow wrapping between clauses, keep the 、 with the preceding clause */
  margin-right: 1px;
}

/* Cost is secondary — small text, no "你能省"/gap framing. */
.ability-cost {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}
.ability-cost-gil {
  font-family: 'Fira Code', ui-monospace, monospace;
  color: var(--app-text, oklch(0.28 0.04 55));
}

/* Already-met state */
.met-message {
  margin: 0;
  font-family: 'Noto Serif TC', serif;
  font-size: 15px;
  font-weight: 600;
  color: var(--app-success, oklch(0.55 0.16 145));
}

.bis-context {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}

.amount-inline {
  font-family: 'Fira Code', ui-monospace, monospace;
  color: var(--app-text, oklch(0.28 0.04 55));
}

/* Gap headline — the hero number, largest element on the card */
.gap-headline {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gap-label {
  font-size: 13px;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}

.gap-amount {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 32px;
  font-weight: 700;
  line-height: 1.05;
  color: var(--app-success, oklch(0.55 0.16 145));
}

.gap-unit {
  font-size: 16px;
  font-weight: 500;
}

/* Plans — primary recommendation is the focus, BiS is a quiet reference.
   No nested card boxes; hierarchy comes from weight + a single divider. */
.plan {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.plan-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.plan-title {
  margin: 0;
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
}

.plan-total {
  font-family: 'Fira Code', ui-monospace, monospace;
}

.plan-primary .plan-title {
  font-size: 15px;
  color: var(--app-text, oklch(0.28 0.04 55));
}

.plan-primary .plan-total {
  font-size: 17px;
  font-weight: 600;
  color: var(--app-text, oklch(0.28 0.04 55));
}

.plan-secondary .plan-title {
  font-size: 13px;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}

.plan-secondary .plan-total {
  font-size: 14px;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}

.plan-divider {
  height: 1px;
  background: var(--app-border, oklch(0.65 0.04 65 / 0.3));
}

.infeasible-reason {
  margin: 0;
  font-size: 13px;
  color: var(--app-danger, oklch(0.55 0.2 25));
}

.steps-list {
  margin: 0;
  padding-left: 16px;
  font-size: 13px;
  color: var(--app-text, oklch(0.28 0.04 55));
}

.steps-list li {
  margin-bottom: 2px;
}

.caveat {
  font-size: 12px;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}

/* CTA row — the actionable part: push the plan onto the gearset, or copy the
   shopping list. Primary is filled (吐司金), secondary is a quiet ghost. */
.plan-cta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.cta-btn {
  flex: 1 1 auto;
  padding: 7px 12px;
  border-radius: 6px;
  font-family: 'Noto Serif TC', serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 140ms ease, border-color 140ms ease, opacity 140ms ease;
}

.cta-primary {
  background: var(--app-accent, oklch(0.72 0.15 65));
  color: var(--app-on-accent, oklch(0.22 0.04 55));
}

.cta-primary:hover {
  background: var(--app-accent-strong, oklch(0.66 0.16 60));
}

.cta-ghost {
  background: transparent;
  border-color: var(--app-border, oklch(0.65 0.04 65 / 0.4));
  color: var(--app-text, oklch(0.28 0.04 55));
  flex: 0 0 auto;
}

.cta-ghost:hover {
  border-color: var(--app-accent, oklch(0.72 0.15 65));
  color: var(--app-accent-strong, oklch(0.5 0.12 60));
}

/* Reverse-gate (Slice C) — inline confirm row that escalates the session
   override into a permanent gearset write. Quiet trigger; the confirm row
   reveals the two scope choices in place (no modal). */
.save-gate {
  margin-top: 6px;
}
.save-gate-trigger {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
  font-family: 'Noto Serif TC', serif;
  font-size: 12.5px;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  transition: color 140ms ease;
}
.save-gate-trigger:hover {
  color: var(--app-craft, oklch(0.50 0.16 40));
}
.save-gate-confirm {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--app-border, oklch(0.65 0.04 65 / 0.3));
  border-radius: 8px;
}
.save-gate-prompt {
  font-size: 12.5px;
  color: var(--app-text, oklch(0.28 0.04 55));
}
.save-gate-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.save-gate-cancel {
  padding: 0 6px;
  border: 0;
  background: transparent;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
  font-size: 12.5px;
  cursor: pointer;
  flex: 0 0 auto;
}
.save-gate-cancel:hover {
  color: var(--app-text, oklch(0.28 0.04 55));
}

/* Disclaimer — honest about estimate vs exact, in plain language */
.disclaimer {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}
</style>

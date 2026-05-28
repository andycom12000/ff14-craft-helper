<script setup lang="ts">
import { computed } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import type { MeldAdvice } from '@/services/meld-advisor'
import { formatGil } from '@/utils/format'

const props = defineProps<{
  advice: MeldAdvice | 'loading' | 'stale' | null
}>()

const isLoading = computed(() => props.advice === 'loading')
const isStale = computed(() => props.advice === 'stale')
const isEmpty = computed(() => props.advice === null)
const result = computed(() => {
  if (isLoading.value || isStale.value || isEmpty.value) return null
  return props.advice as MeldAdvice
})
</script>

<template>
  <div
    class="meld-advisor-card"
    :class="{ 'is-stale': isStale }"
  >
    <div class="mac-header">
      <span class="mac-title">鑲嵌建議</span>
    </div>

    <div class="mac-body" aria-live="polite">
      <p v-if="isEmpty" class="empty-hint">尚未求解，按 solve 後將算出鑲嵌建議</p>

      <div v-else-if="isLoading" class="loading-state">
        <el-icon data-test="spinner" class="is-loading mac-spinner"><Loading /></el-icon>
        <span>計算中…</span>
      </div>

      <div v-else-if="isStale" class="stale-state">
        <p class="stale-title">先前建議已過期</p>
        <p class="stale-hint">輸入已變更，請重新求解以更新鑲嵌建議</p>
      </div>

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
                {{ s.stat }} Ⅻ × {{ Math.ceil(s.expectedCount) }}
              </li>
            </ul>
            <small v-if="!result.costOptimal.confirmedBySolver" class="caveat">保守估計</small>
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
.meld-advisor-card {
  background: var(--app-surface, oklch(0.975 0.018 85));
  border: 1px solid var(--app-border, oklch(0.65 0.04 65 / 0.3));
  border-radius: 8px;
  overflow: hidden;
  transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.meld-advisor-card.is-stale {
  opacity: 0.62;
}

.mac-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--app-border, oklch(0.65 0.04 65 / 0.3));
  background: var(--app-surface-2, oklch(0.93 0.04 80));
}

.mac-title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 17px;
  line-height: 1.4;
  color: var(--app-text, oklch(0.28 0.04 55));
}

.mac-body {
  padding: 16px;
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

/* Result state */
.result-state {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

/* Disclaimer — honest about estimate vs exact, in plain language */
.disclaimer {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--app-text-muted, oklch(0.5 0.03 60));
}
</style>

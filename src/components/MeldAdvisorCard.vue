<script setup lang="ts">
import { computed } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import type { MeldAdvice } from '@/services/meld-advisor'

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

function fmtGil(n: number | null): string {
  if (n === null) return '—'
  return n.toLocaleString('en-US')
}
</script>

<template>
  <div
    class="meld-advisor-card"
    :class="{ 'is-stale': isStale }"
  >
    <div class="mac-header">
      <span class="mac-title">鑲嵌建議</span>
    </div>

    <div v-if="isEmpty" class="mac-body empty-state">
      <p class="empty-hint">尚未求解，按 solve 後將算出鑲嵌建議</p>
    </div>

    <div v-else-if="isLoading" class="mac-body loading-state">
      <el-icon data-test="spinner" class="is-loading mac-spinner"><Loading /></el-icon>
      <span>計算中…</span>
    </div>

    <div v-else-if="result" class="mac-body result-state">
      <template v-if="result.alreadyMeetsThreshold">
        <p class="met-message">你的裝備已能保證 HQ，無需鑲嵌</p>
        <p class="bis-context">
          往全 BiS 還需 <span class="amount-inline">{{ fmtGil(result.bis.totalGil) }}</span> gil（over-meld 空間）
        </p>
      </template>

      <template v-else>
        <div class="gap-headline">
          <span class="gap-label">你能省</span>
          <span class="gap-amount">{{ fmtGil(result.gapGil) }} gil</span>
        </div>

        <div class="two-cards">
          <section class="card-side cost-optimal">
            <h4 class="side-title">最省錢達標</h4>
            <p class="side-total">{{ fmtGil(result.costOptimal.totalGil) }} gil</p>
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

          <section class="card-side bis">
            <h4 class="side-title">全 BiS pentameld</h4>
            <p class="side-total">{{ fmtGil(result.bis.totalGil) }} gil</p>
            <small class="caveat">含 overmeld 失敗耗損</small>
          </section>
        </div>

        <p class="disclaimer">
          ⓘ「可行門檻」可靠，「跨軸最省配比」為近似（v1 貪婪）
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.meld-advisor-card {
  background: var(--app-surface, #fff);
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 8px;
  overflow: hidden;
  transition: opacity 200ms ease;
}

.meld-advisor-card.is-stale {
  opacity: 0.5;
}

.mac-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color, #dcdfe6);
  background: var(--app-surface-alt, #fafafa);
}

.mac-title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 700;
  font-size: 15.5px;
  color: var(--app-text, #303133);
  letter-spacing: 0.005em;
}

.mac-body {
  padding: 16px;
}

/* Empty state */
.empty-state {
  text-align: center;
  color: var(--app-text-muted, #909399);
}

.empty-hint {
  margin: 0;
  font-size: 14px;
}

/* Loading state */
.loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text-muted, #909399);
  font-size: 14px;
}

.mac-spinner {
  font-size: 20px;
}

/* Result state */
.result-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Already-met state */
.met-message {
  margin: 0;
  font-family: 'Noto Serif TC', serif;
  font-size: 15px;
  font-weight: 600;
  color: var(--app-success, #67c23a);
}

.bis-context {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-muted, #909399);
}

.amount-inline {
  font-family: 'Fira Code', ui-monospace, monospace;
  color: var(--app-text, #303133);
}

/* Gap headline */
.gap-headline {
  text-align: center;
}

.gap-label {
  display: block;
  font-size: 12px;
  color: var(--app-text-muted, #909399);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 2px;
}

.gap-amount {
  display: block;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 2rem;
  font-weight: bold;
  color: var(--app-success, #67c23a);
}

/* Two-column layout */
.two-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.card-side {
  padding: 12px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 6px;
  background: var(--app-surface, #fff);
}

.side-title {
  margin: 0 0 6px;
  font-family: 'Noto Serif TC', serif;
  font-size: 13px;
  font-weight: 700;
  color: var(--app-text, #303133);
}

.side-total {
  margin: 0 0 4px;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--app-text, #303133);
}

.infeasible-reason {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--el-color-danger, #f56c6c);
}

.steps-list {
  margin: 4px 0 0;
  padding-left: 16px;
  font-size: 12.5px;
  color: var(--app-text, #303133);
}

.steps-list li {
  margin-bottom: 2px;
}

.caveat {
  display: block;
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--app-text-muted, #909399);
}

/* Disclaimer */
.disclaimer {
  margin: 0;
  font-size: 0.85rem;
  color: var(--app-text-muted, #909399);
}
</style>

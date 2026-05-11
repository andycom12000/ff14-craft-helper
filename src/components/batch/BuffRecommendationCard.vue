<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { BuffRecommendation } from '@/stores/batch'
import { useBatchStore } from '@/stores/batch'
import { formatGil } from '@/utils/format'

const props = defineProps<{
  recommendation: BuffRecommendation
}>()
const emit = defineEmits<{ apply: [] }>()

const batchStore = useBatchStore()

const netSavings = computed(() =>
  props.recommendation.hqMaterialSavings - props.recommendation.buffCost,
)

const hasEnabledRecipes = computed(() => props.recommendation.enabledRecipes.length > 0)
const hasAffectedRecipes = computed(() => props.recommendation.affectedRecipes.length > 0)
const hasSavings = computed(() => props.recommendation.hqMaterialSavings > 0)

function buffName(buff: { buff: { name: string }; isHq: boolean }): string {
  const suffix = buff.isHq ? '(HQ)' : '(NQ)'
  return `${buff.buff.name.replace(' HQ', '')}${suffix}`
}

const buffLabel = computed(() => {
  const parts: string[] = []
  if (props.recommendation.food) parts.push(buffName(props.recommendation.food))
  if (props.recommendation.medicine) parts.push(buffName(props.recommendation.medicine))
  return parts.join(' + ')
})

/** True when the user already has this recommendation's food + medicine
 *  committed in BatchSettings (so re-applying would be a no-op). */
const isApplied = computed(() => {
  const rec = props.recommendation
  const foodMatch =
    (rec.food?.buff.id ?? null) === batchStore.foodId &&
    (rec.food?.isHq ?? true) === batchStore.foodIsHq
  const medMatch =
    (rec.medicine?.buff.id ?? null) === batchStore.medicineId &&
    (rec.medicine?.isHq ?? true) === batchStore.medicineIsHq
  return foodMatch && medMatch
})

async function copyName(name: string) {
  const cleanName = name.replace(' HQ', '')
  try {
    await navigator.clipboard.writeText(cleanName)
    ElMessage({ message: `已複製「${cleanName}」`, type: 'success', duration: 1500 })
  } catch {
    ElMessage.error('複製失敗')
  }
}

function apply() {
  const rec = props.recommendation
  batchStore.foodId = rec.food?.buff.id ?? null
  batchStore.foodIsHq = rec.food?.isHq ?? true
  batchStore.medicineId = rec.medicine?.buff.id ?? null
  batchStore.medicineIsHq = rec.medicine?.isHq ?? true
  emit('apply')
}
</script>

<template>
  <details class="sug sug-buff" :open="!isApplied">
    <summary class="sug-head">
      <svg class="sug-chev" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M3.5 2 L7 5 L3.5 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="sug-title">{{ hasEnabledRecipes ? '食物推薦' : '省錢小提示' }}</span>
      <span class="sug-summary">{{ buffLabel }}</span>
      <div class="sug-stats">
        <span v-if="isApplied" class="sug-applied">✓ 已套用</span>
        <button
          v-else
          type="button"
          class="sug-apply"
          @click.stop="apply"
        >套用到本批次</button>
      </div>
    </summary>

    <div class="sug-body">
      <p class="buff-lead">
        <template v-if="hasEnabledRecipes">
          使用 <strong class="buff-name">{{ buffLabel }}</strong>
          可讓 {{ recommendation.enabledRecipes.length }} 個配方達成 HQ 品質<template v-if="hasAffectedRecipes">，並讓 {{ recommendation.affectedRecipes.length }} 個配方免用 HQ 材料</template>
          <template v-if="hasSavings">；以 {{ formatGil(recommendation.buffCost) }} G 換 {{ formatGil(recommendation.hqMaterialSavings) }} G 的 HQ 材料省下，<span class="buff-savings">淨省 {{ formatGil(netSavings) }} Gil</span></template>。
        </template>
        <template v-else>
          使用 <strong class="buff-name">{{ buffLabel }}</strong>
          可讓 {{ recommendation.affectedRecipes.length }} 個配方免用 HQ 材料。<template v-if="hasSavings">以 {{ formatGil(recommendation.buffCost) }} G 換 {{ formatGil(recommendation.hqMaterialSavings) }} G 的 HQ 材料省下，<span class="buff-savings">淨省 {{ formatGil(netSavings) }} Gil</span>。</template>
        </template>
      </p>

      <div class="buff-chip-row">
        <button
          v-if="recommendation.food"
          type="button"
          class="buff-chip"
          :aria-label="`複製食物名稱：${buffName(recommendation.food)}`"
          @click.stop="copyName(recommendation.food.buff.name)"
        >
          <span class="buff-chip__label">食物</span>
          <span class="buff-chip__name">{{ buffName(recommendation.food) }}</span>
          <span v-if="recommendation.foodPrice?.server" class="buff-chip__server">{{ recommendation.foodPrice.server }}</span>
          <span v-if="recommendation.foodPrice" class="buff-chip__price">{{ formatGil(recommendation.foodPrice.price) }} G</span>
          <span class="buff-chip__copy" aria-hidden="true">⎘</span>
        </button>
        <button
          v-if="recommendation.medicine"
          type="button"
          class="buff-chip"
          :aria-label="`複製藥水名稱：${buffName(recommendation.medicine)}`"
          @click.stop="copyName(recommendation.medicine.buff.name)"
        >
          <span class="buff-chip__label">藥水</span>
          <span class="buff-chip__name">{{ buffName(recommendation.medicine) }}</span>
          <span v-if="recommendation.medicinePrice?.server" class="buff-chip__server">{{ recommendation.medicinePrice.server }}</span>
          <span v-if="recommendation.medicinePrice" class="buff-chip__price">{{ formatGil(recommendation.medicinePrice.price) }} G</span>
          <span class="buff-chip__copy" aria-hidden="true">⎘</span>
        </button>
      </div>
    </div>
  </details>
</template>

<style scoped>
/* === Shared <details class="sug"> vocabulary ============================ */
.sug {
  padding: 4px 0 6px;
}

.sug-head {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 4px 0;
  flex-wrap: wrap;
}
.sug-head::-webkit-details-marker { display: none; }

.sug-chev {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  color: var(--buff-info, oklch(0.50 0.13 70));
  opacity: 0.75;
  transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
  transform: translateY(1px);
}
.sug[open] > .sug-head .sug-chev {
  transform: translateY(1px) rotate(90deg);
}

.sug-title {
  font-family: 'Noto Serif TC', serif;
  font-weight: 700;
  font-size: 15.5px;
  color: var(--buff-info, oklch(0.50 0.13 70));
  letter-spacing: 0.005em;
}
.sug-summary {
  font-size: 12.5px;
  color: var(--app-text-muted);
}
.sug-stats {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.sug-apply {
  appearance: none;
  border: 1px solid var(--accent-gold);
  background: var(--accent-gold);
  color: var(--app-surface);
  font-family: 'Noto Sans TC', sans-serif;
  font-size: 12.5px;
  font-weight: 500;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 140ms ease-out, transform 120ms ease-out;
}
.sug-apply:hover {
  background: color-mix(in oklch, var(--accent-gold) 88%, white);
  transform: translateY(-1px);
}
.sug-apply:focus-visible {
  outline: 2px solid var(--accent-gold);
  outline-offset: 2px;
}

.sug-applied {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-success);
  padding: 2px 8px;
  border-radius: 4px;
  background: color-mix(in oklch, var(--app-success) 10%, transparent);
}

.sug-body {
  padding: 6px 0 0 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* === Buff-specific ====================================================== */
.buff-lead {
  margin: 0;
  font-family: 'Noto Serif TC', serif;
  font-size: 14.5px;
  font-weight: 400;
  color: var(--app-text);
  line-height: 1.85;
  max-width: 65ch;
}
.buff-name {
  color: var(--buff-info, oklch(0.50 0.13 70));
  font-weight: 600;
}
.buff-savings {
  color: var(--app-success);
  font-weight: 600;
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12.5px;
}

.buff-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.buff-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 10px 6px 8px;
  background: color-mix(in oklch, var(--buff-info, oklch(0.50 0.13 70)) 6%, var(--app-surface));
  border: 1px solid color-mix(in oklch, var(--buff-info, oklch(0.50 0.13 70)) 30%, transparent);
  border-radius: 6px;
  font-size: 12.5px;
  font-family: 'Noto Sans TC', sans-serif;
  color: var(--app-text);
  cursor: pointer;
  transition: background 140ms ease-out, border-color 140ms ease-out;
}
.buff-chip:hover {
  background: color-mix(in oklch, var(--buff-info, oklch(0.50 0.13 70)) 12%, var(--app-surface));
  border-color: color-mix(in oklch, var(--buff-info, oklch(0.50 0.13 70)) 50%, transparent);
}
.buff-chip:focus-visible {
  outline: 2px solid var(--buff-info, oklch(0.50 0.13 70));
  outline-offset: 2px;
}
.buff-chip__label {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--buff-info, oklch(0.50 0.13 70));
  opacity: 0.85;
}
.buff-chip__name {
  font-weight: 500;
}
.buff-chip__server {
  font-size: 11px;
  color: var(--app-text-muted);
}
.buff-chip__price {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11.5px;
  color: var(--app-text);
}
.buff-chip__copy {
  font-size: 11px;
  color: var(--buff-info, oklch(0.50 0.13 70));
  opacity: 0.7;
}

@media (max-width: 640px) {
  .sug-head { gap: 8px; }
  .sug-summary { flex-basis: 100%; margin-left: 24px; }
  .sug-stats { flex-basis: 100%; margin-left: 24px; }
}
</style>

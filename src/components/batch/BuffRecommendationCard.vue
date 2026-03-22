<script setup lang="ts">
import type { BuffRecommendation } from '@/stores/batch'
import { formatGil } from '@/utils/format'
import { computed } from 'vue'

const props = defineProps<{
  recommendation: BuffRecommendation
}>()

const netSavings = computed(() =>
  props.recommendation.hqMaterialSavings - props.recommendation.buffCost,
)

const hasEnabledRecipes = computed(() => props.recommendation.enabledRecipes.length > 0)
const hasAffectedRecipes = computed(() => props.recommendation.affectedRecipes.length > 0)
const hasSavings = computed(() => props.recommendation.hqMaterialSavings > 0)

const buffLabel = computed(() => {
  const parts: string[] = []
  if (props.recommendation.food) {
    const suffix = props.recommendation.food.isHq ? '(HQ)' : '(NQ)'
    parts.push(`${props.recommendation.food.buff.name.replace(' HQ', '')}${suffix}`)
  }
  if (props.recommendation.medicine) {
    const suffix = props.recommendation.medicine.isHq ? '(HQ)' : '(NQ)'
    parts.push(`${props.recommendation.medicine.buff.name.replace(' HQ', '')}${suffix}`)
  }
  return parts.join(' + ')
})
</script>

<template>
  <div class="buff-recommendation">
    <span class="buff-icon">💡</span>
    <div class="buff-body">
      <div class="buff-title">{{ hasEnabledRecipes ? '食物推薦' : '省錢小提示' }}</div>
      <div v-if="hasEnabledRecipes" class="buff-main">
        使用 <strong class="buff-name">{{ buffLabel }}</strong>
        可讓 {{ recommendation.enabledRecipes.length }} 個配方達成 HQ 品質
        <span v-if="hasAffectedRecipes">，並讓 {{ recommendation.affectedRecipes.length }} 個配方免用 HQ 材料</span>
      </div>
      <div v-else class="buff-main">
        使用 <strong class="buff-name">{{ buffLabel }}</strong>
        可讓 {{ recommendation.affectedRecipes.length }} 個配方免用 HQ 材料
      </div>
      <div v-if="hasEnabledRecipes" class="buff-enabled-list">
        可 HQ 製作：<span v-for="(r, i) in recommendation.enabledRecipes" :key="r.id">{{ r.name }}<span v-if="i < recommendation.enabledRecipes.length - 1">、</span></span>
      </div>
      <div v-if="hasSavings" class="buff-detail">
        <span>食物/藥水成本：<strong>{{ formatGil(recommendation.buffCost) }} Gil</strong></span>
        <span>節省 HQ 材料：<strong class="buff-savings">{{ formatGil(recommendation.hqMaterialSavings) }} Gil</strong></span>
        <span>淨省：<strong class="buff-savings">{{ formatGil(netSavings) }} Gil</strong></span>
      </div>
      <div v-else class="buff-detail">
        <span>食物/藥水成本：<strong>{{ formatGil(recommendation.buffCost) }} Gil</strong></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.buff-recommendation {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(64, 158, 255, 0.08);
  border: 1px solid rgba(64, 158, 255, 0.2);
  border-radius: 8px;
  padding: 14px 18px;
  margin-bottom: 20px;
}

.buff-icon {
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 1px;
}

.buff-body {
  flex: 1;
}

.buff-title {
  font-size: 14px;
  font-weight: 600;
  color: #a0cfff;
  margin-bottom: 4px;
}

.buff-main {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.buff-name {
  color: #e9c176;
}

.buff-detail {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.buff-savings {
  color: var(--app-success, #67c23a);
}

.buff-enabled-list {
  font-size: 13px;
  color: var(--app-success, #67c23a);
  margin-top: 4px;
}

@media (max-width: 768px) {
  .buff-detail {
    flex-direction: column;
    gap: 4px;
  }
}
</style>

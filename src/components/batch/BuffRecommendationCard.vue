<script setup lang="ts">
import type { BuffRecommendation } from '@/stores/batch'
import { formatGil } from '@/utils/format'
import { computed } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  recommendation: BuffRecommendation
}>()

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

async function copyName(name: string) {
  const cleanName = name.replace(' HQ', '')
  try {
    await navigator.clipboard.writeText(cleanName)
    ElMessage({ message: `已複製「${cleanName}」`, type: 'success', duration: 1500 })
  } catch {
    ElMessage.error('複製失敗')
  }
}
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

      <div class="buff-items">
        <div v-if="recommendation.food" class="buff-item" @click="copyName(recommendation.food.buff.name)">
          <span class="buff-item-label">食物</span>
          <span class="buff-item-name">{{ buffName(recommendation.food) }}</span>
          <span v-if="recommendation.foodPrice?.server" class="buff-item-server">{{ recommendation.foodPrice.server }}</span>
          <span v-if="recommendation.foodPrice" class="buff-item-price">{{ formatGil(recommendation.foodPrice.price) }} Gil</span>
          <span class="buff-item-copy" title="複製名稱">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </span>
        </div>
        <div v-if="recommendation.medicine" class="buff-item" @click="copyName(recommendation.medicine.buff.name)">
          <span class="buff-item-label">藥水</span>
          <span class="buff-item-name">{{ buffName(recommendation.medicine) }}</span>
          <span v-if="recommendation.medicinePrice?.server" class="buff-item-server">{{ recommendation.medicinePrice.server }}</span>
          <span v-if="recommendation.medicinePrice" class="buff-item-price">{{ formatGil(recommendation.medicinePrice.price) }} Gil</span>
          <span class="buff-item-copy" title="複製名稱">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </span>
        </div>
      </div>

      <div v-if="hasEnabledRecipes" class="buff-enabled-list">
        可 HQ 製作：<span v-for="(r, i) in recommendation.enabledRecipes" :key="r.id">{{ r.name }}<span v-if="i < recommendation.enabledRecipes.length - 1">、</span></span>
      </div>

      <div v-if="hasSavings" class="buff-detail">
        <span>總成本：<strong>{{ formatGil(recommendation.buffCost) }} Gil</strong></span>
        <span>節省 HQ 材料：<strong class="buff-savings">{{ formatGil(recommendation.hqMaterialSavings) }} Gil</strong></span>
        <span>淨省：<strong class="buff-savings">{{ formatGil(netSavings) }} Gil</strong></span>
      </div>
      <div v-else class="buff-detail">
        <span>總成本：<strong>{{ formatGil(recommendation.buffCost) }} Gil</strong></span>
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
  min-width: 0;
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

.buff-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.buff-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
  font-size: 13px;
}

.buff-item:hover {
  background: var(--app-accent-glow, rgba(124, 58, 237, 0.2));
  border-color: var(--app-accent, #7C3AED);
}

.buff-item-label {
  color: var(--app-text-muted, #94A3B8);
  font-size: 12px;
  min-width: 28px;
}

.buff-item-name {
  color: #e9c176;
  font-weight: 500;
}

.buff-item-server {
  font-size: 11px;
  color: var(--app-accent-light, #A78BFA);
  background: rgba(124, 58, 237, 0.15);
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.buff-item-price {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: auto;
}

.buff-item-copy {
  color: var(--app-text-muted, #94A3B8);
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.buff-item:hover .buff-item-copy {
  opacity: 1;
}

.buff-detail {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-top: 8px;
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
  margin-top: 6px;
}

@media (max-width: 768px) {
  .buff-detail {
    flex-direction: column;
    gap: 4px;
  }

  .buff-item-copy {
    opacity: 1;
  }
}
</style>

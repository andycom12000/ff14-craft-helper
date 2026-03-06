<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRecipeStore } from '@/stores/recipe'
import { useSimulatorStore } from '@/stores/simulator'
import { calculateInitialQuality } from '@/engine/quality'

const emit = defineEmits<{
  'update:initialQuality': [value: number]
}>()

const recipeStore = useRecipeStore()
const simStore = useSimulatorStore()
const recipe = computed(() => recipeStore.currentRecipe)

// 從模擬結果取得當前品質
const simulatedQuality = computed(() => {
  const results = simStore.simulationResults
  if (results.length === 0) return 0
  return results[results.length - 1].state.quality
})

// Track HQ amounts for each ingredient by index
const hqAmounts = ref<number[]>([])

// Reset HQ amounts when recipe changes
watch(
  () => recipe.value,
  (newRecipe) => {
    if (newRecipe) {
      hqAmounts.value = newRecipe.ingredients.map(() => 0)
    } else {
      hqAmounts.value = []
    }
  },
  { immediate: true },
)

const initialQuality = computed(() => {
  if (!recipe.value) return 0

  const ingredients = recipe.value.ingredients.map((ing, i) => ({
    amount: ing.amount,
    hqAmount: hqAmounts.value[i] ?? 0,
    level: ing.level,
    canHq: ing.canHq,
  }))

  return calculateInitialQuality(
    recipe.value.recipeLevelTable.quality,
    recipe.value.materialQualityFactor,
    ingredients,
  )
})

// Emit whenever quality changes
watch(initialQuality, (val) => {
  emit('update:initialQuality', val)
}, { immediate: true })

const maxQuality = computed(() => recipe.value?.recipeLevelTable.quality ?? 0)

const qualityPercent = computed(() => {
  if (maxQuality.value === 0) return 0
  return Math.round((initialQuality.value / maxQuality.value) * 100)
})

const totalQuality = computed(() => Math.min(initialQuality.value + simulatedQuality.value, maxQuality.value))

const totalQualityPercent = computed(() => {
  if (maxQuality.value === 0) return 0
  return Math.round((totalQuality.value / maxQuality.value) * 100)
})

const remainingQuality = computed(() => Math.max(0, maxQuality.value - totalQuality.value))

function setAllHq() {
  if (!recipe.value) return
  hqAmounts.value = recipe.value.ingredients.map((ing) => ing.canHq ? ing.amount : 0)
}

function clearAllHq() {
  if (!recipe.value) return
  hqAmounts.value = recipe.value.ingredients.map(() => 0)
}

function incrementHq(index: number) {
  if (!recipe.value) return
  const ing = recipe.value.ingredients[index]
  if (!ing.canHq) return
  const current = hqAmounts.value[index] ?? 0
  if (current < ing.amount) {
    hqAmounts.value[index] = current + 1
  }
}

function decrementHq(index: number) {
  const current = hqAmounts.value[index] ?? 0
  if (current > 0) {
    hqAmounts.value[index] = current - 1
  }
}
</script>

<template>
  <div class="initial-quality">
    <el-empty v-if="!recipe" description="尚未選擇配方" />

    <template v-else>
      <div class="quality-result">
        <div class="quality-row">
          <span class="quality-label">初期品質</span>
          <span class="quality-number">{{ initialQuality.toLocaleString() }}</span>
        </div>
        <div class="quality-row">
          <span class="quality-label">模擬品質</span>
          <span class="quality-number sim">{{ simulatedQuality.toLocaleString() }}</span>
        </div>
        <div class="quality-row">
          <span class="quality-label">合計</span>
          <span class="quality-number total">{{ totalQuality.toLocaleString() }}</span>
          <span class="quality-max">/ {{ maxQuality.toLocaleString() }}</span>
          <el-tag
            v-if="remainingQuality > 0"
            type="warning"
            size="small"
            style="margin-left: 8px"
          >
            差 {{ remainingQuality.toLocaleString() }}
          </el-tag>
          <el-tag
            v-else
            type="success"
            size="small"
            style="margin-left: 8px"
          >
            已滿
          </el-tag>
        </div>
        <el-progress
          :percentage="totalQualityPercent"
          :stroke-width="16"
          :format="() => `${totalQualityPercent}%`"
          style="margin-top: 8px"
        />
      </div>

      <el-divider />

      <div class="ingredient-header">
        <h4 style="margin: 0">HQ 素材設定</h4>
        <div class="header-actions">
          <el-button size="small" @click="setAllHq">全部 HQ</el-button>
          <el-button size="small" @click="clearAllHq">全部清除</el-button>
        </div>
      </div>

      <div class="ingredient-list">
        <div
          v-for="(ing, index) in recipe.ingredients"
          :key="index"
          class="ingredient-row"
          :class="{ disabled: !ing.canHq }"
        >
          <div class="ingredient-info">
            <img :src="ing.icon" :alt="ing.name" class="ingredient-icon" />
            <span class="ingredient-name">{{ ing.name }}</span>
          </div>
          <div class="ingredient-controls">
            <template v-if="ing.canHq">
              <el-button-group>
                <el-button
                  :disabled="(hqAmounts[index] ?? 0) <= 0"
                  @click="decrementHq(index)"
                  class="hq-btn nq-btn"
                >
                  NQ {{ ing.amount - (hqAmounts[index] ?? 0) }}
                </el-button>
                <el-button
                  type="primary"
                  :disabled="(hqAmounts[index] ?? 0) >= ing.amount"
                  @click="incrementHq(index)"
                  class="hq-btn"
                >
                  HQ {{ hqAmounts[index] ?? 0 }}
                </el-button>
              </el-button-group>
            </template>
            <template v-else>
              <el-button disabled class="hq-btn nq-only-btn">
                NQ {{ ing.amount }}
              </el-button>
            </template>
          </div>
        </div>
      </div>

      <div class="info-text">
        <el-text type="info" size="small">
          品質因子：{{ recipe.materialQualityFactor }}%
          ｜品質上限：{{ recipe.recipeLevelTable.quality.toLocaleString() }}
        </el-text>
      </div>
    </template>
  </div>
</template>

<style scoped>
.initial-quality {
  padding: 4px 0;
  max-width: 600px;
}

.quality-result {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 16px 20px;
}

.quality-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}

.quality-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  min-width: 64px;
}

.quality-number {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-color-primary);
}

.quality-number.sim {
  color: var(--el-color-success);
}

.quality-number.total {
  font-size: 24px;
}

.quality-max {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.ingredient-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.ingredient-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.ingredient-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.ingredient-row.disabled {
  opacity: 0.55;
}

.ingredient-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ingredient-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.ingredient-name {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ingredient-controls {
  flex-shrink: 0;
}

.hq-btn {
  min-width: 80px;
  font-size: 14px;
  font-weight: 600;
  padding: 8px 16px;
  height: 38px;
}

.nq-only-btn {
  min-width: 100px;
}

.info-text {
  margin-top: 12px;
  text-align: right;
}
</style>

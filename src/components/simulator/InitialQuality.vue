<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRecipeStore } from '@/stores/recipe'
import { calculateInitialQuality } from '@/engine/quality'

const emit = defineEmits<{
  'update:initialQuality': [value: number]
}>()

const recipeStore = useRecipeStore()
const recipe = computed(() => recipeStore.currentRecipe)

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

const qualityPercent = computed(() => {
  if (!recipe.value || recipe.value.recipeLevelTable.quality === 0) return 0
  return Math.round((initialQuality.value / recipe.value.recipeLevelTable.quality) * 100)
})

function setAllHq() {
  if (!recipe.value) return
  hqAmounts.value = recipe.value.ingredients.map((ing) => ing.amount)
}

function clearAllHq() {
  if (!recipe.value) return
  hqAmounts.value = recipe.value.ingredients.map(() => 0)
}
</script>

<template>
  <div class="initial-quality">
    <el-empty v-if="!recipe" description="尚未選擇配方" />

    <template v-else>
      <div class="quality-result">
        <div class="quality-value">
          <span class="quality-label">初期品質</span>
          <span class="quality-number">{{ initialQuality.toLocaleString() }}</span>
          <span class="quality-max">
            / {{ recipe.recipeLevelTable.quality.toLocaleString() }}
          </span>
        </div>
        <el-progress
          :percentage="qualityPercent"
          :stroke-width="16"
          :format="() => `${qualityPercent}%`"
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

      <el-table :data="recipe.ingredients" border style="width: 100%; margin-top: 12px">
        <el-table-column label="圖示" width="60" align="center">
          <template #default="{ row }">
            <img :src="row.icon" :alt="row.name" style="width: 28px; height: 28px" />
          </template>
        </el-table-column>

        <el-table-column prop="name" label="素材名稱" />

        <el-table-column label="需求數量" width="90" align="center">
          <template #default="{ row }">
            {{ row.amount }}
          </template>
        </el-table-column>

        <el-table-column label="HQ 數量" width="160" align="center">
          <template #default="{ $index, row }">
            <el-input-number
              v-model="hqAmounts[$index]"
              :min="0"
              :max="row.amount"
              size="small"
              controls-position="right"
              style="width: 120px"
            />
          </template>
        </el-table-column>
      </el-table>

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

.quality-value {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.quality-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.quality-number {
  font-size: 28px;
  font-weight: 700;
  color: var(--el-color-primary);
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

.info-text {
  margin-top: 12px;
  text-align: right;
}
</style>

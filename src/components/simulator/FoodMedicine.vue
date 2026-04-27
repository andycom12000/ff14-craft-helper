<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRecipeStore } from '@/stores/recipe'
import { useGearsetsStore } from '@/stores/gearsets'
import { useMediaQuery } from '@/composables/useMediaQuery'
import {
  COMMON_FOODS,
  COMMON_MEDICINES,
  applyFoodBuff,
  applyMedicineBuff,
  scaleForNq,
  type FoodBuff,
  type EnhancedStats,
} from '@/engine/food-medicine'

const emit = defineEmits<{
  'update:enhancedStats': [value: EnhancedStats]
}>()

const recipeStore = useRecipeStore()
const gearsetsStore = useGearsetsStore()
const gearset = computed(() => {
  const recipe = recipeStore.currentRecipe
  if (!recipe) return null
  return gearsetsStore.getGearsetForJob(recipe.job) ?? null
})

const selectedFoodId = ref<number | null>(null)
const selectedMedicineId = ref<number | null>(null)
const foodIsHq = ref(true)
const medicineIsHq = ref(true)
const useSpecialist = ref(false)

// Specialist soul crystal bonuses (固定值)
const SPECIALIST_BONUS = { craftsmanship: 20, control: 20, cp: 15 }

const baseStats = computed<EnhancedStats>(() => {
  if (!gearset.value) {
    return { craftsmanship: 0, control: 0, cp: 0 }
  }
  return {
    craftsmanship: gearset.value.craftsmanship,
    control: gearset.value.control,
    cp: gearset.value.cp,
  }
})

// 專家之證加成後的數值（食物/藥水基數）
const afterSpecialist = computed<EnhancedStats>(() => {
  if (!useSpecialist.value) return baseStats.value
  return {
    craftsmanship: baseStats.value.craftsmanship + SPECIALIST_BONUS.craftsmanship,
    control: baseStats.value.control + SPECIALIST_BONUS.control,
    cp: baseStats.value.cp + SPECIALIST_BONUS.cp,
  }
})

const selectedFood = computed<FoodBuff | null>(() => {
  if (!selectedFoodId.value) return null
  const food = COMMON_FOODS.find((f) => f.id === selectedFoodId.value) ?? null
  if (!food) return null
  return foodIsHq.value ? food : scaleForNq(food)
})

const selectedMedicine = computed<FoodBuff | null>(() => {
  if (!selectedMedicineId.value) return null
  const med = COMMON_MEDICINES.find((m) => m.id === selectedMedicineId.value) ?? null
  if (!med) return null
  return medicineIsHq.value ? med : scaleForNq(med)
})

// Apply specialist first, then food, then medicine
const enhancedStats = computed<EnhancedStats>(() => {
  const afterFood = applyFoodBuff(afterSpecialist.value, selectedFood.value)
  return applyMedicineBuff(afterFood, selectedMedicine.value)
})

watch(enhancedStats, (val) => {
  emit('update:enhancedStats', val)
}, { immediate: true })

// Bonus preview helpers
function foodBonusText(food: FoodBuff): string {
  const parts: string[] = []
  if (food.craftsmanship) {
    parts.push(`作業 +${food.craftsmanship.percent}%(上限${food.craftsmanship.max})`)
  }
  if (food.control) {
    parts.push(`加工 +${food.control.percent}%(上限${food.control.max})`)
  }
  if (food.cp) {
    parts.push(`CP +${food.cp.percent}%(上限${food.cp.max})`)
  }
  return parts.join('　')
}

function statDiff(base: number, enhanced: number): string {
  const diff = enhanced - base
  if (diff === 0) return ''
  return `(+${diff})`
}

const isVeryNarrow = useMediaQuery('(max-width: 479px)')
const isNarrow = useMediaQuery('(max-width: 767px)')
const statsDescColumns = computed(() =>
  isVeryNarrow.value ? 1 : isNarrow.value ? 2 : 3,
)
</script>

<template>
  <div class="food-medicine">
    <!-- !gearset only fires when there's no recipe selected (gearsets store
         always returns a default entry per job once a recipe sets the job
         context). So the message must reflect "step 1 missing" not
         "you forgot to fill in your gearset". -->
    <el-alert
      v-if="!gearset"
      title="先選配方"
      description="選好配方後，這裡可加食物與藥水的能力加成。"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />
    <el-alert
      v-else-if="gearset.craftsmanship === 0 && gearset.control === 0"
      title="尚未設定配裝"
      description="請先在配裝管理中設定職業配裝數值。"
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />

    <!-- Base stats display -->
    <div class="stats-section">
      <h4>基礎能力值</h4>
      <el-descriptions :column="statsDescColumns" border size="small">
        <el-descriptions-item label="作業精度">
          {{ baseStats.craftsmanship }}
        </el-descriptions-item>
        <el-descriptions-item label="加工精度">
          {{ baseStats.control }}
        </el-descriptions-item>
        <el-descriptions-item label="CP">
          {{ baseStats.cp }}
        </el-descriptions-item>
      </el-descriptions>
    </div>

    <el-divider />

    <!-- Specialist soul crystal -->
    <div class="buff-section">
      <div class="buff-header">
        <el-checkbox v-model="useSpecialist" label="專家之證" />
      </div>
      <div v-if="useSpecialist" class="buff-preview">
        <el-tag type="warning" size="small">作業 +{{ SPECIALIST_BONUS.craftsmanship }}</el-tag>
        <el-tag type="success" size="small">加工 +{{ SPECIALIST_BONUS.control }}</el-tag>
        <el-tag type="primary" size="small">CP +{{ SPECIALIST_BONUS.cp }}</el-tag>
      </div>
    </div>

    <el-divider />

    <!-- Food selection -->
    <div class="buff-section">
      <div class="buff-header">
        <h4>食物</h4>
        <el-switch
          v-model="foodIsHq"
          active-text="HQ"
          inactive-text="NQ"
          style="margin-left: 12px"
        />
      </div>

      <el-select
        v-model="selectedFoodId"
        placeholder="選擇食物（可不選）"
        clearable
        style="width: 100%"
      >
        <el-option
          v-for="food in COMMON_FOODS"
          :key="food.id"
          :label="food.name"
          :value="food.id"
        >
          <div class="option-content">
            <span class="option-name">{{ food.name }}</span>
            <span class="option-bonus">{{ foodBonusText(food) }}</span>
          </div>
        </el-option>
      </el-select>

      <div v-if="selectedFood" class="buff-preview">
        <el-tag
          v-if="selectedFood.craftsmanship"
          type="warning"
          size="small"
        >
          作業 +{{ selectedFood.craftsmanship.percent }}%（上限 {{ selectedFood.craftsmanship.max }}）
        </el-tag>
        <el-tag
          v-if="selectedFood.control"
          type="success"
          size="small"
        >
          加工 +{{ selectedFood.control.percent }}%（上限 {{ selectedFood.control.max }}）
        </el-tag>
        <el-tag
          v-if="selectedFood.cp"
          type="primary"
          size="small"
        >
          CP +{{ selectedFood.cp.percent }}%（上限 {{ selectedFood.cp.max }}）
        </el-tag>
      </div>
    </div>

    <el-divider />

    <!-- Medicine selection -->
    <div class="buff-section">
      <div class="buff-header">
        <h4>藥水</h4>
        <el-switch
          v-model="medicineIsHq"
          active-text="HQ"
          inactive-text="NQ"
          style="margin-left: 12px"
        />
      </div>

      <el-select
        v-model="selectedMedicineId"
        placeholder="選擇藥水（可不選）"
        clearable
        style="width: 100%"
      >
        <el-option
          v-for="med in COMMON_MEDICINES"
          :key="med.id"
          :label="med.name"
          :value="med.id"
        >
          <div class="option-content">
            <span class="option-name">{{ med.name }}</span>
            <span class="option-bonus">{{ foodBonusText(med) }}</span>
          </div>
        </el-option>
      </el-select>

      <div v-if="selectedMedicine" class="buff-preview">
        <el-tag
          v-if="selectedMedicine.craftsmanship"
          type="warning"
          size="small"
        >
          作業 +{{ selectedMedicine.craftsmanship.percent }}%（上限 {{ selectedMedicine.craftsmanship.max }}）
        </el-tag>
        <el-tag
          v-if="selectedMedicine.control"
          type="success"
          size="small"
        >
          加工 +{{ selectedMedicine.control.percent }}%（上限 {{ selectedMedicine.control.max }}）
        </el-tag>
        <el-tag
          v-if="selectedMedicine.cp"
          type="primary"
          size="small"
        >
          CP +{{ selectedMedicine.cp.percent }}%（上限 {{ selectedMedicine.cp.max }}）
        </el-tag>
      </div>
    </div>

    <el-divider />

    <!-- Enhanced stats result -->
    <div class="stats-section enhanced">
      <h4>最終能力值</h4>
      <el-descriptions :column="statsDescColumns" border size="small">
        <el-descriptions-item label="作業精度">
          <span class="enhanced-value">{{ enhancedStats.craftsmanship }}</span>
          <span class="stat-diff" v-if="statDiff(baseStats.craftsmanship, enhancedStats.craftsmanship)">
            {{ statDiff(baseStats.craftsmanship, enhancedStats.craftsmanship) }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="加工精度">
          <span class="enhanced-value">{{ enhancedStats.control }}</span>
          <span class="stat-diff" v-if="statDiff(baseStats.control, enhancedStats.control)">
            {{ statDiff(baseStats.control, enhancedStats.control) }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="CP">
          <span class="enhanced-value">{{ enhancedStats.cp }}</span>
          <span class="stat-diff" v-if="statDiff(baseStats.cp, enhancedStats.cp)">
            {{ statDiff(baseStats.cp, enhancedStats.cp) }}
          </span>
        </el-descriptions-item>
      </el-descriptions>
    </div>
  </div>
</template>

<style scoped>
.food-medicine {
  padding: 4px 0;
  max-width: 600px;
}

.stats-section h4,
.buff-section h4 {
  margin: 0 0 10px 0;
}

.buff-header {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 480px) {
  .buff-header :deep(.el-switch) {
    margin-left: 0 !important;
  }
}

@media (max-width: 640px) {
  .food-medicine {
    max-width: none;
    padding: 0;
  }

  .food-medicine :deep(.el-divider) {
    margin: 12px 0;
  }

  .stats-section h4,
  .buff-section h4 {
    font-size: 13px;
    color: var(--app-text-muted, var(--el-text-color-secondary));
    font-weight: 600;
    margin: 0 0 6px;
  }

  .food-medicine :deep(.el-descriptions) {
    --el-descriptions-item-bordered-label-background: transparent;
  }

  .food-medicine :deep(.el-descriptions__body),
  .food-medicine :deep(.el-descriptions__table) {
    background: transparent;
  }

  .food-medicine :deep(.el-descriptions__table) {
    display: block;
  }

  .food-medicine :deep(.el-descriptions__table tbody) {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: auto auto;
    grid-auto-flow: column;
    gap: 2px 8px;
  }

  .food-medicine :deep(.el-descriptions__table tr) {
    display: contents;
  }

  .food-medicine :deep(.el-descriptions .el-descriptions__cell) {
    display: block;
    padding: 6px 10px;
    border: 1px solid var(--app-border, var(--el-border-color-lighter));
    background: transparent;
    min-height: 0;
    text-align: left;
  }

  .food-medicine :deep(.el-descriptions__label.is-bordered-label) {
    background: transparent;
    border-bottom: 0;
    border-radius: 8px 8px 0 0;
    padding-bottom: 2px;
  }

  .food-medicine :deep(.el-descriptions__content) {
    border-top: 0;
    border-radius: 0 0 8px 8px;
    padding-top: 2px;
  }

  .food-medicine :deep(.el-descriptions__label) {
    font-size: 11px;
    color: var(--app-text-muted, var(--el-text-color-secondary));
    font-weight: 500;
  }

  .food-medicine :deep(.el-descriptions__content) {
    font-size: 15px;
    font-weight: 600;
    color: var(--app-text, var(--el-text-color-primary));
  }

  .enhanced :deep(.el-descriptions__content) {
    color: var(--app-craft, var(--el-color-primary));
  }

  .stat-diff {
    font-size: 11px;
    margin-left: 6px;
  }

  .buff-header {
    margin-bottom: 8px;
  }

  .buff-preview :deep(.el-tag) {
    font-size: 11px;
  }
}

.buff-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.option-content {
  display: flex;
  flex-direction: column;
  padding: 2px 0;
  min-width: 0;
}

.option-name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-bonus {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.enhanced .enhanced-value {
  font-weight: 700;
}

.stat-diff {
  color: var(--el-color-success);
  font-size: 12px;
  margin-left: 4px;
}
</style>

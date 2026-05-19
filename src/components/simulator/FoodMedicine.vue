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
import { applyCrafterSoulBonus } from '@/services/specialist-state'

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

// Specialist bonus is gearset-derived (set in GearsetSheet); no local toggle here.
const afterSpecialist = computed<EnhancedStats>(() => {
  if (!gearset.value) return baseStats.value
  const { craftsmanship, control, cp } = applyCrafterSoulBonus(gearset.value)
  return { craftsmanship, control, cp }
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

// At narrow-rail (rail 220-280px) the el-descriptions 3-col table
// squashes 4-char CJK labels into vertical characters; swap to a stacked
// grid for that range only.
const isRailNarrow = useMediaQuery('(min-width: 1100px) and (max-width: 1360px)')
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
      <div v-if="isRailNarrow" class="stats-grid">
        <div class="stat-cell">
          <span class="stat-label">作業精度</span>
          <span class="stat-value">{{ baseStats.craftsmanship }}</span>
        </div>
        <div class="stat-cell">
          <span class="stat-label">加工精度</span>
          <span class="stat-value">{{ baseStats.control }}</span>
        </div>
        <div class="stat-cell">
          <span class="stat-label">CP</span>
          <span class="stat-value">{{ baseStats.cp }}</span>
        </div>
      </div>
      <el-descriptions v-else :column="statsDescColumns" border size="small">
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
      <div v-if="isRailNarrow" class="stats-grid">
        <div class="stat-cell">
          <span class="stat-label">作業精度</span>
          <span class="stat-value">
            <span class="enhanced-value">{{ enhancedStats.craftsmanship }}</span>
            <span class="stat-diff" v-if="statDiff(baseStats.craftsmanship, enhancedStats.craftsmanship)">
              {{ statDiff(baseStats.craftsmanship, enhancedStats.craftsmanship) }}
            </span>
          </span>
        </div>
        <div class="stat-cell">
          <span class="stat-label">加工精度</span>
          <span class="stat-value">
            <span class="enhanced-value">{{ enhancedStats.control }}</span>
            <span class="stat-diff" v-if="statDiff(baseStats.control, enhancedStats.control)">
              {{ statDiff(baseStats.control, enhancedStats.control) }}
            </span>
          </span>
        </div>
        <div class="stat-cell">
          <span class="stat-label">CP</span>
          <span class="stat-value">
            <span class="enhanced-value">{{ enhancedStats.cp }}</span>
            <span class="stat-diff" v-if="statDiff(baseStats.cp, enhancedStats.cp)">
              {{ statDiff(baseStats.cp, enhancedStats.cp) }}
            </span>
          </span>
        </div>
      </div>
      <el-descriptions v-else :column="statsDescColumns" border size="small">
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

/* Mirrors el-descriptions border/small visuals (same EP tokens) so the
 * narrow-rail stack reads as the same component, rotated. */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr;
  /* Transparent so the grid blends with the rail surface — the only
     visible tint is on the label cells, mirroring how el-descriptions
     looks against the rail in narrow contexts. */
  border: 0.8px solid var(--el-border-color-lighter);
  border-radius: 2px;
  overflow: hidden;
}
.stat-cell {
  display: grid;
  grid-template-columns: minmax(64px, max-content) 1fr;
  align-items: baseline;
  border-bottom: 0.8px solid var(--el-border-color-lighter);
}
.stat-cell:last-child { border-bottom: 0; }
.stat-label,
.stat-value {
  font-size: 12px;
  padding: 4px 7px;
}
.stat-label {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-weight: 700;
  white-space: nowrap;
  border-right: 0.8px solid var(--el-border-color-lighter);
}
.stat-value {
  color: var(--el-text-color-primary);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  min-width: 0;
}
.enhanced .stat-value { color: var(--app-craft, var(--el-color-primary)); }
.enhanced .stat-value .enhanced-value { font-weight: 700; }

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

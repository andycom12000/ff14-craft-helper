<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useGearsetsStore } from '@/stores/gearsets'
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

const gearsetsStore = useGearsetsStore()
const gearset = computed(() => gearsetsStore.activeGearset)

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

// Apply food first, then medicine on top of that
const enhancedStats = computed<EnhancedStats>(() => {
  const afterFood = applyFoodBuff(baseStats.value, selectedFood.value)
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
</script>

<template>
  <div class="food-medicine">
    <el-alert
      v-if="!gearset"
      title="尚未選擇配裝"
      description="請先在配裝管理中新增並選擇一組配裝。"
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />

    <!-- Base stats display -->
    <div class="stats-section">
      <h4>基礎能力值</h4>
      <el-descriptions :column="3" border size="small">
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
      <el-descriptions :column="3" border size="small">
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
}

.stats-section h4,
.buff-section h4 {
  margin: 0 0 10px 0;
}

.buff-header {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
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
}

.option-name {
  font-size: 14px;
}

.option-bonus {
  font-size: 11px;
  color: var(--el-text-color-secondary);
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

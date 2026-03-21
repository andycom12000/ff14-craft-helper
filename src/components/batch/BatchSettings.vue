<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import { useBatchStore } from '@/stores/batch'
import { COMMON_FOODS, COMMON_MEDICINES } from '@/engine/food-medicine'

const settings = useSettingsStore()
const batch = useBatchStore()
</script>

<template>
  <el-card shadow="never" class="settings-card">
    <template #header>
      <span class="card-title">計算設定</span>
    </template>
    <div class="settings-row">
      <div class="settings-item">
        <el-switch v-model="settings.recursivePricing" size="small" />
        <span class="settings-text">遞迴查價</span>
        <el-input-number
          v-if="settings.recursivePricing"
          v-model="settings.maxRecursionDepth"
          :min="1" :max="10" size="small"
                    style="width: 120px;"
        />
      </div>
      <el-divider direction="vertical" />
      <div class="settings-item">
        <el-switch v-model="settings.crossServer" size="small" />
        <span class="settings-text">跨服採購</span>
        <el-text v-if="settings.crossServer" size="small" type="info">{{ settings.dataCenter }}</el-text>
      </div>
      <el-divider direction="vertical" />
      <div class="settings-item">
        <span class="settings-text">例外：</span>
        <el-radio-group v-model="settings.exceptionStrategy" size="small">
          <el-radio-button value="skip">跳過</el-radio-button>
          <el-radio-button value="buy">購買</el-radio-button>
        </el-radio-group>
        <el-text size="small" type="info">等級不足/無法雙滿</el-text>
      </div>
      <el-divider direction="vertical" />
      <div class="settings-item">
        <span class="settings-text">食物：</span>
        <el-select v-model="batch.foodId" placeholder="無" clearable size="small" class="buff-select">
          <el-option v-for="food in COMMON_FOODS" :key="food.id" :label="food.name.replace(' HQ', '')" :value="food.id" />
        </el-select>
        <el-switch v-if="batch.foodId" v-model="batch.foodIsHq" active-text="HQ" inactive-text="NQ" size="small" style="margin-left: 2px" />
      </div>
      <el-divider direction="vertical" />
      <div class="settings-item">
        <span class="settings-text">藥水：</span>
        <el-select v-model="batch.medicineId" placeholder="無" clearable size="small" class="buff-select">
          <el-option v-for="med in COMMON_MEDICINES" :key="med.id" :label="med.name.replace(' HQ', '')" :value="med.id" />
        </el-select>
        <el-switch v-if="batch.medicineId" v-model="batch.medicineIsHq" active-text="HQ" inactive-text="NQ" size="small" style="margin-left: 2px" />
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.settings-card {
  margin-top: 16px;
}

.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.settings-item {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.settings-text {
  font-size: 13px;
}

.buff-select {
  width: 160px;
}

@media (max-width: 768px) {
  .settings-row :deep(.el-divider--vertical) {
    display: none;
  }

  .settings-row {
    gap: var(--space-md);
  }
}
</style>

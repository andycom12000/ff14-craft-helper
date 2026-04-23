<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import { useBatchStore } from '@/stores/batch'
import { COMMON_FOODS, COMMON_MEDICINES } from '@/engine/food-medicine'
import ModeChip from './ModeChip.vue'

const settings = useSettingsStore()
const batch = useBatchStore()
</script>

<template>
  <el-card shadow="never" class="settings-card">
    <template #header>
      <span class="card-title">計算設定</span>
    </template>

    <div class="settings-stack">
      <!-- Mode chip at top: choose macro vs quick-buy -->
      <div class="mode-row">
        <ModeChip :model-value="batch.calcMode" @change="batch.setCalcMode" />
        <el-text size="small" type="info" class="mode-hint">
          {{ batch.calcMode === 'macro' ? '會計算巨集與 HQ 需求' : '直接列出採購清單，不跑巨集' }}
        </el-text>
      </div>

      <!-- Quality pills: quick-buy only (progressive disclosure) -->
      <Transition name="slide-fade">
        <div v-if="batch.calcMode === 'quick-buy'" class="quality-row">
          <span class="settings-text">素材品質：</span>
          <div class="quality-chip" role="tablist" aria-label="素材品質">
            <button
              type="button"
              class="quality-pill"
              :class="{ 'quality-pill--active': batch.bulkQualityMode === 'nq' }"
              :aria-selected="batch.bulkQualityMode === 'nq'"
              @click="batch.setBulkQuality('nq')"
            >全 NQ</button>
            <button
              type="button"
              class="quality-pill quality-pill--hq"
              :class="{ 'quality-pill--active': batch.bulkQualityMode === 'hq' }"
              :aria-selected="batch.bulkQualityMode === 'hq'"
              @click="batch.setBulkQuality('hq')"
            >全 HQ</button>
          </div>
          <el-text size="small" type="info">可於素材列單獨調整</el-text>
        </div>
      </Transition>

      <!-- Original settings row -->
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
      </div>

      <!-- Food/medicine section with contextual auto-evaluate switch -->
      <div class="buff-section">
        <div class="buff-section-header">
          <span class="buff-section-title">食藥設定</span>
          <div class="buff-auto-toggle">
            <el-switch
              v-model="batch.autoEvaluateBuffs"
              size="small"
              inline-prompt
              aria-label="自動評估食藥"
            />
            <span class="settings-text">自動評估食藥</span>
            <el-tooltip content="當未選擇食藥時，根據配方自動推薦對成品最有幫助的食物/藥水" placement="top">
              <el-text size="small" type="info" class="buff-auto-hint">?</el-text>
            </el-tooltip>
          </div>
        </div>
        <div class="settings-row">
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
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.settings-card {
  margin-top: 16px;
}

.settings-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mode-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.mode-hint {
  font-size: 12.5px;
}

.quality-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
}

.quality-chip {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: var(--el-fill-color);
  border: 1px solid var(--el-border-color-lighter);
}

.quality-pill {
  appearance: none;
  border: none;
  background: transparent;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.quality-pill:hover:not(.quality-pill--active) {
  color: var(--el-text-color-primary);
}

.quality-pill--active {
  background: var(--el-color-info-light-8, var(--el-fill-color-dark));
  color: var(--el-text-color-primary);
}

.quality-pill--hq.quality-pill--active {
  background: color-mix(in oklch, var(--accent-gold) 22%, transparent);
  color: var(--accent-gold);
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

.buff-section {
  border-top: 1px dashed var(--el-border-color-lighter);
  padding-top: 12px;
}

.buff-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}

.buff-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.buff-auto-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.buff-auto-hint {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--el-fill-color);
  font-weight: 600;
  cursor: help;
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease, max-height 0.2s ease;
  overflow: hidden;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
  max-height: 0;
}

.slide-fade-enter-to,
.slide-fade-leave-from {
  opacity: 1;
  max-height: 60px;
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

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useBatchStore } from '@/stores/batch'
import { useIsMobile } from '@/composables/useMediaQuery'
import { COMMON_FOODS, COMMON_MEDICINES } from '@/engine/food-medicine'
import ModeChip from './ModeChip.vue'

const settings = useSettingsStore()
const batch = useBatchStore()

const isMobile = useIsMobile()

// Advanced section accordion state (mobile-only, not persisted across mounts)
const advancedOpen = ref(false)

// 進階設定收合摘要：依目前 foodId / medicineId 決定文字
const buffSummary = computed(() => {
  const foodName = batch.foodId
    ? COMMON_FOODS.find(f => f.id === batch.foodId)?.name.replace(' HQ', '') ?? null
    : null
  const medName = batch.medicineId
    ? COMMON_MEDICINES.find(m => m.id === batch.medicineId)?.name.replace(' HQ', '') ?? null
    : null
  if (!foodName && !medName) return { text: '未設定', muted: true }
  if (foodName && medName) return { text: '已設定', muted: false }
  return { text: foodName ?? medName ?? '已設定', muted: false }
})
</script>

<template>
  <template v-if="!isMobile">
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

      <!-- Original settings row -->
      <div class="settings-row">
        <div class="settings-item">
          <el-switch v-model="settings.recursivePricing" size="small" />
          <span class="settings-text">遞迴查價</span>
          <el-input-number
            v-if="settings.recursivePricing"
            v-model="settings.maxRecursionDepth"
            :min="1" :max="10" size="small"
            aria-label="遞迴查價最大深度"
            class="recursion-depth"
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
  <template v-else>
    <div class="m-settings">
      <div class="m-mode-row">
        <ModeChip :model-value="batch.calcMode" @change="batch.setCalcMode" />
        <p class="m-mode-hint">
          {{ batch.calcMode === 'macro' ? '會計算巨集與 HQ 需求' : '直接列出採購清單，不跑巨集' }}
        </p>
      </div>

      <div class="m-cell">
        <span class="m-cell-icon" aria-hidden="true">🔄</span>
        <div class="m-cell-body">
          <div class="m-cell-title">遞迴查價</div>
          <div class="m-cell-sub">把素材的素材也納入採購</div>
        </div>
        <el-switch v-model="settings.recursivePricing" size="default" />
      </div>

      <div class="m-cell">
        <span class="m-cell-icon" aria-hidden="true">🌐</span>
        <div class="m-cell-body">
          <div class="m-cell-title">跨服採購</div>
          <div class="m-cell-sub">{{ settings.dataCenter ? `${settings.dataCenter} 全跨服比價` : '跨資料中心比價，找最便宜的伺服器' }}</div>
        </div>
        <el-switch v-model="settings.crossServer" size="default" />
      </div>

      <div class="m-cell m-cell--last">
        <span class="m-cell-icon" aria-hidden="true">⚠️</span>
        <div class="m-cell-body">
          <div class="m-cell-title">例外策略</div>
          <div class="m-cell-sub">等級不足/無法雙滿時</div>
        </div>
        <el-segmented
          v-model="settings.exceptionStrategy"
          :options="[
            { label: '跳過', value: 'skip' },
            { label: '購買', value: 'buy' },
          ]"
          size="small"
        />
      </div>

      <button
        type="button"
        class="m-adv-row"
        :aria-expanded="advancedOpen"
        @click="advancedOpen = !advancedOpen"
      >
        <span class="m-adv-summary">
          進階設定
          <span class="m-adv-dot">·</span>
          遞迴 <b>{{ settings.maxRecursionDepth }}</b> 次
          <span class="m-adv-dot">·</span>
          食藥 <span :class="{ muted: buffSummary.muted }">{{ buffSummary.text }}</span>
        </span>
        <span class="m-adv-chev" :class="{ 'is-open': advancedOpen }" aria-hidden="true">▾</span>
      </button>

      <div v-if="advancedOpen" class="m-adv-body">
        <!-- Task 4 會填入 form-rows -->
      </div>
    </div>
  </template>
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

.recursion-depth {
  width: 120px;
}

@media (max-width: 640px) {
  .buff-select {
    width: 100%;
  }
  .recursion-depth {
    width: 100%;
    max-width: 120px;
  }
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


@media (max-width: 768px) {
  .settings-row :deep(.el-divider--vertical) {
    display: none;
  }

  .settings-row {
    gap: var(--space-md);
  }
}

/* === Mobile (≤640px) === */
.m-settings {
  display: flex;
  flex-direction: column;
}

.m-mode-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 4px 0 14px;
}

.m-mode-hint {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-muted);
}

.m-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 0;
  border-bottom: 1px solid var(--app-border);
}

.m-cell--last {
  border-bottom: none;
}

.m-cell-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}

.m-cell-body {
  flex: 1;
  min-width: 0;
}

.m-cell-title {
  font-size: 13.5px;
  color: var(--app-text);
}

.m-cell-sub {
  font-size: 11px;
  color: var(--app-text-muted);
  margin-top: 2px;
}

.m-adv-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 2px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.m-adv-summary {
  font-size: 13px;
  color: var(--app-text-muted);
}

.m-adv-summary b {
  color: var(--app-text);
  font-weight: 600;
}

.m-adv-summary .muted {
  color: var(--app-text-muted);
  opacity: 0.7;
}

.m-adv-dot {
  color: var(--app-text-muted);
  opacity: 0.5;
  margin: 0 5px;
}

.m-adv-chev {
  color: var(--app-text-muted);
  font-size: 12px;
  transition: transform 0.18s var(--ease-out-quart, ease-out);
}

.m-adv-chev.is-open {
  transform: rotate(180deg);
  color: var(--app-craft);
}

.m-adv-body {
  padding: 8px 2px 16px;
  border-bottom: 1px solid var(--app-border);
}
</style>

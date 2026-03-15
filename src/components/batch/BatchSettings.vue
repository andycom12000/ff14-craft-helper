<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
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
          controls-position="right"
          style="width: 70px;"
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
</style>

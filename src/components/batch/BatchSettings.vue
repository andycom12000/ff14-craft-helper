<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
</script>

<template>
  <el-card shadow="never">
    <template #header>計算設定</template>
    <div class="settings-grid">
      <div class="settings-item">
        <el-switch v-model="settings.recursivePricing" active-text="遞迴查價（半成品）" />
        <div v-if="settings.recursivePricing" class="settings-sub">
          <el-text size="small" type="info">最大遞迴深度：</el-text>
          <el-input-number v-model="settings.maxRecursionDepth" :min="1" :max="10" size="small" style="width:80px;" />
        </div>
      </div>
      <div class="settings-item">
        <el-switch v-model="settings.crossServer" active-text="跨服採購" />
        <div v-if="settings.crossServer" class="settings-sub">
          <el-text size="small" type="info">查詢 {{ settings.dataCenter }} 全伺服器最低價</el-text>
        </div>
      </div>
      <div class="settings-item">
        <el-text size="small" style="display: block; margin-bottom: 6px;">例外處理策略</el-text>
        <el-radio-group v-model="settings.exceptionStrategy" size="small">
          <el-radio-button value="skip">跳過</el-radio-button>
          <el-radio-button value="buy">套用購買價</el-radio-button>
        </el-radio-group>
        <div style="margin-top: 4px;">
          <el-text size="small" type="info">等級不足或無法雙滿時的處理方式</el-text>
        </div>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.settings-item {
  min-width: 0;
}

.settings-sub {
  margin-top: 8px;
  padding-left: 50px;
}

@media (max-width: 768px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }

  .settings-sub {
    padding-left: 0;
    margin-top: 6px;
  }
}
</style>

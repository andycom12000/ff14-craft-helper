<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
</script>

<template>
  <el-card shadow="never" class="settings-card">
    <template #header>
      <span class="card-title">計算設定</span>
    </template>
    <div class="settings-grid">
      <div class="settings-item">
        <el-switch v-model="settings.recursivePricing" active-text="遞迴查價（半成品）" />
        <transition name="el-fade-in">
          <div v-if="settings.recursivePricing" class="settings-sub">
            <el-text size="small" type="info">最大遞迴深度：</el-text>
            <el-input-number
              v-model="settings.maxRecursionDepth"
              :min="1" :max="10" size="small"
              style="width: 90px;"
            />
          </div>
        </transition>
      </div>
      <div class="settings-item">
        <el-switch v-model="settings.crossServer" active-text="跨服採購" />
        <transition name="el-fade-in">
          <div v-if="settings.crossServer" class="settings-sub">
            <el-text size="small" type="info">查詢 {{ settings.dataCenter }} 全伺服器最低價</el-text>
          </div>
        </transition>
      </div>
      <div class="settings-item">
        <div class="settings-label">例外處理策略</div>
        <el-radio-group v-model="settings.exceptionStrategy" size="small">
          <el-radio-button value="skip">跳過</el-radio-button>
          <el-radio-button value="buy">套用購買價</el-radio-button>
        </el-radio-group>
        <el-text size="small" type="info" class="settings-hint">
          等級不足或無法雙滿時的處理方式
        </el-text>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.settings-card {
  margin-top: 16px;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 24px;
}

.settings-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-sub {
  padding-left: 50px;
  padding-top: 4px;
}

.settings-label {
  font-size: 13px;
  color: var(--el-text-color-regular);
  margin-bottom: 4px;
}

.settings-hint {
  display: block;
  margin-top: 4px;
}

@media (max-width: 768px) {
  .settings-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .settings-sub {
    padding-left: 0;
  }
}
</style>

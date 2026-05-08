<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import { useIsMobile } from '@/composables/useMediaQuery'

const settings = useSettingsStore()
const isMobile = useIsMobile()
</script>

<template>
  <template v-if="!isMobile">
    <el-card shadow="never" class="bom-settings-card">
      <template #header>
        <span class="card-title">查價設定</span>
      </template>

      <div class="bom-settings__row">
        <div class="bom-settings__cell">
          <el-switch v-model="settings.crossServer" size="small" />
          <span class="bom-settings__label">跨服採購</span>
        </div>
        <span v-if="settings.crossServer" class="bom-settings__hint">
          {{ settings.dataCenter || '所有伺服器' }} 同 DC 比價
        </span>
      </div>

      <div class="bom-settings__row">
        <div class="bom-settings__cell">
          <el-switch v-model="settings.recursivePricing" size="small" />
          <span class="bom-settings__label">遞迴查價</span>
          <el-input-number
            v-if="settings.recursivePricing"
            v-model="settings.maxRecursionDepth"
            :min="1"
            :max="10"
            size="small"
            controls-position="right"
            class="bom-settings__depth"
            aria-label="遞迴查價最大深度"
          />
        </div>
        <span class="bom-settings__hint">把材料的材料也納入比價</span>
      </div>

      <div class="bom-settings__row">
        <div class="bom-settings__cell">
          <span class="bom-settings__label">原料準備</span>
          <el-radio-group v-model="settings.rawMaterialDefault" size="small">
            <el-radio-button value="buy">購買</el-radio-button>
            <el-radio-button value="gather">自採</el-radio-button>
          </el-radio-group>
        </div>
        <span class="bom-settings__hint">
          {{ settings.rawMaterialDefault === 'gather'
            ? '可採集的原料預設標為自採（免費）'
            : '原料預設走市場價'
          }}
        </span>
      </div>

      <div class="bom-settings__row">
        <div class="bom-settings__cell">
          <span class="bom-settings__label">遇到例外</span>
          <el-radio-group v-model="settings.exceptionStrategy" size="small">
            <el-radio-button value="skip">跳過</el-radio-button>
            <el-radio-button value="buy">直接買</el-radio-button>
          </el-radio-group>
        </div>
        <span class="bom-settings__hint">等級不足或無法雙滿時</span>
      </div>
    </el-card>
  </template>

  <template v-else>
    <div class="m-bom-settings">
      <div class="m-cell">
        <span class="m-cell-icon" aria-hidden="true">⌖</span>
        <div class="m-cell-body">
          <div class="m-cell-title">跨服採購</div>
          <div class="m-cell-sub">
            {{ settings.crossServer ? `${settings.dataCenter || '同 DC'} 比價` : '只看當前伺服器' }}
          </div>
        </div>
        <el-switch v-model="settings.crossServer" size="default" />
      </div>

      <div class="m-cell">
        <span class="m-cell-icon" aria-hidden="true">⟳</span>
        <div class="m-cell-body">
          <div class="m-cell-title">遞迴查價</div>
          <div class="m-cell-sub">把材料的材料也納入比價</div>
        </div>
        <el-switch v-model="settings.recursivePricing" size="default" />
      </div>

      <div v-if="settings.recursivePricing" class="m-cell">
        <span class="m-cell-icon" aria-hidden="true">⇅</span>
        <div class="m-cell-body">
          <div class="m-cell-title">遞迴深度</div>
          <div class="m-cell-sub">最多展開幾層</div>
        </div>
        <el-input-number
          v-model="settings.maxRecursionDepth"
          :min="1"
          :max="10"
          size="small"
          aria-label="遞迴查價最大深度"
        />
      </div>

      <div class="m-cell">
        <span class="m-cell-icon" aria-hidden="true">⛏</span>
        <div class="m-cell-body">
          <div class="m-cell-title">原料準備</div>
          <div class="m-cell-sub">
            {{ settings.rawMaterialDefault === 'gather'
              ? '可採集原料預設自採'
              : '原料預設走市場價'
            }}
          </div>
        </div>
        <el-segmented
          v-model="settings.rawMaterialDefault"
          :options="[
            { label: '購買', value: 'buy' },
            { label: '自採', value: 'gather' },
          ]"
          size="small"
        />
      </div>

      <div class="m-cell m-cell--last">
        <span class="m-cell-icon" aria-hidden="true">△</span>
        <div class="m-cell-body">
          <div class="m-cell-title">遇到例外</div>
          <div class="m-cell-sub">等級不足或無法雙滿時</div>
        </div>
        <el-segmented
          v-model="settings.exceptionStrategy"
          :options="[
            { label: '跳過', value: 'skip' },
            { label: '直接買', value: 'buy' },
          ]"
          size="small"
        />
      </div>
    </div>
  </template>
</template>

<style scoped>
/* Card chrome inherits el-card defaults; matches BatchSettings (.settings-card)
 * which doesn't override either header or body padding. `.card-title` falls
 * back to the global rule in App.vue (15px / 600). */
.bom-settings-card {
  margin-top: 0;
}

.bom-settings-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bom-settings__row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0;
}

.bom-settings__row + .bom-settings__row {
  border-top: 1px dashed var(--app-border);
}

.bom-settings__cell {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bom-settings__label {
  font-size: 13px;
  color: var(--app-text);
}

.bom-settings__hint {
  font-size: 11.5px;
  color: var(--app-text-muted);
  padding-left: 2px;
}

.bom-settings__depth {
  width: 96px;
  margin-left: 4px;
}

/* Mobile */
.m-bom-settings {
  display: flex;
  flex-direction: column;
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
  font-size: 11.5px;
  color: var(--app-text-muted);
  margin-top: 2px;
}
</style>

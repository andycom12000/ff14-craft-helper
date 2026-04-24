<script setup lang="ts">
import { useBomStore } from '@/stores/bom'
import { ElMessage } from 'element-plus'
import { Search, Delete } from '@element-plus/icons-vue'
import AppEmptyState from '@/components/common/AppEmptyState.vue'
import ItemName from '@/components/common/ItemName.vue'

const bomStore = useBomStore()

const emit = defineEmits<{
  calculate: []
  'open-search': []
}>()

function handleQuantityChange(recipeId: number, val: number | undefined) {
  bomStore.updateTargetQuantity(recipeId, val ?? 1)
}

function handleClearAll() {
  bomStore.clearTargets()
  ElMessage.info('已清除所有目標')
}
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <span class="card-title">製作目標</span>
        <div class="card-actions">
          <el-button type="primary" size="small" :icon="Search" @click="emit('open-search')">
            搜尋配方
          </el-button>
          <el-popconfirm
            title="確定要清除所有目標嗎？"
            confirm-button-text="確定"
            cancel-button-text="取消"
            @confirm="handleClearAll"
          >
            <template #reference>
              <el-button size="small" :disabled="bomStore.targets.length === 0">
                清除全部
              </el-button>
            </template>
          </el-popconfirm>
        </div>
      </div>
    </template>

    <AppEmptyState
      v-if="bomStore.targets.length === 0"
      icon="📜"
      title="建立你的購物清單"
      description="加入想製作的道具，自動計算所需素材和市場價格"
    >
      <el-button type="primary" :icon="Search" @click="emit('open-search')">搜尋配方</el-button>
    </AppEmptyState>

    <el-table v-else :data="bomStore.targets" border style="width: 100%" class="targets-table">
      <el-table-column label="圖示" width="60" align="center">
        <template #default="{ row }">
          <img :src="row.icon" :alt="row.name" crossorigin="anonymous" loading="lazy" decoding="async" style="width: 28px; height: 28px" />
        </template>
      </el-table-column>
      <el-table-column label="品項名稱">
        <template #default="{ row }">
          <ItemName :item-id="row.itemId" :fallback="row.name" />
        </template>
      </el-table-column>
      <el-table-column label="數量" width="140" align="center">
        <template #default="{ row }">
          <el-input-number
            :model-value="row.quantity"
            :min="1"
            :max="999"
            size="small"
            @change="(val: number | undefined) => handleQuantityChange(row.recipeId, val)"
          />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ row }">
          <el-button
            type="danger"
            size="small"
            text
            @click="bomStore.removeTarget(row.recipeId)"
          >
            移除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Mobile: compact single-line rows -->
    <ul v-if="bomStore.targets.length > 0" class="targets-mobile-list">
      <li v-for="row in bomStore.targets" :key="row.recipeId" class="target-row">
        <img :src="row.icon" :alt="row.name" crossorigin="anonymous" loading="lazy" decoding="async" class="target-row__icon" />
        <span class="target-row__name">
          <ItemName :item-id="row.itemId" :fallback="row.name" />
        </span>
        <el-input-number
          :model-value="row.quantity"
          :min="1"
          :max="999"
          size="small"
          aria-label="數量"
          class="target-row__qty"
          @change="(val: number | undefined) => handleQuantityChange(row.recipeId, val)"
        />
        <button
          type="button"
          class="target-row__remove"
          :aria-label="`移除 ${row.name}`"
          @click="bomStore.removeTarget(row.recipeId)"
        >
          <el-icon><Delete /></el-icon>
        </button>
      </li>
    </ul>

    <div v-if="bomStore.targets.length > 0" class="calculate-row">
      <el-button type="success" @click="emit('calculate')">
        計算材料需求
      </el-button>
    </div>
  </el-card>
</template>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.calculate-row {
  margin-top: 16px;
  text-align: center;
}

.targets-mobile-list {
  display: none;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.target-row {
  display: grid;
  grid-template-columns: 32px 1fr auto 44px;
  align-items: center;
  column-gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  min-height: var(--touch-target-min, 44px);
}

.target-row:last-child {
  border-bottom: none;
}

.target-row__icon {
  width: 28px;
  height: 28px;
  border-radius: 3px;
  flex-shrink: 0;
}

.target-row__name {
  font-size: 14.5px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.target-row__qty {
  width: 108px;
  flex-shrink: 0;
}

.target-row__qty :deep(.el-input-number__decrease),
.target-row__qty :deep(.el-input-number__increase) {
  background: transparent;
  border-color: transparent;
  color: var(--el-text-color-placeholder);
  transition: color 0.15s, background-color 0.15s;
}

.target-row__qty :deep(.el-input-number__decrease:hover:not(.is-disabled)),
.target-row__qty :deep(.el-input-number__increase:hover:not(.is-disabled)) {
  background: var(--el-fill-color-light);
  color: var(--page-accent, var(--el-color-primary));
}

.target-row__qty :deep(.el-input-number__decrease.is-disabled),
.target-row__qty :deep(.el-input-number__increase.is-disabled) {
  color: var(--el-text-color-disabled);
}

.target-row__qty :deep(.el-input__wrapper) {
  box-shadow: none;
  background: transparent;
  padding: 0;
}

.target-row__qty :deep(.el-input__inner) {
  font-weight: 600;
  font-size: 15px;
  color: var(--el-text-color-primary);
}

.target-row__remove {
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  color: var(--el-text-color-placeholder);
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: background-color 0.15s, color 0.15s;
}

.target-row__remove:hover {
  background: color-mix(in srgb, var(--el-color-danger) 12%, transparent);
  color: var(--el-color-danger);
}

.target-row__remove:focus-visible {
  outline: 2px solid var(--page-accent, var(--accent-gold));
  outline-offset: 2px;
  color: var(--el-color-danger);
}

/* Default: table visible, mobile list hidden */
.targets-table {
  display: table;
  /* Fixed layout so the flex column actually shrinks to fit container —
   * auto layout was letting the name column demand an 800px+ natural width
   * and forcing a horizontal scroll inside the card at 1200–1400px widths. */
  table-layout: fixed;
}
.targets-mobile-list {
  display: none;
}

@media (max-width: 640px) {
  .targets-table {
    display: none;
  }
  .targets-mobile-list {
    display: flex;
    border-top: 1px solid var(--el-border-color-lighter);
  }

  .el-card {
    background: transparent;
    border: none;
    box-shadow: none;
    border-radius: 0;
  }
  :deep(.el-card__header) {
    padding: 0 0 10px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    margin-bottom: 0;
  }
  :deep(.el-card__body) {
    padding: 0;
  }

  .card-header {
    gap: 6px;
  }

  .card-actions {
    gap: 6px;
  }

  .calculate-row {
    margin-top: 14px;
  }
}
</style>

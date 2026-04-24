<script setup lang="ts">
import { useBomStore } from '@/stores/bom'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
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

    <!-- Mobile: stack rows as cards -->
    <ul v-if="bomStore.targets.length > 0" class="targets-mobile-list">
      <li v-for="row in bomStore.targets" :key="row.recipeId" class="target-card">
        <div class="target-card-head">
          <img :src="row.icon" :alt="row.name" crossorigin="anonymous" loading="lazy" decoding="async" class="target-card-icon" />
          <div class="target-card-name">
            <ItemName :item-id="row.itemId" :fallback="row.name" />
          </div>
        </div>
        <div class="target-card-actions">
          <el-input-number
            :model-value="row.quantity"
            :min="1"
            :max="999"
            size="small"
            aria-label="數量"
            @change="(val: number | undefined) => handleQuantityChange(row.recipeId, val)"
          />
          <el-button
            type="danger"
            size="small"
            text
            :aria-label="`移除 ${row.name}`"
            @click="bomStore.removeTarget(row.recipeId)"
          >
            移除
          </el-button>
        </div>
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

.target-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
}

.target-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.target-card-icon {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.target-card-name {
  font-size: 14px;
  font-weight: 500;
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.target-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* Default: table visible, mobile list hidden */
.targets-table {
  display: table;
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
  }
}
</style>

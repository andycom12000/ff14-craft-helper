<script setup lang="ts">
import { useBomStore } from '@/stores/bom'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import AppEmptyState from '@/components/common/AppEmptyState.vue'

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
      title="建立你的材料清單"
      description="加入想製作的道具，自動計算所需素材和市場價格"
    >
      <el-button type="primary" :icon="Search" @click="emit('open-search')">搜尋配方</el-button>
    </AppEmptyState>

    <el-table v-else :data="bomStore.targets" border style="width: 100%">
      <el-table-column label="圖示" width="60" align="center">
        <template #default="{ row }">
          <img :src="row.icon" :alt="row.name" crossorigin="anonymous" style="width: 28px; height: 28px" />
        </template>
      </el-table-column>
      <el-table-column prop="name" label="品項名稱" />
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
}

.card-actions {
  display: flex;
  gap: 8px;
}

.calculate-row {
  margin-top: 16px;
  text-align: center;
}
</style>

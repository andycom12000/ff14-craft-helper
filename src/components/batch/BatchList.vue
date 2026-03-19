<script setup lang="ts">
import { ref } from 'vue'
import { useBatchStore } from '@/stores/batch'
import { Search } from '@element-plus/icons-vue'
import BatchRecipeCard from './BatchRecipeCard.vue'
import OcrImportDialog from './OcrImportDialog.vue'

const batchStore = useBatchStore()
const showOcrDialog = ref(false)

const emit = defineEmits<{ 'open-search': [] }>()
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="card-title">製作清單</span>
        <div style="display: flex; align-items: center; gap: 12px;">
          <el-button type="primary" text size="small" :icon="Search" @click="emit('open-search')">
            搜尋配方
          </el-button>
          <el-button type="primary" text size="small" @click="showOcrDialog = true">
            從截圖匯入
          </el-button>
          <el-text type="info" size="small">{{ batchStore.targets.length }} 個配方</el-text>
          <el-popconfirm
            v-if="batchStore.targets.length > 0 || batchStore.results"
            title="確定要清除所有配方與計算結果嗎？"
            confirm-button-text="確定"
            cancel-button-text="取消"
            @confirm="batchStore.resetAll()"
          >
            <template #reference>
              <el-button type="danger" text size="small">
                全部清除
              </el-button>
            </template>
          </el-popconfirm>
        </div>
      </div>
    </template>

    <div v-if="batchStore.targets.length > 0" class="recipe-card-list">
      <BatchRecipeCard
        v-for="target in batchStore.targets"
        :key="target.recipe.id"
        :target="target"
        @update:quantity="(id, qty) => batchStore.updateQuantity(id, qty)"
        @remove="(id) => batchStore.removeTarget(id)"
      />
    </div>

    <el-empty v-else description="尚未加入任何配方">
      <div class="empty-actions">
        <el-button type="primary" :icon="Search" @click="emit('open-search')">搜尋配方</el-button>
        <el-button @click="showOcrDialog = true">從截圖匯入</el-button>
      </div>
    </el-empty>

    <OcrImportDialog v-model="showOcrDialog" />
  </el-card>
</template>

<style scoped>
.recipe-card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-actions {
  display: flex;
  gap: 12px;
}
</style>

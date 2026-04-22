<script setup lang="ts">
import type { Recipe } from '@/stores/recipe'
import { starsDisplay } from '@/utils/format'
import ItemName from '@/components/common/ItemName.vue'

defineProps<{
  recipe: Recipe | null
}>()

const emit = defineEmits<{
  'use-in-simulator': []
  'add-to-bom': []
  'add-to-batch': []
}>()
</script>

<template>
  <div class="recipe-detail">
    <el-empty v-if="!recipe" description="請從左側搜尋並選擇一個配方" />

    <template v-else>
      <div class="recipe-header">
        <img :src="recipe.icon" :alt="recipe.name" crossorigin="anonymous" class="recipe-icon" />
        <div class="recipe-title">
          <h3><ItemName :item-id="recipe.itemId" :fallback="recipe.name" /></h3>
          <el-tag size="small" type="info">{{ recipe.job }}</el-tag>
          <el-tag size="small" style="margin-left: 6px">
            Lv.{{ recipe.level }}
            <span v-if="recipe.stars" class="stars">{{ starsDisplay(recipe.stars) }}</span>
          </el-tag>
          <el-tag v-if="recipe.canHq" size="small" type="success" style="margin-left: 6px">
            HQ
          </el-tag>
        </div>
      </div>

      <el-descriptions :column="2" border style="margin-top: 16px">
        <el-descriptions-item label="作業精度需求">
          {{ recipe.recipeLevelTable.suggestedCraftsmanship }}
        </el-descriptions-item>
        <el-descriptions-item label="難度">
          {{ recipe.recipeLevelTable.difficulty }}
        </el-descriptions-item>
        <el-descriptions-item label="品質上限">
          {{ recipe.recipeLevelTable.quality }}
        </el-descriptions-item>
        <el-descriptions-item label="耐久">
          {{ recipe.recipeLevelTable.durability }}
        </el-descriptions-item>
        <el-descriptions-item label="品質因子">
          {{ recipe.materialQualityFactor }}
        </el-descriptions-item>
      </el-descriptions>

      <h4 style="margin-top: 20px; margin-bottom: 8px">素材列表</h4>
      <el-table :data="recipe.ingredients" border style="width: 100%">
        <el-table-column label="圖示" width="60" align="center">
          <template #default="{ row }">
            <img :src="row.icon" :alt="row.name" crossorigin="anonymous" style="width: 28px; height: 28px" />
          </template>
        </el-table-column>
        <el-table-column label="名稱">
          <template #default="{ row }">
            <ItemName :item-id="row.itemId" :fallback="row.name" />
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="數量" width="80" align="center" />
      </el-table>

      <div class="recipe-actions">
        <el-button type="primary" @click="emit('use-in-simulator')">
          在模擬器中使用
        </el-button>
        <el-button @click="emit('add-to-bom')">
          加入材料清單
        </el-button>
        <el-button type="warning" @click="emit('add-to-batch')">
          加入批量
        </el-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.recipe-detail {
  height: 100%;
}

.recipe-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.recipe-icon {
  width: 48px;
  height: 48px;
}

.recipe-title h3 {
  margin: 0 0 6px 0;
}

.stars {
  color: #e6a23c;
  margin-left: 4px;
}

.recipe-actions {
  margin-top: 20px;
  display: flex;
  gap: 12px;
}
</style>

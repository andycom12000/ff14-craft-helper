<script setup lang="ts">
import { useBatchStore } from '@/stores/batch'
import { getJobName } from '@/utils/jobs'
import { starsDisplay } from '@/utils/format'

const batchStore = useBatchStore()
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>製作清單</span>
        <el-text type="info" size="small">{{ batchStore.targets.length }} 個配方</el-text>
      </div>
    </template>

    <el-table :data="batchStore.targets" v-if="batchStore.targets.length > 0">
      <el-table-column label="" width="50">
        <template #default="{ row }">
          <img v-if="row.recipe.icon" :src="row.recipe.icon" style="width:24px;height:24px;border-radius:4px;" />
        </template>
      </el-table-column>
      <el-table-column label="配方名稱" prop="recipe.name" />
      <el-table-column label="數量" width="100">
        <template #default="{ row }">
          <el-input-number
            :model-value="row.quantity"
            @update:model-value="(v: number) => batchStore.updateQuantity(row.recipe.id, v)"
            :min="1"
            :max="99"
            size="small"
            controls-position="right"
          />
        </template>
      </el-table-column>
      <el-table-column label="職業" width="100">
        <template #default="{ row }">
          <el-tag size="small" type="primary">{{ getJobName(row.recipe.job) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="等級" width="120">
        <template #default="{ row }">
          Lv.{{ row.recipe.recipeLevelTable.classJobLevel }} {{ starsDisplay(row.recipe.stars) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80">
        <template #default="{ row }">
          <el-button type="danger" text size="small" @click="batchStore.removeTarget(row.recipe.id)">
            移除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-else description="尚未加入任何配方，請至「配方搜尋」頁面新增" />
  </el-card>
</template>

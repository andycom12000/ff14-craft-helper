<script setup lang="ts">
import type { BatchTarget } from '@/stores/batch'
import { getJobName } from '@/utils/jobs'
import { starsDisplay } from '@/utils/format'
import { Delete } from '@element-plus/icons-vue'

defineProps<{ target: BatchTarget }>()
const emit = defineEmits<{
  'update:quantity': [id: number, qty: number]
  remove: [id: number]
}>()
</script>

<template>
  <div class="recipe-card">
    <img
      v-if="target.recipe.icon"
      :src="target.recipe.icon"
      :alt="target.recipe.name"
      class="recipe-card-icon"
    />
    <div class="recipe-card-icon recipe-card-icon--empty" v-else />
    <div class="recipe-card-info">
      <div class="recipe-card-name">{{ target.recipe.name }}</div>
      <div class="recipe-card-meta">
        Lv.{{ target.recipe.recipeLevelTable.classJobLevel }}
        {{ starsDisplay(target.recipe.stars) }}
        <el-tag size="small" type="primary">{{ getJobName(target.recipe.job) }}</el-tag>
      </div>
    </div>
    <div class="recipe-card-controls">
      <el-input-number
        :model-value="target.quantity"
        @update:model-value="(v: number) => emit('update:quantity', target.recipe.id, v)"
        :min="1"
        :max="99"
        size="small"
        controls-position="right"
      />
      <el-button
        :icon="Delete"
        size="small"
        type="danger"
        text
        @click="emit('remove', target.recipe.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.recipe-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--el-fill-color-darker);
  transition: background-color 0.15s;
}

.recipe-card:hover {
  background: var(--el-fill-color-light);
}

.recipe-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  flex-shrink: 0;
}

.recipe-card-icon--empty {
  background: var(--el-fill-color-light);
}

.recipe-card-info {
  flex: 1;
  min-width: 0;
}

.recipe-card-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recipe-card-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.recipe-card-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
</style>

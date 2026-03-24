<script setup lang="ts">
import { ref } from 'vue'
import { useBatchStore } from '@/stores/batch'
import { Search } from '@element-plus/icons-vue'
import BatchRecipeCard from './BatchRecipeCard.vue'
import OcrImportDialog from './OcrImportDialog.vue'

const batchStore = useBatchStore()
const showOcrDialog = ref(false)

const emit = defineEmits<{ 'open-search': [] }>()

const dragIndex = ref<number | null>(null)
const dropTargetIndex = ref<number | null>(null)

function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(index: number, event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dropTargetIndex.value = index
}

function onDragLeave() {
  dropTargetIndex.value = null
}

function onDrop(index: number, event: DragEvent) {
  event.preventDefault()
  if (dragIndex.value !== null && dragIndex.value !== index) {
    batchStore.reorderTargets(dragIndex.value, index)
  }
  dragIndex.value = null
  dropTargetIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  dropTargetIndex.value = null
}
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
      <div
        v-for="(target, index) in batchStore.targets"
        :key="target.recipe.id"
        class="recipe-card-wrapper"
        :class="{
          'recipe-card-wrapper--dragging': dragIndex === index,
          'recipe-card-wrapper--drop-target': dropTargetIndex === index && dragIndex !== index,
        }"
        draggable="true"
        @dragstart="onDragStart(index, $event)"
        @dragover="onDragOver(index, $event)"
        @dragleave="onDragLeave"
        @drop="onDrop(index, $event)"
        @dragend="onDragEnd"
      >
        <span class="drag-handle" title="拖曳排序">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
        </span>
        <BatchRecipeCard
          :target="target"
          @update:quantity="(id, qty) => batchStore.updateQuantity(id, qty)"
          @remove="(id) => batchStore.removeTarget(id)"
        />
      </div>
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

.recipe-card-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.recipe-card-wrapper :deep(.recipe-card) {
  flex: 1;
  min-width: 0;
}

.recipe-card-wrapper--dragging {
  opacity: 0.4;
}

.recipe-card-wrapper--drop-target {
  border-top: 2px solid var(--app-accent, #7C3AED);
  padding-top: 6px;
}

.drag-handle {
  cursor: grab;
  color: var(--el-text-color-placeholder);
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 4px;
}

.drag-handle:active {
  cursor: grabbing;
}

.recipe-card-wrapper:hover .drag-handle {
  opacity: 1;
}

.empty-actions {
  display: flex;
  gap: 12px;
}
</style>

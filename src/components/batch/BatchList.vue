<script setup lang="ts">
import { ref } from 'vue'
import { useBatchStore } from '@/stores/batch'
import { Search } from '@element-plus/icons-vue'
import BatchRecipeCard from './BatchRecipeCard.vue'
import OcrImportDialog from './OcrImportDialog.vue'
import AppEmptyState from '@/components/common/AppEmptyState.vue'

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
  <section class="batch-list">
    <header class="batch-list-header">
      <span class="card-title">購物清單</span>
      <div class="batch-list-actions">
        <el-button type="primary" text size="small" :icon="Search" @click="emit('open-search')">
          搜尋配方
        </el-button>
        <el-button type="primary" text size="small" @click="showOcrDialog = true">
          從截圖匯入
        </el-button>
        <el-text type="info" size="small" class="batch-list-count">{{ batchStore.targets.length }} 個配方</el-text>
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
    </header>

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

    <AppEmptyState
      v-else
      icon="📋"
      title="開始規劃批量製作"
      description="加入想製作的配方，一次算出最佳採購方案和製作順序"
    >
      <el-button type="primary" :icon="Search" @click="emit('open-search')">搜尋配方</el-button>
      <el-button @click="showOcrDialog = true">從截圖匯入</el-button>
    </AppEmptyState>

    <OcrImportDialog v-model="showOcrDialog" />
  </section>
</template>

<style scoped>
.batch-list {
  /* No outer chrome — recipe cards inside carry their own boundary */
}

.batch-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  padding: 0 4px;
}

.batch-list-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .batch-list-header {
    gap: 8px;
  }

  .batch-list-actions {
    gap: 8px;
    width: 100%;
  }

  .batch-list-count {
    margin-left: auto;
  }
}

.recipe-card-list {
  /* Column-first ordering — fills col 1 top-down (1,2,3,4) then col 2
   * (5,6,7,8). No max-width: columns split the parent's full width
   * (prepare-main on wide layouts, batch-view otherwise). */
  column-count: 1;
  column-gap: 8px;
}

@media (min-width: 900px) {
  .recipe-card-list {
    column-count: 2;
  }
}

.recipe-card-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
  break-inside: avoid;
}

.recipe-card-wrapper :deep(.recipe-card) {
  flex: 1;
  min-width: 0;
}

.recipe-card-wrapper--dragging {
  opacity: 0.4;
}

.recipe-card-wrapper--drop-target {
  border-top: 2px solid var(--app-accent, oklch(0.65 0.18 65));
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

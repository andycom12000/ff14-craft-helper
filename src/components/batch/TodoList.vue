<script setup lang="ts">
import { ref, computed } from 'vue'
import { formatMacros } from '@/services/macro-formatter'
import { getJobName } from '@/utils/jobs'
import { ElMessage } from 'element-plus'
import type { TodoItem } from '@/stores/batch'

const props = defineProps<{ items: TodoItem[] }>()
const emit = defineEmits<{ 'update:done': [index: number, done: boolean] }>()

const expandedMacro = ref<number | null>(null)

const doneCount = computed(() => props.items.filter(i => i.done).length)
const progressPercent = computed(() =>
  props.items.length === 0 ? 0 : Math.round((doneCount.value / props.items.length) * 100),
)

const macroCache = computed(() =>
  new Map(props.items.map((item, i) => [i, formatMacros(item.actions)])),
)

function toggleMacro(index: number) {
  expandedMacro.value = expandedMacro.value === index ? null : index
}

function getMacros(index: number): string[] {
  return macroCache.value.get(index) ?? []
}

async function copyMacro(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('巨集已複製')
  } catch {
    ElMessage.error('複製失敗')
  }
}

function toggleDone(index: number) {
  emit('update:done', index, !props.items[index].done)
}

function resetAll() {
  for (let i = 0; i < props.items.length; i++) {
    emit('update:done', i, false)
  }
}
</script>

<template>
  <div class="todo-list">
    <el-text size="small" type="info" tag="div" class="todo-desc">
      製作順序（依相依性排列，由底層半成品到頂層成品）
    </el-text>

    <div
      v-for="(item, index) in items"
      :key="index"
      class="todo-item"
      :class="{ 'todo-item--done': item.done }"
    >
      <div class="todo-row">
        <el-checkbox :model-value="item.done" @update:model-value="() => toggleDone(index)" />
        <span class="todo-num">{{ index + 1 }}</span>
        <div class="todo-info">
          <div class="todo-name">
            <img
              v-if="item.recipe.icon"
              :src="item.recipe.icon"
              :alt="item.recipe.name"
              class="todo-icon"
            />
            {{ item.recipe.name }}
          </div>
          <div class="todo-meta">
            x{{ item.quantity }} |
            <el-tag size="small" type="primary">{{ getJobName(item.recipe.job) }}</el-tag>
            <span v-if="item.isSemiFinished" class="todo-badge">半成品</span>
          </div>
        </div>
        <div class="todo-actions">
          <!-- Quick copy: single macro = one button, multiple = numbered buttons -->
          <template v-if="getMacros(index).length === 1">
            <el-button size="small" type="primary" @click="copyMacro(getMacros(index)[0])">
              複製巨集
            </el-button>
          </template>
          <template v-else-if="getMacros(index).length > 1">
            <el-button
              v-for="(_, mi) in getMacros(index)"
              :key="mi"
              size="small"
              type="primary"
              @click="copyMacro(getMacros(index)[mi])"
            >
              巨集{{ mi + 1 }}
            </el-button>
          </template>
          <el-button size="small" @click="toggleMacro(index)">
            {{ expandedMacro === index ? '收起' : '展開' }}
          </el-button>
        </div>
      </div>

      <!-- Macro expansion -->
      <div v-if="expandedMacro === index" class="macro-expand">
        <div v-for="(macro, mi) in getMacros(index)" :key="mi" class="macro-block">
          <div class="macro-header">
            <el-text size="small" tag="b">巨集 {{ mi + 1 }}</el-text>
            <el-button size="small" type="primary" @click="copyMacro(macro)">複製</el-button>
          </div>
          <pre class="code-block" @click="copyMacro(macro)">{{ macro }}</pre>
        </div>
      </div>
    </div>

    <div v-if="items.length > 0" class="todo-footer">
      <el-progress :percentage="progressPercent" :stroke-width="10" class="todo-progress" />
      <div class="todo-footer-row">
        <el-text size="small" type="info">
          進度：{{ doneCount }} / {{ items.length }} 完成
        </el-text>
        <el-button size="small" @click="resetAll">全部重設</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.todo-desc {
  margin-bottom: 12px;
}

.todo-item {
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  transition: background-color 0.15s;
}

.todo-item:last-of-type {
  border-bottom: none;
}

.todo-item:hover {
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.todo-item--done {
  opacity: 0.55;
}

.todo-item--done .todo-name {
  text-decoration: line-through;
}

.todo-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.todo-num {
  width: 20px;
  text-align: center;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.todo-info {
  flex: 1;
  min-width: 0;
}

.todo-name {
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

.todo-icon {
  width: 20px;
  height: 20px;
  border-radius: 2px;
  flex-shrink: 0;
}

.todo-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.todo-badge {
  color: var(--el-color-success);
  font-size: 11px;
}

.todo-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.macro-expand {
  margin-top: 8px;
  padding-left: 52px;
}

.macro-block {
  margin-bottom: 8px;
}

.macro-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}


.todo-footer {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.todo-progress {
  margin-bottom: 8px;
}

.todo-footer-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>

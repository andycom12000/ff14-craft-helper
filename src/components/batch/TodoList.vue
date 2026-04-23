<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { formatMacros } from '@/services/macro-formatter'
import { useLocaleStore } from '@/stores/locale'
import { getJobName } from '@/utils/jobs'
import { ElMessage } from 'element-plus'
import { DocumentCopy, ArrowRight } from '@element-plus/icons-vue'
import type { TodoItem } from '@/stores/batch'
import ItemName from '@/components/common/ItemName.vue'

const props = defineProps<{ items: TodoItem[] }>()
const emit = defineEmits<{
  'update:done': [index: number, done: boolean]
  'reorder': [fromIndex: number, toIndex: number]
}>()

const expandedMacro = ref<number | null>(null)
const showDoneItems = ref(false)
const dragIndex = ref<number | null>(null)
const dropTargetIndex = ref<number | null>(null)
const flashNameIndex = ref<number | null>(null)

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
    emit('reorder', dragIndex.value, index)
  }
  dragIndex.value = null
  dropTargetIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  dropTargetIndex.value = null
}

const doneCount = computed(() => props.items.filter(i => i.done).length)
const progressPercent = computed(() =>
  props.items.length === 0 ? 0 : Math.round((doneCount.value / props.items.length) * 100),
)

const pendingItems = computed(() =>
  props.items.map((item, index) => ({ item, index })).filter(({ item }) => !item.done),
)
const doneItems = computed(() =>
  props.items.map((item, index) => ({ item, index })).filter(({ item }) => item.done),
)

const localeStore = useLocaleStore()
const macroCache = computed(() => {
  // Track locale so macro text refreshes when the sidebar language switches.
  const locale = localeStore.current
  return new Map(props.items.map((item, i) => [i, formatMacros(item.actions, { locale })]))
})

function toggleMacro(index: number) {
  expandedMacro.value = expandedMacro.value === index ? null : index
}

function getMacros(index: number): string[] {
  return macroCache.value.get(index) ?? []
}

async function copyText(text: string, label = '巨集') {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`${label}已複製`)
  } catch {
    ElMessage.error('複製失敗')
  }
}

async function copyMacro(text: string) {
  copyText(text, '巨集')
}

async function copyRecipeName(name: string, index?: number) {
  copyText(name, `「${name}」`)
  if (index !== undefined) {
    flashNameIndex.value = index
    nextTick(() => {
      setTimeout(() => { flashNameIndex.value = null }, 300)
    })
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
  <div class="todo-list" style="container-type: inline-size;">
    <el-text size="small" type="info" tag="div" class="todo-desc">
      製作順序（依相依性排列，由底層半成品到頂層成品）
    </el-text>

    <!-- Completed items collapsed section -->
    <div v-if="doneItems.length > 0" class="done-collapse">
      <div class="done-collapse-header" @click="showDoneItems = !showDoneItems">
        <el-icon class="done-collapse-arrow" :class="{ 'is-expanded': showDoneItems }">
          <ArrowRight />
        </el-icon>
        <el-text size="small" type="success">
          已完成 {{ doneItems.length }} 項
        </el-text>
      </div>
      <div v-if="showDoneItems" class="todo-grid">
        <div
          v-for="{ item, index } in doneItems"
          :key="index"
          class="todo-item todo-item--done"
        >
          <div class="todo-row">
            <el-checkbox :model-value="item.done" @update:model-value="() => toggleDone(index)" />
            <span class="todo-num">{{ index + 1 }}</span>
            <div class="todo-info">
              <div class="todo-name" :class="{ 'name-flash': flashNameIndex === index }">
                <img
                  v-if="item.recipe.icon"
                  :src="item.recipe.icon"
                  :alt="item.recipe.name"
                  class="todo-icon"
                />
                <span
                  class="todo-name-text"
                  role="button"
                  tabindex="0"
                  :aria-label="`複製品名：${item.recipe.name}`"
                  @click.stop="copyRecipeName(item.recipe.name, index)"
                  @keydown.enter.stop.prevent="copyRecipeName(item.recipe.name, index)"
                  @keydown.space.stop.prevent="copyRecipeName(item.recipe.name, index)"
                ><ItemName :item-id="item.recipe.itemId" :fallback="item.recipe.name" /></span>
              </div>
              <div class="todo-meta">
                x{{ item.quantity }} |
                <el-tag size="small" type="primary">{{ getJobName(item.recipe.job) }}</el-tag>
                <span v-if="item.isSemiFinished" class="todo-badge">半成品</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pending items -->
    <div class="todo-grid">
    <div
      v-for="{ item, index } in pendingItems"
      :key="index"
      class="todo-item"
      :class="{
        'todo-item--dragging': dragIndex === index,
        'todo-item--drop-target': dropTargetIndex === index && dragIndex !== index,
      }"
      draggable="true"
      @dragstart="onDragStart(index, $event)"
      @dragover="onDragOver(index, $event)"
      @dragleave="onDragLeave"
      @drop="onDrop(index, $event)"
      @dragend="onDragEnd"
    >
      <div class="todo-row">
        <span class="todo-drag-handle" title="拖曳排序">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
        </span>
        <el-checkbox :model-value="item.done" @update:model-value="() => toggleDone(index)" />
        <span class="todo-num">{{ index + 1 }}</span>
        <div class="todo-info">
          <div class="todo-name" :class="{ 'name-flash': flashNameIndex === index }">
            <img
              v-if="item.recipe.icon"
              :src="item.recipe.icon"
              :alt="item.recipe.name"
              class="todo-icon"
            />
            <span
              class="todo-name-text"
              role="button"
              tabindex="0"
              :aria-label="`複製品名：${item.recipe.name}`"
              @click.stop="copyRecipeName(item.recipe.name, index)"
              @keydown.enter.stop.prevent="copyRecipeName(item.recipe.name, index)"
              @keydown.space.stop.prevent="copyRecipeName(item.recipe.name, index)"
            ><ItemName :item-id="item.recipe.itemId" :fallback="item.recipe.name" /></span>
            <el-button
              :icon="DocumentCopy"
              size="small"
              text
              class="copy-name-btn"
              :aria-label="`複製品名：${item.recipe.name}`"
              @click.stop="copyRecipeName(item.recipe.name, index)"
            />
          </div>
          <div class="todo-meta">
            x{{ item.quantity }} |
            <el-tag size="small" type="primary">{{ getJobName(item.recipe.job) }}</el-tag>
            <span v-if="item.isSemiFinished" class="todo-badge">半成品</span>
          </div>
          <div v-if="item.hqAmounts.some(a => a > 0)" class="todo-hq-hint">
            <el-tag size="small" type="warning">HQ</el-tag>
            <template v-for="(ing, ii) in item.recipe.ingredients" :key="ii">
              <span v-if="item.hqAmounts[ii] > 0" class="hq-ingredient">
                <ItemName :item-id="ing.itemId" :fallback="ing.name" /> x{{ item.hqAmounts[ii] }}
              </span>
            </template>
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

.todo-item--dragging {
  opacity: 0.4;
}

.todo-item--drop-target {
  border-top: 2px solid var(--app-accent, #7C3AED);
  padding-top: 10px;
}

.todo-drag-handle {
  cursor: grab;
  color: var(--el-text-color-placeholder);
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 2px;
}

.todo-drag-handle:active {
  cursor: grabbing;
}

.todo-item:hover .todo-drag-handle {
  opacity: 1;
}

.done-collapse {
  margin-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 8px;
}

.done-collapse-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 6px 4px;
  border-radius: 4px;
  user-select: none;
  transition: background-color 0.15s;
}

.done-collapse-header:hover {
  background: var(--el-fill-color-light);
}

.done-collapse-arrow {
  transition: transform 0.2s;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.done-collapse-arrow.is-expanded {
  transform: rotate(90deg);
}

.todo-item--done {
  opacity: 0.55;
}

.todo-item--done .todo-name-text {
  text-decoration: line-through;
}

.todo-item--done .todo-name-text:hover {
  text-decoration: line-through underline;
  text-decoration-style: dotted;
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
  border-radius: 4px;
  padding: 2px 4px;
  margin-left: -4px;
  transition: background-color 0.3s;
}

.todo-name-text {
  cursor: pointer;
  border-radius: 2px;
}

.todo-name-text:hover {
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 3px;
}

.todo-name-text:focus-visible {
  outline: 2px solid var(--app-accent, #7C3AED);
  outline-offset: 2px;
}

.todo-name.name-flash {
  background-color: var(--app-accent-glow);
}

.todo-icon {
  width: 20px;
  height: 20px;
  border-radius: 2px;
  flex-shrink: 0;
}

.copy-name-btn {
  opacity: 0;
  transition: opacity 0.15s;
  margin-left: 2px;
}

.todo-item:hover .copy-name-btn {
  opacity: 1;
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

.todo-hq-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-color-warning);
  margin-top: 2px;
}

.hq-ingredient + .hq-ingredient::before {
  content: '、';
  color: var(--el-text-color-secondary);
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

/* Wide screen: 2-column todo grid */
@container (min-width: 1000px) {
  .todo-grid {
    columns: 2;
    column-gap: 20px;
  }

  .todo-item {
    break-inside: avoid;
  }
}
</style>

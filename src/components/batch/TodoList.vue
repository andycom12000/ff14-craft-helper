<script setup lang="ts">
import { ref, computed } from 'vue'
import { formatMacros } from '@/services/macro-formatter'
import { getJobName } from '@/utils/jobs'
import { ElMessage } from 'element-plus'
import type { TodoItem } from '@/stores/batch'

const props = defineProps<{ items: TodoItem[] }>()
const emit = defineEmits<{ 'update:done': [index: number, done: boolean] }>()

const expandedMacro = ref<number | null>(null)

// Cache macros to avoid re-formatting on every render
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
  <div>
    <el-text size="small" type="info" tag="div" style="margin-bottom: 12px;">
      製作順序（依相依性排列，由底層半成品到頂層成品）
    </el-text>

    <div v-for="(item, index) in items" :key="index" style="border-bottom: 1px solid var(--el-border-color-lighter); padding: 12px 0;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <el-checkbox :model-value="item.done" @update:model-value="() => toggleDone(index)" />
        <el-text type="info" size="small" style="width: 24px; text-align: center;">{{ index + 1 }}</el-text>
        <div style="flex: 1;">
          <div :style="{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--el-text-color-placeholder)' : '' }">
            <img v-if="item.recipe.icon" :src="item.recipe.icon" style="width:20px;height:20px;vertical-align:middle;margin-right:4px;border-radius:2px;" />
            {{ item.recipe.name }}
          </div>
          <el-text size="small" type="info">
            x{{ item.quantity }} |
            <el-tag size="small" type="primary">{{ getJobName(item.recipe.job) }}</el-tag>
            {{ item.isSemiFinished ? '半成品' : '' }}
          </el-text>
        </div>
        <el-button size="small" @click="toggleMacro(index)">
          {{ expandedMacro === index ? '收起巨集' : '查看巨集' }}
        </el-button>
      </div>

      <!-- Macro expansion -->
      <div v-if="expandedMacro === index" style="margin-top: 8px; margin-left: 60px;">
        <div v-for="(macro, mi) in getMacros(index)" :key="mi" style="margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <el-text size="small" tag="b">巨集 {{ mi + 1 }}</el-text>
            <el-button size="small" type="primary" @click="copyMacro(macro)">複製</el-button>
          </div>
          <pre style="margin:0;padding:12px;background:var(--el-fill-color-light);border-radius:4px;font-size:12px;line-height:1.6;white-space:pre;cursor:pointer;" @click="copyMacro(macro)">{{ macro }}</pre>
        </div>
      </div>
    </div>

    <div v-if="items.length > 0" style="display: flex; justify-content: space-between; margin-top: 12px;">
      <el-text size="small" type="info">
        進度：{{ items.filter(i => i.done).length }} / {{ items.length }} 完成
      </el-text>
      <el-button size="small" @click="resetAll">全部重設</el-button>
    </div>
  </div>
</template>

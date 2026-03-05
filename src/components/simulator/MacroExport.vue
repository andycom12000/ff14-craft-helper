<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSimulatorStore } from '@/stores/simulator'
import { getSkillById, type SkillDefinition } from '@/engine/skills'
import { ElMessage } from 'element-plus'

const simStore = useSimulatorStore()

const MACRO_LINE_LIMIT = 15
const BUFF_CATEGORIES = new Set(['buff', 'repair', 'other'])

const waitTime = ref(3)
const includeEcho = ref(true)

function getWaitTime(skill: SkillDefinition): number {
  if (BUFF_CATEGORIES.has(skill.category)) {
    return Math.min(waitTime.value, 2)
  }
  return waitTime.value
}

function formatAction(skillId: string): string {
  const skill = getSkillById(skillId)
  if (!skill) return `/ac "${skillId}" <wait.${waitTime.value}>`
  return `/ac "${skill.name}" <wait.${getWaitTime(skill)}>`
}

const macros = computed(() => {
  const actions = simStore.actions
  if (actions.length === 0) return []

  const lines = actions.map(formatAction)
  const result: string[][] = []
  let current: string[] = []

  for (const line of lines) {
    // Reserve 1 line for echo if enabled
    const limit = includeEcho.value ? MACRO_LINE_LIMIT - 1 : MACRO_LINE_LIMIT
    if (current.length >= limit) {
      result.push(current)
      current = []
    }
    current.push(line)
  }
  if (current.length > 0) {
    result.push(current)
  }

  return result.map((chunk, i) => {
    const macroLines = [...chunk]
    if (includeEcho.value) {
      macroLines.push(`/echo 巨集 ${i + 1} 完成 <se.1>`)
    }
    return macroLines.join('\n')
  })
})

const summaryText = computed(() => {
  const skillCount = simStore.actions.length
  const macroCount = macros.value.length
  return `共 ${macroCount} 個巨集, ${skillCount} 個技能`
})

async function copyMacro(text: string, index: number) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`巨集 ${index + 1} 已複製到剪貼簿`)
  } catch {
    ElMessage.error('複製失敗，請手動複製')
  }
}
</script>

<template>
  <div class="macro-export">
    <!-- Options -->
    <el-card shadow="never" class="options-card">
      <template #header>
        <span>匯出設定</span>
      </template>
      <el-form :inline="true" label-position="left">
        <el-form-item label="等待時間 (秒)">
          <el-input-number
            v-model="waitTime"
            :min="2"
            :max="9"
            :step="1"
            size="small"
          />
        </el-form-item>
        <el-form-item label="包含音效提示">
          <el-switch v-model="includeEcho" />
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Summary -->
    <el-text v-if="simStore.actions.length > 0" class="summary-text">
      {{ summaryText }}
    </el-text>

    <!-- Macros -->
    <div v-if="macros.length > 0" class="macro-list">
      <div v-for="(macro, index) in macros" :key="index" class="macro-item">
        <div class="macro-header">
          <el-text tag="b">巨集 {{ index + 1 }}</el-text>
          <el-button
            type="primary"
            size="small"
            @click="copyMacro(macro, index)"
          >
            複製
          </el-button>
        </div>
        <el-input
          type="textarea"
          :model-value="macro"
          readonly
          :autosize="{ minRows: 3, maxRows: 20 }"
          class="macro-textarea"
        />
      </div>
    </div>

    <el-empty v-else description="尚無技能序列，請先在模擬頁面新增技能" />
  </div>
</template>

<style scoped>
.macro-export {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.options-card {
  margin-bottom: 0;
}

.summary-text {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.macro-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.macro-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.macro-textarea :deep(.el-textarea__inner) {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
}
</style>

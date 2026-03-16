<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSimulatorStore } from '@/stores/simulator'
import { formatMacros } from '@/services/macro-formatter'
import { ElMessage } from 'element-plus'

const simStore = useSimulatorStore()

const waitTime = ref(3)
const includeEcho = ref(true)

const macros = computed(() =>
  formatMacros(simStore.actions, {
    waitTime: waitTime.value,
    includeEcho: includeEcho.value,
  })
)

const summaryText = computed(() => {
  const skillCount = simStore.actions.length
  const macroCount = macros.value.length
  return `共 ${macroCount} 個巨集, ${skillCount} 個技能`
})

async function copyMacro(text: string, index: number) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`巨集 ${index + 1} 已複製`)
  } catch {
    ElMessage.error('複製失敗，請手動複製')
  }
}
</script>

<template>
  <div class="macro-export">
    <el-form :inline="true" label-position="left" class="macro-options">
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

    <el-text v-if="simStore.actions.length > 0" class="summary-text">
      {{ summaryText }}
    </el-text>

    <div v-if="macros.length > 0" class="macro-list">
      <div v-for="(macro, index) in macros" :key="index" class="macro-item">
        <el-text tag="b" size="small">巨集 {{ index + 1 }}</el-text>
        <pre
          class="code-block"
          @click="copyMacro(macro, index)"
        >{{ macro }}</pre>
      </div>
    </div>

    <el-empty v-else description="尚無技能序列" />
  </div>
</template>

<style scoped>
.macro-export {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.macro-options {
  margin-bottom: 0;
}

.summary-text {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.macro-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.macro-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.macro-export :deep(.code-block:active) {
  background: var(--el-fill-color-dark);
}
</style>

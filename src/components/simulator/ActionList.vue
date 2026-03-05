<script setup lang="ts">
import type { StepResult } from '@/engine/simulator'
import { getSkillById } from '@/engine/skills'

defineProps<{
  actions: string[]
  results: StepResult[]
}>()

const emit = defineEmits<{
  remove: [index: number]
  clear: []
}>()

function getSkillName(actionId: string): string {
  return getSkillById(actionId)?.nameZh ?? actionId
}

function getStepTooltip(index: number, results: StepResult[]): string {
  if (index >= results.length) return '尚未模擬'
  const result = results[index]
  const prev = index > 0 ? results[index - 1].state : null
  const progressDelta = prev
    ? result.state.progress - prev.progress
    : result.state.progress
  const qualityDelta = prev
    ? result.state.quality - prev.quality
    : result.state.quality
  const duraDelta = prev
    ? result.state.durability - prev.durability
    : result.state.durability - result.state.maxDurability
  const cpDelta = prev
    ? result.state.cp - prev.cp
    : result.state.cp - result.state.maxCp

  const parts: string[] = []
  if (progressDelta !== 0) parts.push(`進展 ${progressDelta > 0 ? '+' : ''}${progressDelta}`)
  if (qualityDelta !== 0) parts.push(`品質 ${qualityDelta > 0 ? '+' : ''}${qualityDelta}`)
  if (duraDelta !== 0) parts.push(`耐久 ${duraDelta > 0 ? '+' : ''}${duraDelta}`)
  if (cpDelta !== 0) parts.push(`CP ${cpDelta > 0 ? '+' : ''}${cpDelta}`)
  return parts.length > 0 ? parts.join(' / ') : '無變化'
}
</script>

<template>
  <div class="action-list">
    <div class="action-header">
      <el-text size="small" tag="b">技能序列 ({{ actions.length }} 步)</el-text>
      <el-button
        v-if="actions.length > 0"
        type="danger"
        size="small"
        text
        @click="emit('clear')"
      >
        全部清除
      </el-button>
    </div>

    <div v-if="actions.length === 0" class="empty-hint">
      <el-text type="info" size="small">點擊技能面板中的技能來添加動作</el-text>
    </div>

    <div v-else class="action-tags">
      <el-tooltip
        v-for="(action, idx) in actions"
        :key="idx"
        :content="getStepTooltip(idx, results)"
        placement="top"
      >
        <el-tag
          closable
          size="default"
          :type="idx < results.length && results[idx].state.isComplete
            ? (results[idx].state.isSuccess ? 'success' : 'danger')
            : ''"
          @close="emit('remove', idx)"
          class="action-tag"
        >
          <span class="action-index">{{ idx + 1 }}.</span>
          {{ getSkillName(action) }}
        </el-tag>
      </el-tooltip>
    </div>
  </div>
</template>

<style scoped>
.action-list {
  padding: 8px 12px;
}

.action-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.empty-hint {
  text-align: center;
  padding: 16px 0;
}

.action-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.action-tag {
  cursor: pointer;
}

.action-index {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-right: 2px;
}
</style>

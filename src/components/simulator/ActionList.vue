<script setup lang="ts">
import { computed } from 'vue'
import type { StepResult } from '@/engine/simulator'
import {
  getSkillIconUrl,
  getSkillNameByLocale,
  type SupportedLocale,
} from '@/engine/skills'
import { useLocaleStore } from '@/stores/locale'

defineProps<{
  actions: string[]
  results: StepResult[]
}>()

const emit = defineEmits<{
  remove: [index: number]
  clear: []
}>()

const localeStore = useLocaleStore()

const currentLocale = computed<SupportedLocale>(() => {
  const raw = localeStore.current
  if (raw === 'en' || raw === 'ja' || raw === 'zh-TW' || raw === 'zh-CN') return raw
  return 'zh-TW'
})

function displayName(id: string): string {
  return getSkillNameByLocale(id, currentLocale.value)
}

function iconUrl(id: string): string | null {
  return getSkillIconUrl(id)
}

function getStepTooltip(index: number, results: StepResult[], actionId: string): string {
  const name = displayName(actionId)
  if (index >= results.length) return `${name}\n尚未模擬`
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
  // TODO: if successProbability lands on StepDetail, surface it here as a %.
  const delta = parts.length > 0 ? parts.join(' / ') : '無變化'
  return `${name}\n${delta}`
}

function tagTone(index: number, results: StepResult[]): '' | 'success' | 'danger' {
  if (index >= results.length) return ''
  const s = results[index].state
  if (!s.isComplete) return ''
  return s.isSuccess ? 'success' : 'danger'
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
        :content="getStepTooltip(idx, results, action)"
        placement="top"
        :show-after="150"
      >
        <el-tag
          closable
          size="default"
          :type="tagTone(idx, results)"
          class="action-tag"
          @close="emit('remove', idx)"
        >
          <span class="action-index">{{ idx + 1 }}.</span>
          <img
            v-if="iconUrl(action)"
            :src="iconUrl(action)!"
            :alt="displayName(action)"
            class="action-icon"
            loading="lazy"
          />
          <span class="action-label">{{ displayName(action) }}</span>
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
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.action-tag :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.action-index {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.action-icon {
  width: 18px;
  height: 18px;
  image-rendering: pixelated;
  border-radius: 3px;
}

.action-label {
  font-size: 12px;
}
</style>

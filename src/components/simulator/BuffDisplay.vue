<script setup lang="ts">
import type { BuffType } from '@/engine/buffs'
import { BUFF_DEFINITIONS } from '@/engine/buffs'

defineProps<{
  buffs: Map<BuffType, { stacks: number; duration: number }>
}>()

function getBuffName(type: BuffType): string {
  return BUFF_DEFINITIONS[type]?.name ?? type
}

function getTagType(type: BuffType): '' | 'success' | 'warning' | 'danger' | 'info' {
  const colorMap: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    InnerQuiet: '',
    WasteNot: 'warning',
    WasteNotII: 'warning',
    Veneration: 'danger',
    Innovation: 'success',
    GreatStrides: 'success',
    Manipulation: 'info',
    FinalAppraisal: 'info',
    MuscleMemory: 'danger',
    Pliant: '',
  }
  return colorMap[type] ?? ''
}

function formatDuration(duration: number): string {
  if (duration === Infinity) return ''
  return ` (${duration})`
}

function formatStacks(stacks: number, type: BuffType): string {
  if (type === 'InnerQuiet' && stacks > 0) return ` x${stacks}`
  return ''
}
</script>

<template>
  <div class="buff-display">
    <el-text v-if="buffs.size === 0" size="small" type="info">無增益效果</el-text>
    <div v-else class="buff-tags">
      <el-tooltip
        v-for="[type, info] in buffs"
        :key="type"
        :content="BUFF_DEFINITIONS[type]?.description ?? ''"
        placement="top"
      >
        <el-tag
          :type="getTagType(type)"
          size="default"
          effect="dark"
        >
          {{ getBuffName(type) }}{{ formatStacks(info.stacks, type) }}{{ formatDuration(info.duration) }}
        </el-tag>
      </el-tooltip>
    </div>
  </div>
</template>

<style scoped>
.buff-display {
  padding: 8px 12px;
  min-height: 36px;
}

.buff-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>

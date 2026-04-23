<script setup lang="ts">
import { computed } from 'vue'
import type { CraftState } from '@/engine/simulator'

const props = defineProps<{
  craftState: CraftState | null
}>()

const progressPct = computed(() => {
  if (!props.craftState) return 0
  return Math.round((props.craftState.progress / props.craftState.maxProgress) * 100)
})

const qualityPct = computed(() => {
  if (!props.craftState || props.craftState.maxQuality === 0) return 0
  return Math.round((props.craftState.quality / props.craftState.maxQuality) * 100)
})

const durabilityPct = computed(() => {
  if (!props.craftState || props.craftState.maxDurability === 0) return 0
  return Math.round((props.craftState.durability / props.craftState.maxDurability) * 100)
})

const cpPct = computed(() => {
  if (!props.craftState || props.craftState.maxCp === 0) return 0
  return Math.round((props.craftState.cp / props.craftState.maxCp) * 100)
})

const completionText = computed(() => {
  if (!props.craftState) return ''
  if (!props.craftState.isComplete) return '製作中'
  return props.craftState.isSuccess ? '製作成功' : '製作失敗'
})

const completionType = computed(() => {
  if (!props.craftState || !props.craftState.isComplete) return 'info'
  return props.craftState.isSuccess ? 'success' : 'error'
})
</script>

<template>
  <div class="status-bar">
    <div v-if="!craftState" class="no-state">
      <el-text type="info">尚未開始模擬</el-text>
    </div>
    <template v-else>
      <div class="status-header">
        <el-tag :type="completionType" size="small">{{ completionText }}</el-tag>
        <el-text size="small" type="info">步數: {{ craftState.step }}</el-text>
      </div>

      <div class="bar-row">
        <span class="bar-label">進展</span>
        <el-progress
          :percentage="progressPct"
          :stroke-width="18"
          color="var(--app-accent)"
          :text-inside="true"
          :format="() => `${craftState!.progress} / ${craftState!.maxProgress}`"
        />
      </div>

      <div class="bar-row">
        <span class="bar-label">品質</span>
        <el-progress
          :percentage="qualityPct"
          :stroke-width="18"
          color="var(--app-success)"
          :text-inside="true"
          :format="() => `${craftState!.quality} / ${craftState!.maxQuality}`"
        />
      </div>

      <div class="bar-row">
        <span class="bar-label">耐久</span>
        <el-progress
          :percentage="durabilityPct"
          :stroke-width="18"
          color="var(--el-color-warning)"
          :text-inside="true"
          :format="() => `${craftState!.durability} / ${craftState!.maxDurability}`"
        />
      </div>

      <div class="bar-row">
        <span class="bar-label">CP</span>
        <el-progress
          :percentage="cpPct"
          :stroke-width="18"
          color="var(--el-color-info)"
          :text-inside="true"
          :format="() => `${craftState!.cp} / ${craftState!.maxCp}`"
        />
      </div>

    </template>
  </div>
</template>

<style scoped>
.status-bar {
  padding: 12px;
}

.no-state {
  text-align: center;
  padding: 20px 0;
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.bar-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  gap: 12px;
}

.bar-label {
  width: 40px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 500;
  text-align: right;
}

.bar-row .el-progress {
  flex: 1;
}
</style>

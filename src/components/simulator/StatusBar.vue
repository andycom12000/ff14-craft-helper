<script setup lang="ts">
import { computed } from 'vue'
import type { CraftState } from '@/engine/simulator'
import { percentOf } from '@/utils/format'

const props = defineProps<{
  craftState: CraftState | null
  /* #234: present only when the active recipe was actually downgraded by level
     sync. Lives here rather than on a recipe-detail panel because this header
     sits directly above the 進展／品質／耐久 bars — the very numbers the sync
     changed — so the explanation is where the surprise is. */
  levelSync?: { syncedLevel: number; originalLevel: number } | null
}>()

interface BarSpec {
  label: string
  color: string
  current: number
  max: number
}

const bars = computed<BarSpec[]>(() => {
  const s = props.craftState
  if (!s) return []
  // Muted variants — chroma trimmed so 4 stacked bars don't compete
  return [
    { label: '進展', color: 'oklch(0.62 0.12 65)', current: s.progress, max: s.maxProgress },
    { label: '品質', color: 'oklch(0.55 0.10 145)', current: s.quality, max: s.maxQuality },
    { label: '耐久', color: 'oklch(0.58 0.12 45)', current: s.durability, max: s.maxDurability },
    { label: 'CP', color: 'oklch(0.55 0.05 230)', current: s.cp, max: s.maxCp },
  ]
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
        <el-tooltip
          v-if="levelSync"
          content="這是宇宙探索的等級同步配方：難度、品質上限與耐久已依你這個職業的裝備組等級換算，因此與配方手帳上的原始標示不同。"
          placement="top"
        >
          <el-tag size="small" type="warning" effect="light" class="level-sync-tag">
            等級同步 Lv.{{ levelSync.syncedLevel }}
            <span class="level-sync-origin">原始 Lv.{{ levelSync.originalLevel }}</span>
          </el-tag>
        </el-tooltip>
        <el-text size="small" type="info">步數: {{ craftState.step }}</el-text>
      </div>

      <div v-for="bar in bars" :key="bar.label" class="bar-row">
        <span class="bar-label">{{ bar.label }}</span>
        <div class="bar-track">
          <el-progress
            :percentage="percentOf(bar.current, bar.max)"
            :stroke-width="14"
            :color="bar.color"
            :show-text="false"
            :aria-label="`${bar.label} ${bar.current} / ${bar.max}`"
          />
        </div>
        <span class="bar-value">{{ bar.current }} / {{ bar.max }}</span>
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
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

/* Keeps 步數 pinned right no matter how many tags precede it. */
.status-header > :last-child {
  margin-left: auto;
}

.level-sync-tag {
  cursor: help;
}

.level-sync-origin {
  margin-left: 4px;
  opacity: 0.72;
}

.bar-row {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  margin-bottom: 8px;
  gap: 10px;
}

.bar-label {
  font-size: 13px;
  font-weight: 500;
  text-align: right;
}

.bar-track {
  min-width: 0;
}

.bar-value {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--app-text-muted);
  white-space: nowrap;
  text-align: right;
  min-width: 60px;
}

/* On narrow phones, stack the numeric readout below the bar so long values
 * (e.g. 8838 / 8500) are never squeezed. */
@media (max-width: 480px) {
  .bar-row {
    grid-template-columns: 40px 1fr;
    row-gap: 2px;
  }

  .bar-value {
    grid-column: 2 / 3;
    text-align: left;
    min-width: 0;
  }
}
</style>

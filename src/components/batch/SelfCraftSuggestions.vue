<script setup lang="ts">
import { computed } from 'vue'
import { useBatchStore } from '@/stores/batch'
import type { SelfCraftCandidate } from '@/stores/batch'
import { formatGil } from '@/utils/format'

const props = defineProps<{ candidates: SelfCraftCandidate[] }>()
const batch = useBatchStore()

const selectedSavings = computed(() => {
  let total = 0
  for (const c of props.candidates) {
    if (batch.selectedSelfCraftIds.has(c.itemId)) total += c.savings
  }
  return total
})

const allSelected = computed(() =>
  props.candidates.length > 0 &&
  props.candidates.every(c => batch.selectedSelfCraftIds.has(c.itemId)),
)

function isChecked(id: number) {
  return batch.selectedSelfCraftIds.has(id)
}

function toggle(id: number) {
  batch.toggleSelfCraft(id)
}

function toggleAll() {
  if (allSelected.value) batch.clearSelfCraftSelection()
  else batch.selectAllSelfCraft()
}
</script>

<template>
  <div v-if="candidates.length > 0" class="self-craft-block">
    <div class="block-header">
      <div class="block-title">
        <el-tag type="warning" size="small">💡 自製建議</el-tag>
        <el-text size="small" type="info">
          勾選要改為自製的素材，購物清單與製作步驟會自動更新
        </el-text>
      </div>
      <div class="block-stats">
        <el-text size="small" type="success">
          已省下 {{ formatGil(selectedSavings) }}
        </el-text>
        <el-button size="small" @click="toggleAll">
          {{ allSelected ? '全部取消' : '全選' }}
        </el-button>
      </div>
    </div>

    <el-table :data="candidates" size="small" class="suggestions-table">
      <el-table-column label="" width="40" align="center">
        <template #default="{ row }">
          <el-checkbox :model-value="isChecked(row.itemId)" @change="() => toggle(row.itemId)" />
        </template>
      </el-table-column>
      <el-table-column label="" width="36">
        <template #default="{ row }">
          <img v-if="row.icon" :src="row.icon" :alt="row.name" class="row-icon" />
        </template>
      </el-table-column>
      <el-table-column label="素材" prop="name">
        <template #default="{ row }">
          {{ row.name }}
          <el-tag v-if="row.hqRequired" size="small" type="warning" style="margin-left: 4px">需 HQ</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="數量" prop="amount" width="60" align="right" />
      <el-table-column label="買" width="90" align="right">
        <template #default="{ row }">{{ formatGil(row.buyCost) }}</template>
      </el-table-column>
      <el-table-column label="做" width="90" align="right">
        <template #default="{ row }">{{ formatGil(row.craftCost) }}</template>
      </el-table-column>
      <el-table-column label="省" width="100" align="right">
        <template #default="{ row }">
          <el-text type="success" size="small">
            -{{ Math.round(row.savingsRatio * 100) }}%
          </el-text>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.self-craft-block {
  margin-bottom: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 12px;
  background: var(--el-fill-color-lighter);
}

.block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}

.block-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.block-stats {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-icon {
  width: 20px;
  height: 20px;
  border-radius: 2px;
}
</style>

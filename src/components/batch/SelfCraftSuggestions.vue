<script setup lang="ts">
import { computed } from 'vue'
import { useBatchStore } from '@/stores/batch'
import type { SelfCraftCandidate } from '@/stores/batch'
import { formatGil } from '@/utils/format'
import ItemName from '@/components/common/ItemName.vue'

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
  <section v-if="candidates.length > 0" class="self-craft-block" aria-label="自製建議">
    <header class="block-header">
      <div class="block-title">
        <span class="block-label">自製建議</span>
        <span class="block-hint">勾選要改為自製的素材，購物清單與製作步驟會自動更新</span>
      </div>
      <div class="block-stats">
        <span class="block-saved">已省下 {{ formatGil(selectedSavings) }}</span>
        <el-button size="small" @click="toggleAll">
          {{ allSelected ? '全部取消' : '全選' }}
        </el-button>
      </div>
    </header>

    <el-table :data="candidates" size="small" class="suggestions-table">
      <el-table-column label="" width="44" align="center">
        <template #default="{ row }">
          <el-checkbox
            :model-value="isChecked(row.itemId)"
            :aria-label="`改為自製：${row.name}`"
            @change="() => toggle(row.itemId)"
          />
        </template>
      </el-table-column>
      <el-table-column label="" width="36">
        <template #default="{ row }">
          <img v-if="row.icon" :src="row.icon" alt="" aria-hidden="true" loading="lazy" decoding="async" class="row-icon" />
        </template>
      </el-table-column>
      <el-table-column label="素材">
        <template #default="{ row }">
          <ItemName :item-id="row.itemId" :fallback="row.name" />
          <el-tag v-if="row.hqRequired" size="small" type="warning" style="margin-left: 4px">需 HQ</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="數量" prop="amount" width="60" align="right" />
      <el-table-column label="購買成本" width="96" align="right">
        <template #default="{ row }">{{ formatGil(row.buyCost) }}</template>
      </el-table-column>
      <el-table-column label="自製成本" width="96" align="right">
        <template #default="{ row }">{{ formatGil(row.craftCost) }}</template>
      </el-table-column>
      <el-table-column label="省" width="80" align="right">
        <template #default="{ row }">
          <span class="savings-badge">
            −{{ Math.round(row.savingsRatio * 100) }}%
          </span>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<style scoped>
.self-craft-block {
  margin-bottom: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-left: 3px solid var(--accent-gold);
  border-radius: 6px;
  padding: 12px 14px;
  background: var(--el-fill-color-lighter);
}

.block-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 10px;
}

.block-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.block-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-gold);
  letter-spacing: 0.02em;
}

.block-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.block-stats {
  display: flex;
  align-items: center;
  gap: 10px;
}

.block-saved {
  font-size: 13px;
  color: var(--app-success);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.row-icon {
  width: 20px;
  height: 20px;
  border-radius: 2px;
}

.savings-badge {
  color: var(--app-success);
  font-weight: 600;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 640px) {
  .block-header {
    flex-direction: column;
    align-items: stretch;
  }

  .block-stats {
    justify-content: space-between;
  }
}
</style>

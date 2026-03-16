<script setup lang="ts">
import { watch, triggerRef } from 'vue'
import { ElMessage } from 'element-plus'
import type { CrystalSummary, ServerGroup, MaterialWithPrice } from '@/services/shopping-list'
import type { WorldPriceSummary } from '@/api/universalis'
import { useCrossWorldPricing } from '@/composables/useCrossWorldPricing'
import CrossWorldPriceDetail from '@/components/common/CrossWorldPriceDetail.vue'
import { formatGil } from '@/utils/format'

const props = defineProps<{
  crystals: CrystalSummary[]
  serverGroups: ServerGroup[]
  selfCraftItems: MaterialWithPrice[]
  grandTotal: number
  crossWorldCache?: Map<number, WorldPriceSummary[]>
}>()

const { crossWorldData, crossWorldLoading, fetchCrossWorldData } = useCrossWorldPricing()

// Seed composable cache with pre-fetched data from batch optimizer
watch(() => props.crossWorldCache, (cache) => {
  if (!cache) return
  let seeded = false
  for (const [id, summary] of cache) {
    if (!crossWorldData.value.has(id)) {
      crossWorldData.value.set(id, summary)
      seeded = true
    }
  }
  if (seeded) triggerRef(crossWorldData)
}, { immediate: true })

const crystalColors: Record<string, string> = {
  '火': '#F87171', '水': '#60A5FA', '風': '#34D399',
  '雷': '#FBBF24', '冰': '#A78BFA', '土': '#F472B6',
}

function getCrystalColor(name: string): string {
  for (const [key, color] of Object.entries(crystalColors)) {
    if (name.includes(key)) return color
  }
  return '#94A3B8'
}

function handleExpand(row: MaterialWithPrice, expandedRows: MaterialWithPrice[]) {
  const expanded = expandedRows.some(r => r.itemId === row.itemId && r.type === row.type)
  if (!expanded) return
  fetchCrossWorldData(row.itemId, row.name)
}

function copyName(row: MaterialWithPrice, _col: unknown, event: Event) {
  // Don't copy when clicking the expand arrow column
  const target = event.target as HTMLElement
  if (target.closest('.el-table__expand-icon')) return
  navigator.clipboard.writeText(row.name)
  ElMessage({ message: `已複製「${row.name}」`, type: 'success', duration: 1500 })
}
</script>

<template>
  <div class="shopping-list" style="container-type: inline-size;">
    <!-- Crystals -->
    <div v-if="crystals.length > 0" class="crystal-section">
      <el-text size="small" type="info" tag="div" class="section-label">水晶（不計入費用）</el-text>
      <div class="crystal-tags">
        <el-tag v-for="c in crystals" :key="c.itemId" effect="dark" round size="small">
          <span class="crystal-dot" :style="{ background: getCrystalColor(c.name) }" />
          {{ c.name }} x{{ c.amount }}
        </el-tag>
      </div>
      <el-divider />
    </div>

    <!-- Server groups -->
    <div class="server-grid">
    <div v-for="group in serverGroups" :key="group.server" class="server-group">
      <div class="server-header">
        <div class="server-info">
          <el-tag type="primary" size="small">{{ group.server }}</el-tag>
          <el-text size="small" type="info">{{ group.items.length }} 項素材</el-text>
        </div>
        <el-text type="warning" size="small" tag="b">小計：{{ formatGil(group.subtotal) }} Gil</el-text>
      </div>
      <el-table :data="group.items" size="small" class="material-table clickable-rows" @expand-change="handleExpand" @row-click="copyName">
        <el-table-column type="expand">
          <template #default="{ row }">
            <CrossWorldPriceDetail
              :data="crossWorldData.get(row.itemId)"
              :loading="crossWorldLoading.has(row.itemId)"
              show-listing-count
            />
          </template>
        </el-table-column>
        <el-table-column label="" width="36">
          <template #default="{ row }">
            <img v-if="row.icon" :src="row.icon" :alt="row.name" class="material-icon" />
          </template>
        </el-table-column>
        <el-table-column label="素材" prop="name" min-width="120" />
        <el-table-column label="類型" width="55">
          <template #default="{ row }">
            <el-tag size="small" :type="row.type === 'hq' ? 'warning' : 'info'">
              {{ row.type.toUpperCase() }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="數量" prop="amount" width="50" />
        <el-table-column label="單價" width="70" align="right">
          <template #default="{ row }">{{ formatGil(row.unitPrice) }}</template>
        </el-table-column>
        <el-table-column label="小計" width="80" align="right">
          <template #default="{ row }">
            <el-text type="warning">{{ formatGil(row.unitPrice * row.amount) }}</el-text>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- Self-craft -->
    <div v-if="selfCraftItems.length > 0" class="server-group">
      <div class="server-header">
        <div class="server-info">
          <el-tag type="success" size="small">需自行製作</el-tag>
          <el-text size="small" type="info">{{ selfCraftItems.length }} 項素材</el-text>
        </div>
      </div>
      <el-table :data="selfCraftItems" size="small" class="material-table clickable-rows" @row-click="copyName">
        <el-table-column label="" width="36">
          <template #default="{ row }">
            <img v-if="row.icon" :src="row.icon" :alt="row.name" class="material-icon" />
          </template>
        </el-table-column>
        <el-table-column label="素材" prop="name" />
        <el-table-column label="數量" prop="amount" width="60" />
      </el-table>
    </div>
    </div>

    <el-divider />
    <div class="grand-total">
      購買合計：{{ formatGil(grandTotal) }} Gil
    </div>
  </div>
</template>

<style scoped>
.section-label {
  margin-bottom: 8px;
}

.crystal-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.crystal-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 2px;
  vertical-align: middle;
}

.server-grid {
  columns: 1;
  column-gap: 16px;
}

.server-group {
  margin-bottom: 16px;
  break-inside: avoid;
}

.server-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.server-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.material-icon {
  width: 20px;
  height: 20px;
  border-radius: 2px;
}

.material-table {
  --el-table-border-color: var(--el-border-color-lighter);
}

.clickable-rows :deep(.el-table__row) {
  cursor: pointer;
}

.grand-total {
  text-align: right;
  font-size: 17px;
  font-weight: 700;
  color: var(--el-color-warning);
}

@container (min-width: 900px) {
  .server-grid {
    columns: 2;
  }
}
</style>

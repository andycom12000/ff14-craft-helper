<script setup lang="ts">
import { ref, watch, triggerRef, computed, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import type { CrystalSummary, ServerGroup, MaterialWithPrice } from '@/services/shopping-list'
import type { WorldPriceSummary } from '@/api/universalis'
import type { BuyFinishedDecision, SelfCraftCandidate } from '@/stores/batch'
import { useBatchStore } from '@/stores/batch'
import { useCrossWorldPricing } from '@/composables/useCrossWorldPricing'
import CrossWorldPriceDetail from '@/components/common/CrossWorldPriceDetail.vue'
import SelfCraftSuggestions from './SelfCraftSuggestions.vue'
import { formatGil } from '@/utils/format'

const props = defineProps<{
  crystals: CrystalSummary[]
  serverGroups: ServerGroup[]
  selfCraftCandidates: SelfCraftCandidate[]
  buyFinishedItems: BuyFinishedDecision[]
  grandTotal: number
  crossWorldCache?: Map<number, WorldPriceSummary[]>
}>()

const batchStore = useBatchStore()
const { crossWorldData, crossWorldLoading, fetchCrossWorldData } = useCrossWorldPricing()

const effectiveServerGroups = computed<ServerGroup[]>(() => {
  const items = batchStore.finalShoppingItems
  if (items.length === 0) return props.serverGroups
  const map = new Map<string, ServerGroup>()
  for (const it of items) {
    const server = it.server ?? '本伺服器'
    if (!map.has(server)) map.set(server, { server, items: [], subtotal: 0 })
    const g = map.get(server)!
    g.items.push(it)
    g.subtotal += it.unitPrice * it.amount
  }
  return [...map.values()]
})

const buyFinishedSavings = computed(() => {
  if (!props.buyFinishedItems.length) return null
  const totalSaved = props.buyFinishedItems.reduce(
    (sum, bf) => sum + (bf.craftCost - bf.buyPrice) * bf.quantity, 0)
  return { count: props.buyFinishedItems.length, totalSaved }
})

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

// Crystal itemIds 2-19, repeating every 6: fire, ice, wind, earth, lightning, water
const crystalColorsByElement = [
  '#F87171', // fire
  '#A78BFA', // ice
  '#34D399', // wind
  '#F472B6', // earth
  '#FBBF24', // lightning
  '#60A5FA', // water
]

function getCrystalColor(itemId: number): string {
  if (itemId < 2 || itemId > 19) return '#94A3B8'
  return crystalColorsByElement[(itemId - 2) % 6]
}

function handleExpand(row: MaterialWithPrice, expandedRows: MaterialWithPrice[]) {
  const expanded = expandedRows.some(r => r.itemId === row.itemId && r.type === row.type)
  if (!expanded) return
  fetchCrossWorldData(row.itemId, row.name)
}

const flashRowKey = ref<string | null>(null)

function copyName(row: MaterialWithPrice, _col: unknown, event: Event) {
  // Don't copy when clicking the expand arrow
  const target = event.target as HTMLElement
  if (target.closest('.el-table__expand-icon')) return
  navigator.clipboard.writeText(row.name)
  ElMessage({ message: `已複製「${row.name}」`, type: 'success', duration: 1500 })

  // Flash feedback
  const key = `${row.itemId}-${row.type}`
  flashRowKey.value = key
  nextTick(() => {
    setTimeout(() => { flashRowKey.value = null }, 300)
  })
}

function rowClassName({ row }: { row: MaterialWithPrice }) {
  const classes: string[] = []
  if (flashRowKey.value === `${row.itemId}-${row.type}`) classes.push('row-flash')
  if (batchStore.isShoppingChecked(row.itemId, row.type, row.isFinishedProduct)) classes.push('row-checked')
  return classes.join(' ')
}
</script>

<template>
  <div class="shopping-list" style="container-type: inline-size;">
    <SelfCraftSuggestions :candidates="selfCraftCandidates" />

    <!-- Crystals -->
    <div v-if="crystals.length > 0" class="crystal-section">
      <el-text size="small" type="info" tag="div" class="section-label">水晶（不計入費用）</el-text>
      <div class="crystal-tags">
        <el-tag v-for="c in crystals" :key="c.itemId" type="info" effect="plain" round size="small">
          <span class="crystal-dot" :style="{ background: getCrystalColor(c.itemId) }" />
          {{ c.name }} x{{ c.amount }}
        </el-tag>
      </div>
      <el-divider />
    </div>

    <!-- Buy-finished summary -->
    <div v-if="buyFinishedSavings" class="buy-finished-summary">
      <el-alert type="success" :closable="false" show-icon>
        <template #title>
          {{ buyFinishedSavings.count }} 件配方改為直購成品，共省 {{ formatGil(buyFinishedSavings.totalSaved) }} Gil
        </template>
      </el-alert>
    </div>

    <!-- Server groups -->
    <div class="server-grid">
    <div v-for="group in effectiveServerGroups" :key="group.server" class="server-group">
      <div class="server-header">
        <div class="server-info">
          <el-tag type="primary" size="small">{{ group.server }}</el-tag>
          <el-text size="small" type="info">{{ group.items.length }} 項素材</el-text>
        </div>
        <el-text type="warning" size="small" tag="b">小計：{{ formatGil(group.subtotal) }} Gil</el-text>
      </div>
      <el-table :data="group.items" size="small" class="material-table clickable-rows" :row-class-name="rowClassName" @expand-change="handleExpand" @row-click="copyName">
        <el-table-column type="expand">
          <template #default="{ row }">
            <CrossWorldPriceDetail
              :data="crossWorldData.get(row.itemId)"
              :loading="crossWorldLoading.has(row.itemId)"
              show-listing-count
            />
          </template>
        </el-table-column>
        <el-table-column label="" width="40" align="center">
          <template #default="{ row }">
            <div @click.stop>
              <el-checkbox
                :model-value="batchStore.isShoppingChecked(row.itemId, row.type, row.isFinishedProduct)"
                @change="() => batchStore.toggleShoppingItem(row.itemId, row.type, row.isFinishedProduct)"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="" width="36">
          <template #default="{ row }">
            <img v-if="row.icon" :src="row.icon" :alt="row.name" class="material-icon" />
          </template>
        </el-table-column>
        <el-table-column label="素材" min-width="120">
          <template #default="{ row }">
            <span>{{ row.name }}</span>
            <template v-if="row.isFinishedProduct">
              <el-tag size="small" type="success" class="finished-badge">直購成品</el-tag>
              <div v-if="row.craftCostComparison" class="craft-compare-hint">
                自製需 {{ formatGil(row.craftCostComparison.craftCost) }} Gil，省 {{ formatGil(row.craftCostComparison.craftCost - row.craftCostComparison.buyPrice) }} Gil
              </div>
            </template>
          </template>
        </el-table-column>
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

    </div>

    <!-- Shopping progress -->
    <div v-if="batchStore.shoppingItemCount > 0" class="shopping-footer">
      <el-divider />
      <el-progress
        :percentage="Math.round((batchStore.shoppingCheckedCount / batchStore.shoppingItemCount) * 100)"
        :stroke-width="10"
        class="shopping-progress"
      />
      <div class="shopping-footer-row">
        <el-text size="small" type="info">
          採購進度：{{ batchStore.shoppingCheckedCount }} / {{ batchStore.shoppingItemCount }} 完成
        </el-text>
        <el-tag v-if="batchStore.allShoppingDone" type="success" size="small">全部採購完成</el-tag>
      </div>
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
  margin-bottom: var(--space-sm);
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  padding: 8px 12px;
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

.clickable-rows :deep(.row-flash td) {
  background-color: var(--app-accent-glow) !important;
  transition: background-color 0.3s;
}

.clickable-rows :deep(.row-checked td) {
  opacity: 0.45;
  text-decoration: line-through;
}

.clickable-rows :deep(.row-checked:hover td) {
  opacity: 0.65;
}

.shopping-footer {
  margin-top: 4px;
}

.shopping-progress {
  margin-bottom: 8px;
}

.shopping-footer-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.buy-finished-summary {
  margin-bottom: 12px;
}

.finished-badge {
  margin-left: 6px;
  vertical-align: middle;
}

.craft-compare-hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

@container (min-width: 900px) {
  .server-grid {
    columns: 2;
  }
}

@container (min-width: 1400px) {
  .server-grid {
    columns: 3;
  }
}
</style>

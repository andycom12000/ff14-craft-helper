<script setup lang="ts">
import { computed } from 'vue'
import type { FlatMaterial, PriceInfo, MaterialNode } from '@/stores/bom'
import { useSettingsStore } from '@/stores/settings'
import { getPrice } from '@/stores/bom'
import { computeOptimalCosts, type CostDecision } from '@/services/bom-calculator'
import { useCrossWorldPricing } from '@/composables/useCrossWorldPricing'
import CrossWorldPriceDetail from '@/components/common/CrossWorldPriceDetail.vue'
import ItemName from '@/components/common/ItemName.vue'
import { formatGil } from '@/utils/format'

const props = defineProps<{
  materials: FlatMaterial[]
  prices: Map<number, PriceInfo>
  targetItemIds?: number[]
  materialTree?: MaterialNode[]
}>()

const emit = defineEmits<{
  'refresh-prices': []
}>()

const settingsStore = useSettingsStore()

const targetIdSet = computed(() => new Set(props.targetItemIds ?? []))

const rawMaterials = computed(() =>
  props.materials.filter((m) => m.isRaw),
)

const craftableMaterials = computed(() =>
  props.materials.filter((m) => !m.isRaw && !targetIdSet.value.has(m.itemId)),
)

const targetMaterials = computed(() =>
  props.materials.filter((m) => !m.isRaw && targetIdSet.value.has(m.itemId)),
)

function getNqPrice(itemId: number): number {
  return props.prices.get(itemId)?.minPrice ?? 0
}

function getHqPrice(itemId: number): number {
  return props.prices.get(itemId)?.hqMinPrice ?? 0
}

function getUnitPrice(itemId: number): number {
  const priceInfo = props.prices.get(itemId)
  if (!priceInfo) return 0
  return getPrice(priceInfo, settingsStore.priceDisplayMode)
}

function getTotalPrice(itemId: number, amount: number): number {
  return getUnitPrice(itemId) * amount
}

const rawTotalCost = computed(() =>
  rawMaterials.value.reduce(
    (sum, m) => sum + getTotalPrice(m.itemId, m.totalAmount),
    0,
  ),
)

const craftTotalCost = computed(() =>
  craftableMaterials.value.reduce(
    (sum, m) => sum + getTotalPrice(m.itemId, m.totalAmount),
    0,
  ),
)

const optimalResult = computed(() => {
  if (!props.materialTree || props.materialTree.length === 0) return null
  return computeOptimalCosts(props.materialTree, getUnitPrice)
})

const decisionsMap = computed(() => {
  const map = new Map<number, CostDecision>()
  if (optimalResult.value) {
    for (const d of optimalResult.value.decisions) {
      map.set(d.itemId, d)
    }
  }
  return map
})

const grandTotal = computed(() => {
  if (optimalResult.value) return optimalResult.value.totalCost
  return rawTotalCost.value
})

// Buy-vs-craft comparison for target items
const targetBuyPrice = computed(() =>
  targetMaterials.value.reduce(
    (sum, m) => sum + getTotalPrice(m.itemId, m.totalAmount),
    0,
  ),
)

const craftSaving = computed(() => targetBuyPrice.value - grandTotal.value)

const { crossWorldData, crossWorldLoading, fetchCrossWorldData } = useCrossWorldPricing()

function handleExpand(row: FlatMaterial, expandedRows: FlatMaterial[]) {
  const expanded = expandedRows.some(r => r.itemId === row.itemId)
  if (!expanded) return
  fetchCrossWorldData(row.itemId, row.name)
}

</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header">
        <span class="card-title">
          材料總覽與價格
          <el-tag size="small" type="info" style="margin-left: 8px">
            {{ settingsStore.server }}
          </el-tag>
        </span>
        <el-button size="small" @click="emit('refresh-prices')">
          重新取得價格
        </el-button>
      </div>
    </template>

    <el-empty
      v-if="materials.length === 0"
      description="尚未計算"
      :image-size="80"
    />

    <template v-else>
      <!-- Raw materials section -->
      <h4 class="section-title">原始素材（需採集 / 購買）</h4>
      <el-table :data="rawMaterials" border style="width: 100%" size="small" @expand-change="handleExpand">
        <el-table-column type="expand">
          <template #default="{ row }">
            <CrossWorldPriceDetail
              :data="crossWorldData.get(row.itemId)"
              :loading="crossWorldLoading.has(row.itemId)"
            />
          </template>
        </el-table-column>
        <el-table-column label="圖示" width="50" align="center">
          <template #default="{ row }">
            <img :src="row.icon" :alt="row.name" crossorigin="anonymous" style="width: 24px; height: 24px" />
          </template>
        </el-table-column>
        <el-table-column label="名稱">
          <template #default="{ row }">
            <ItemName :item-id="row.itemId" :fallback="row.name" />
          </template>
        </el-table-column>
        <el-table-column label="需求數量" width="100" align="center">
          <template #default="{ row }">
            {{ row.totalAmount }}
          </template>
        </el-table-column>
        <el-table-column label="NQ 最低" width="110" align="right">
          <template #default="{ row }">
            {{ getNqPrice(row.itemId) > 0 ? formatGil(getNqPrice(row.itemId)) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="HQ 最低" width="110" align="right">
          <template #default="{ row }">
            <span class="hq-price">{{ getHqPrice(row.itemId) > 0 ? formatGil(getHqPrice(row.itemId)) : '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="小計" width="120" align="right">
          <template #default="{ row }">
            {{ formatGil(getTotalPrice(row.itemId, row.totalAmount)) }}
          </template>
        </el-table-column>
      </el-table>

      <div class="subtotal">
        原始素材小計：<strong>{{ formatGil(rawTotalCost) }}</strong> Gil
      </div>

      <!-- Craftable intermediates section -->
      <template v-if="craftableMaterials.length > 0">
        <h4 class="section-title">半成品（可製作）</h4>
        <el-table :data="craftableMaterials" border style="width: 100%" size="small" @expand-change="handleExpand">
          <el-table-column type="expand">
            <template #default="{ row }">
              <CrossWorldPriceDetail
                :data="crossWorldData.get(row.itemId)"
                :loading="crossWorldLoading.has(row.itemId)"
              />
            </template>
          </el-table-column>
          <el-table-column label="圖示" width="50" align="center">
            <template #default="{ row }">
              <img :src="row.icon" :alt="row.name" crossorigin="anonymous" style="width: 24px; height: 24px" />
            </template>
          </el-table-column>
          <el-table-column label="名稱">
            <template #default="{ row }">
              <ItemName :item-id="row.itemId" :fallback="row.name" />
            </template>
          </el-table-column>
          <el-table-column label="需求數量" width="100" align="center">
            <template #default="{ row }">
              {{ row.totalAmount }}
            </template>
          </el-table-column>
          <el-table-column label="NQ 最低" width="110" align="right">
            <template #default="{ row }">
              {{ getNqPrice(row.itemId) > 0 ? formatGil(getNqPrice(row.itemId)) : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="HQ 最低" width="110" align="right">
            <template #default="{ row }">
              <span class="hq-price">{{ getHqPrice(row.itemId) > 0 ? formatGil(getHqPrice(row.itemId)) : '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="直購成本" width="120" align="right">
            <template #default="{ row }">
              {{ formatGil(getTotalPrice(row.itemId, row.totalAmount)) }}
            </template>
          </el-table-column>
          <el-table-column label="材料成本" width="120" align="right">
            <template #default="{ row }">
              <template v-if="decisionsMap.get(row.itemId)">
                {{ formatGil(decisionsMap.get(row.itemId)!.craftCost) }}
              </template>
              <template v-else>-</template>
            </template>
          </el-table-column>
          <el-table-column label="建議" width="120" align="center">
            <template #default="{ row }">
              <template v-if="decisionsMap.get(row.itemId)">
                <el-tag
                  :type="decisionsMap.get(row.itemId)!.recommendation === 'craft' ? 'success' : 'warning'"
                  size="small"
                >
                  {{ decisionsMap.get(row.itemId)!.recommendation === 'craft' ? '自製較省' : '直購較省' }}
                </el-tag>
              </template>
            </template>
          </el-table-column>
        </el-table>

        <div class="subtotal">
          半成品小計：<strong>{{ formatGil(craftTotalCost) }}</strong> Gil
        </div>
      </template>

      <!-- Grand total -->
      <el-divider />
      <div class="grand-total">
        最優製作成本：<strong>{{ formatGil(grandTotal) }}</strong> Gil
      </div>

      <!-- Buy vs Craft comparison -->
      <template v-if="targetMaterials.length > 0 && targetBuyPrice > 0">
        <div class="buy-compare">
          <div class="buy-compare-row">
            <span>直接購買：</span>
            <span>
              <template v-for="(m, i) in targetMaterials" :key="m.itemId">
                <template v-if="i > 0">、</template>
                <ItemName :item-id="m.itemId" :fallback="m.name" />
                <template v-if="m.totalAmount > 1"> ×{{ m.totalAmount }}</template>
              </template>
              = <strong>{{ formatGil(targetBuyPrice) }}</strong> Gil
            </span>
          </div>
          <div class="buy-compare-verdict">
            <el-tag v-if="craftSaving > 0" type="success" size="small">
              自製省 {{ formatGil(craftSaving) }} Gil
            </el-tag>
            <el-tag v-else-if="craftSaving < 0" type="warning" size="small">
              直接購買省 {{ formatGil(-craftSaving) }} Gil
            </el-tag>
            <el-tag v-else type="info" size="small">
              費用相同
            </el-tag>
          </div>
        </div>
      </template>
    </template>
  </el-card>
</template>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}


.subtotal {
  margin-top: 8px;
  text-align: right;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.grand-total {
  text-align: right;
  font-size: 18px;
  color: var(--el-color-primary);
}

.hq-price {
  color: #e6a23c;
}

.buy-compare {
  margin-top: 12px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

.buy-compare-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.buy-compare-verdict {
  margin-top: 8px;
  text-align: right;
}
</style>

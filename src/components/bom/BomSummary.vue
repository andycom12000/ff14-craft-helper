<script setup lang="ts">
import { computed } from 'vue'
import type { FlatMaterial, PriceInfo } from '@/stores/bom'
import { useSettingsStore } from '@/stores/settings'
import { getPrice } from '@/stores/bom'

const props = defineProps<{
  materials: FlatMaterial[]
  prices: Map<number, PriceInfo>
}>()

const emit = defineEmits<{
  'refresh-prices': []
}>()

const settingsStore = useSettingsStore()

const rawMaterials = computed(() =>
  props.materials.filter((m) => m.isRaw),
)

const craftableMaterials = computed(() =>
  props.materials.filter((m) => !m.isRaw),
)

function getUnitPrice(itemId: number): number {
  const priceInfo = props.prices.get(itemId)
  if (!priceInfo) return 0
  return getPrice(priceInfo, settingsStore.priceDisplayMode)
}

function getTotalPrice(itemId: number, amount: number): number {
  return getUnitPrice(itemId) * amount
}

function formatGil(value: number): string {
  return value.toLocaleString()
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

const grandTotal = computed(() => rawTotalCost.value + craftTotalCost.value)
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
      <el-table :data="rawMaterials" border style="width: 100%" size="small">
        <el-table-column label="圖示" width="50" align="center">
          <template #default="{ row }">
            <img :src="row.icon" :alt="row.name" style="width: 24px; height: 24px" />
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名稱" />
        <el-table-column label="需求數量" width="100" align="center">
          <template #default="{ row }">
            {{ row.totalAmount }}
          </template>
        </el-table-column>
        <el-table-column label="單價" width="120" align="right">
          <template #default="{ row }">
            {{ formatGil(getUnitPrice(row.itemId)) }}
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
        <el-table :data="craftableMaterials" border style="width: 100%" size="small">
          <el-table-column label="圖示" width="50" align="center">
            <template #default="{ row }">
              <img :src="row.icon" :alt="row.name" style="width: 24px; height: 24px" />
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名稱" />
          <el-table-column label="需求數量" width="100" align="center">
            <template #default="{ row }">
              {{ row.totalAmount }}
            </template>
          </el-table-column>
          <el-table-column label="單價" width="120" align="right">
            <template #default="{ row }">
              {{ formatGil(getUnitPrice(row.itemId)) }}
            </template>
          </el-table-column>
          <el-table-column label="小計" width="120" align="right">
            <template #default="{ row }">
              {{ formatGil(getTotalPrice(row.itemId, row.totalAmount)) }}
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
        總成本：<strong>{{ formatGil(grandTotal) }}</strong> Gil
      </div>
    </template>
  </el-card>
</template>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
}

.section-title {
  margin: 16px 0 8px;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.section-title:first-of-type {
  margin-top: 0;
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
</style>

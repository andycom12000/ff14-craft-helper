<script setup lang="ts">
import type { WorldPriceSummary } from '@/api/universalis'
import { useSettingsStore } from '@/stores/settings'
import { formatGil, formatTimeAgo } from '@/utils/format'

withDefaults(defineProps<{
  data: WorldPriceSummary[] | undefined
  loading?: boolean
  showListingCount?: boolean
  showAvgPrice?: boolean
  border?: boolean
}>(), {
  loading: false,
})

const settingsStore = useSettingsStore()
</script>

<template>
  <div v-if="loading" style="padding: 12px; text-align: center">
    <el-skeleton :rows="2" animated />
  </div>
  <el-table v-else-if="data" :data="data" size="small" :border="border" style="margin: 8px 0">
    <el-table-column prop="worldName" label="伺服器" width="120">
      <template #default="{ row: world }">
        <span :style="{ fontWeight: world.worldName === settingsStore.server ? 'bold' : 'normal' }">
          {{ world.worldName }}
          <el-tag v-if="world.worldName === settingsStore.server" size="small" type="primary" style="margin-left: 4px">你</el-tag>
        </span>
      </template>
    </el-table-column>
    <el-table-column label="NQ 最低" width="100" align="right">
      <template #default="{ row: world, $index }">
        <span :style="{ color: $index === 0 && world.minPriceNQ > 0 ? '#67c23a' : '' }">
          {{ world.minPriceNQ > 0 ? formatGil(world.minPriceNQ) : '-' }}
        </span>
      </template>
    </el-table-column>
    <el-table-column label="HQ 最低" width="100" align="right">
      <template #default="{ row: world }">
        {{ world.minPriceHQ > 0 ? formatGil(world.minPriceHQ) : '-' }}
      </template>
    </el-table-column>
    <el-table-column v-if="showAvgPrice" label="NQ 平均" width="100" align="right">
      <template #default="{ row: world }">
        {{ world.avgPriceNQ > 0 ? formatGil(world.avgPriceNQ) : '-' }}
      </template>
    </el-table-column>
    <el-table-column v-if="showAvgPrice" label="HQ 平均" width="100" align="right">
      <template #default="{ row: world }">
        {{ world.avgPriceHQ > 0 ? formatGil(world.avgPriceHQ) : '-' }}
      </template>
    </el-table-column>
    <el-table-column v-if="showListingCount" label="數量" prop="listingCount" width="60" align="center" />
    <el-table-column label="更新時間" min-width="100" align="center">
      <template #default="{ row: world }">
        {{ formatTimeAgo(world.lastUploadTime) }}
      </template>
    </el-table-column>
  </el-table>
  <el-empty v-else description="無資料" :image-size="40" />
</template>

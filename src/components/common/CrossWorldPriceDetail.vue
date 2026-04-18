<script setup lang="ts">
import type { WorldPriceSummary } from '@/api/universalis'
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { formatGil, formatTimeAgo } from '@/utils/format'

const props = withDefaults(defineProps<{
  data: WorldPriceSummary[] | undefined
  loading?: boolean
  showListingCount?: boolean
  showAvgPrice?: boolean
  border?: boolean
  /** Compact chip-list form for nested use (inside table expand rows). Table form stays for standalone pages like MarketView. */
  compact?: boolean
}>(), {
  loading: false,
  compact: true,
})

const settingsStore = useSettingsStore()

const useTable = computed(() => !props.compact || props.showAvgPrice)

function isHome(world: string) {
  return world === settingsStore.server
}
</script>

<template>
  <div v-if="loading" class="cwp-state" aria-busy="true">
    <el-skeleton :rows="2" animated />
  </div>
  <el-empty v-else-if="!data || data.length === 0" description="此素材暫無跨伺服器價格" :image-size="40" />

  <!-- Table form: MarketView / standalone -->
  <el-table v-else-if="useTable" :data="data" size="small" :border="border" style="margin: 8px 0">
    <el-table-column prop="worldName" label="伺服器" width="120">
      <template #default="{ row: world }">
        <span :style="{ fontWeight: isHome(world.worldName) ? 'bold' : 'normal' }">
          {{ world.worldName }}
          <el-tag v-if="isHome(world.worldName)" size="small" type="primary" style="margin-left: 4px">你</el-tag>
        </span>
      </template>
    </el-table-column>
    <el-table-column label="NQ 最低" width="100" align="right">
      <template #default="{ row: world, $index }">
        <span :style="{ color: $index === 0 && world.minPriceNQ > 0 ? 'var(--app-success)' : '' }">
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

  <!-- Compact chip list: nested use -->
  <ul v-else class="cwp-list" role="list">
    <li
      v-for="(world, idx) in data"
      :key="world.worldName"
      class="cwp-row"
      :class="{ 'cwp-row--home': isHome(world.worldName), 'cwp-row--best': idx === 0 && world.minPriceNQ > 0 }"
    >
      <span class="cwp-world">
        {{ world.worldName }}
        <span v-if="isHome(world.worldName)" class="cwp-you">你</span>
      </span>
      <span class="cwp-prices">
        <span class="cwp-price">
          <span class="cwp-quality">NQ</span>
          <span class="cwp-value">{{ world.minPriceNQ > 0 ? formatGil(world.minPriceNQ) : '—' }}</span>
        </span>
        <span class="cwp-price">
          <span class="cwp-quality cwp-quality--hq">HQ</span>
          <span class="cwp-value">{{ world.minPriceHQ > 0 ? formatGil(world.minPriceHQ) : '—' }}</span>
        </span>
      </span>
      <span v-if="showListingCount" class="cwp-listings">{{ world.listingCount }} 件</span>
      <time class="cwp-updated" :datetime="new Date(world.lastUploadTime).toISOString()">{{ formatTimeAgo(world.lastUploadTime) }}</time>
    </li>
  </ul>
</template>

<style scoped>
.cwp-state {
  padding: 10px 12px;
}

.cwp-list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: grid;
  gap: 2px;
}

.cwp-row {
  display: grid;
  grid-template-columns: minmax(80px, 1fr) auto auto auto;
  align-items: center;
  gap: 12px;
  padding: 6px 10px;
  border-radius: 5px;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
}

.cwp-row:hover {
  background: var(--el-fill-color-light);
}

.cwp-row--best {
  background: color-mix(in oklch, var(--app-success) 10%, transparent);
}

.cwp-row--home .cwp-world {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.cwp-world {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cwp-you {
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary-light-3);
  letter-spacing: 0.04em;
}

.cwp-prices {
  display: inline-flex;
  gap: 14px;
  font-variant-numeric: tabular-nums;
}

.cwp-price {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}

.cwp-quality {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--el-text-color-secondary);
}

.cwp-quality--hq {
  color: var(--accent-gold);
}

.cwp-value {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.cwp-row--best .cwp-price:first-of-type .cwp-value {
  color: var(--app-success);
  font-weight: 600;
}

.cwp-listings {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  min-width: 44px;
  text-align: right;
}

.cwp-updated {
  font-size: 11.5px;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
}

@container (max-width: 480px) {
  .cwp-row {
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    gap: 4px 10px;
  }

  .cwp-prices {
    grid-column: 1 / -1;
    gap: 16px;
  }

  .cwp-updated {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
  }

  .cwp-listings {
    display: none;
  }
}
</style>

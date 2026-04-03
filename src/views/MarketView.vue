<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import { getMarketDataByDC, aggregateByWorld } from '@/api/universalis'
import CrossWorldPriceDetail from '@/components/common/CrossWorldPriceDetail.vue'
import AppEmptyState from '@/components/common/AppEmptyState.vue'
import { formatGil, formatTimeAgo } from '@/utils/format'
import type { MarketListing, WorldPriceSummary } from '@/api/universalis'

const settingsStore = useSettingsStore()

const searchQuery = ref('')
const searching = ref(false)
const searchResults = ref<Array<{ id: number; itemId: number; name: string; icon: string }>>([])

const selectedItem = ref<{ id: number; itemId: number; name: string; icon: string } | null>(null)
const loadingMarket = ref(false)
const worldPrices = ref<WorldPriceSummary[]>([])
const listings = ref<MarketListing[]>([])

async function handleSearch() {
  if (!searchQuery.value.trim()) return
  searching.value = true
  try {
    const { searchRecipes } = await import('@/api/xivapi')
    const results = await searchRecipes(searchQuery.value)
    searchResults.value = results.map(r => ({ id: r.id, itemId: r.itemId, name: r.name, icon: r.icon }))
  } catch {
    ElMessage.error('搜尋失敗')
  } finally {
    searching.value = false
  }
}

async function selectItem(item: { id: number; itemId: number; name: string; icon: string }) {
  selectedItem.value = item
  searchResults.value = []
  loadingMarket.value = true
  try {
    const data = await getMarketDataByDC(settingsStore.dataCenter, item.itemId)
    worldPrices.value = aggregateByWorld(data.listings)
    listings.value = data.listings.sort((a, b) => a.pricePerUnit - b.pricePerUnit).slice(0, 50)
  } catch {
    ElMessage.error('無法取得市場資料')
  } finally {
    loadingMarket.value = false
  }
}

</script>

<template>
  <div class="market-view">
    <h2>市場查價</h2>
    <p class="view-desc">
      查查看「{{ settingsStore.dataCenter }}」各伺服器現在賣多少。
    </p>

    <el-input
      v-model="searchQuery"
      placeholder="輸入物品名稱搜尋..."
      clearable
      @keyup.enter="handleSearch"
    >
      <template #append>
        <el-button :loading="searching" @click="handleSearch">搜尋</el-button>
      </template>
    </el-input>

    <el-card v-if="searchResults.length > 0" shadow="never" class="search-results">
      <div
        v-for="item in searchResults"
        :key="item.id"
        class="search-result-item"
        @click="selectItem(item)"
      >
        <img v-if="item.icon" :src="item.icon" class="result-icon" />
        <span>{{ item.name }}</span>
      </div>
    </el-card>

    <AppEmptyState
      v-if="!selectedItem && searchResults.length === 0"
      icon="🪙"
      title="查詢市場行情"
      description="輸入物品名稱，比較各伺服器的最新價格"
      style="margin-top: 48px;"
    />

    <template v-if="selectedItem">
      <div class="selected-item">
        <img v-if="selectedItem.icon" :src="selectedItem.icon" style="width: 32px; height: 32px" />
        <h3 style="margin: 0">{{ selectedItem.name }}</h3>
      </div>

      <el-skeleton v-if="loadingMarket" :rows="4" animated style="margin-top: 16px" />

      <template v-else>
        <el-card shadow="never" class="data-card">
          <template #header>
            <span class="card-title">各伺服器價格比較</span>
          </template>

          <CrossWorldPriceDetail
            :data="worldPrices"
            show-listing-count
            show-avg-price
            border
          />
        </el-card>

        <el-card shadow="never" class="data-card">
          <template #header>
            <span class="card-title">當前掛牌（最便宜 50 筆）</span>
          </template>

          <el-table :data="listings" border size="small" max-height="400">
            <el-table-column label="單價" width="120" align="right">
              <template #default="{ row }">
                {{ formatGil(row.pricePerUnit) }}
              </template>
            </el-table-column>
            <el-table-column label="數量" width="80" align="center" prop="quantity" />
            <el-table-column label="總價" width="120" align="right">
              <template #default="{ row }">
                {{ formatGil(row.total) }}
              </template>
            </el-table-column>
            <el-table-column label="品質" width="60" align="center">
              <template #default="{ row }">
                <el-tag :type="row.hq ? 'warning' : 'info'" size="small">
                  {{ row.hq ? 'HQ' : 'NQ' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="伺服器" width="120" prop="worldName" />
            <el-table-column label="時間" width="100" align="center">
              <template #default="{ row }">
                {{ formatTimeAgo(row.lastReviewTime) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </template>
    </template>
  </div>
</template>

<style scoped>
.market-view { --page-accent: var(--app-market); --page-accent-dim: var(--app-market-dim); }

.market-view {
  max-width: 960px;
}

.search-results {
  margin-top: 12px;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 8px;
  transition: background-color 0.2s ease;
}

.search-result-item:hover {
  background-color: var(--app-surface-hover);
}

.result-icon {
  width: 24px;
  height: 24px;
}

.selected-item {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
}

.data-card {
  margin-top: 16px;
}

@media (max-width: 768px) {
  .data-card :deep(.el-table) {
    font-size: 12px;
  }
}
</style>

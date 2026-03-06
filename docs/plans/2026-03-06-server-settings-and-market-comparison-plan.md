# 伺服器設定與跨服比價 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 讓使用者可以選擇所在伺服器（預設繁中服），並在材料清單和獨立頁面中比較各伺服器物價。

**Architecture:** 擴充 settings store 加入 region/DC/server/priceDisplayMode，新增設定頁面和市場查價頁面，擴充 BomSummary 加入跨服展開比價，擴充 Universalis API 支援 DC 級查詢。

**Tech Stack:** Vue 3, Element Plus, Pinia (persisted), Universalis API, XIVAPI (yyyy.games)

---

### Task 1: 擴充 Settings Store

**Files:**
- Modify: `src/stores/settings.ts`

**Step 1: 更新 settings store**

將預設值改為繁中服，新增 region 和 priceDisplayMode：

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type PriceDisplayMode = 'nq' | 'hq' | 'minOf'

export const useSettingsStore = defineStore('settings', () => {
  const server = ref('巴哈姆特')
  const dataCenter = ref('陸行鳥')
  const region = ref('繁中服')
  const language = ref('zh')
  const priceDisplayMode = ref<PriceDisplayMode>('nq')

  return { server, dataCenter, region, language, priceDisplayMode }
}, {
  persist: true,
})
```

**Step 2: 確認 dev server 仍正常啟動**

Run: `npm run dev`
Expected: 正常編譯無報錯

**Step 3: Commit**

```bash
git add src/stores/settings.ts
git commit -m "feat: update settings store defaults to TW server and add price display mode"
```

---

### Task 2: 擴充 Universalis API

**Files:**
- Modify: `src/api/universalis.ts`

**Step 1: 新增 DC 級市場查詢和跨服比價的型別與函式**

在現有檔案末尾新增：

```ts
export interface WorldPriceSummary {
  worldName: string
  minPriceNQ: number
  minPriceHQ: number
  avgPriceNQ: number
  avgPriceHQ: number
  lastUploadTime: number
  listingCount: number
}

export function getMarketDataByDC(
  dcName: string,
  itemId: number
): Promise<MarketData> {
  return fetchUniversalis(`${encodeURIComponent(dcName)}/${itemId}`)
}

export function aggregateByWorld(listings: MarketListing[]): WorldPriceSummary[] {
  const worldMap = new Map<string, MarketListing[]>()

  for (const listing of listings) {
    const world = listing.worldName ?? 'Unknown'
    if (!worldMap.has(world)) worldMap.set(world, [])
    worldMap.get(world)!.push(listing)
  }

  return Array.from(worldMap.entries()).map(([worldName, worldListings]) => {
    const nqListings = worldListings.filter(l => !l.hq)
    const hqListings = worldListings.filter(l => l.hq)

    return {
      worldName,
      minPriceNQ: nqListings.length > 0 ? Math.min(...nqListings.map(l => l.pricePerUnit)) : 0,
      minPriceHQ: hqListings.length > 0 ? Math.min(...hqListings.map(l => l.pricePerUnit)) : 0,
      avgPriceNQ: nqListings.length > 0
        ? Math.round(nqListings.reduce((s, l) => s + l.pricePerUnit, 0) / nqListings.length)
        : 0,
      avgPriceHQ: hqListings.length > 0
        ? Math.round(hqListings.reduce((s, l) => s + l.pricePerUnit, 0) / hqListings.length)
        : 0,
      lastUploadTime: Math.max(...worldListings.map(l => l.lastReviewTime)),
      listingCount: worldListings.length,
    }
  }).sort((a, b) => {
    const priceA = a.minPriceNQ || Infinity
    const priceB = b.minPriceNQ || Infinity
    return priceA - priceB
  })
}
```

**Step 2: 確認編譯**

Run: `npm run dev`
Expected: 正常編譯

**Step 3: Commit**

```bash
git add src/api/universalis.ts
git commit -m "feat: add DC-level market query and world price aggregation"
```

---

### Task 3: 新增設定頁面

**Files:**
- Create: `src/views/SettingsView.vue`
- Modify: `src/router/index.ts`
- Modify: `src/App.vue`

**Step 1: 建立 SettingsView.vue**

```vue
<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import { getDataCenters, getWorlds } from '@/api/universalis'
import type { DataCenter, World } from '@/api/universalis'

const settingsStore = useSettingsStore()

const dataCenters = ref<DataCenter[]>([])
const worlds = ref<World[]>([])
const loading = ref(false)

// Group DCs by region
interface RegionGroup {
  region: string
  dataCenters: (DataCenter & { worldDetails: World[] })[]
}
const regionGroups = ref<RegionGroup[]>([])

onMounted(async () => {
  loading.value = true
  try {
    const [dcList, worldList] = await Promise.all([
      getDataCenters(),
      getWorlds(),
    ])
    dataCenters.value = dcList
    worlds.value = worldList

    // Build region groups
    const regionMap = new Map<string, (DataCenter & { worldDetails: World[] })[]>()
    for (const dc of dcList) {
      const region = dc.region || 'Other'
      if (!regionMap.has(region)) regionMap.set(region, [])
      const worldDetails = dc.worlds
        .map(wId => worldList.find(w => w.id === wId))
        .filter((w): w is World => !!w)
      regionMap.get(region)!.push({ ...dc, worldDetails })
    }
    regionGroups.value = Array.from(regionMap.entries()).map(([region, dcs]) => ({
      region,
      dataCenters: dcs,
    }))
  } catch {
    ElMessage.error('無法載入伺服器清單')
  } finally {
    loading.value = false
  }
})

const selectedRegion = ref(settingsStore.region)
const selectedDC = ref(settingsStore.dataCenter)
const selectedServer = ref(settingsStore.server)
const selectedPriceMode = ref(settingsStore.priceDisplayMode)

const availableDCs = ref<(DataCenter & { worldDetails: World[] })[]>([])
const availableWorlds = ref<World[]>([])

watch(selectedRegion, (newRegion) => {
  const group = regionGroups.value.find(g => g.region === newRegion)
  availableDCs.value = group?.dataCenters ?? []
  if (availableDCs.value.length > 0 && !availableDCs.value.find(dc => dc.name === selectedDC.value)) {
    selectedDC.value = availableDCs.value[0].name
  }
})

watch(selectedDC, (newDC) => {
  const dc = availableDCs.value.find(d => d.name === newDC)
  availableWorlds.value = dc?.worldDetails ?? []
  if (availableWorlds.value.length > 0 && !availableWorlds.value.find(w => w.name === selectedServer.value)) {
    selectedServer.value = availableWorlds.value[0].name
  }
})

watch(regionGroups, () => {
  // Trigger chain after data loads
  const group = regionGroups.value.find(g => g.region === selectedRegion.value)
  availableDCs.value = group?.dataCenters ?? []
  const dc = availableDCs.value.find(d => d.name === selectedDC.value)
  availableWorlds.value = dc?.worldDetails ?? []
})

function saveSettings() {
  settingsStore.region = selectedRegion.value
  settingsStore.dataCenter = selectedDC.value
  settingsStore.server = selectedServer.value
  settingsStore.priceDisplayMode = selectedPriceMode.value
  ElMessage.success('設定已儲存')
}
</script>

<template>
  <div class="settings-view">
    <h2>設定</h2>

    <el-skeleton v-if="loading" :rows="6" animated />

    <template v-else>
      <el-card shadow="never">
        <template #header>
          <span class="card-title">伺服器設定</span>
        </template>

        <el-form label-width="120px" label-position="left">
          <el-form-item label="地區">
            <el-select v-model="selectedRegion" placeholder="選擇地區">
              <el-option
                v-for="group in regionGroups"
                :key="group.region"
                :label="group.region"
                :value="group.region"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="資料中心">
            <el-select v-model="selectedDC" placeholder="選擇資料中心">
              <el-option
                v-for="dc in availableDCs"
                :key="dc.name"
                :label="dc.name"
                :value="dc.name"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="伺服器">
            <el-select v-model="selectedServer" placeholder="選擇伺服器">
              <el-option
                v-for="world in availableWorlds"
                :key="world.id"
                :label="world.name"
                :value="world.name"
              />
            </el-select>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never" style="margin-top: 20px">
        <template #header>
          <span class="card-title">價格偏好</span>
        </template>

        <el-form label-width="120px" label-position="left">
          <el-form-item label="價格顯示">
            <el-radio-group v-model="selectedPriceMode">
              <el-radio value="nq">NQ 最低價</el-radio>
              <el-radio value="hq">HQ 最低價</el-radio>
              <el-radio value="minOf">NQ / HQ 取較低者</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </el-card>

      <div style="margin-top: 20px; text-align: right">
        <el-button type="primary" @click="saveSettings">儲存設定</el-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.settings-view {
  padding: 20px;
  max-width: 720px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
}
</style>
```

**Step 2: 新增路由**

在 `src/router/index.ts` 的 routes 陣列末尾新增：

```ts
{
  path: '/settings',
  name: 'settings',
  component: () => import('@/views/SettingsView.vue'),
},
```

**Step 3: 更新側邊欄導航**

在 `src/App.vue` 的 `<el-menu>` 中，在材料清單 menu-item 後新增市場查價（Task 6 會建立頁面）和設定：

```vue
<!-- 在 /bom menu-item 之後新增 -->
<el-menu-item index="/market">
  <el-icon><TrendCharts /></el-icon>
  <span>市場查價</span>
</el-menu-item>
<el-divider style="margin: 8px 16px; border-color: rgba(255,255,255,0.1)" />
<el-menu-item index="/settings">
  <el-icon><Setting /></el-icon>
  <span>設定</span>
</el-menu-item>
```

同時更新 script 中的 import：
- 把 `Setting` 從圖示 import 清單中保留
- 新增 `TrendCharts` import：`import { Setting, Search, Cpu, List, TrendCharts } from '@element-plus/icons-vue'`
- 把原本「配裝管理」的 `<Setting />` 改成其他圖示（如 `<List />` 等），避免與底部「設定」圖示重複

**Step 4: 確認 dev server 載入設定頁**

Run: `npm run dev`
Navigate to: `/#/settings`
Expected: 可以看到伺服器選擇和價格偏好設定

**Step 5: Commit**

```bash
git add src/views/SettingsView.vue src/router/index.ts src/App.vue
git commit -m "feat: add settings page with server selection and price preference"
```

---

### Task 4: 更新 BOM Store 和 BomView 使用 priceDisplayMode

**Files:**
- Modify: `src/stores/bom.ts`
- Modify: `src/views/BomView.vue`
- Modify: `src/components/bom/BomSummary.vue`

**Step 1: 更新 bom store 的 totalCost 計算**

在 `src/stores/bom.ts` 中：
- Import `useSettingsStore`
- 修改 `totalCost` computed 使用 priceDisplayMode：

```ts
import { useSettingsStore } from '@/stores/settings'
import type { PriceDisplayMode } from '@/stores/settings'

// 在 useBomStore 內新增 helper
function getPrice(price: PriceInfo, mode: PriceDisplayMode): number {
  switch (mode) {
    case 'hq': return price.hqMinPrice
    case 'minOf': {
      const nq = price.minPrice || Infinity
      const hq = price.hqMinPrice || Infinity
      const min = Math.min(nq, hq)
      return min === Infinity ? 0 : min
    }
    default: return price.minPrice
  }
}

// 修改 totalCost
const totalCost = computed(() => {
  const settings = useSettingsStore()
  let total = 0
  for (const mat of flatMaterials.value) {
    const price = prices.value.get(mat.itemId)
    if (price) {
      total += getPrice(price, settings.priceDisplayMode) * mat.totalAmount
    }
  }
  return total
})
```

同時 export `getPrice` function。

**Step 2: 更新 BomSummary 使用 priceDisplayMode**

在 `src/components/bom/BomSummary.vue` 中：
- Import `useSettingsStore` 和 `getPrice`
- 修改 `getUnitPrice` 使用 `getPrice(priceInfo, settingsStore.priceDisplayMode)`

```ts
import { useSettingsStore } from '@/stores/settings'
import { getPrice } from '@/stores/bom'

const settingsStore = useSettingsStore()

function getUnitPrice(itemId: number): number {
  const priceInfo = props.prices.get(itemId)
  if (!priceInfo) return 0
  return getPrice(priceInfo, settingsStore.priceDisplayMode)
}
```

- 在表頭新增伺服器名稱提示：

```vue
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
```

**Step 3: 確認價格顯示正確**

Run: `npm run dev`
Expected: BomSummary 表頭顯示伺服器名稱，價格根據設定顯示

**Step 4: Commit**

```bash
git add src/stores/bom.ts src/views/BomView.vue src/components/bom/BomSummary.vue
git commit -m "feat: use price display mode setting in BOM calculations"
```

---

### Task 5: BomSummary 跨服展開比價

**Files:**
- Modify: `src/components/bom/BomSummary.vue`

**Step 1: 新增展開列的跨服比價功能**

在 BomSummary.vue 中：

- 新增 state 追蹤每個物品的跨服資料：

```ts
import { ref } from 'vue'
import { getMarketDataByDC, aggregateByWorld } from '@/api/universalis'
import type { WorldPriceSummary } from '@/api/universalis'

const crossWorldData = ref<Map<number, WorldPriceSummary[]>>(new Map())
const crossWorldLoading = ref<Set<number>>(new Set())

async function handleExpand(row: FlatMaterial, expanded: boolean) {
  if (!expanded) return
  if (crossWorldData.value.has(row.itemId)) return

  crossWorldLoading.value.add(row.itemId)
  try {
    const data = await getMarketDataByDC(settingsStore.dataCenter, row.itemId)
    const summary = aggregateByWorld(data.listings)
    crossWorldData.value.set(row.itemId, summary)
  } catch {
    ElMessage.error(`無法取得 ${row.name} 的跨服價格`)
  } finally {
    crossWorldLoading.value.delete(row.itemId)
  }
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp * 1000
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小時前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}
```

- 在 el-table 加上 expand type column 和展開內容：

```vue
<el-table
  :data="rawMaterials"
  border
  style="width: 100%"
  size="small"
  @expand-change="(row, expanded) => handleExpand(row, expanded.length > 0)"
>
  <el-table-column type="expand">
    <template #default="{ row }">
      <div v-if="crossWorldLoading.has(row.itemId)" style="padding: 12px; text-align: center">
        <el-skeleton :rows="2" animated />
      </div>
      <el-table
        v-else-if="crossWorldData.get(row.itemId)"
        :data="crossWorldData.get(row.itemId)"
        size="small"
        style="margin: 8px 0"
      >
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
        <el-table-column label="更新時間" width="120" align="center">
          <template #default="{ row: world }">
            {{ formatTimeAgo(world.lastUploadTime) }}
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="無資料" :image-size="40" />
    </template>
  </el-table-column>
  <!-- ... 其餘原有欄位 ... -->
</el-table>
```

半成品表格也同樣加上展開功能。

**Step 2: 確認展開比價正常運作**

Run: `npm run dev`
Expected: 在材料清單中展開某個材料，看到同 DC 各伺服器價格

**Step 3: Commit**

```bash
git add src/components/bom/BomSummary.vue
git commit -m "feat: add cross-world price comparison in BOM summary expand rows"
```

---

### Task 6: 獨立市場查價頁面

**Files:**
- Create: `src/views/MarketView.vue`
- Modify: `src/router/index.ts`

**Step 1: 建立 MarketView.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import { getMarketDataByDC, aggregateByWorld } from '@/api/universalis'
import type { MarketListing, WorldPriceSummary } from '@/api/universalis'

const settingsStore = useSettingsStore()

const searchQuery = ref('')
const searching = ref(false)
const searchResults = ref<Array<{ id: number; name: string; icon: string }>>([])

const selectedItem = ref<{ id: number; name: string; icon: string } | null>(null)
const loadingMarket = ref(false)
const worldPrices = ref<WorldPriceSummary[]>([])
const listings = ref<MarketListing[]>([])

async function handleSearch() {
  if (!searchQuery.value.trim()) return
  searching.value = true
  try {
    // 使用現有的 XIVAPI 搜尋（搜尋 item，非 recipe）
    const { searchRecipes } = await import('@/api/xivapi')
    const results = await searchRecipes(searchQuery.value)
    searchResults.value = results.map(r => ({ id: r.id, name: r.name, icon: r.icon }))
  } catch {
    ElMessage.error('搜尋失敗')
  } finally {
    searching.value = false
  }
}

async function selectItem(item: { id: number; name: string; icon: string }) {
  selectedItem.value = item
  searchResults.value = []
  loadingMarket.value = true
  try {
    const data = await getMarketDataByDC(settingsStore.dataCenter, item.id)
    worldPrices.value = aggregateByWorld(data.listings)
    listings.value = data.listings.sort((a, b) => a.pricePerUnit - b.pricePerUnit).slice(0, 50)
  } catch {
    ElMessage.error('無法取得市場資料')
  } finally {
    loadingMarket.value = false
  }
}

function formatGil(value: number): string {
  return value.toLocaleString()
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp * 1000
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小時前`
  return `${Math.floor(hours / 24)} 天前`
}
</script>

<template>
  <div class="market-view">
    <h2>市場查價</h2>
    <p class="view-desc">
      搜尋物品，比較「{{ settingsStore.dataCenter }}」資料中心各伺服器的價格。
    </p>

    <!-- Search -->
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

    <!-- Search results -->
    <el-card v-if="searchResults.length > 0" shadow="never" style="margin-top: 12px">
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

    <!-- Selected item market data -->
    <template v-if="selectedItem">
      <div class="selected-item" style="margin-top: 20px">
        <img v-if="selectedItem.icon" :src="selectedItem.icon" style="width: 32px; height: 32px" />
        <h3 style="margin: 0">{{ selectedItem.name }}</h3>
      </div>

      <el-skeleton v-if="loadingMarket" :rows="4" animated style="margin-top: 16px" />

      <template v-else>
        <!-- Cross-world price table -->
        <el-card shadow="never" style="margin-top: 16px">
          <template #header>
            <span class="card-title">各伺服器價格比較</span>
          </template>

          <el-table :data="worldPrices" border size="small">
            <el-table-column prop="worldName" label="伺服器" width="140">
              <template #default="{ row }">
                <span :style="{ fontWeight: row.worldName === settingsStore.server ? 'bold' : 'normal' }">
                  {{ row.worldName }}
                  <el-tag v-if="row.worldName === settingsStore.server" size="small" type="primary">你</el-tag>
                </span>
              </template>
            </el-table-column>
            <el-table-column label="NQ 最低" width="120" align="right">
              <template #default="{ row, $index }">
                <span :style="{ color: $index === 0 && row.minPriceNQ > 0 ? '#67c23a' : '' }">
                  {{ row.minPriceNQ > 0 ? formatGil(row.minPriceNQ) : '-' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="HQ 最低" width="120" align="right">
              <template #default="{ row }">
                {{ row.minPriceHQ > 0 ? formatGil(row.minPriceHQ) : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="NQ 平均" width="120" align="right">
              <template #default="{ row }">
                {{ row.avgPriceNQ > 0 ? formatGil(row.avgPriceNQ) : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="HQ 平均" width="120" align="right">
              <template #default="{ row }">
                {{ row.avgPriceHQ > 0 ? formatGil(row.avgPriceHQ) : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="掛牌數" width="80" align="center" prop="listingCount" />
            <el-table-column label="更新" width="100" align="center">
              <template #default="{ row }">
                {{ formatTimeAgo(row.lastUploadTime) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- Listings -->
        <el-card shadow="never" style="margin-top: 16px">
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
.market-view {
  padding: 20px;
  max-width: 960px;
}

.view-desc {
  color: var(--el-text-color-secondary);
  margin-bottom: 20px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  cursor: pointer;
  border-radius: 4px;
}

.search-result-item:hover {
  background-color: var(--el-fill-color-light);
}

.result-icon {
  width: 24px;
  height: 24px;
}

.selected-item {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
```

**Step 2: 新增路由**

在 `src/router/index.ts` 中新增（在 `/bom` 路由之後）：

```ts
{
  path: '/market',
  name: 'market',
  component: () => import('@/views/MarketView.vue'),
},
```

**Step 3: 確認市場查價頁正常**

Run: `npm run dev`
Navigate to: `/#/market`
Expected: 可以搜尋物品並看到跨服比價

**Step 4: Commit**

```bash
git add src/views/MarketView.vue src/router/index.ts
git commit -m "feat: add market price comparison page with cross-world view"
```

---

### Task 7: 設定測試基礎設施

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/__tests__/setup.ts`

**Step 1: 安裝 Vitest 和相關依賴**

Run:
```bash
npm install -D vitest @vue/test-utils happy-dom
```

**Step 2: 建立 vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['src/__tests__/setup.ts'],
  },
})
```

**Step 3: 建立 test setup 檔案**

`src/__tests__/setup.ts`:
```ts
// Global test setup - mock fetch by default
import { vi } from 'vitest'

// Provide a global fetch mock that tests can override
globalThis.fetch = vi.fn()
```

**Step 4: 在 package.json 新增 test script**

在 `"scripts"` 中新增：
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 5: 確認 vitest 能跑**

Run: `npx vitest run`
Expected: 顯示 "No test files found"（正常，尚未寫測試）

**Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/__tests__/setup.ts
git commit -m "chore: add vitest testing infrastructure"
```

---

### Task 8: 測試 — Universalis API 層

**Files:**
- Create: `src/__tests__/api/universalis.test.ts`

**Step 1: 撰寫 aggregateByWorld 單元測試**

```ts
import { describe, it, expect } from 'vitest'
import { aggregateByWorld } from '@/api/universalis'
import type { MarketListing } from '@/api/universalis'

function makeListing(overrides: Partial<MarketListing>): MarketListing {
  return {
    pricePerUnit: 100,
    quantity: 1,
    total: 100,
    hq: false,
    worldName: '巴哈姆特',
    lastReviewTime: 1700000000,
    ...overrides,
  }
}

describe('aggregateByWorld', () => {
  it('groups listings by world and computes min/avg prices', () => {
    const listings: MarketListing[] = [
      makeListing({ pricePerUnit: 500, worldName: '巴哈姆特', hq: false }),
      makeListing({ pricePerUnit: 600, worldName: '巴哈姆特', hq: false }),
      makeListing({ pricePerUnit: 800, worldName: '巴哈姆特', hq: true }),
      makeListing({ pricePerUnit: 400, worldName: '伊弗利特', hq: false }),
    ]

    const result = aggregateByWorld(listings)

    expect(result).toHaveLength(2)
    // Sorted by NQ min price ascending — 伊弗利特 (400) first
    expect(result[0].worldName).toBe('伊弗利特')
    expect(result[0].minPriceNQ).toBe(400)

    expect(result[1].worldName).toBe('巴哈姆特')
    expect(result[1].minPriceNQ).toBe(500)
    expect(result[1].avgPriceNQ).toBe(550)
    expect(result[1].minPriceHQ).toBe(800)
  })

  it('returns empty array for empty listings', () => {
    expect(aggregateByWorld([])).toEqual([])
  })

  it('handles world with only HQ listings', () => {
    const listings: MarketListing[] = [
      makeListing({ pricePerUnit: 900, worldName: '鳳凰', hq: true }),
    ]

    const result = aggregateByWorld(listings)

    expect(result).toHaveLength(1)
    expect(result[0].minPriceNQ).toBe(0)
    expect(result[0].minPriceHQ).toBe(900)
  })
})
```

**Step 2: 跑測試確認通過**

Run: `npx vitest run src/__tests__/api/universalis.test.ts`
Expected: 3 tests PASS

**Step 3: Commit**

```bash
git add src/__tests__/api/universalis.test.ts
git commit -m "test: add aggregateByWorld unit tests"
```

---

### Task 9: 測試 — Settings Store

**Files:**
- Create: `src/__tests__/stores/settings.test.ts`

**Step 1: 撰寫 settings store 測試**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '@/stores/settings'

describe('useSettingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('has correct TW server defaults', () => {
    const store = useSettingsStore()

    expect(store.server).toBe('巴哈姆特')
    expect(store.dataCenter).toBe('陸行鳥')
    expect(store.region).toBe('繁中服')
  })

  it('defaults priceDisplayMode to nq', () => {
    const store = useSettingsStore()

    expect(store.priceDisplayMode).toBe('nq')
  })

  it('allows updating all settings', () => {
    const store = useSettingsStore()

    store.server = '伊弗利特'
    store.dataCenter = '陸行鳥'
    store.region = '繁中服'
    store.priceDisplayMode = 'hq'

    expect(store.server).toBe('伊弗利特')
    expect(store.priceDisplayMode).toBe('hq')
  })
})
```

**Step 2: 跑測試確認通過**

Run: `npx vitest run src/__tests__/stores/settings.test.ts`
Expected: 3 tests PASS

**Step 3: Commit**

```bash
git add src/__tests__/stores/settings.test.ts
git commit -m "test: add settings store unit tests"
```

---

### Task 10: 測試 — BOM Store getPrice 邏輯

**Files:**
- Create: `src/__tests__/stores/bom.test.ts`

**Step 1: 撰寫 getPrice 和 totalCost 測試**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useBomStore, getPrice } from '@/stores/bom'
import { useSettingsStore } from '@/stores/settings'
import type { PriceInfo } from '@/stores/bom'

const mockPrice: PriceInfo = {
  itemId: 1,
  minPrice: 500,
  avgPrice: 600,
  hqMinPrice: 800,
  hqAvgPrice: 900,
  lastUpdated: 1700000000,
}

describe('getPrice', () => {
  it('returns NQ min price for nq mode', () => {
    expect(getPrice(mockPrice, 'nq')).toBe(500)
  })

  it('returns HQ min price for hq mode', () => {
    expect(getPrice(mockPrice, 'hq')).toBe(800)
  })

  it('returns min of NQ and HQ for minOf mode', () => {
    expect(getPrice(mockPrice, 'minOf')).toBe(500)
  })

  it('minOf ignores zero values', () => {
    const priceNoNQ: PriceInfo = { ...mockPrice, minPrice: 0 }
    expect(getPrice(priceNoNQ, 'minOf')).toBe(800)

    const priceNoHQ: PriceInfo = { ...mockPrice, hqMinPrice: 0 }
    expect(getPrice(priceNoHQ, 'minOf')).toBe(500)
  })

  it('minOf returns 0 when both are zero', () => {
    const priceZero: PriceInfo = { ...mockPrice, minPrice: 0, hqMinPrice: 0 }
    expect(getPrice(priceZero, 'minOf')).toBe(0)
  })
})

describe('useBomStore.totalCost', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('computes total cost using priceDisplayMode', () => {
    const bomStore = useBomStore()
    const settingsStore = useSettingsStore()

    bomStore.flatMaterials = [
      { itemId: 1, name: 'A', icon: '', totalAmount: 10, isRaw: true },
      { itemId: 2, name: 'B', icon: '', totalAmount: 5, isRaw: true },
    ]
    bomStore.prices = new Map([
      [1, { itemId: 1, minPrice: 100, avgPrice: 110, hqMinPrice: 200, hqAvgPrice: 210, lastUpdated: 0 }],
      [2, { itemId: 2, minPrice: 50, avgPrice: 60, hqMinPrice: 80, hqAvgPrice: 90, lastUpdated: 0 }],
    ])

    settingsStore.priceDisplayMode = 'nq'
    expect(bomStore.totalCost).toBe(100 * 10 + 50 * 5) // 1250

    settingsStore.priceDisplayMode = 'hq'
    expect(bomStore.totalCost).toBe(200 * 10 + 80 * 5) // 2400
  })
})
```

**Step 2: 跑測試確認通過**

Run: `npx vitest run src/__tests__/stores/bom.test.ts`
Expected: 6 tests PASS

**Step 3: Commit**

```bash
git add src/__tests__/stores/bom.test.ts
git commit -m "test: add BOM store getPrice and totalCost unit tests"
```

---

### Task 11: 測試 — flattenMaterialTree 純函式

**Files:**
- Create: `src/__tests__/services/bom-calculator.test.ts`

**Step 1: 撰寫 flattenMaterialTree 和 getCraftingOrder 測試**

```ts
import { describe, it, expect } from 'vitest'
import { flattenMaterialTree, getCraftingOrder } from '@/services/bom-calculator'
import type { MaterialNode } from '@/stores/bom'

describe('flattenMaterialTree', () => {
  it('flattens nested tree and deduplicates by itemId', () => {
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 10,
        children: [
          { itemId: 1, name: 'Iron Ore', icon: '', amount: 3 },
          { itemId: 2, name: 'Coal', icon: '', amount: 2 },
        ],
      },
      {
        itemId: 200, name: 'Product B', icon: '', amount: 2, recipeId: 20,
        children: [
          { itemId: 1, name: 'Iron Ore', icon: '', amount: 5 },
        ],
      },
    ]

    const flat = flattenMaterialTree(tree)
    const ironOre = flat.find(m => m.itemId === 1)

    expect(ironOre).toBeDefined()
    expect(ironOre!.totalAmount).toBe(8) // 3 + 5 deduplicated
    expect(ironOre!.isRaw).toBe(true)
  })

  it('marks craftable intermediates as non-raw', () => {
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 10,
        children: [
          { itemId: 50, name: 'Intermediate', icon: '', amount: 2, recipeId: 5, children: [
            { itemId: 1, name: 'Raw', icon: '', amount: 4 },
          ]},
        ],
      },
    ]

    const flat = flattenMaterialTree(tree)
    const intermediate = flat.find(m => m.itemId === 50)
    const raw = flat.find(m => m.itemId === 1)

    expect(intermediate!.isRaw).toBe(false)
    expect(raw!.isRaw).toBe(true)
  })
})

describe('getCraftingOrder', () => {
  it('returns items in bottom-up order (raw first, products last)', () => {
    const tree: MaterialNode[] = [
      {
        itemId: 100, name: 'Product', icon: '', amount: 1, recipeId: 10,
        children: [
          { itemId: 1, name: 'Raw A', icon: '', amount: 3 },
          { itemId: 2, name: 'Raw B', icon: '', amount: 2 },
        ],
      },
    ]

    const order = getCraftingOrder(tree)
    const names = order.map(o => o.name)

    expect(names.indexOf('Raw A')).toBeLessThan(names.indexOf('Product'))
    expect(names.indexOf('Raw B')).toBeLessThan(names.indexOf('Product'))
  })
})
```

**Step 2: 跑測試確認通過**

Run: `npx vitest run src/__tests__/services/bom-calculator.test.ts`
Expected: 3 tests PASS

**Step 3: Commit**

```bash
git add src/__tests__/services/bom-calculator.test.ts
git commit -m "test: add bom-calculator flattenMaterialTree and getCraftingOrder tests"
```

---

### Task 12: 最終檢查與修正

**Files:**
- 所有已修改的檔案

**Step 1: 跑全部測試**

Run: `npx vitest run`
Expected: 所有測試 PASS

**Step 2: TypeScript 編譯檢查**

Run: `npx vue-tsc --noEmit`
Expected: 無編譯錯誤

**Step 3: 功能驗證清單**

手動驗證：
1. `/#/settings` — 可以選擇 Region > DC > Server，儲存後刷新仍保留
2. `/#/bom` — 計算後價格根據設定顯示，表頭顯示伺服器名稱
3. `/#/bom` — 展開材料列可看到跨服比價
4. `/#/market` — 搜尋物品可看到各服價格和掛牌明細
5. 側邊欄顯示「市場查價」和「設定」項目

**Step 4: 修正任何發現的問題**

**Step 5: Final commit**

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```

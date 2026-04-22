<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import BomTargetList from '@/components/bom/BomTargetList.vue'
import RecipeSearchSidebar from '@/components/recipe/RecipeSearchSidebar.vue'
import FlowBreadcrumb from '@/components/common/FlowBreadcrumb.vue'

import BomSummary from '@/components/bom/BomSummary.vue'
import BomCraftTree from '@/components/bom/BomCraftTree.vue'
import { useBomStore } from '@/stores/bom'
import { useRecipeStore } from '@/stores/recipe'
import { useSettingsStore } from '@/stores/settings'
import { useLocaleStore } from '@/stores/locale'
import { loadingState } from '@/services/local-data-source'
import { buildMaterialTree, flattenMaterialTree } from '@/services/bom-calculator'
import { getAggregatedPrices } from '@/api/universalis'
import { getRecipe } from '@/api/xivapi'
import type { MaterialNode } from '@/stores/bom'

const bomStore = useBomStore()
const recipeStore = useRecipeStore()
const settingsStore = useSettingsStore()
const localeStore = useLocaleStore()

const isLoadingData = computed(() => {
  const s = loadingState[localeStore.current]
  return s.recipes || s.items || s.rlt
})

const searchSidebarOpen = ref(false)
const activeTab = ref('tree')
const calculating = ref(false)
const fetchingPrices = ref(false)
const calculated = computed(() => bomStore.materialTree.length > 0)
const loadingMessage = ref('正在計算材料需求...')

async function handleCalculate() {
  if (bomStore.targets.length === 0) {
    ElMessage.warning('請先加入至少一個製作目標')
    return
  }

  calculating.value = true

  try {
    loadingMessage.value = '正在展開子配方...'
    const tree = await buildMaterialTree(bomStore.targets)
    bomStore.materialTree = tree

    loadingMessage.value = '正在整理材料清單...'
    const flat = flattenMaterialTree(tree)
    bomStore.flatMaterials = flat

    await fetchPrices(flat.map((m) => m.itemId))

    ElMessage.success('材料計算完成')
  } catch (err) {
    console.error('[BOM] Calculation failed:', err)
    ElMessage.error('材料計算失敗，請稍後再試')
  } finally {
    calculating.value = false
  }
}

async function fetchPrices(itemIds?: number[]) {
  const ids = itemIds ?? bomStore.flatMaterials.map((m) => m.itemId)
  if (ids.length === 0) return

  fetchingPrices.value = true

  try {
    const marketDataMap = await getAggregatedPrices(settingsStore.server, ids)

    const priceMap = new Map(bomStore.prices)
    for (const [id, data] of marketDataMap) {
      priceMap.set(id, {
        itemId: id,
        minPrice: data.minPriceNQ,
        avgPrice: data.currentAveragePriceNQ,
        hqMinPrice: data.minPriceHQ,
        hqAvgPrice: data.currentAveragePriceHQ,
        lastUpdated: data.lastUploadTime,
      })
    }
    bomStore.prices = priceMap
  } catch (err) {
    console.error('[BOM] Price fetch failed:', err)
    ElMessage.error('價格取得失敗，請稍後再試')
  } finally {
    fetchingPrices.value = false
  }
}

async function handleSimulateRecipe(recipeId: number) {
  try {
    const recipe = await getRecipe(recipeId)
    recipeStore.addToQueue(recipe)
    recipeStore.setRecipe(recipe)
    ElMessage.success(`已將「${recipe.name}」加入模擬佇列`)
  } catch (err) {
    console.error('[BOM] Failed to load recipe for queue:', err)
    ElMessage.error('載入配方失敗')
  }
}

function handleToggleCollapsed(node: MaterialNode) {
  bomStore.toggleCollapsed(node)
  bomStore.recalcFlat()

  // Only fetch prices for items not already in the cache
  const missingIds = bomStore.flatMaterials
    .map(m => m.itemId)
    .filter(id => !bomStore.prices.has(id))
  if (missingIds.length > 0) {
    fetchPrices(missingIds)
  }
}

function handleAddFromSearch(recipe: import('@/stores/recipe').Recipe) {
  bomStore.addTarget({
    itemId: recipe.itemId,
    recipeId: recipe.id,
    name: recipe.name,
    icon: recipe.icon,
    quantity: 1,
  })
  ElMessage.success(`已加入「${recipe.name}」`)
}

function handleRefreshPrices() {
  fetchPrices()
}
</script>

<template>
  <div class="bom-view" :class="{ 'full-width': activeTab === 'tree' && calculated && !calculating }" v-loading="isLoadingData">
    <FlowBreadcrumb :steps="[
      { label: '材料清單', path: '/bom', icon: '📜' },
    ]" />
    <h2>材料清單</h2>
    <p class="view-desc">想做什麼就加進來，幫你算好所有材料和花費。</p>

    <BomTargetList @calculate="handleCalculate" @open-search="searchSidebarOpen = true" />

    <div v-if="calculating" class="loading-section">
      <el-skeleton :rows="4" animated />
      <p class="loading-text">{{ loadingMessage }}</p>
    </div>

    <template v-if="calculated && !calculating">
      <div class="section-gap">
        <div v-if="fetchingPrices" class="loading-section">
          <el-skeleton :rows="3" animated />
          <p class="loading-text">正在取得市場價格...</p>
        </div>
        <el-tabs v-else v-model="activeTab">
          <el-tab-pane label="製作價格樹" name="tree">
            <BomCraftTree
              :tree="bomStore.materialTree"
              :prices="bomStore.prices"
              @simulate-recipe="handleSimulateRecipe"
              @toggle-collapsed="handleToggleCollapsed"
            />
          </el-tab-pane>
          <el-tab-pane label="材料總覽" name="summary">
            <BomSummary
              :materials="bomStore.flatMaterials"
              :prices="bomStore.prices"
              :material-tree="bomStore.materialTree"
              @refresh-prices="handleRefreshPrices"
            />
          </el-tab-pane>
        </el-tabs>
      </div>
    </template>
    <RecipeSearchSidebar v-model="searchSidebarOpen" context="加入材料清單" @add="handleAddFromSearch" />
  </div>
</template>

<style scoped>
.bom-view { --page-accent: var(--app-craft); --page-accent-dim: var(--app-craft-dim); }

.bom-view {
  max-width: 960px;
}

.bom-view.full-width {
  max-width: none;
}

.section-gap {
  margin-top: 20px;
}

.loading-section {
  margin-top: 20px;
  padding: 20px;
}

.loading-text {
  text-align: center;
  color: var(--app-text-muted);
  margin-top: 12px;
}
</style>

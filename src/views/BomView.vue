<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import BomTargetList from '@/components/bom/BomTargetList.vue'
import BomMaterialTree from '@/components/bom/BomMaterialTree.vue'
import BomSummary from '@/components/bom/BomSummary.vue'
import { useBomStore } from '@/stores/bom'
import { useRecipeStore } from '@/stores/recipe'
import { useSettingsStore } from '@/stores/settings'
import { buildMaterialTree, flattenMaterialTree } from '@/services/bom-calculator'
import { getAggregatedPrices } from '@/api/universalis'
import { getRecipe } from '@/api/xivapi'
import type { PriceInfo, MaterialNode } from '@/stores/bom'

const bomStore = useBomStore()
const recipeStore = useRecipeStore()
const settingsStore = useSettingsStore()

const calculating = ref(false)
const fetchingPrices = ref(false)
const calculated = ref(false)
const loadingMessage = ref('正在計算材料需求...')

async function handleCalculate() {
  if (bomStore.targets.length === 0) {
    ElMessage.warning('請先加入至少一個製作目標')
    return
  }

  calculating.value = true
  calculated.value = false

  try {
    loadingMessage.value = '正在展開子配方...'
    const tree = await buildMaterialTree(bomStore.targets)
    bomStore.materialTree = tree

    loadingMessage.value = '正在整理材料清單...'
    const flat = flattenMaterialTree(tree)
    bomStore.flatMaterials = flat

    calculated.value = true

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

    const priceMap = new Map<number, PriceInfo>()
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
    ElMessage.success(`已將「${recipe.name}」加入模擬佇列`)
  } catch (err) {
    console.error('[BOM] Failed to load recipe for queue:', err)
    ElMessage.error('載入配方失敗')
  }
}

function handleToggleCollapsed(node: MaterialNode) {
  bomStore.toggleCollapsed(node)
  bomStore.recalcFlat()
  fetchPrices(bomStore.flatMaterials.map(m => m.itemId))
}

function handleRefreshPrices() {
  fetchPrices()
}
</script>

<template>
  <div class="bom-view">
    <h2>材料清單</h2>
    <p class="view-desc">計算製作所需材料、查詢市場價格，一鍵進入模擬器。</p>

    <BomTargetList @calculate="handleCalculate" />

    <div v-if="calculating" class="loading-section">
      <el-skeleton :rows="4" animated />
      <p class="loading-text">{{ loadingMessage }}</p>
    </div>

    <template v-if="calculated && !calculating">
      <div class="section-gap">
        <BomMaterialTree
          :tree="bomStore.materialTree"
          @simulate-recipe="handleSimulateRecipe"
          @toggle-collapsed="handleToggleCollapsed"
        />
      </div>

      <div class="section-gap">
        <div v-if="fetchingPrices" class="loading-section">
          <el-skeleton :rows="3" animated />
          <p class="loading-text">正在取得市場價格...</p>
        </div>
        <BomSummary
          v-else
          :materials="bomStore.flatMaterials"
          :prices="bomStore.prices"
          @refresh-prices="handleRefreshPrices"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.bom-view {
  max-width: 960px;
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
